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
  account: call("account:get"), login: call("account:login"), signup: call("account:signup"), logout: call("account:logout"),
  uploads: call("account:uploads"), unpublish: call("account:unpublish"), setPin: call("account:setPin"), setServer: call("account:setServer"),
  keep: call("app:keep"), setAutodelete: call("settings:autodelete"),
  githubStatus: call("github:status"), githubSave: call("github:save"), githubClear: call("github:clear"),
  openRepo: call("link:open"),
  onLog: (cb) => ipcRenderer.on("install:log", (_e, spec, text) => cb(spec, text)),
});
