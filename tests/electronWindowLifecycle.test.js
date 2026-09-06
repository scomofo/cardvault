import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { getOrigin, canGrantRendererPermission } from "../src/electron/permissions.js";
import { isAllowedExternalUrl, isAllowedNavigation } from "../src/electron/navigation.js";
import { getScanImageRejection, isScanImageExtension } from "../src/electron/scanImage.js";

const mainModuleUrl = new URL("../src/electron/main.js", import.meta.url).href;
const mainSource = await readFile(new URL(mainModuleUrl), "utf8");

function createHarness({ deferLoads = false } = {}) {
  const windows = [];
  const app = new EventEmitter();
  Object.assign(app, {
    name: "CardVault", ready: true, quitCalls: 0,
    setName() {}, requestSingleInstanceLock: () => true,
    getPath: () => "/tmp/cardvault-native-test", isDefaultProtocolClient: () => true,
    isReady: () => app.ready, whenReady: () => ({ then() {} }),
    quit: () => { app.quitCalls += 1; },
  });

  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return windows.filter((window) => !window.destroyed); }
    constructor() {
      super();
      this.destroyed = false;
      this.loading = true;
      this.messages = [];
      this.webContents = Object.assign(new EventEmitter(), {
        session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
        setWindowOpenHandler() {}, isLoadingMainFrame: () => this.loading,
        send: (...message) => { this.assertAlive(); this.messages.push(message); },
      });
      windows.push(this);
    }
    assertAlive() { assert.equal(this.destroyed, false, "must not use a destroyed native window"); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { this.assertAlive(); return false; }
    show() { this.assertAlive(); this.shown = true; }
    focus() { this.assertAlive(); this.focused = true; }
    close() {
      this.destroyed = true;
      this.emit("closed");
      this.rejectLoad?.(new Error("Object has been destroyed"));
      app.emit("window-all-closed");
    }
    loadURL(url) {
      this.url = url;
      return new Promise((resolve, reject) => {
        this.rejectLoad = reject;
        this.finishLoad = () => {
          this.loading = false;
          this.emit("ready-to-show");
          this.webContents.emit("did-finish-load");
          resolve();
        };
        if (!deferLoads) this.finishLoad();
      });
    }
  }

  const Menu = { buildFromTemplate: (template) => template, setApplicationMenu: (menu) => { Menu.current = menu; } };
  const context = vm.createContext({
    mainModuleUrl, app, BrowserWindow, Menu, path, fileURLToPath, pathToFileURL,
    process: { platform: "darwin", env: { CARDVAULT_DEV_URL: "http://127.0.0.1:3000" } },
    existsSync: () => false, mkdirSync() {}, copyFileSync() {},
    statSync: () => ({ isFile: () => true, size: 10 }),
    readFile: (_file, callback) => callback(null, Buffer.from("card-image")),
    getOrigin, canGrantRendererPermission, isAllowedExternalUrl, isAllowedNavigation,
    getScanImageRejection, isScanImageExtension,
    shell: {}, dialog: { showErrorBox: (_title, message) => { assert.fail(message); } },
    ipcMain: new EventEmitter(), Notification: { isSupported: () => false },
    setupTray() {}, refreshTray() {}, setTrayBadge() {}, destroyTray() {},
    setTimeout() {}, console,
  });
  // Execute the real main-process code with native imports replaced by test
  // doubles. This exercises lifecycle behavior on Linux without claiming to
  // run Electron or macOS, and never touches the user's data or filesystem.
  vm.runInContext(mainSource.replace(/^import .*;\n/gm, "").replaceAll("import.meta.url", "mainModuleUrl"), context);
  return { context, app, windows, Menu };
}

test("macOS tray can reopen the window after Cmd+W without quitting the app", async () => {
  const { context, windows, app } = createHarness();
  await context.createWindow();
  windows[0].close();
  assert.equal(app.quitCalls, 0);
  await context.openMainWindow();
  assert.equal(windows.length, 2);
  assert.equal(windows[1].shown, true);
});

test("card deep links reopen a closed native window and reach the new renderer once", async () => {
  const { context, windows } = createHarness();
  await context.createWindow();
  windows[0].close();
  context.deliverDeepLink("cardvault://card/card-23");
  await context.createWindow();
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[1].messages, [["cardvault:deep-link", "cardvault://card/card-23"]]);
});

test("native Settings reopens a closed window", async () => {
  const { context, windows, Menu } = createHarness();
  context.buildMenu();
  await context.createWindow();
  windows[0].close();
  Menu.current[0].submenu.find((item) => item.label === "Settings…").click();
  await context.createWindow();
  assert.deepEqual(windows[1].messages, [["cardvault:deep-link", "cardvault://settings"]]);
});

test("native image opening reopens the window and delivers after loading", async () => {
  const { context, windows } = createHarness();
  await context.createWindow();
  windows[0].close();
  await context.deliverScanImage("/tmp/card.jpg");
  await context.createWindow();
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[1].messages, [["cardvault:scan-image", `data:image/jpeg;base64,${Buffer.from("card-image").toString("base64")}`]]);
});

test("deep links received while the renderer loads wait without creating another window", async () => {
  const { context, windows } = createHarness({ deferLoads: true });
  const opening = context.createWindow();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(windows.length, 1);
  context.deliverDeepLink("cardvault://card/loading-card");
  context.openMainWindow();
  assert.deepEqual(windows[0].messages, []);
  windows[0].finishLoad();
  await opening;
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0].messages, [["cardvault:deep-link", "cardvault://card/loading-card"]]);
});

test("deep links received before app readiness wait for startup", async () => {
  const { context, windows, app } = createHarness();
  app.ready = false;
  context.deliverDeepLink("cardvault://card/startup-card");
  assert.equal(windows.length, 0);
  app.ready = true;
  await context.createWindow();
  assert.deepEqual(windows[0].messages, [["cardvault:deep-link", "cardvault://card/startup-card"]]);
});

test("deep links received during a renderer reload flush when it finishes", async () => {
  const { context, windows } = createHarness();
  await context.createWindow();
  windows[0].loading = true;
  context.deliverDeepLink("cardvault://card/reloaded-card");
  assert.deepEqual(windows[0].messages, []);
  windows[0].loading = false;
  windows[0].webContents.emit("did-finish-load");
  assert.deepEqual(windows[0].messages, [["cardvault:deep-link", "cardvault://card/reloaded-card"]]);
});

test("closing during initial load lets a replacement open without stale promise cleanup", async () => {
  const { context, windows } = createHarness({ deferLoads: true });
  const initial = context.createWindow();
  // Attach a handler immediately so an expected load cancellation cannot
  // become an unhandled rejection while the replacement window starts.
  const initialOutcome = initial.then((value) => ({ value }), (error) => ({ error }));
  await Promise.resolve();
  await Promise.resolve();
  windows[0].close();
  const replacement = context.openMainWindow();
  assert.notEqual(replacement, initial, "the closed window's pending load must not block reopening");
  const outcome = await initialOutcome;
  assert.equal(outcome.error, undefined, "closing a window must handle the expected load cancellation");
  assert.equal(windows.length, 2);
  assert.equal(context.createWindow(), replacement, "old cleanup must preserve the replacement's pending load");
  windows[1].finishLoad();
  await replacement;
  assert.equal(windows.length, 2);
  assert.equal(windows[1].shown, true);
});
