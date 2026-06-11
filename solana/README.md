# Aegis Pool — Solana (USDC-SPL) shielded pool

The Solana counterpart to the EVM `UsdcPrivacyPool`. Same construction —
fixed-denomination deposits against a Poseidon commitment in a Merkle tree, ZK
withdrawal to a fresh address — rewritten as an **Anchor (Rust)** program for the
Solana VM. Solana has native **USDC (SPL)** and far cheaper fees, which is the
whole point of this port.

> **This is a from-scratch protocol, not a recompile.** Solana and the EVM share
> nothing at the execution layer. The cryptographic design carries over; the code
> does not.

## What's implemented (`programs/aegis-pool/src/lib.rs`)

- ✅ `initialize` — create a pool (token mint, denomination, tree height); computes
  the Poseidon "zeros" chain and the empty-tree root on-chain.
- ✅ `deposit` — pulls exactly `denomination` USDC via an **SPL-token CPI** into a
  pool-owned vault, and inserts the commitment into the Merkle tree using Solana's
  **`poseidon` syscall** (BN254, big-endian — matches circomlib / the circuit).
- ✅ `withdraw` — checks the root is known, verifies a **Groth16 proof** via the
  `groth16-solana` crate (BN254 `alt_bn128` syscalls), records the nullifier as a
  PDA (re-spend fails because the PDA already exists), and pays out USDC from the
  vault (+ optional relayer fee).
- ✅ Merkle tree with a 30-root rolling history; nullifier double-spend guard.
- ✅ No admin / owner / upgrade logic — funds leave only via a valid proof.

## What still has to be done before it can run / be safe

These are real engineering steps, not config:

1. **Build the toolchain** (Linux/WSL): `bash setup/install-toolchain.sh`
   (Rust + Solana CLI + Anchor; Anchor compiles from source and is slow).
2. **Adapt the withdraw circuit for Solana.** A Solana recipient is a **32-byte
   pubkey**, which doesn't fit in one BN254 field element like an EVM 20-byte
   address does. The program binds it as `Poseidon(hi128, lo128)`; the circuit must
   compute the identical binding. This means a **new circuit + a new Phase-2
   trusted setup** (the EVM `zkey` cannot be reused as-is).
3. **Generate the real verifying key** from that circuit and replace the
   placeholder in `programs/aegis-pool/src/verifying_key.rs` (currently zeroed, so
   `verify()` rejects everything — fail-closed).
4. **Program ID** — run `anchor keys sync` and update `declare_id!` + `Anchor.toml`.
5. **Tests** on a local validator (`anchor test`) — deposit/withdraw round-trip,
   double-spend rejection, wrong-root rejection.
6. **Frontend** — a Solana transaction path (build/sign with a Solana wallet, read
   tree state from the pool account). The current React app is EVM-only.
7. **Security** — independent audit + a real trusted-setup ceremony before any
   mainnet use. A brand-new unaudited mixer holding real funds is how people get
   drained.

## Build & deploy (once the toolchain is ready)

```bash
cd solana
anchor build
anchor keys sync                     # set the real program id
solana-test-validator &              # local cluster
anchor deploy --provider.cluster localnet
anchor test
# devnet / mainnet:
anchor deploy --provider.cluster devnet
```

Mainnet USDC (SPL) mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
