# 🍌 BananaPeel Store

A desktop app (Electron) for [BananaPeel](https://www.npmjs.com/package/@blockblock2/bananapeel). Browse apps people have shared on GitHub and click **Download**, or paste a repo (`owner/repo` or a GitHub URL) to install it.

```bash
npm install
npm start
```

Then open **Settings** and paste your free [Cloudmersive](https://portal.cloudmersive.com) API key. BananaPeel refuses to install anything it can't virus-scan.

## How it works

- **Installing, running, uninstalling** all go through the real BananaPeel CLI (bundled as a dependency, run with Electron's own Node), so the virus scan and install rules are exactly the same as in the terminal. Nothing is installed if the scan fails or can't run.
- **Discover** searches GitHub for repos with the `bananapeel` topic, then keeps only those with a valid `bananapeel.json`. Set `GITHUB_TOKEN` to also include repos found by GitHub code search (`filename:bananapeel.json`) and to avoid rate limits.
- **Installed** reads `~/.bananapeel/installed.json` (or `$BANANAPEEL_HOME`).

## Account tab

- **BananaPeel account:** sign up, sign in and out, and manage your private uploads (change a PIN, remove an upload). To upload, run `bananapeel upload` inside your app's folder. Passwords are handed to BananaPeel through the environment, never on a command line.
- **GitHub token:** optional. Makes the store's GitHub searches faster and more complete. It's stored encrypted with your OS keychain and used only for searching. BananaPeel can't download private repos yet, so it doesn't unlock them.
- **Settings → auto-delete:** apps that remove themselves (expiring, one-time, score-based) ask first, and you can switch that off for good.

## For app authors

Add the **`bananapeel`** topic to your GitHub repo so it shows up in Discover. Without it, people can still install it by pasting `owner/repo`.

## Tests

```bash
npm test
```
