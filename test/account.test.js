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
