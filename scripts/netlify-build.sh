#!/usr/bin/env bash
# Netlify build: install the pnpm workspace, build the web app under /app/,
# and assemble the publish directory (landing at root, SPA under /app/).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9.15.0
fi

pnpm install --frozen-lockfile

# The app bundle is large (~6MB main chunk); unbounded V8 heap growth during
# rollup's chunk-render phase gets the process OOM-killed on 4GB boxes
# (exit 137 "Killed"). Cap the old-space so V8 GCs aggressively instead.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=1792"

# The app's build:web script pins READANY_WEB=1 and base=/app/ internally.
READANY_WEB=1 pnpm --filter app build:web

# Assemble the publish directory:
#   dist/index.html      ← landing page (self-contained + vendored QR lib)
#   dist/app/**          ← the SPA: index.html + hashed assets + public icons
rm -rf dist
mkdir -p dist
cp -r packages/app/dist dist/app
cp landing/index.html landing/qrcode.min.js dist/
[ -f landing/demo.html ] && cp landing/demo.html dist/demo.html
[ -f landing/demo-cache.json ] && cp landing/demo-cache.json dist/demo-cache.json
if [ -f landing/robots.txt ]; then
  cp landing/robots.txt dist/robots.txt
fi

echo "publish dir assembled:"
find dist -maxdepth 2 | sort | head -20
