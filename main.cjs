const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const fs = require("node:fs");
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
handle("app:install", async (e, spec, opts) => {
  await bp.install(String(spec), { code: opts?.code && String(opts.code), pin: opts?.pin && String(opts.pin), keep: Boolean(opts?.keep) },
    (text) => e.sender.send("install:log", spec, text));
  // Reinstalling the store itself: close, then open the fresh copy.
  if (!bp.isStore(String(spec))) return { relaunching: false };
  bp.relaunchLater();
  setTimeout(() => app.quit(), 800); // let the window show "Restarting…" first
  return { relaunching: true };
});
handle("app:uninstall", (_e, name) => bp.uninstall(String(name)));
handle("app:run", (_e, name) => bp.run(String(name)));
handle("app:installed", async () => { await bp.sweepExpired(); return bp.installed(); });
handle("wallet:get", () => bp.wallet());
// ---- account / uploads / preferences
handle("account:get", () => bp.account());
handle("account:login", (_e, u, p) => bp.login(String(u), String(p)));
handle("account:signup", (_e, u, p, c) => bp.signup(String(u), String(p), c ? String(c) : ""));
handle("account:logout", () => bp.logout());
handle("account:uploads", () => bp.uploads());
handle("account:unpublish", (_e, name) => bp.unpublish(String(name)));
handle("account:setPin", (_e, name, pin) => bp.setPin(String(name), String(pin)));
handle("account:setServer", (_e, url) => bp.setServer(String(url)));
handle("app:keep", (_e, name) => bp.keep(String(name)));
handle("settings:autodelete", (_e, on) => bp.setAutodelete(Boolean(on)));

// ---- GitHub token: only used for the store's own GitHub searches, stored encrypted with the OS keychain
const tokenFile = () => path.join(app.getPath("userData"), "github-token.bin");
function loadToken() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    gh.setToken(safeStorage.decryptString(fs.readFileSync(tokenFile())));
  } catch { /* none saved yet */ }
}
handle("github:status", () => ({ signedIn: Boolean(process.env.GITHUB_TOKEN) || fs.existsSync(tokenFile()), canStore: safeStorage.isEncryptionAvailable() }));
handle("github:save", async (_e, token) => {
  token = String(token).trim();
  if (!/^[\w-]{20,255}$/.test(token)) throw new Error("That doesn't look like a GitHub token.");
  const login = await gh.whoami(token);
  if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
  gh.setToken(token); // without a keychain it only lasts until you close the store
  return login;
});
handle("github:clear", () => { gh.setToken(null); fs.rmSync(tokenFile(), { force: true }); });

handle("settings:get", () => ({ hasKey: bp.hasKey() }));
handle("settings:saveKey", (_e, key) => bp.saveKey(String(key)));
handle("link:open", (_e, spec) => {
  if (!gh.parseSpec(spec)) throw new Error("Bad repo.");
  return shell.openExternal(`https://github.com/${spec}`);
});

app.whenReady().then(() => {
  loadToken();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on("window-all-closed", () => process.platform === "darwin" || app.quit());
