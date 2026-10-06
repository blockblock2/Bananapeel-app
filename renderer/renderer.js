const $ = (id) => document.getElementById(id);
const busy = new Set();
let installedNames = new Set();
let lastResults = [];

function banner(msg, isError) {
  const b = $("banner");
  b.hidden = !msg;
  b.textContent = msg || "";
  b.className = isError ? "error" : "";
}

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

function card({ icon, title, desc, meta, actions }) {
  const img = icon ? el("img", { className: "icon", src: icon, alt: "" }) : el("div", { className: "icon" }, "🍌");
  img.onerror = () => img.replaceWith(el("div", { className: "icon" }, "🍌"));
  return el("div", { className: "card" }, img,
    el("div", { className: "body" },
      el("div", { className: "title" }, title), el("div", { className: "desc" }, desc || "No description."),
      meta, el("div", { className: "actions" }, ...actions)));
}

function appCard(app) {
  const isInstalled = installedNames.has(app.name);
  const btn = el("button", { className: "primary" }, busy.has(app.spec) ? "Installing…" : isInstalled ? "Reinstall" : "Download");
  btn.disabled = busy.has(app.spec);
  btn.onclick = () => install(app, btn);
  const repo = el("a", { href: "#", textContent: app.spec });
  repo.onclick = (e) => { e.preventDefault(); window.store.openRepo(app.spec); };
  const meta = el("div", { className: "meta" }, repo, ` · v${app.version}` + (app.stars ? ` · ★ ${app.stars}` : ""));
  return card({ icon: app.icon, title: app.title, desc: app.description, meta, actions: [btn] });
}

async function install(app, btn) {
  if (!(await window.store.settings()).data?.hasKey) {
    banner("Add your Cloudmersive API key in Settings first — apps are virus-scanned before install.", true);
    return;
  }
  banner("");
  busy.add(app.spec);
  btn.disabled = true;
  btn.textContent = "Installing…";
  $("log").hidden = false;
  $("log").textContent = "";
  const res = await window.store.install(app.spec);
  busy.delete(app.spec);
  banner(res.ok ? `Installed ${app.title}.` : res.error, !res.ok);
  await refreshInstalled();
  renderResults();
}

function renderResults() {
  const box = $("results");
  box.replaceChildren(...lastResults.map(appCard));
}

async function refreshInstalled() {
  const res = await window.store.installed();
  const apps = res.ok ? res.data : [];
  installedNames = new Set(apps.map((a) => a.name));
  $("installed-list").replaceChildren(...(apps.length ? apps.map(installedCard)
    : [el("p", { className: "muted" }, "Nothing installed yet. Find something in Discover.")]));
}

function installedCard(a) {
  const run = el("button", { className: "primary" }, "Open");
  run.onclick = async () => { const r = await window.store.run(a.name); if (!r.ok) banner(r.error, true); };
  const rm = el("button", {}, "Uninstall");
  rm.onclick = async () => {
    rm.disabled = true;
    const r = await window.store.uninstall(a.name);
    banner(r.ok ? `Removed ${a.name}.` : r.error, !r.ok);
    await refreshInstalled();
    renderResults();
  };
  const meta = el("div", { className: "meta" }, `v${a.version} · ${a.language || "?"} · ${a.source}` + (a.windowed ? "" : " · runs in background"));
  return card({ icon: a.icon, title: a.title, desc: a.description, meta, actions: [run, rm] });
}

// Looks like "owner/repo" or a github.com URL → install that repo directly.
const looksLikeRepo = (s) => /^(https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+(@[\w./-]+)?(\.git)?\/?$/i.test(s.trim());

async function search(query) {
  banner("");
  $("status").textContent = "Searching GitHub…";
  const res = looksLikeRepo(query) ? await window.store.lookup(query) : await window.store.search(query);
  if (!res.ok) { $("status").textContent = ""; lastResults = []; renderResults(); return banner(res.error, true); }
  lastResults = Array.isArray(res.data) ? res.data : [res.data];
  $("status").textContent = lastResults.length ? "" : "No BananaPeel apps found. Try a different search, or paste a repo as owner/repo.";
  renderResults();
}

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  for (const id of ["discover", "installed", "settings"]) $(id).hidden = id !== t.dataset.tab;
  if (t.dataset.tab === "installed") refreshInstalled();
  if (t.dataset.tab === "settings") keyStatus();
}));

$("search").addEventListener("submit", (e) => { e.preventDefault(); search($("q").value); });

async function keyStatus() {
  const s = await window.store.settings();
  $("key-status").textContent = s.data?.hasKey ? "✔ A key is saved." : "No key saved yet.";
}
$("key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await window.store.saveKey($("key").value.trim());
  $("key").value = "";
  banner(res.ok ? "Key saved." : res.error, !res.ok);
  keyStatus();
});

window.store.onLog((_spec, text) => { const l = $("log"); l.textContent += text; l.scrollTop = l.scrollHeight; });

(async () => { await refreshInstalled(); await search(""); })();
