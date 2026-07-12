#!/usr/bin/env bash
# Rebuild the vendored configurator LOCALLY (never on the Pi — 1GB RAM OOMs on
# `next build`). Leaves the prebuilt output in configurator/src/build + bin so it
# can be committed to the mono-repo (the installer ships that committed build).
#
# Usage:  scripts/build-configurator.sh
# Requires: node + pnpm on a dev machine.
set -Eeuo pipefail

RK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
APP="${RK_ROOT}/configurator/src"

command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm required" >&2; exit 1; }
[[ -f "${APP}/package.json" ]] || { echo "ERROR: ${APP}/package.json not found" >&2; exit 1; }

echo ">> Installing deps in ${APP}"
pnpm -C "${APP}" install

echo ">> Building Next app (build/) + CLI (bin/ratical.mjs)"
pnpm -C "${APP}" build
pnpm -C "${APP}" build:cli

# Guard: OSS build must not contain SciChart (Community-license timeout / non-OSS).
if find "${APP}/build" -name 'scichart2d.wasm' -print -quit 2>/dev/null | grep -q .; then
  echo "ERROR: SciChart wasm found in build/ — refuse (analysis must be uPlot)" >&2; exit 1
fi

echo ">> Done."
echo "   Prebuilt: ${APP}/build  +  ${APP}/bin/ratical.mjs"
echo "   Commit it:  git add configurator/src/build configurator/src/bin && git commit -m 'chore: refresh prebuilt configurator'"
