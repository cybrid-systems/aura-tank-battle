#!/usr/bin/env bash
# Install the pinned Aura nightly, start the local bridge and serve the page.
# AURA_BIN=/path/to/aura skips the download.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${AURA_BIN:-}" ]]; then
  if ! command -v aura >/dev/null 2>&1; then
    bin="$(bash scripts/install-aura.sh)"
    export PATH="${bin}:${PATH}"
  fi
  export AURA_BIN="$(command -v aura)"
fi

node bridge/server.mjs
