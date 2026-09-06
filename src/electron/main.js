import { app, BrowserWindow, Menu, shell, dialog, ipcMain, Notification } from "electron";
import { existsSync, mkdirSync, copyFileSync, readFile, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setupTray, refreshTray, setTrayBadge, destroyTray } from "./tray.js";
import { syncSpotlightIndex, readCardvaultFile } from "./spotlight.js";
import { canGrantRendererPermission, getOrigin } from "./permissions.js";
import { buildCvServiceDependencyMessage, buildCvServiceProbeArgs } from "./cvService.js";
import { getScanImageRejection, isScanImageExtension } from "./scanImage.js";
import { isAllowedExternalUrl, isAllowedNavigation } from "./navigation.js";

app.setName("CardVault");

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const userDataDir = app.getPath("userData");
mkdirSync(userDataDir, { recursive: true });

const userDbPath = path.join(userDataDir, "cardvault.db");
const userEnvPath = path.join(userDataDir, ".env");
const bundledEnvExample = path.join(projectRoot, ".env.example");

if (!existsSync(userEnvPath) && existsSync(bundledEnvExample)) {
  copyFileSync(bundledEnvExample, userEnvPath);
}

process.env.CARDVAULT_DB_PATH = process.env.CARDVAULT_DB_PATH || userDbPath;
process.env.CARDVAULT_ENV_FILE = process.env.CARDVAULT_ENV_FILE || userEnvPath;
process.env.CARDVAULT_DIST_DIR = process.env.CARDVAULT_DIST_DIR || path.join(projectRoot, "dist");
process.env.CARDVAULT_APP_MODE = "electron";
process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "3001";

const APP_PORT = Number(process.env.PORT);
const DEV_URL = process.env.CARDVAULT_DEV_URL || null;

let mainWindow = null;
let windowPromise = null;
let serverPromise = null;
let pendingDeepLink = null;
let cvServiceProcess = null;

const CV_SERVICE_DIR = path.join(projectRoot, "cv-service");
const CV_SERVICE_HEALTH_URL = "http://127.0.0.1:8000/health";

