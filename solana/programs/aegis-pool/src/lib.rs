//! Aegis Pool — fixed-denomination USDC (SPL) shielded pool on Solana.
//!
//! This is the Solana counterpart to the EVM `UsdcPrivacyPool`. Same idea:
//! deposit an exact amount of USDC against a Poseidon commitment, then withdraw
//! to any address by proving (in zero knowledge) membership of that commitment
//! in an on-chain Merkle tree — without revealing which leaf.
//!
//! Solana specifics:
//!   - USDC is an SPL token; transfers are CPIs to the SPL Token program.
//!   - Poseidon hashing uses Solana's `poseidon` syscall (BN254, big-endian).
//!   - Groth16 verification uses the `groth16-solana` crate (BN254 alt_bn128 syscalls).
//!   - The Merkle tree + rolling root history live in the Pool account.
//!   - A spent nullifier is recorded as a PDA: re-spending fails because the PDA
//!     already exists (the Solana equivalent of the EVM `nullifierHashes` mapping).
//!
//! No admin / owner / upgrade-authority logic lives here — funds can only leave
//! via a valid withdraw proof.
//!
//! STATUS: program logic for deposit/withdraw/merkle/nullifier/SPL is implemented.
//! Before this can verify real proofs it needs (1) the Solana-specific verifying
//! key generated from the circuit (see `verifying_key.rs`) and (2) the withdraw
//! circuit's recipient binding adapted to a 32-byte Solana pubkey. See solana/README.md.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::poseidon::{hashv, Endianness, Parameters};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

mod verifying_key;
use verifying_key::VERIFYINGKEY;
use groth16_solana::groth16::Groth16Verifier;

declare_id!("AegisPoo1111111111111111111111111111111111");

pub const MAX_LEVELS: usize = 20;
pub const ROOT_HISTORY_SIZE: usize = 30;
/// Number of public inputs to the withdraw circuit:
/// [root, nullifierHash, recipient, relayer, fee, refund]
pub const N_PUBLIC_INPUTS: usize = 6;

#[program]
pub mod aegis_pool {
    use super::*;

    /// Create a pool for `denomination` units of `token_mint`, with a Merkle tree
    /// of `levels` height. `zero_value` is the empty-leaf domain separator (a field
    /// element < BN254 modulus, big-endian) — the frontend uses the same value so
    /// its path reconstruction matches.
    pub fn initialize(
        ctx: Context<Initialize>,
        denomination: u64,
        levels: u8,
        zero_value: [u8; 32],
    ) -> Result<()> {
        require!(denomination > 0, AegisError::ZeroDenomination);
        require!(
            (levels as usize) > 0 && (levels as usize) <= MAX_LEVELS,
            AegisError::BadLevels
        );

        let pool = &mut ctx.accounts.pool;
        pool.bump = ctx.bumps.pool;
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.denomination = denomination;
        pool.levels = levels;
        pool.next_index = 0;
        pool.current_root_index = 0;

        // zeros[0] = zero_value; zeros[i] = Poseidon(zeros[i-1], zeros[i-1]).
        // filled_subtrees start as the zeros; the initial root is zeros[levels-1].
        let mut current = zero_value;
        for i in 0..(levels as usize) {
            pool.zeros[i] = current;
            pool.filled_subtrees[i] = current;
            current = poseidon2(&current, &current)?;
        }
        // `current` is now zeros[levels] = the empty-tree root.
        pool.roots[0] = current;

        emit!(PoolInitialized {
            pool: pool.key(),
            token_mint: pool.token_mint,
            denomination,
            levels,
        });
        Ok(())
    }

    /// Deposit exactly `denomination` USDC against `commitment`.
    pub fn deposit(ctx: Context<Deposit>, commitment: [u8; 32]) -> Result<()> {
        let denomination = ctx.accounts.pool.denomination;

        // Effects first: insert the leaf into the tree.
        let leaf_index = insert(&mut ctx.accounts.pool, commitment)?;

        // Interaction: pull exactly `denomination` USDC into the vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            denomination,
        )?;

