#!/bin/sh
# Downloads the static fpcalc (Chromaprint) binary for Linux x86_64.
# Runs during Vercel build so the identify route has a real binary available.
set -e

mkdir -p bin

if [ -f bin/fpcalc ]; then
  echo "fpcalc already present, skipping download"
  exit 0
fi

FPCALC_URL="https://github.com/acoustid/chromaprint/releases/download/v1.5.1/chromaprint-fpcalc-1.5.1-linux-x86_64.tar.gz"
echo "Downloading fpcalc from $FPCALC_URL"
curl -L "$FPCALC_URL" | tar -xzf - --strip-components=1 -C bin/ --wildcards "*/fpcalc"
chmod +x bin/fpcalc
echo "fpcalc installed at bin/fpcalc"
