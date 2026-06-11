#!/usr/bin/env bash
# Installs the Solana build toolchain (run inside Linux / WSL Ubuntu).
set -euo pipefail

# Rust (skip if present)
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
. "$HOME/.cargo/env"
rustc --version

# Solana CLI (Anza)
if ! command -v solana >/dev/null 2>&1; then
  curl -sSfL https://release.anza.xyz/stable/install -o /tmp/sol-install.sh
  sh /tmp/sol-install.sh
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version

# Anchor via AVM (this compiles from source — slow, several minutes)
if ! command -v anchor >/dev/null 2>&1; then
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.30.1
  avm use 0.30.1
fi
anchor --version

echo "TOOLCHAIN_READY"
