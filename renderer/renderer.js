const $ = (id) => document.getElementById(id);
const busy = new Set();
let installedNames = new Set();
let lastResults = [];
let wallet = { coins: 0, owned: [] };
let autodelete = true;

async function refreshWallet() {
  const res = await window.store.wallet();
  if (res.ok) wallet = res.data;
  $("coins").textContent = `🍌 ${wallet.coins}`;
}
const owned = (app) => wallet.owned.includes(app.spec.toLowerCase());

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
  const pay = app.price && !owned(app);
  const label = pay ? `Buy · ${app.price} 🍌` : isInstalled ? "Reinstall" : "Download";
  const btn = el("button", { className: "primary" }, busy.has(app.spec) ? "Installing…" : label);
  btn.disabled = busy.has(app.spec) || (pay && wallet.coins < app.price);
  if (pay && wallet.coins < app.price) btn.title = `You have ${wallet.coins} 🍌, it costs ${app.price}. You get +10 every day.`;
  btn.onclick = () => install(app, btn);
  const repo = el("a", { href: "#", textContent: app.spec });
  repo.onclick = (e) => { e.preventDefault(); window.store.openRepo(app.spec); };
  const meta = el("div", { className: "meta" }, repo, (app.version ? ` · v${app.version}` : "") + (app.stars ? ` · ★ ${app.stars}` : ""));
  const warn = (app.notices || []).filter((n) => !(app.price && owned(app) && n.includes("BananaCoins"))).map((n) => el("div", { className: "meta" }, `⏳ ${n}`));
  return card({ icon: app.icon, title: app.title, desc: app.description, meta: el("div", {}, meta, ...warn), actions: [btn] });
}

async function install(app, btn) {
  if (!(await window.store.settings()).data?.hasKey) {
    banner("Add your Cloudmersive API key in Settings first — apps are virus-scanned before install.", true);
    return;
  }
  banner("");
  const opts = {};
  if (app.account) {
    opts.pin = await ask({ title: `PIN for ${app.spec}`, text: "Ask the author for the 6–10 digit PIN.", input: "PIN", ok: "Install" });
    if (!opts.pin) return;
  }
  if (app.locked) {
    opts.code = await ask({ title: `${app.title} is locked`, text: "Enter the unlock code the author gave you.", input: "XXXX-XXXX-XXXX-XXXX", ok: "Unlock & install" });
    if (!opts.code) return;
  }
  if (app.selfRemoves && autodelete) {
    const choice = await ask({ title: `${app.title} can remove itself`, text: (app.notices || []).filter((n) => !/BananaCoins|locked/.test(n)).join(" · "), ok: "Let it", alt: "Keep it" });
    if (!choice) return;
    if (choice === "alt") opts.keep = true;
  }
  if (app.price && !owned(app) && !(await ask({ title: `Buy ${app.title}?`, text: `It costs ${app.price} BananaCoins (pretend coins, not real money). You have ${wallet.coins} and only pay once.`, ok: `Buy for ${app.price} 🍌` }))) return;
  busy.add(app.spec);
  btn.disabled = true;
  btn.textContent = "Installing…";
  $("log").hidden = false;
  $("log").textContent = "";
  const res = await window.store.install(app.spec, opts);
  busy.delete(app.spec);
  if (res.ok && res.data?.relaunching) return banner("Updated! Restarting BananaPeel Store…");
  banner(res.ok ? `Installed ${app.title}.` : res.error, !res.ok);
  await Promise.all([refreshInstalled(), refreshWallet()]);
  renderResults();
}

// Electron has no window.prompt/confirm, so ask in a small dialog. Resolves to the typed text (or true), or null if cancelled.
function ask({ title, text, input, ok = "OK", alt }) {
  const dlg = $("ask"), box = $("ask-input");
  $("ask-title").textContent = title;
  $("ask-text").textContent = text || "";
  box.hidden = !input; box.value = ""; box.placeholder = input || "";
  $("ask-ok").textContent = ok;
  $("ask-alt").hidden = !alt; $("ask-alt").textContent = alt || "";
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); resolve(v); };
    $("ask-form").onsubmit = (e) => { e.preventDefault(); done(input ? box.value.trim() || null : true); };
    $("ask-cancel").onclick = () => done(null);
    $("ask-alt").onclick = () => done("alt");
    dlg.oncancel = (e) => { e.preventDefault(); done(null); };
    dlg.showModal();
    if (input) box.focus();
  });
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
  const actions = [run, rm];
  if ((a.expiresAt || a.oneTime) && !a.kept) {
    const keep = el("button", {}, "Keep");
    keep.title = "Stop this app from removing itself";
    keep.onclick = async () => { const r = await window.store.keep(a.name); banner(r.ok ? `${a.title} will stay.` : r.error, !r.ok); refreshInstalled(); };
    actions.push(keep);
  }
  const meta = el("div", { className: "meta" }, `v${a.version} · ${a.language || "?"} · ${a.source}` + (a.windowed ? "" : " · runs in background")
    + (a.expiresAt ? ` · expires ${new Date(a.expiresAt).toLocaleString()}` : "") + (a.oneTime ? " · one-time app" : ""));
  return card({ icon: a.icon, title: a.title, desc: a.description, meta, actions });
}

// Looks like "owner/repo" or a github.com URL → install that repo directly.
const looksLikeRepo = (s) => /^(https?:\/\/github\.com\/)?@?[\w.-]+\/[\w.-]+(@[\w./-]+)?(\.git)?\/?$/i.test(s.trim());

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
  for (const id of ["discover", "installed", "account", "settings"]) $(id).hidden = id !== t.dataset.tab;
  if (t.dataset.tab === "installed") refreshInstalled();
  if (t.dataset.tab === "settings") { keyStatus(); loadAutodelete(); }
  if (t.dataset.tab === "account") loadAccount();
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

