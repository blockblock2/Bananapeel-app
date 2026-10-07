// Thin wrapper around the BananaPeel CLI. The CLI does the real work (download,
// virus scan, install) so the store always behaves exactly like the terminal.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { parseSpec, isAccountSpec } = require("./github.cjs");

const HOME = process.env.BANANAPEEL_HOME || path.join(os.homedir(), ".bananapeel");
const WINDOW_EXT = /\.(html?|sb[23]?)$/i;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,49}$/i;

function cliPath() {
  return require.resolve("@blockblock2/bananapeel/bin/bananapeel.js");
}

// Runs the CLI with Electron's own Node, so users need no global install.
function runCli(args, { onData, detached = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath(), ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NO_COLOR: "1" },
      stdio: detached ? "ignore" : ["ignore", "pipe", "pipe"],
      detached,
    });
    if (detached) { child.unref(); return resolve({ code: 0, output: "" }); }
    let output = "";
    const take = (b) => { const s = b.toString(); output += s; onData && onData(s); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => resolve({ code: 1, output: e.message }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

// The CLI prints failures as "✖ message".
function errorFrom(output) {
  const lines = output.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("✖"));
  return (lines.pop() || "Something went wrong.").replace(/^✖\s*/, "");
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };

// The app's own icon (from its bananapeel.json), as a data URL. Null if missing or unsafe.
function localIcon(appDir, manifest) {
  try {
    const mime = MIME[path.extname(manifest.icon || "").toLowerCase()];
    if (!mime) return null;
    const file = path.resolve(appDir, manifest.icon);
    if (!file.startsWith(path.resolve(appDir) + path.sep)) return null;
    const buf = fs.readFileSync(file);
    return buf.length > 2e6 ? null : `data:${mime};base64,${buf.toString("base64")}`;
  } catch { return null; }
}

function installed() {
  return Object.entries(readJson(path.join(HOME, "installed.json"), {})).map(([name, a]) => {
    const appDir = path.join(HOME, "apps", name);
    const manifest = readJson(path.join(appDir, "bananapeel.json"), {});
    return {
      name, title: manifest.title || name, icon: localIcon(appDir, manifest),
      expiresAt: a.expiresAt || null, oneTime: Boolean(a.uninstallAfterRun),
      version: a.version, description: a.description, source: a.source,
      language: a.language, windowed: WINDOW_EXT.test(a.main || ""),
    };
  });
}

// Any CLI command first removes expired apps (0.7+), so a cheap one keeps the list honest.
const sweepExpired = () => runCli(["list"]);

// BananaCoins live in BananaPeel's own config; the store only reads them (the CLI does the buying).
function wallet() {
  const c = readJson(path.join(HOME, "config.json"), {});
  return { coins: Number.isFinite(c.coins) ? c.coins : 100, owned: (c.owned || []).map((o) => String(o).toLowerCase()) };
}

const hasKey = () => Boolean(process.env.CLOUDMERSIVE_API_KEY || readJson(path.join(HOME, "config.json"), {}).apiKey);

// Unlock codes look like XXXX-XXXX-XXXX-XXXX; PINs are 6-10 digits.
function installArgs(spec, { code, pin } = {}) {
  if (!parseSpec(spec) && !isAccountSpec(spec)) throw new Error("Use the form owner/repo, e.g. blockblock2/repro-app");
  const args = ["install", spec, "-y"];
  if (code) {
    if (!/^[A-Za-z0-9-]{8,40}$/.test(code)) throw new Error("That doesn't look like an unlock code.");
    args.push(`--code=${code}`);
  }
  if (pin) {
    if (!/^\d{6,10}$/.test(pin)) throw new Error("PINs are 6-10 digits.");
    args.push(`--pin=${pin}`);
  }
  return args;
}

async function install(spec, opts, onData) {
  const { code, output } = await runCli(installArgs(spec, opts), { onData });
  if (code !== 0) throw new Error(errorFrom(output));
}

async function uninstall(name) {
  if (!NAME_RE.test(name)) throw new Error("Bad app name.");
  const { code, output } = await runCli(["uninstall", name]);
  if (code !== 0) throw new Error(errorFrom(output));
}

async function run(name) {
  if (!NAME_RE.test(name)) throw new Error("Bad app name.");
  await runCli(["run", name], { detached: true });
}

async function saveKey(key) {
  if (!/^[\w-]{8,200}$/.test(key || "")) throw new Error("That doesn't look like an API key.");
  const { code, output } = await runCli(["key", key]);
  if (code !== 0) throw new Error(errorFrom(output));
}

module.exports = { wallet, installArgs, sweepExpired, installed, hasKey, install, uninstall, run, saveKey, errorFrom };
