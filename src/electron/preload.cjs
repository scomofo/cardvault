const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cardvault", {
  platform: process.platform,
  onOpenSettings: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("cardvault:open-settings", listener);
    return () => ipcRenderer.removeListener("cardvault:open-settings", listener);
  },
  onDeepLink: (handler) => {
    const listener = (_event, url) => handler(url);
    ipcRenderer.on("cardvault:deep-link", listener);
    return () => ipcRenderer.removeListener("cardvault:deep-link", listener);
  },
  setBadgeCount: (count) => {
    ipcRenderer.send("cardvault:set-badge", Number(count) || 0);
  },
  onScanImage: (handler) => {
    const listener = (_event, dataUrl) => handler(dataUrl);
    ipcRenderer.on("cardvault:scan-image", listener);
    return () => ipcRenderer.removeListener("cardvault:scan-image", listener);
  },
  openExternal: (url) => {
    ipcRenderer.send("cardvault:open-external", String(url || ""));
  },
});
