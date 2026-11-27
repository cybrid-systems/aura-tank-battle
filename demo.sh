#!/usr/bin/env bash
# Run the deterministic headless demo (no keyboard input).
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n "${AURA_BIN:-}" ]]; then
  exec "${AURA_BIN}" run game/main.aura "$@"
fi

bin="$(bash scripts/install-aura.sh)"
export PATH="${bin}:${PATH}"
exec aura run game/main.aura "$@"
