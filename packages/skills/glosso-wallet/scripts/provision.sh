#!/usr/bin/env bash
# Glosso — Wallet Provisioner
#
# Works correctly whether this script is run directly OR via a symlink
# (e.g. from ~/.openclaw/skills/glosso-wallet/scripts/).
#
# Usage:
#   bash provision.sh                          # sovereign, devnet (defaults)
#   bash provision.sh --mode privy             # privy mode
#   bash provision.sh --mode turnkey           # turnkey mode
#   bash provision.sh --network mainnet-beta   # mainnet

set -euo pipefail

# ── Resolve real path (follows symlinks, works on Linux + macOS) ──────────────
if command -v readlink &>/dev/null && readlink -f "$0" &>/dev/null 2>&1; then
  REAL_SCRIPT="$(readlink -f "$0")"
else
  # macOS fallback (readlink -f not available)
  REAL_SCRIPT="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$0")"
fi

echo "[debug] \$0 = $0"
echo "[debug] REAL_SCRIPT = $REAL_SCRIPT"

SCRIPTS_DIR="$(dirname "$REAL_SCRIPT")"                  # .../glosso/packages/skills/glosso-wallet/scripts
SKILL_DIR="$(dirname "$SCRIPTS_DIR")"                    # .../glosso/packages/skills/glosso-wallet
SKILLS_DIR="$(dirname "$SKILL_DIR")"                     # .../glosso/packages/skills
PACKAGES_DIR="$(dirname "$SKILLS_DIR")"                  # .../glosso/packages
REPO_ROOT="$(dirname "$PACKAGES_DIR")"                   # .../glosso
CLI="$REPO_ROOT/packages/cli/src/index.ts"

echo "[debug] REPO_ROOT = $REPO_ROOT"
echo "[debug] CLI = $CLI"
echo "[debug] CLI exists? $(test -f "$CLI" && echo YES || echo NO)"

# ── Validate ──────────────────────────────────────────────────────────────────
if [[ ! -f "$CLI" ]]; then
  echo "❌ Glosso CLI not found at: $CLI"
  echo "   Make sure you cloned the full glosso repo and ran: bash install.sh"
  exit 1
fi

# ── Run provisioner ───────────────────────────────────────────────────────────
echo "→ Provisioning Glosso wallet..."
echo "   Repo: $REPO_ROOT"
echo "   CLI: $CLI"
echo "   Output: ~/.glosso/.env"
echo ""

mkdir -p "${HOME}/.glosso"

# Must cd to repo root so Node resolves @glosso/core from node_modules
cd "$REPO_ROOT"
exec npx tsx "$CLI" provision --dir "${HOME}/.glosso" "$@"
