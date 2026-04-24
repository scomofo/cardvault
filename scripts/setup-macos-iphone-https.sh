#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/certs"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"
KEY_PATH="certs/cardvault-key.pem"
CERT_PATH="certs/cardvault-cert.pem"
PORT="${CARDVAULT_PORT:-3000}"

log() {
  printf '\n[%s] %s\n' "cardvault" "$1"
}

fail() {
  printf '\n[cardvault] Error: %s\n' "$1" >&2
  exit 1
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "This setup script is intended for macOS."
  fi
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  fail "Homebrew is required. Install it from https://brew.sh and rerun this script."
}

ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    return
  fi

  log "Installing mkcert with Homebrew"
  brew install mkcert
}

detect_bonjour_host() {
  local raw_host
  raw_host="$(scutil --get LocalHostName 2>/dev/null || true)"
  if [[ -z "$raw_host" ]]; then
    raw_host="$(hostname -s 2>/dev/null || true)"
  fi
  if [[ -z "$raw_host" ]]; then
    fail "Could not determine the Mac's local hostname."
  fi
  printf '%s.local' "$raw_host"
}

detect_lan_ip() {
  local interface_name
  interface_name="$(route -n get default 2>/dev/null | awk '/interface: / { print $2; exit }')"

  if [[ -n "$interface_name" ]]; then
    ipconfig getifaddr "$interface_name" 2>/dev/null || true
    return
  fi

  for candidate in en0 en1; do
    if ipconfig getifaddr "$candidate" >/dev/null 2>&1; then
      ipconfig getifaddr "$candidate"
      return
    fi
  done
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    return
  fi

  if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    log "Creating .env from .env.example"
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    return
  fi

  touch "$ENV_FILE"
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  if grep -Eq "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { updated = 0 }
      $0 ~ ("^" key "=") {
        print key "=" value
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print key "=" value
        }
      }
    ' "$ENV_FILE" > "$tmp_file"
  else
    cat "$ENV_FILE" > "$tmp_file"
    if [[ -s "$tmp_file" ]]; then
      printf '\n' >> "$tmp_file"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv "$tmp_file" "$ENV_FILE"
}

main() {
  require_macos
  ensure_homebrew
  ensure_mkcert

  local bonjour_host
  local lan_ip
  local redirect_uri
  local caroot

  bonjour_host="${CARDVAULT_HOSTNAME:-$(detect_bonjour_host)}"
  lan_ip="${CARDVAULT_IP:-$(detect_lan_ip)}"

  if [[ -z "$lan_ip" ]]; then
    fail "Could not determine the MacBook's LAN IP. Re-run with CARDVAULT_IP=your.ip.address."
  fi

  redirect_uri="https://${bonjour_host}:${PORT}/api/ebay/callback"

  log "Using Bonjour host: ${bonjour_host}"
  log "Using LAN IP: ${lan_ip}"

  mkdir -p "$CERT_DIR"

  log "Installing mkcert local CA into the macOS trust store"
  mkcert -install

  log "Generating local HTTPS certificate"
  (
    cd "$ROOT_DIR"
    mkcert \
      -key-file "$KEY_PATH" \
      -cert-file "$CERT_PATH" \
      localhost 127.0.0.1 ::1 "$bonjour_host" "$lan_ip"
  )

  ensure_env_file
  upsert_env_var "HOST" "0.0.0.0"
  upsert_env_var "SSL_KEY_FILE" "$KEY_PATH"
  upsert_env_var "SSL_CERT_FILE" "$CERT_PATH"
  upsert_env_var "DEV_HOSTNAME" "$bonjour_host"
  upsert_env_var "EBAY_REDIRECT_URI" "$redirect_uri"

  caroot="$(mkcert -CAROOT)"

  log "Setup complete"
  printf '  App URL: %s\n' "https://${bonjour_host}:${PORT}"
  printf '  Backup URL: %s\n' "https://${lan_ip}:${PORT}"
  printf '  Root CA to install on iPhone: %s\n' "${caroot}/rootCA.pem"
  printf '  .env updated: %s\n' "$ENV_FILE"
  printf '\nNext steps:\n'
  printf '  1. AirDrop "%s" to the iPhone and install it.\n' "${caroot}/rootCA.pem"
  printf '  2. On iPhone: Settings > General > About > Certificate Trust Settings > enable full trust.\n'
  printf '  3. Start CardVault with: npm run dev:secure\n'
  printf '  4. Open Safari on iPhone: %s\n' "https://${bonjour_host}:${PORT}"
}

main "$@"
