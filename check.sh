#!/usr/bin/env bash
# Local gate: baseline pin, golden tests, demo and one scripted play turn.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n "${AURA_BIN:-}" ]]; then
  export PATH="$(dirname "${AURA_BIN}"):${PATH}"
elif ! command -v aura >/dev/null 2>&1; then
  bin="$(bash scripts/install-aura.sh)"
  export PATH="${bin}:${PATH}"
fi

echo "== baseline"
python3 scripts/check-baseline.py --self

echo "== tests"
aura test

echo "== demo"
aura run game/main.aura >/dev/null

echo "== play smoke"
printf 'd\nf\nq\n' | aura run game/play.aura >/dev/null

echo "== evolution demo"
aura run game/evolve-demo.aura >/dev/null

echo "== server ping"
printf '{"cmd":"ping"}\n' | aura run game/server.aura | grep -q '"pong"'

echo "checks ok"
