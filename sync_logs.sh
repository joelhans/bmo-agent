#!/usr/bin/env bash
set -euo pipefail

# Sync referenced agent logs into ./logs
# - Parses CAPTAINS_LOG.md for agent-*.log references
# - Copies only those logs from ~/.local/share/bmo (or $BMO_LOGS_DIR)
# Usage: ./sync_logs.sh [DEST_DIR]

BASE_DIR="${BMO_LOGS_DIR:-$HOME/.local/share/bmo}"
DEST_DIR="${1:-logs}"

mkdir -p "$DEST_DIR"

# Collect unique referenced .log paths
refs=$(grep -oE '([A-Za-z0-9_.-]+/)*agent-[0-9TZ:-]+\.log' CAPTAINS_LOG.md | sort -u || true)
if [ -z "${refs}" ]; then
  echo "No .log references found in CAPTAINS_LOG.md"
  exit 0
fi

copied=0
missing=0

for ref in $refs; do
  bn="${ref##*/}"
  src=""
  if [ -f "$BASE_DIR/$ref" ]; then
    src="$BASE_DIR/$ref"
  elif [ -f "$BASE_DIR/$bn" ]; then
    src="$BASE_DIR/$bn"
  else
    # Fallback: search recursively for the basename (portable across BSD/GNU find)
    candidate=$(find "$BASE_DIR" -type f -name "$bn" 2>/dev/null | head -n 1 || true)
    if [ -n "$candidate" ]; then
      src="$candidate"
    fi
  fi

  if [ -n "$src" ] && [ -f "$src" ]; then
    cp -f "$src" "$DEST_DIR/$bn"
    echo "Copied $bn"
    copied=$((copied+1))
  else
    echo "Missing: $ref"
    missing=$((missing+1))
  fi
done

echo "Done. Copied: $copied, Missing: $missing, Destination: $DEST_DIR"
