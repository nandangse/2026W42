#!/bin/sh
# Emit the report module as ESM node can run. Same trick as the deck: tsc keeps
# the import specifiers verbatim and node will not guess the extension.
set -e
cd "$(dirname "$0")/../.."
rm -rf scratchpad/report/build
node node_modules/typescript/bin/tsc --outDir scratchpad/report/build \
  --module esnext --target es2021 --moduleResolution bundler --skipLibCheck \
  src/lib/delivery-report.ts
for f in scratchpad/report/build/*.js; do
  sed -i '' -E 's|(from "\./[a-z-]+)";|\1.js";|g' "$f"
done
echo "compiled -> scratchpad/report/build"
