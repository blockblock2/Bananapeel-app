// Finds BananaPeel apps on GitHub. `bananapeel list` only shows what is
// already installed, so discovery works off GitHub itself:
//   1. repos tagged with the "bananapeel" topic (no login needed)
//   2. repos containing a bananapeel.json (GitHub code search, needs GITHUB_TOKEN)
// Every candidate is then checked for a valid bananapeel.json.
const UA = { "User-Agent": "bananapeel-store", Accept: "application/vnd.github+json" };
const SPEC_RE = /^([\w.-]+)\/([\w.-]+)(?:@([\w./-]+))?$/;

// Private upload by a BananaPeel account: @user/app (needs a PIN to install).
const ACCOUNT_RE = /^@[a-z0-9][a-z0-9_-]{2,19}\/[a-z0-9][a-z0-9_-]{0,49}$/i;
const isAccountSpec = (spec) => ACCOUNT_RE.test((spec || "").trim());

function parseSpec(spec) {
  const m = SPEC_RE.exec((spec || "").trim());
  return m ? { owner: m[1], repo: m[2], ref: m[3] || "HEAD" } : null;
}

// Accepts "owner/repo" or a full github.com URL.
function normalizeSpec(input) {
  const s = (input || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const url = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/i.exec(s);
  return url ? `${url[1]}/${url[2]}` : s;
}

function headers() {
  const h = { ...UA };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function ghJson(url) {
  const res = await fetch(url, { headers: headers() });
  if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached. Wait a minute and try again.");
  if (!res.ok) throw new Error(`GitHub error: HTTP ${res.status}`);
  return res.json();
}

async function fetchManifest({ owner, repo, ref }) {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/bananapeel.json`, { headers: UA });
  if (!res.ok) return null;
  try {
    const m = await res.json();
    return m && typeof m === "object" && typeof m.name === "string" && typeof m.main === "string" ? m : null;
  } catch { return null; }
}

function iconUrl({ owner, repo, ref }, manifest) {
  if (!manifest.icon || /^[\\/]|\.\./.test(manifest.icon)) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${manifest.icon.split("/").map(encodeURIComponent).join("/")}`;
}

// "Removes itself…" warnings, from BananaPeel itself so they match the CLI wording.
async function notices(manifest) {
  try {
    const { describeSelfRemove } = await import("@blockblock2/bananapeel/lib/selfremove.js");
    return describeSelfRemove(manifest);
  } catch { return []; }
}

async function toApp(spec, extra = {}) {
  // Account uploads are private: we can't read their manifest without the PIN.
  if (isAccountSpec(spec)) {
    return { spec: spec.trim().toLowerCase(), name: spec.trim(), title: spec.trim(), version: "", description: "Private upload. You'll be asked for its PIN.",
      main: "", icon: null, notices: [], account: true, needsPin: true, ...extra };
  }
  const where = parseSpec(spec);
  if (!where) return null;
  const manifest = await fetchManifest(where);
  if (!manifest) return null;
  return {
    spec: `${where.owner}/${where.repo}`,
    name: manifest.name,
    title: manifest.title || manifest.name,
    version: manifest.version || "0.0.0",
    description: manifest.description || "",
    main: manifest.main,
    icon: iconUrl(where, manifest),
    notices: [
      ...(manifest.locked ? ["🔑 locked: you need an unlock code from the author"] : []),
      ...(manifest.price ? [`🍌 costs ${manifest.price} BananaCoins (pretend coins)`] : []),
      ...(await notices(manifest)),
    ],
    locked: Boolean(manifest.locked),
    price: Number(manifest.price) || 0,
    unlisted: Boolean(manifest.unlisted),
    ...extra,
  };
}

async function candidates(query) {
  const found = new Map();
  const q = (query || "").trim();
  const topic = await ghJson(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:bananapeel ${q}`.trim())}&sort=stars&per_page=50`);
  for (const r of topic.items || []) found.set(r.full_name.toLowerCase(), { spec: r.full_name, stars: r.stargazers_count });

  if (process.env.GITHUB_TOKEN) {
    try {
      const code = await ghJson(
        `https://api.github.com/search/code?q=${encodeURIComponent(`filename:bananapeel.json ${q}`.trim())}&per_page=50`);
      for (const i of code.items || []) {
        const key = i.repository.full_name.toLowerCase();
        if (!found.has(key)) found.set(key, { spec: i.repository.full_name, stars: 0 });
      }
    } catch { /* code search is a bonus; topic results still count */ }
  }
  return [...found.values()];
}

async function searchApps(query) {
  const results = await Promise.all((await candidates(query)).map((c) => toApp(c.spec, { stars: c.stars }).catch(() => null)));
  // Unlisted apps stay out of Discover; people can still install them by typing the repo.
  return results.filter((a) => a && !a.unlisted);
}

module.exports = { isAccountSpec, parseSpec, normalizeSpec, fetchManifest, toApp, searchApps };