        emit!(DepositEvent {
            commitment,
            leaf_index,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Withdraw `denomination - fee` USDC to the recipient, paying `fee` to the relayer.
    ///
    /// `nullifier_hash` is the spend-once tag. The `nullifier` account is created
    /// (PDA seeded by the nullifier hash) — if it already exists the instruction
    /// fails, which is what prevents double-spends.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        root: [u8; 32],
        nullifier_hash: [u8; 32],
        fee: u64,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(fee <= pool.denomination, AegisError::FeeTooHigh);
        require!(is_known_root(pool, &root), AegisError::UnknownRoot);

        // Bind the recipient + relayer + fee into the proof's public inputs.
        // A Solana pubkey is 32 bytes (can exceed the BN254 field), so it is bound
        // as a Poseidon hash split across two field elements. The withdraw circuit
        // must compute the same binding (see solana/README.md).
        let recipient_field = pubkey_to_field(&ctx.accounts.recipient_token_account.owner)?;
        let relayer_field = pubkey_to_field(&ctx.accounts.relayer_token_account.owner)?;
        let fee_field = u64_to_field(fee);
        let refund_field = [0u8; 32];

        let public_inputs: [[u8; 32]; N_PUBLIC_INPUTS] = [
            root,
            nullifier_hash,
            recipient_field,
            relayer_field,
            fee_field,
            refund_field,
        ];

        let mut verifier =
            Groth16Verifier::new(&proof_a, &proof_b, &proof_c, &public_inputs, &VERIFYINGKEY)
                .map_err(|_| error!(AegisError::ProofMalformed))?;
        verifier
            .verify()
            .map_err(|_| error!(AegisError::InvalidProof))?;

        // The `nullifier` account is `init` in the context — creation fails if it
        // already exists, which marks the note permanently spent.
        ctx.accounts.nullifier.spent = true;

        // Pay out from the vault (owned by the pool PDA).
        let denomination = pool.denomination;
        let pool_key = pool.key();
        let seeds: &[&[u8]] = &[b"pool", pool.token_mint.as_ref(), &[pool.bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            denomination - fee,
        )?;

        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.relayer_token_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }

        emit!(WithdrawalEvent {
            pool: pool_key,
            nullifier_hash,
            recipient: ctx.accounts.recipient_token_account.owner,
            fee,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------- merkle tree

/// Insert `leaf` and return its index. Mirrors the EVM `_insert`.
fn insert(pool: &mut Pool, leaf: [u8; 32]) -> Result<u64> {
    let levels = pool.levels as usize;
    let next_index = pool.next_index;
    require!(next_index < (1u64 << levels), AegisError::TreeFull);

    let mut current_index = next_index;
    let mut current_hash = leaf;
    for i in 0..levels {
        let (left, right) = if current_index % 2 == 0 {
            pool.filled_subtrees[i] = current_hash;
            (current_hash, pool.zeros[i])
        } else {
            (pool.filled_subtrees[i], current_hash)
        };
        current_hash = poseidon2(&left, &right)?;
        current_index /= 2;
    }

    let new_root_index = ((pool.current_root_index as usize) + 1) % ROOT_HISTORY_SIZE;
    pool.current_root_index = new_root_index as u8;
    pool.roots[new_root_index] = current_hash;
    pool.next_index = next_index + 1;
    Ok(next_index)
}

fn is_known_root(pool: &Pool, root: &[u8; 32]) -> bool {
    if *root == [0u8; 32] {
        return false;
    }
    let mut i = pool.current_root_index as usize;
    for _ in 0..ROOT_HISTORY_SIZE {
        if pool.roots[i] == *root {
            return true;
        }
        i = if i == 0 { ROOT_HISTORY_SIZE - 1 } else { i - 1 };
    }
    false
}

/// Poseidon(left, right) over BN254, big-endian — matches circomlib / the circuit.
fn poseidon2(left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32]> {
    let h = hashv(Parameters::Bn254X5, Endianness::BigEndian, &[left, right])
        .map_err(|_| error!(AegisError::HashError))?;
    Ok(h.to_bytes())
}

/// Bind a 32-byte pubkey as a single BN254 field element via Poseidon over its
/// two 16-byte halves (keeps it inside the field). The circuit binds it identically.
fn pubkey_to_field(pk: &Pubkey) -> Result<[u8; 32]> {
    let b = pk.to_bytes();
    let mut lo = [0u8; 32];
    let mut hi = [0u8; 32];
    lo[16..].copy_from_slice(&b[0..16]);
    hi[16..].copy_from_slice(&b[16..32]);
    poseidon2(&hi, &lo)
}

fn u64_to_field(v: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&v.to_be_bytes());
    out
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Pool::SIZE,
        seeds = [b"pool", token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    /// CHECK: SPL mint of the token (USDC). Validated by the vault constraint.
    pub token_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(
        init,
        payer = payer,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"pool", pool.token_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = depositor_token_account.mint == pool.token_mint)]
    pub depositor_token_account: Account<'info, TokenAccount>,
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(proof_a: [u8;64], proof_b: [u8;128], proof_c: [u8;64], root: [u8;32], nullifier_hash: [u8;32])]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"pool", pool.token_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = recipient_token_account.mint == pool.token_mint)]
    pub recipient_token_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = relayer_token_account.mint == pool.token_mint)]
    pub relayer_token_account: Account<'info, TokenAccount>,
    /// Spend-once marker. `init` => fails if this nullifier was already used.
    #[account(
        init,
        payer = payer,
        space = 8 + 1,
        seeds = [b"nullifier", pool.key().as_ref(), nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------- state

#[account]
pub struct Pool {
    pub bump: u8,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub denomination: u64,
    pub levels: u8,
    pub next_index: u64,
    pub current_root_index: u8,
    pub roots: [[u8; 32]; ROOT_HISTORY_SIZE],
    pub filled_subtrees: [[u8; 32]; MAX_LEVELS],
    pub zeros: [[u8; 32]; MAX_LEVELS],
}
impl Pool {
    pub const SIZE: usize = 1 + 32 + 32 + 8 + 1 + 8 + 1
        + 32 * ROOT_HISTORY_SIZE
        + 32 * MAX_LEVELS
        + 32 * MAX_LEVELS;
}

#[account]
pub struct Nullifier {
    pub spent: bool,
}

// ---------------------------------------------------------------- events / errors

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub token_mint: Pubkey,
    pub denomination: u64,
    pub levels: u8,
}
#[event]
pub struct DepositEvent {
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub timestamp: i64,
}
#[event]
pub struct WithdrawalEvent {
    pub pool: Pubkey,
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    pub fee: u64,
}

#[error_code]
pub enum AegisError {
    #[msg("denomination must be greater than zero")]
    ZeroDenomination,
    #[msg("levels out of range")]
    BadLevels,
    #[msg("merkle tree is full")]
    TreeFull,
    #[msg("unknown merkle root")]
    UnknownRoot,
    #[msg("fee exceeds denomination")]
    FeeTooHigh,
    #[msg("malformed proof")]
    ProofMalformed,
    #[msg("invalid withdraw proof")]
    InvalidProof,
    #[msg("poseidon hash error")]
    HashError,
}