async function isCvServiceUp() {
  try {
    const res = await fetch(CV_SERVICE_HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function waitForProcessExit(proc) {
  return new Promise((resolveProcess) => {
    proc.on("exit", (code) => resolveProcess(code));
    proc.on("error", () => resolveProcess(127));
  });
}

async function probeCvServiceDependencies(pythonBin) {
  const probe = spawn(pythonBin, buildCvServiceProbeArgs(), {
    cwd: CV_SERVICE_DIR,
    stdio: "ignore",
  });
  return (await waitForProcessExit(probe)) === 0;
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  } else {
    console.log(`[${title}] ${body}`);
  }
}

async function startCvService() {
  if (cvServiceProcess) {
    notify("Card Detection Service", "Service is already running.");
    return;
  }
  if (await isCvServiceUp()) {
    notify("Card Detection Service", "Already running on port 8000.");
    return;
  }
  if (!existsSync(path.join(CV_SERVICE_DIR, "main.py"))) {
    dialog.showErrorBox("Card Detection Service", `cv-service is not bundled with this build. Expected ${CV_SERVICE_DIR}/main.py.`);
    return;
  }
  const candidates = ["python3", "python"];
  let chosen = null;
  for (const bin of candidates) {
    try {
      const probe = spawn(bin, ["--version"], { stdio: "ignore" });
      const code = await new Promise((resolveProbe) => probe.on("exit", resolveProbe).on("error", () => resolveProbe(127)));
      if (code === 0) { chosen = bin; break; }
    } catch {
      // try next candidate
    }
  }
  if (!chosen) {
    dialog.showErrorBox("Card Detection Service", "Python 3 was not found on this Mac. Install python3 (e.g. via Homebrew) and try again.");
    return;
  }
  if (!(await probeCvServiceDependencies(chosen))) {
    dialog.showErrorBox("Card Detection Service", buildCvServiceDependencyMessage(chosen));
    return;
  }
  try {
    cvServiceProcess = spawn(
      chosen,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
      { cwd: CV_SERVICE_DIR, stdio: "ignore", detached: false }
    );
    cvServiceProcess.on("exit", () => { cvServiceProcess = null; rebuildMenu(); });
    cvServiceProcess.on("error", (err) => {
      cvServiceProcess = null;
      rebuildMenu();
      dialog.showErrorBox("Card Detection Service", String(err?.message || err));
    });
    notify("Card Detection Service", "Starting on port 8000…");
    rebuildMenu();
  } catch (err) {
    cvServiceProcess = null;
    dialog.showErrorBox("Card Detection Service", String(err?.message || err));
  }
}

function stopCvService() {
  if (!cvServiceProcess) return;
  try { cvServiceProcess.kill("SIGTERM"); } catch {}
  cvServiceProcess = null;
  notify("Card Detection Service", "Stopped.");
  rebuildMenu();
}

function rebuildMenu() {
  buildMenu();
  refreshTray({
    onOpenWindow: openMainWindow,
    onStartCv: startCvService,
    onStopCv: stopCvService,
    isCvRunning: () => !!cvServiceProcess,
    onQuit: () => app.quit(),
  });
}

function openMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return createWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function readImageAsDataUrl(filePath) {
  return new Promise((resolveRead, rejectRead) => {
    readFile(filePath, (err, buf) => {
      if (err) return rejectRead(err);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === ".png" ? "image/png"
        : ext === ".webp" ? "image/webp"
        : ext === ".heic" || ext === ".heif" ? "image/heic"
        : "image/jpeg";
      resolveRead(`data:${mime};base64,${buf.toString("base64")}`);
    });
  });
}

async function deliverScanImage(filePath) {
  if (!filePath) return;
  let fileStat;
  try {
    fileStat = statSync(filePath);
  } catch {
    return;
  }
  const rejection = getScanImageRejection(fileStat);
  if (rejection) {
    dialog.showErrorBox("Could not open card image", rejection);
    return;
  }
  if (!isScanImageExtension(filePath)) return;
  try {
    const dataUrl = await readImageAsDataUrl(filePath);
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoadingMainFrame()) {
      pendingScanImage = dataUrl;
      if (app.isReady()) openMainWindow();
      return;
    }
    openMainWindow();
    mainWindow.webContents.send("cardvault:scan-image", dataUrl);
  } catch (err) {
    dialog.showErrorBox("Could not open card image", String(err?.message || err));
  }
}

let pendingScanImage = null;

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (path.extname(filePath).toLowerCase() === ".cardvault") {
    const link = readCardvaultFile(filePath);
    if (link) {
      deliverDeepLink(link);
    } else {
      dialog.showErrorBox("CardVault", "That .cardvault index file is unreadable.");
    }
    return;
  }
  deliverScanImage(filePath);
});

async function rebuildSpotlightIndex() {
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/items`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const items = await res.json();
    const summary = syncSpotlightIndex(items || []);
    notify("Spotlight index updated", `${summary.written} cards indexed in ${summary.dir}`);
  } catch (err) {
    dialog.showErrorBox("Spotlight index failed", String(err?.message || err));
  }
}

if (!app.isDefaultProtocolClient("cardvault")) {
  app.setAsDefaultProtocolClient("cardvault");
}

function deliverDeepLink(url) {
  if (!url || !url.startsWith("cardvault://")) return;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.send("cardvault:deep-link", url);
    openMainWindow();
  } else {
    pendingDeepLink = url;
    if (app.isReady()) openMainWindow();
  }
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  deliverDeepLink(url);
});

app.on("second-instance", (_event, argv) => {
  const link = argv.find((a) => typeof a === "string" && a.startsWith("cardvault://"));
  if (link) deliverDeepLink(link);
  if (app.isReady()) openMainWindow();
});

async function ensureServer() {
  if (DEV_URL) return DEV_URL;
  if (!serverPromise) {
    const serverModule = await import(pathToFileURL(path.join(projectRoot, "server.js")).href);
    serverPromise = serverModule.startServer({ port: APP_PORT, host: "127.0.0.1" });
  }
  await serverPromise;
  return `http://127.0.0.1:${APP_PORT}`;
}

