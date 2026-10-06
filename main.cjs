const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const gh = require("./lib/github.cjs");
const bp = require("./lib/bp.cjs");

function createWindow() {
  const win = new BrowserWindow({
    width: 980, height: 720, minWidth: 560, minHeight: 480, title: "BananaPeel Store",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

// Every handler returns { ok, data } or { ok:false, error } so the UI never sees a raw exception.
const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
  try { return { ok: true, data: await fn(event, ...args) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

handle("catalog:search", (_e, query) => gh.searchApps(String(query || "").slice(0, 100)));
handle("app:lookup", async (_e, input) => {
  const spec = gh.normalizeSpec(input);
  const found = await gh.toApp(spec);
  if (!found) throw new Error(`${spec} isn't a BananaPeel app (no valid bananapeel.json).`);
  return found;
});
handle("app:install", (e, spec) => bp.install(String(spec), (text) => e.sender.send("install:log", spec, text)));
handle("app:uninstall", (_e, name) => bp.uninstall(String(name)));
handle("app:run", (_e, name) => bp.run(String(name)));
handle("app:installed", () => bp.installed());
handle("settings:get", () => ({ hasKey: bp.hasKey() }));
handle("settings:saveKey", (_e, key) => bp.saveKey(String(key)));
handle("link:open", (_e, spec) => {
  if (!gh.parseSpec(spec)) throw new Error("Bad repo.");
  return shell.openExternal(`https://github.com/${spec}`);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on("window-all-closed", () => process.platform === "darwin" || app.quit());
