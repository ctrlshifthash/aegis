//! Groth16 verifying key for the withdraw circuit, in the layout `groth16-solana`
//! expects.
//!
//! ⚠️ PLACEHOLDER — this must be generated from the circuit's `verification_key.json`.
//! The values below are zeroed, so `verify()` will reject everything until a real
//! key is dropped in (fail-closed, which is the safe default).
//!
//! To generate the real key:
//!   1. Build the Solana withdraw circuit (recipient bound as a Poseidon hash of the
//!      32-byte pubkey — see solana/README.md) and run a Phase-2 trusted setup.
//!   2. Convert the resulting snarkjs `verification_key.json` to this Rust struct,
//!      e.g. with Light Protocol's `groth16-solana` parser / `snarkjs-to-rust` tool.
//!   3. Replace the constants below and re-build.

use groth16_solana::groth16::Groth16Verifyingkey;

pub const VERIFYINGKEY: Groth16Verifyingkey = Groth16Verifyingkey {
    // 6 public inputs: [root, nullifierHash, recipient, relayer, fee, refund]
    nr_pubinputs: 6,
    vk_alpha_g1: [0u8; 64],
    vk_beta_g2: [0u8; 128],
    vk_gamme_g2: [0u8; 128], // (sic) — crate field name
    vk_delta_g2: [0u8; 128],
    // length = nr_pubinputs + 1 = 7
    vk_ic: &VK_IC,
};

const VK_IC: [[u8; 64]; 7] = [[0u8; 64]; 7];
