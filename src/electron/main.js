import { app, BrowserWindow, Menu, shell, dialog, ipcMain, Notification } from "electron";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
}

if (!app.isDefaultProtocolClient("cardvault")) {
  app.setAsDefaultProtocolClient("cardvault");
}

function deliverDeepLink(url) {
  if (!url || !url.startsWith("cardvault://")) return;
  if (mainWindow) {
    mainWindow.webContents.send("cardvault:deep-link", url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingDeepLink = url;
  }
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  deliverDeepLink(url);
});

app.on("second-instance", (_event, argv) => {
  const link = argv.find((a) => typeof a === "string" && a.startsWith("cardvault://"));
  if (link) deliverDeepLink(link);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
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
  if (!mainWindow) return;
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/ai/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.configured) return;
    mainWindow.webContents.send("cardvault:open-settings");
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
              click: () => mainWindow?.webContents.send("cardvault:open-settings"),
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

async function createWindow() {
  const url = await ensureServer().catch((err) => {
    dialog.showErrorBox("CardVault failed to start", String(err?.stack || err));
    app.quit();
    throw err;
  });

  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
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
      sandbox: false,
    },
  });

  const session = mainWindow.webContents.session;
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["media", "clipboard-read", "clipboard-sanitized-write", "fullscreen"].includes(permission));
  });
  session.setPermissionCheckHandler((_wc, permission) => {
    return ["media", "clipboard-read", "clipboard-sanitized-write", "fullscreen"].includes(permission);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingDeepLink) {
      const link = pendingDeepLink;
      pendingDeepLink = null;
      deliverDeepLink(link);
    }
    setTimeout(() => maybeShowOnboarding(), 800);
  });
  await mainWindow.loadURL(url);
}

ipcMain.on("cardvault:set-badge", (_event, count) => {
  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(Number.isFinite(count) && count > 0 ? count : 0);
  }
});

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
  maybeAutoStartCvService();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("before-quit", () => {
  stopCvService();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
