#!/usr/bin/env bash
set -euo pipefail

line='export BUN_JSC_useTailCalls=0'

case "${SHELL:-}" in
  */zsh) profile="$HOME/.zshrc" ;;
  */bash) profile="$HOME/.bashrc" ;;
  *)
    echo "Error: unknown shell '${SHELL:-}'. Add this line to your shell profile by hand: $line" >&2
    exit 1
    ;;
esac

if grep -qxF "$line" "$profile" 2>/dev/null; then
  echo "$profile already has: $line"
  exit 0
fi

echo "$line" >> "$profile"
echo "Added to $profile: $line"
echo "Open a new terminal and restart Claude Code so the setting takes effect."