async function getStoredPreference(key) {
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/settings`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const settings = await res.json();
    return settings?.[key] ?? null;
  } catch {
    return null;
  }
}

async function maybeAutoStartCvService() {
  if (DEV_URL) return; // skip in mac:dev to avoid surprising the user
  const pref = await getStoredPreference("cv_service_autostart");
  if (pref === "true") {
    await startCvService();
  }
}

async function maybeShowOnboarding() {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/ai/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.configured) return;
    if (window.isDestroyed() || mainWindow !== window) return;
    window.webContents.send("cardvault:open-settings");
    notify("Welcome to CardVault", "Add your Anthropic API key in Settings to enable card recognition and pricing.");
  } catch {
    // server may still be warming up; skip onboarding silently
  }
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            {
              label: "Open Data Folder",
              click: () => shell.openPath(userDataDir),
            },
            {
              label: "Settings…",
              accelerator: "Cmd+,",
              click: () => deliverDeepLink("cardvault://settings"),
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
    {
      label: "Tools",
      submenu: [
        {
          label: cvServiceProcess ? "Stop Card Detection Service" : "Start Card Detection Service",
          click: () => (cvServiceProcess ? stopCvService() : startCvService()),
        },
        {
          label: "Reveal Card Detection Service folder",
          click: () => shell.openPath(CV_SERVICE_DIR),
        },
        { type: "separator" },
        {
          label: "Update Spotlight Index",
          click: () => rebuildSpotlightIndex(),
        },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "CardVault on GitHub",
          click: () => shell.openExternal("https://github.com/scomofo/cardvault"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (windowPromise) return windowPromise;
  if (mainWindow && !mainWindow.isDestroyed()) return Promise.resolve(mainWindow);
  const pending = buildWindow().finally(() => {
    if (windowPromise === pending) windowPromise = null;
  });
  windowPromise = pending;
  return windowPromise;
}

async function buildWindow() {
  const url = await ensureServer().catch((err) => {
    dialog.showErrorBox("CardVault failed to start", String(err?.stack || err));
    app.quit();
    throw err;
  });

  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    backgroundColor: isMac ? "#00000000" : "#0b0d10",
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
      windowPromise = null;
    }
  });

  const session = window.webContents.session;
  const allowedRendererOrigins = new Set([getOrigin(url)].filter(Boolean));
  session.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(canGrantRendererPermission({
      permission,
      requestingUrl: details?.requestingUrl || wc.getURL(),
      allowedOrigins: allowedRendererOrigins,
    }));
  });
  session.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    return canGrantRendererPermission({
      permission,
      requestingUrl: details?.requestingUrl || requestingOrigin || wc.getURL(),
      allowedOrigins: allowedRendererOrigins,
    });
  });

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isAllowedExternalUrl(target)) shell.openExternal(target);
    return { action: "deny" };
  });

  // The renderer only ever needs its own origin (including a same-origin
  // redirect, e.g. /api/ebay/callback back to /#settings). Anything else —
  // an OAuth provider's page, a stray link — must not load into the main
  // window, where the preload bridge and IPC channels are attached.
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigation({ targetUrl, allowedOrigins: allowedRendererOrigins })) {
      event.preventDefault();
      if (isAllowedExternalUrl(targetUrl)) shell.openExternal(targetUrl);
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.on("did-finish-load", () => {
    if (pendingDeepLink) {
      const link = pendingDeepLink;
      pendingDeepLink = null;
      deliverDeepLink(link);
    }
    if (pendingScanImage) {
      const img = pendingScanImage;
      pendingScanImage = null;
      window.webContents.send("cardvault:scan-image", img);
    }
  });
  window.webContents.once("did-finish-load", () => setTimeout(() => maybeShowOnboarding(), 800));
  try {
    await window.loadURL(url);
  } catch (error) {
    // Cmd+W can cancel the first load. A closed window must neither block
    // reopening nor turn that expected cancellation into a startup failure.
    if (!window.isDestroyed()) throw error;
  }
  return window.isDestroyed() ? null : window;
}

ipcMain.on("cardvault:set-badge", (_event, count) => {
  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(Number.isFinite(count) && count > 0 ? count : 0);
  }
  setTrayBadge(count);
});

// Used for flows that must not run inside the app's own BrowserWindow (eBay
// OAuth: the local /api/ebay/auth kickoff redirects to eBay's login page,
// which should never load with this app's preload bridge attached).
ipcMain.on("cardvault:open-external", (_event, url) => {
  if (isAllowedExternalUrl(url)) shell.openExternal(url);
});

app.whenReady().then(async () => {
  buildMenu();
  setupTray({
    buildResourcesDir: path.join(projectRoot, "build"),
    onOpenWindow: openMainWindow,
    onStartCv: startCvService,
    onStopCv: stopCvService,
    isCvRunning: () => !!cvServiceProcess,
    onQuit: () => app.quit(),
  });
  await createWindow();
  maybeAutoStartCvService();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("before-quit", () => {
  stopCvService();
  destroyTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
