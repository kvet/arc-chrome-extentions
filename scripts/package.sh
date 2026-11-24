#!/usr/bin/env bash
# Builds one zip per extension into dist/, named <extension>-<manifest version>.zip.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dist="$root/dist"
rm -rf "$dist"
mkdir -p "$dist"

for ext in kept-tabs pr-live-groups; do
  version="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$root/$ext/manifest.json" | head -n 1)"
  if [ -z "$version" ]; then
    echo "No version in $ext/manifest.json" >&2
    exit 1
  fi
  out="$dist/$ext-$version.zip"
  (cd "$root" && zip -qr -X "$out" "$ext" -x '*.DS_Store')
  echo "$out"
done
