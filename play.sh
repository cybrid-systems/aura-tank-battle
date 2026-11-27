#!/usr/bin/env bash
# Download the Aura nightly (sha256-checked, cached) and open the interactive
# board. AURA_BIN=/path/to/aura skips the download.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n "${AURA_BIN:-}" ]]; then
  exec "${AURA_BIN}" run game/play.aura "$@"
fi

bin="$(bash scripts/install-aura.sh)"
export PATH="${bin}:${PATH}"
exec aura run game/play.aura "$@"
