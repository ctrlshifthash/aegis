import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';

// Native USDC mint on Solana mainnet.
export const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DECIMALS = 6;

/// Solana RPC — set VITE_SOLANA_RPC_URL to your Helius endpoint for reliability.
export function getConnection(): Connection {
  const url =
    (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
    'https://api.mainnet-beta.solana.com';
  return new Connection(url, 'confirmed');
}

/// USDC (SPL) balance for `owner`, in whole USDC. Returns 0 if no token account.
export async function getUsdcBalance(connection: Connection, owner: string): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, new PublicKey(owner));
    const acc = await getAccount(connection, ata);
    return Number(acc.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return 0;
  }
}

/// Build an SPL USDC transfer from `owner` to `recipient`. Creates the recipient's
/// associated token account if it doesn't exist yet (the sender pays the rent).
export async function buildUsdcTransfer(
  connection: Connection,
  owner: string,
  recipient: string,
  amountUsdc: number,
): Promise<Transaction> {
  const ownerPk = new PublicKey(owner);
  const toPk = new PublicKey(recipient);
  const fromAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, ownerPk);
  const toAta = getAssociatedTokenAddressSync(SOLANA_USDC_MINT, toPk);
  const amount = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));

  const tx = new Transaction();
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(createAssociatedTokenAccountInstruction(ownerPk, toAta, toPk, SOLANA_USDC_MINT));
  }
  tx.add(
    createTransferCheckedInstruction(fromAta, SOLANA_USDC_MINT, toAta, ownerPk, amount, USDC_DECIMALS),
  );
  tx.feePayer = ownerPk;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
