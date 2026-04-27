#!/usr/bin/env bash

# Sanity-check a freshly built CardVault.app on macOS.
# Run this after `npm run mac:build` on the MacBook.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-electron"

green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    red "This verifier only runs on macOS."
    exit 1
  fi
}

find_app() {
  local candidates=(
    "$DIST_DIR/mac-universal/CardVault.app"
    "$DIST_DIR/mac-arm64/CardVault.app"
    "$DIST_DIR/mac/CardVault.app"
  )
  for path in "${candidates[@]}"; do
    if [[ -d "$path" ]]; then
      printf '%s' "$path"
      return 0
    fi
  done
  return 1
}

check_plist_key() {
  local plist="$1" key="$2"
  if /usr/libexec/PlistBuddy -c "Print :${key}" "$plist" >/dev/null 2>&1; then
    green "  ✓ Info.plist has ${key}"
  else
    red "  ✗ Info.plist is missing ${key}"
    return 1
  fi
}

main() {
  require_macos

  if [[ ! -d "$DIST_DIR" ]]; then
    red "No dist-electron/ directory. Run 'npm run mac:build' first."
    exit 1
  fi

  local app
  if ! app=$(find_app); then
    red "No CardVault.app found under $DIST_DIR/mac*. Run 'npm run mac:build'."
    exit 1
  fi
  green "Found app: $app"

  local binary="$app/Contents/MacOS/CardVault"
  if [[ ! -x "$binary" ]]; then
    red "Binary missing or not executable: $binary"
    exit 1
  fi
  green "Binary is executable"

  local arches
  arches="$(lipo -archs "$binary" 2>/dev/null || echo "unknown")"
  green "Architectures: $arches"

  local plist="$app/Contents/Info.plist"
  if [[ ! -f "$plist" ]]; then
    red "Info.plist missing"
    exit 1
  fi

  check_plist_key "$plist" "CFBundleName"
  check_plist_key "$plist" "CFBundleIdentifier"
  check_plist_key "$plist" "NSCameraUsageDescription"
  check_plist_key "$plist" "NSLocalNetworkUsageDescription"
  check_plist_key "$plist" "CFBundleURLTypes:0:CFBundleURLSchemes:0"

  local bundle_id
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
  if [[ "$bundle_id" != "com.scottmorley.cardvault" ]]; then
    yellow "  ! Bundle ID is '$bundle_id' (expected com.scottmorley.cardvault)"
  fi

  local asar="$app/Contents/Resources/app.asar"
  if [[ ! -f "$asar" ]]; then
    red "app.asar not found"
    exit 1
  fi
  green "app.asar present ($(du -h "$asar" | awk '{print $1}'))"

  local unpacked="$app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3"
  if [[ ! -d "$unpacked" ]]; then
    red "better-sqlite3 not unpacked from asar"
    exit 1
  fi
  green "better-sqlite3 unpacked correctly"

  yellow "Launching the app for 5s as a smoke test (will quit automatically)…"
  open -gj "$app"
  local pid
  pid=$(pgrep -f "CardVault.app/Contents/MacOS/CardVault" | head -1 || true)
  if [[ -z "$pid" ]]; then
    red "  ✗ App did not start"
    exit 1
  fi
  green "  ✓ App PID $pid"
  sleep 5
  if kill -0 "$pid" 2>/dev/null; then
    green "  ✓ App still running after 5s — no immediate crash"
    osascript -e 'tell application "CardVault" to quit' >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true
  else
    red "  ✗ App quit within 5s. Check Console.app for crash logs."
    exit 1
  fi

  green "All checks passed. CardVault.app is ready to launch."
}

main "$@"
