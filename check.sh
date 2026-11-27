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
server_out=$(printf '{"cmd":"ping"}\n{"cmd":"wish-text","text":"海底的小鱼","seed":1}\n' | aura run game/server.aura)
printf '%s' "$server_out" | grep -q '"pong"'
printf '%s' "$server_out" | grep -q '"theme":"ocean"'

echo "checks ok"
