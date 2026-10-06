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
