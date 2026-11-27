#!/usr/bin/env bash
# The terminal version of the same Aura arena.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n "${AURA_BIN:-}" ]]; then
  exec "${AURA_BIN}" run game/play.aura "$@"
fi

bin="$(bash scripts/install-aura.sh)"
export PATH="${bin}:${PATH}"
exec aura run game/play.aura "$@"
