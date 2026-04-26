const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cardvault", {
  platform: process.platform,
  onOpenSettings: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("cardvault:open-settings", listener);
    return () => ipcRenderer.removeListener("cardvault:open-settings", listener);
  },
});
