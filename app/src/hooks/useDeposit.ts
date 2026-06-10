import { useState } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { readContract, writeContract, waitForReceipt } from '../lib/eth';
import {
  NETWORK,
  SUPPORTED_CHAIN_ID,
  poolAddress,
  denomUnits,
  noteHeader,
  type Denomination,
} from '../config';
import { ERC20_ABI, POOL_ABI } from '../abi';
import { getPoseidon } from './useZK';

export interface DepositResult {
  txHash: string;
  note: string;
  commitment: string;
}

function randomFieldBytes(n: number): bigint {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return BigInt('0x' + hex);
}

export function useDeposit() {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function deposit(d: Denomination): Promise<DepositResult | null> {
    if (!isConnected || !address) {
      setStatus('Connect a wallet first.');
      return null;
    }
    const pool = poolAddress(d);
    if (!pool) {
      setStatus(`No ${d} USDC pool is configured for this network yet.`);
      return null;
    }
    const usdc = NETWORK.usdc as Address;
    if (!usdc) {
      setStatus('No USDC token configured for this network.');
      return null;
    }
    const poseidon = getPoseidon();
    if (!poseidon) {
      setStatus('Privacy library still loading — try again in a moment.');
      return null;
    }

    const amount = denomUnits(d);
    const F = poseidon.F;
    setLoading(true);
    try {
      // 1. Generate the secret note (nullifier + secret -> Poseidon commitment).
      setStatus('Generating your private note…');
      const nullifier = randomFieldBytes(31);
      const secret = randomFieldBytes(31);
      const commitmentBn = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
      const commitment = ('0x' + F.toString(commitmentBn, 16).padStart(64, '0')) as `0x${string}`;

      const noteData = {
        chainId: SUPPORTED_CHAIN_ID,
        denomination: d,
        nullifier: nullifier.toString(),
        secret: secret.toString(),
        commitment,
      };
      const note = noteHeader(d) + btoa(JSON.stringify(noteData));

      // 2. Ensure an exact-amount allowance for the pool, then approve if needed.
      const allowance = await readContract<bigint>({
        address: usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, pool as Address],
      });

      if (allowance < amount) {
        setStatus('Approve USDC in your wallet (exact deposit amount)…');
        const approveHash = await writeContract({
          address: usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [pool as Address, amount],
        });
        setStatus('Waiting for approval to confirm…');
        await waitForReceipt(approveHash);
      }

      // 3. Deposit. The contract pulls exactly `amount` USDC via transferFrom.
      setStatus('Confirm the deposit in your wallet…');
      const hash = await writeContract({
        address: pool as Address,
        abi: POOL_ABI,
        functionName: 'deposit',
        args: [commitment],
      });

      setStatus(`Deposit sent (${hash.slice(0, 10)}…). Waiting for confirmation…`);
      const receipt = await waitForReceipt(hash);
      setStatus(`Deposit confirmed in block ${receipt.blockNumber}. Save your note now!`);

      return { txHash: hash, note, commitment };
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      console.error(e);
      setStatus('Error: ' + (err.shortMessage || err.message || String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { deposit, status, loading };
}
