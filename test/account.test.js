const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// A tiny stand-in for the BananaPeel server (worker/server.js), enough for the account calls.
function fakeServer(log) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = body ? JSON.parse(body) : {};
      log.push({ method: req.method, url: req.url, auth: req.headers.authorization, json });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.url === "/signup" || req.url === "/login") {
        if (json.password === "wrong-password") return send(401, { error: "Wrong username or password." });
        return send(200, { username: json.username, token: "tok123" });
      }
      if (req.url === "/apps" && req.method === "GET") return send(200, { apps: ["snake", "pong"] });
      if (req.url.startsWith("/apps/") && req.method === "DELETE") return send(200, { ok: true });
      if (req.url === "/pin") return send(200, { ok: true });
      send(404, { error: "nope" });
    });
  });
}

test("account flow: sign up, list uploads, change PIN, remove, sign out", async () => {
  const log = [];
  const server = fakeServer(log);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.BANANAPEEL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "bp-acct-"));
  process.env.BANANAPEEL_SERVER_URL = `http://127.0.0.1:${server.address().port}`;
  const bp = require("../lib/bp.cjs");
  try {
    assert.equal(bp.account().username, null);
    await bp.signup("ricardo", "correct-horse", "CODE-1");
    assert.equal(bp.account().username, "ricardo");
    assert.deepEqual(log[0].json, { username: "ricardo", password: "correct-horse", code: "CODE-1" });

    assert.deepEqual(await bp.uploads(), ["snake", "pong"]);
    assert.equal(log.at(-1).auth, "Bearer tok123");

    await bp.setPin("snake", "482913");
    assert.equal(log.at(-1).json.pin, "482913");
    await bp.unpublish("pong");
    assert.equal(log.at(-1).url, "/apps/pong");

    await bp.logout();
    assert.equal(bp.account().username, null);
    await assert.rejects(bp.login("ricardo", "wrong-password"), /Wrong username or password/);
  } finally { server.close(); delete process.env.BANANAPEEL_SERVER_URL; }
});

test("account inputs are validated before the CLI runs", async () => {
  const bp = require("../lib/bp.cjs");
  await assert.rejects(bp.login("a", "longenough1"), /Usernames/);
  await assert.rejects(bp.login("ricardo", "short"), /8 characters/);
  await assert.rejects(bp.signup("ricardo", "longenough1", "bad code!"), /sign-up code/);
  await assert.rejects(bp.setPin("snake", "12ab"), /PINs/);
  await assert.rejects(bp.unpublish("../etc"), /Bad app name/);
  await assert.rejects(bp.setServer("http://insecure.example"), /https/);
});

test("installArgs adds --keep when the person says the app must not remove itself", () => {
  const { installArgs } = require("../lib/bp.cjs");
  assert.deepEqual(installArgs("a/b", { keep: true }), ["install", "a/b", "-y", "--keep"]);
});

test("upload: scans and uploads a folder with the PIN, and only accepts a real folder + PIN", async () => {
  const log = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      log.push({ url: req.url, auth: req.headers.authorization, body });
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url === "/scan") return res.end(JSON.stringify({ CleanResult: true, FoundViruses: null }));
      if (req.url.startsWith("/upload/file")) return res.end(JSON.stringify({ install: "@ricardo/snake" }));
      res.end(JSON.stringify({ username: "ricardo", token: "tok123", ok: true }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.BANANAPEEL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "bp-up-"));
  Object.assign(process.env, { BANANAPEEL_SERVER_URL: base, BANANAPEEL_SCAN_URL: base + "/scan", CLOUDMERSIVE_API_KEY: "test-key-123456" });
  const bp = require("../lib/bp.cjs");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "bp-app-"));
  try {
    assert.equal(bp.readManifest(folder), null);
    const made = await bp.initFolder(folder);           // `bananapeel init` in that folder
    assert.ok(made && made.name);
    fs.writeFileSync(path.join(folder, "index.html"), "<h1>hi</h1>");
    fs.writeFileSync(path.join(folder, "bananapeel.json"), JSON.stringify({ name: "snake", version: "1.0.0", main: "index.html" }));
    assert.equal(bp.readManifest(folder).name, "snake");

    await assert.rejects(bp.upload(folder, "12ab"), /PINs/);
    await assert.rejects(bp.upload(null, "482913"), /folder/);
    await assert.rejects(bp.upload(folder, "482913"), /sign in/i);   // not signed in yet

    await bp.login("ricardo", "correct-horse");
    const r = await bp.upload(folder, "482913");
    assert.equal(r.install, "@ricardo/snake");
    assert.ok(log.some((l) => l.url === "/scan"), "scanned before uploading");
    const start = log.find((l) => l.url === "/upload/start");
    assert.equal(JSON.parse(start.body).pin, "482913");
    assert.equal(JSON.parse(start.body).manifest.name, "snake");
  } finally {
    server.close();
    for (const k of ["BANANAPEEL_SERVER_URL", "BANANAPEEL_SCAN_URL", "CLOUDMERSIVE_API_KEY"]) delete process.env[k];
  }
});
