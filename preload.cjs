const { contextBridge, ipcRenderer } = require("electron");
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("store", {
  search: call("catalog:search"),
  lookup: call("app:lookup"),
  install: call("app:install"),
  uninstall: call("app:uninstall"),
  run: call("app:run"),
  installed: call("app:installed"),
  wallet: call("wallet:get"),
  settings: call("settings:get"),
  saveKey: call("settings:saveKey"),
  openRepo: call("link:open"),
  onLog: (cb) => ipcRenderer.on("install:log", (_e, spec, text) => cb(spec, text)),
});
