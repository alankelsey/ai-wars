#!/usr/bin/env bash
# Headless screenshot of the dev server (Playwright has no Chromium build for Ubuntu 26.04; uses system Chrome).
#   scripts/screenshot.sh [path=/] [out=.dev/shot.png] [WxH=1280,800]
set -euo pipefail
cd "$(dirname "$0")/.."
url="http://localhost:3000${1:-/}"; out=${2:-.dev/shot.png}; size=${3:-1280,800}
mkdir -p "$(dirname "$out")"
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size="$size" \
  --virtual-time-budget=3000 --screenshot="$out" "$url" >/dev/null 2>&1
echo "$out"
