#!/usr/bin/env bash
# Glosso — One-command skill installer for OpenClaw VMs
#
# Usage (on the VM):
#   git clone https://github.com/ubadineke/glosso.git && cd glosso && bash install.sh
#
# What this does:
#   1. Installs Node dependencies
#   2. Symlinks the three Glosso skills into ~/.openclaw/skills/
#      (symlinks so @glosso/core module resolution works from the monorepo)
#   3. Prints next steps
#
# Wallet provisioning is handled by your OpenClaw agent — just ask it to
# "create a Solana wallet" and it will walk you through the options.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Glosso — OpenClaw Skill Installer     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────
echo "→ Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install Node.js 18+ and re-run."
  exit 1
fi
echo "  ✅ $(node -v)"

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo "→ Installing dependencies..."
PNPM_CMD="pnpm"
if ! command -v pnpm &>/dev/null; then
  PNPM_CMD="npx --yes pnpm"
fi
cd "$SCRIPT_DIR"
$PNPM_CMD install --reporter=silent 2>/dev/null || $PNPM_CMD install
echo "  ✅ Dependencies installed"

# ── 3. Locate OpenClaw skills directory ───────────────────────────────────────
OPENCLAW_SKILLS="${HOME}/.openclaw/skills"
mkdir -p "$OPENCLAW_SKILLS"

# ── 4. Link skills ─────────────────────────────────────────────────────────────
echo "→ Installing Glosso skills into $OPENCLAW_SKILLS ..."
for SKILL in glosso-wallet glosso-pyth glosso-jupiter; do
  SRC="$SCRIPT_DIR/packages/skills/$SKILL"
  DEST="$OPENCLAW_SKILLS/$SKILL"
  if [[ -d "$SRC" ]]; then
    rm -rf "$DEST"
    ln -s "$SRC" "$DEST"
    echo "  ✅ $SKILL → $SRC"
  else
    echo "  ❌ $SKILL not found at $SRC"
  fi
done

# ── 5. Create ~/.glosso directory for wallet credentials ──────────────────────
mkdir -p "${HOME}/.glosso"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         Installation Complete! 🎉            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Skills installed to: $OPENCLAW_SKILLS"
echo ""
echo "Next steps:"
echo "  1. Restart (or start) your OpenClaw gateway"
echo "  2. Message your agent: 'I need a Solana wallet'"
echo "     → The agent will ask which type (sovereign/privy/turnkey) and provision it for you"
echo "  3. Once provisioned, you can ask:"
echo "     → 'What's my SOL balance?'"
echo "     → 'What's the price of SOL?'"
echo "     → 'Swap 0.1 SOL for USDC'"
echo ""
