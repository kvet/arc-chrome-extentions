#!/usr/bin/env bash
# Builds two zips per extension:
#   dist/<extension>-<version>.zip        unzips to a <extension>/ folder, for "Load unpacked"
#   dist/store/<extension>-<version>.zip  manifest.json at the zip root, for Chrome Web Store upload
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dist="$root/dist"
rm -rf "$dist"
mkdir -p "$dist/store"

for ext in kept-tabs pr-live-groups; do
  version="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$root/$ext/manifest.json" | head -n 1)"
  if [ -z "$version" ]; then
    echo "No version in $ext/manifest.json" >&2
    exit 1
  fi
  (cd "$root" && zip -qr -X "$dist/$ext-$version.zip" "$ext" -x '*.DS_Store' "$ext/icons/icon.svg")
  (cd "$root/$ext" && zip -qr -X "$dist/store/$ext-$version.zip" . -x '*.DS_Store' 'icons/icon.svg')
  echo "$dist/$ext-$version.zip"
  echo "$dist/store/$ext-$version.zip"
done