(async () => { await refreshInstalled(); await refreshWallet(); await search(""); })();

// ---------- Settings: auto-delete
async function loadAutodelete() {
  const r = await window.store.account();
  if (r.ok) { autodelete = r.data.autodelete; $("autodelete").checked = autodelete; }
}
$("autodelete").addEventListener("change", async (e) => {
  const r = await window.store.setAutodelete(e.target.checked);
  if (!r.ok) { banner(r.error, true); e.target.checked = !e.target.checked; return; }
  autodelete = e.target.checked;
  banner(autodelete ? "Apps can remove themselves again." : "No app will remove itself now.");
});
loadAutodelete();

// ---------- Account
async function loadAccount() {
  const r = await window.store.account();
  if (!r.ok) return banner(r.error, true);
  const me = r.data.username;
  $("acct-out").hidden = Boolean(me);
  $("acct-in").hidden = !me;
  $("acct-name").textContent = me ? `Signed in as @${me}` : "";
  $("server-url").placeholder = r.data.serverUrl || "Using BananaPeel's default server";
  if (me) loadUploads(me);
  const g = await window.store.githubStatus();
  $("gh-status").textContent = g.data?.signedIn ? "✔ A token is saved." : "No token saved.";
}

async function loadUploads(me) {
  const r = await window.store.uploads();
  const box = $("uploads-list");
  if (!r.ok) { box.replaceChildren(el("p", { className: "muted" }, r.error)); return; }
  box.replaceChildren(...(r.data.length ? r.data.map((name) => {
    const pin = el("button", {}, "Change PIN");
    pin.onclick = async () => {
      const v = await ask({ title: `New PIN for ${name}`, text: "6–10 digits. The old PIN stops working.", input: "PIN", ok: "Change" });
      if (!v) return;
      const x = await window.store.setPin(name, v);
      banner(x.ok ? "PIN changed." : x.error, !x.ok);
    };
    const rm = el("button", {}, "Remove");
    rm.onclick = async () => {
      if (!(await ask({ title: `Remove ${name}?`, text: "People who already installed it keep their copy.", ok: "Remove" }))) return;
      const x = await window.store.unpublish(name);
      banner(x.ok ? `Removed ${name}.` : x.error, !x.ok);
      loadUploads(me);
    };
    return card({ title: name, desc: `Install name: @${me}/${name}`, meta: el("div"), actions: [pin, rm] });
  }) : [el("p", { className: "muted" }, "Nothing uploaded yet.")]));
}

async function accountAction(kind) {
  const user = $("acct-user").value.trim(), pass = $("acct-pass").value;
  const res = kind === "signup" ? await window.store.signup(user, pass, $("acct-code").value.trim()) : await window.store.login(user, pass);
  $("acct-pass").value = "";
  banner(res.ok ? (kind === "signup" ? "Account created. You're signed in." : "Signed in.") : res.error, !res.ok);
  loadAccount();
}
$("acct-form").addEventListener("submit", (e) => { e.preventDefault(); accountAction("login"); });
$("acct-signup").addEventListener("click", () => accountAction("signup"));
$("acct-logout").addEventListener("click", async () => { const r = await window.store.logout(); banner(r.ok ? "Signed out." : r.error, !r.ok); loadAccount(); });
$("server-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await window.store.setServer($("server-url").value.trim());
  $("server-status").textContent = r.ok ? "✔ Server saved." : r.error;
  if (r.ok) $("server-url").value = "";
});
$("gh-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await window.store.githubSave($("gh-token").value);
  $("gh-token").value = "";
  banner(r.ok ? `GitHub token saved for ${r.data}.` : r.error, !r.ok);
  loadAccount();
});
$("gh-clear").addEventListener("click", async () => { await window.store.githubClear(); banner("GitHub token removed."); loadAccount(); });

// ---------- Upload an app folder
$("upload-btn").addEventListener("click", async () => {
  banner("");
  if (!(await window.store.settings()).data?.hasKey) return banner("Add your Cloudmersive API key in Settings first: apps are virus-scanned before they're uploaded.", true);
  const picked = await window.store.pickFolder();
  if (!picked.ok) return banner(picked.error, true);
  if (!picked.data) return; // cancelled
  let manifest = picked.data.manifest;
  if (!manifest) {
    if (!(await ask({ title: "No bananapeel.json in this folder", text: `Make one for "${picked.data.folder}" now? You can edit it afterwards.`, ok: "Create it" }))) return;
    const made = await window.store.initFolder();
    if (!made.ok) return banner(made.error, true);
    manifest = made.data.manifest;
  }
  const pin = await ask({ title: `Upload ${manifest.title} v${manifest.version || "?"}`, text: "Choose a 6–10 digit PIN. Anyone installing it will need the PIN.", input: "PIN", ok: "Scan & upload" });
  if (!pin) return;
  $("log").hidden = false; $("log").textContent = "";
  banner(`Scanning and uploading ${manifest.title}…`);
  $("upload-btn").disabled = true;
  const res = await window.store.upload(pin);
  $("upload-btn").disabled = false;
  if (!res.ok) return banner(res.error, true);
  banner(res.data.install ? `Uploaded! People install it with ${res.data.install} and the PIN.` : "Uploaded!");
  const me = (await window.store.account()).data?.username;
  if (me) loadUploads(me);
});
