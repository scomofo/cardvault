import { Tray, Menu, nativeImage } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

let tray = null;

export function setupTray({ buildResourcesDir, onOpenWindow, onStartCv, onStopCv, isCvRunning, onQuit }) {
  if (tray) return tray;

  const iconPath = path.join(buildResourcesDir, "tray-iconTemplate.png");
  const image = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  if (existsSync(iconPath)) {
    image.setTemplateImage(true);
  }

  tray = new Tray(image);
  if (image.isEmpty()) {
    tray.setTitle("CV");
  }
  tray.setToolTip("CardVault");
  refreshTray({ onOpenWindow, onStartCv, onStopCv, isCvRunning, onQuit });
  return tray;
}

export function refreshTray({ onOpenWindow, onStartCv, onStopCv, isCvRunning, onQuit }) {
  if (!tray) return;
  const running = isCvRunning();
  const menu = Menu.buildFromTemplate([
    { label: "Open CardVault", click: onOpenWindow },
    { type: "separator" },
    {
      label: running ? "Stop Card Detection Service" : "Start Card Detection Service",
      click: () => (running ? onStopCv() : onStartCv()),
    },
    { type: "separator" },
    { label: "Quit CardVault", click: onQuit },
  ]);
  tray.setContextMenu(menu);
}

export function setTrayBadge(count) {
  if (!tray) return;
  if (typeof count === "number" && count > 0) {
    tray.setTitle(`CV ${count}`);
  } else {
    tray.setTitle("CV");
  }
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
