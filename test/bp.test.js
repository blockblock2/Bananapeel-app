const test = require("node:test");
const assert = require("node:assert");
const { installArgs } = require("../lib/bp.cjs");

test("installArgs passes code and PIN as separate safe arguments", () => {
  assert.deepEqual(installArgs("a/b"), ["install", "a/b", "-y"]);
  assert.deepEqual(installArgs("a/b", { code: "ABCD-1234-EFGH-5678" }), ["install", "a/b", "-y", "--code=ABCD-1234-EFGH-5678"]);
  assert.deepEqual(installArgs("@u_ser/app", { pin: "482913" }), ["install", "@u_ser/app", "-y", "--pin=482913"]);
});

test("installArgs rejects bad specs, codes and PINs", () => {
  assert.throws(() => installArgs("nope"));
  assert.throws(() => installArgs("a/b", { code: "x; rm -rf /" }));
  assert.throws(() => installArgs("a/b", { pin: "12ab" }));
});

test("wallet reads BananaCoins from BananaPeel's config, defaulting to 100", () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bp-wallet-"));
  process.env.BANANAPEEL_HOME = home;
  delete require.cache[require.resolve("../lib/bp.cjs")];
  const { wallet } = require("../lib/bp.cjs");
  assert.deepEqual(wallet(), { coins: 100, owned: [] });
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ coins: 70, owned: ["A/B"] }));
  assert.deepEqual(wallet(), { coins: 70, owned: ["a/b"] });
});

test("isStore is true only for the installed copy of the store itself", () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bp-store-"));
  process.env.BANANAPEEL_HOME = home;
  fs.writeFileSync(path.join(home, "installed.json"), JSON.stringify({
    "bananapeel-store": { main: "start.sh", source: "blockblock2/Bananapeel-app" },
    repro: { main: "repro.sh", source: "blockblock2/repro-app" },
  }));
  delete require.cache[require.resolve("../lib/bp.cjs")];
  const { isStore } = require("../lib/bp.cjs");
  assert.equal(isStore("blockblock2/bananapeel-app"), true);
  assert.equal(isStore("blockblock2/repro-app"), false);
});
