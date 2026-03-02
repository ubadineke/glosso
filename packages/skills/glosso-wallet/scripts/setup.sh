#!/usr/bin/env bash
# Glosso Wallet Skill — One-command setup
#
# This script installs dependencies, provisions a wallet, and
# verifies everything works. Run from the glosso root directory.
#
# Usage:
#   bash packages/skills/glosso-wallet/scripts/setup.sh
#   # or from the skill directory:
#   bash scripts/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find the monorepo root (walk up until we find pnpm-workspace.yaml)
ROOT_DIR="$SKILL_DIR"
while [[ ! -f "$ROOT_DIR/pnpm-workspace.yaml" ]] && [[ "$ROOT_DIR" != "/" ]]; do
  ROOT_DIR="$(dirname "$ROOT_DIR")"
done

if [[ ! -f "$ROOT_DIR/pnpm-workspace.yaml" ]]; then
  echo "❌ Could not find Glosso monorepo root (pnpm-workspace.yaml)"
  echo "   Please run this script from within the glosso project."
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Glosso Wallet Skill — Setup            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Step 1: Check Node.js
echo "→ Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node.js 18+ and try again."
  exit 1
fi
NODE_VERSION=$(node -v)
echo "  ✅ Node.js $NODE_VERSION"

# Step 2: Check pnpm (or use npx)
echo "→ Checking pnpm..."
PNPM_CMD="pnpm"
if ! command -v pnpm &> /dev/null; then
  echo "  ⚠️  pnpm not found globally, using npx pnpm"
  PNPM_CMD="npx pnpm"
fi

# Step 3: Install dependencies
echo "→ Installing dependencies..."
cd "$ROOT_DIR"
$PNPM_CMD install --reporter=silent 2>/dev/null || $PNPM_CMD install
echo "  ✅ Dependencies installed"

# Step 4: Check for existing wallet config
echo "→ Checking wallet configuration..."
if [[ -f "$ROOT_DIR/.env" ]] && grep -q "GLOSSO_MODE" "$ROOT_DIR/.env" 2>/dev/null; then
  echo "  ✅ Existing wallet configuration found in .env"
  source "$ROOT_DIR/.env" 2>/dev/null || true
  echo "     Mode: ${GLOSSO_MODE:-unknown}"
  echo "     Network: ${GLOSSO_NETWORK:-devnet}"
else
  echo "  ⚠️  No wallet configuration found."
  echo ""
  echo "  To provision a new wallet, run:"
  echo "    cd $ROOT_DIR && npx tsx packages/cli/src/index.ts provision"
  echo ""
  echo "  Or set these environment variables manually:"
  echo "    GLOSSO_MODE=sovereign"
  echo "    GLOSSO_MASTER_SEED_ENCRYPTED=<encrypted seed>"
  echo "    GLOSSO_ENCRYPTION_PASSWORD=<password>"
  echo "    GLOSSO_NETWORK=devnet"
  echo ""
  
  # Offer to provision now
  read -rp "  Would you like to provision a sovereign wallet now? [Y/n] " REPLY
  REPLY="${REPLY:-Y}"
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    echo ""
    echo "→ Launching wallet provisioner..."
    cd "$ROOT_DIR" && npx tsx packages/cli/src/index.ts provision
    echo "  ✅ Wallet provisioned"
  else
    echo "  ⏭️  Skipping provisioning. Set up .env manually before using wallet skills."
  fi
fi

# Step 5: Verify skill scripts exist
echo "→ Verifying skill scripts..."
MISSING=0
for SCRIPT in balance.ts send.ts history.ts; do
  if [[ -f "$SKILL_DIR/scripts/$SCRIPT" ]]; then
    echo "  ✅ $SCRIPT"
  else
    echo "  ❌ $SCRIPT MISSING"
    MISSING=1
  fi
done

if [[ $MISSING -eq 1 ]]; then
  echo "❌ Some skill scripts are missing. Reinstall the package."
  exit 1
fi

# Step 6: Quick verification — try balance check
echo "→ Running quick verification..."
if [[ -f "$ROOT_DIR/.env" ]] && grep -q "GLOSSO_MODE" "$ROOT_DIR/.env" 2>/dev/null; then
  cd "$ROOT_DIR"
  set +e
  RESULT=$(npx tsx "$SKILL_DIR/scripts/balance.ts" 2>&1)
  EXIT_CODE=$?
  set -e
  
  if [[ $EXIT_CODE -eq 0 ]]; then
    echo "  ✅ Balance check successful"
    echo "  $RESULT" | head -5
  else
    echo "  ⚠️  Balance check failed (wallet may not be provisioned yet)"
    echo "  $RESULT" | head -3
  fi
else
  echo "  ⏭️  Skipping verification (no wallet configured)"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          Setup Complete! 🎉                  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Available commands:"
echo "  tsx $SKILL_DIR/scripts/balance.ts          # Check balance"
echo "  tsx $SKILL_DIR/scripts/send.ts <to> <amt>  # Send SOL"
echo "  tsx $SKILL_DIR/scripts/history.ts          # Transaction history"
echo ""
echo "Read SKILL.md for the full capability manifest."
echo ""
