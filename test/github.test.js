const test = require("node:test");
const assert = require("node:assert");
const gh = require("../lib/github.cjs");

test("normalizeSpec accepts URLs and plain specs", () => {
  assert.equal(gh.normalizeSpec("https://github.com/blockblock2/repro-app.git"), "blockblock2/repro-app");
  assert.equal(gh.normalizeSpec(" blockblock2/repro-app "), "blockblock2/repro-app");
});

test("parseSpec rejects junk", () => {
  assert.equal(gh.parseSpec("nope"), null);
  assert.equal(gh.parseSpec("a/b; rm -rf /"), null);
  assert.deepEqual(gh.parseSpec("a/b@v1"), { owner: "a", repo: "b", ref: "v1" });
});

test("searchApps keeps only repos with a valid bananapeel.json", async () => {
  const manifest = { name: "repro", title: "Repro", version: "1.1.0", main: "repro.sh", icon: "icon.png" };
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("api.github.com/search/repositories")) {
      return { ok: true, json: async () => ({ items: [
        { full_name: "blockblock2/repro-app", stargazers_count: 3 }, { full_name: "x/not-an-app", stargazers_count: 9 }] }) };
    }
    if (u.includes("blockblock2/repro-app/HEAD/bananapeel.json")) return { ok: true, json: async () => manifest };
    return { ok: false, status: 404 };
  };
  delete process.env.GITHUB_TOKEN;
  const apps = await gh.searchApps("");
  assert.equal(apps.length, 1);
  assert.equal(apps[0].title, "Repro");
  assert.equal(apps[0].icon, "https://raw.githubusercontent.com/blockblock2/repro-app/HEAD/icon.png");
  assert.equal(apps[0].stars, 3);
});

test("toApp includes self-removal notices from BananaPeel", async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ name: "t", main: "index.html", expires: "7d", uninstallAfterRun: true }) });
  const app = await gh.toApp("a/b");
  assert.deepEqual(app.notices, ["expires 7d after installing", "one-time app: removes itself after you close it"]);
});

test("unlisted apps are hidden from search but can still be looked up", async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("search/repositories")) return { ok: true, json: async () => ({ items: [{ full_name: "a/hidden", stargazers_count: 0 }, { full_name: "a/shown", stargazers_count: 0 }] }) };
    if (u.includes("a/hidden/")) return { ok: true, json: async () => ({ name: "hidden", main: "index.html", unlisted: true }) };
    return { ok: true, json: async () => ({ name: "shown", main: "index.html" }) };
  };
  delete process.env.GITHUB_TOKEN;
  assert.deepEqual((await gh.searchApps("")).map((a) => a.name), ["shown"]);
  assert.equal((await gh.toApp("a/hidden")).name, "hidden");
});

test("locked and priced apps are flagged with notices", async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ name: "p", main: "index.html", locked: true, price: 30 }) });
  const app = await gh.toApp("a/p");
  assert.equal(app.locked, true);
  assert.equal(app.price, 30);
  assert.equal(app.notices.length, 2);
});

test("@user/app is an account upload that needs a PIN, without a network call", async () => {
  global.fetch = async () => { throw new Error("should not fetch"); };
  const app = await gh.toApp("@someone/cool-app");
  assert.equal(app.needsPin, true);
  assert.equal(gh.isAccountSpec("@someone/cool-app"), true);
  assert.equal(gh.isAccountSpec("someone/cool-app"), false);
});

test("whoami checks a token with GitHub", async () => {
  global.fetch = async (url, opts) => opts.headers.Authorization === "Bearer good_token_1234567890" ? { ok: true, status: 200, json: async () => ({ login: "ricardo" }) } : { ok: false, status: 401 };
  assert.equal(await gh.whoami("good_token_1234567890"), "ricardo");
  await assert.rejects(gh.whoami("bad_token_000000000000"), /didn't accept/);
});

test("a saved token is sent with GitHub searches", async () => {
  let seen;
  global.fetch = async (url, opts) => { if (String(url).includes("search/repositories")) seen = opts.headers.Authorization; return { ok: true, json: async () => ({ items: [] }) }; };
  gh.setToken("saved_token_1234567890");
  await gh.searchApps("");
  gh.setToken(null);
  assert.equal(seen, "Bearer saved_token_1234567890");
});

test("apps that remove themselves are flagged so the store can ask first", async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ name: "t", main: "index.html", expires: "7d" }) });
  assert.equal((await gh.toApp("a/b")).selfRemoves, true);
  global.fetch = async () => ({ ok: true, json: async () => ({ name: "t", main: "index.html" }) });
  assert.equal((await gh.toApp("a/b")).selfRemoves, false);
});
