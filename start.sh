#!/bin/bash
# BananaPeel Store launcher (used by `bananapeel install` and `bananapeel dmg`).
# First run: copies the app somewhere writable and installs its packages
# (Electron + BananaPeel). After that it just opens.

SRC="$(cd "$(dirname "$0")" && pwd)"
RT="$HOME/.bananapeel-store"
WORK="$RT/app"
LOG="$RT/launcher.log"

# Apps opened from Spotlight/Finder don't get your normal PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

say()  { printf "\033[33m🍌 %s\033[0m\n" "$1"; }
fail() { printf "\n\033[31m✖ %s\033[0m\n" "$1"; exit 1; }
mkdir -p "$WORK"

echo
echo "   🍌  BananaPeel Store"
echo

command -v node >/dev/null && command -v npm >/dev/null \
  || fail "BananaPeel Store needs Node.js 18 or newer: https://nodejs.org"

# 1. Copy the app to a writable folder when it has changed (inside a .app it may be read-only)
HASH="$(cd "$SRC" && find . -type f ! -path './node_modules/*' ! -path './.git/*' -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-40)"
if [ "$(cat "$RT/.copied" 2>/dev/null)" != "$HASH" ]; then
  say "Setting up…"
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude node_modules --exclude .git "$SRC/" "$WORK/" || fail "Couldn't copy the app to $WORK"
  else
    find "$WORK" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
    (cd "$SRC" && tar cf - --exclude ./node_modules --exclude ./.git .) | (cd "$WORK" && tar xf -) \
      || fail "Couldn't copy the app to $WORK"
  fi
  echo "$HASH" > "$RT/.copied"
fi
cd "$WORK" || fail "Missing folder: $WORK"

# 2. Install packages when package-lock.json changes
LOCK="$(shasum package-lock.json 2>/dev/null | cut -c1-40)"
if [ ! -d node_modules ] || [ "$(cat "$RT/.installed" 2>/dev/null)" != "$LOCK" ]; then
  say "Installing (first time only, about a minute)…"
  npm ci --no-audit --no-fund >>"$LOG" 2>&1 || npm install --no-audit --no-fund >>"$LOG" 2>&1 \
    || fail "Installing packages failed. Details: $LOG"
  echo "$LOCK" > "$RT/.installed"
fi

# 3. Mac: a renamed copy of Electron, so the Dock says "BananaPeel Store" with its icon
if [ "$(uname)" = "Darwin" ]; then
  APP="$RT/BananaPeel Store.app"
  if [ ! -d "$APP" ] || [ "$(cat "$APP/.built" 2>/dev/null)" != "$HASH$LOCK" ]; then
    E="$WORK/node_modules/electron/dist/Electron.app"
    [ -d "$E" ] || fail "Electron didn't install. Details: $LOG"
    rm -rf "$APP"; cp -R "$E" "$APP"
    P="$APP/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleName BananaPeel Store" "$P"
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName BananaPeel Store" "$P" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string BananaPeel Store" "$P"
    /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.blockblock2.bananapeel-store" "$P"
    ICON="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$P" 2>/dev/null || echo electron.icns)"
    case "$ICON" in *.icns) ;; *) ICON="$ICON.icns" ;; esac
    [ -f "$WORK/icon.png" ] && sips -s format icns "$WORK/icon.png" --out "$APP/Contents/Resources/$ICON" >>"$LOG" 2>&1
    codesign --force --deep --sign - "$APP" >>"$LOG" 2>&1
    echo "$HASH$LOCK" > "$APP/.built"
  fi
  say "Opening BananaPeel Store…"
  nohup "$APP/Contents/MacOS/Electron" "$WORK" >>"$LOG" 2>&1 &
else
  say "Opening BananaPeel Store…"
  nohup "$WORK/node_modules/.bin/electron" "$WORK" >>"$LOG" 2>&1 &
fi
PID=$!
disown
sleep 3
if ! kill -0 "$PID" 2>/dev/null; then
  echo
  tail -n 25 "$LOG" 2>/dev/null
  fail "BananaPeel Store closed right after starting. The log above is also in $LOG"
fi
echo
echo "   BananaPeel Store is opening. You can close this window."
