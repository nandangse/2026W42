#!/bin/sh
# Emit the deck's two pure modules as plain ESM that node can run.
#
# tsc writes the import specifiers exactly as the source has them ("./delivered"),
# and node's ESM resolver will not guess the extension -- so they are rewritten
# here. Run this before render.mjs, and after any edit to src/lib/deck*.ts.
set -e
cd "$(dirname "$0")/../.."
rm -rf scratchpad/deck/build
node node_modules/typescript/bin/tsc --outDir scratchpad/deck/build \
  --module esnext --target es2021 --moduleResolution bundler --skipLibCheck \
  src/lib/deck.ts src/lib/deck-build.ts
for f in scratchpad/deck/build/*.js; do
  sed -i '' -E 's|(from "\./[a-z-]+)";|\1.js";|g' "$f"
done
echo "compiled -> scratchpad/deck/build"
