import { useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { isAddress, parseAbiItem, type Address } from 'viem';
import { readContract, writeContract, waitForReceipt } from '../lib/eth';
import {
  SUPPORTED_CHAIN_ID,
  poolAddress,
  NOTE_PREFIX,
  DENOMINATIONS,
  type Denomination,
} from '../config';
import { POOL_ABI } from '../abi';
import { getPoseidon } from './useZK';
import * as snarkjs from 'snarkjs';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const MERKLE_LEVELS = 20;

export function useWithdraw() {
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function withdraw(noteString: string, recipient: string): Promise<string | null> {
    if (!isConnected || !publicClient) {
      setStatus('Connect a wallet first.');
      return null;
    }
    const poseidon = getPoseidon();
    if (!poseidon) {
      setStatus('Privacy library still loading — try again in a moment.');
      return null;
    }
    const F = poseidon.F;

    setLoading(true);
    try {
      // 1. Parse + validate the note: aegis-<chainId>-<denom>-<base64>.
      const note = noteString.trim();
      const parts = note.split('-');
      if (parts[0] !== NOTE_PREFIX) throw new Error('Not a valid note for this app.');
      if (Number(parts[1]) !== SUPPORTED_CHAIN_ID) {
        throw new Error(`This note is for chain ${parts[1]}, not the active network.`);
      }
      const denom = parts[2] as Denomination;
      if (!DENOMINATIONS.includes(denom)) throw new Error('Unknown denomination in note.');
      if (!isAddress(recipient)) throw new Error('Recipient is not a valid address.');

      const pool = poolAddress(denom);
      if (!pool) throw new Error(`No ${denom} USDC pool configured for this network.`);

      const noteData = JSON.parse(atob(parts.slice(3).join('-')));

      // 2. Rebuild the Merkle tree from on-chain Deposit logs and locate our leaf.
      setStatus('Reading deposits from chain…');
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 49000n ? currentBlock - 49000n : 0n;
      const logs = await publicClient.getLogs({
        address: pool as Address,
        event: parseAbiItem(
          'event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)',
        ),
        fromBlock,
        toBlock: 'latest',
      });

      const leaves = logs.map((l) => BigInt(l.args.commitment as string));
      const leafIndex = leaves.findIndex((l) => l === BigInt(noteData.commitment));
      if (leafIndex === -1) {
        throw new Error('This note was not found in the pool. Wrong network or not yet confirmed?');
      }

      // 3. Build the Merkle authentication path (empty subtrees come from the contract).
      setStatus('Building Merkle proof…');
      const zeros: bigint[] = [];
      for (let i = 0; i < MERKLE_LEVELS; i++) {
        const z = await readContract<`0x${string}`>({
          address: pool as Address,
          abi: POOL_ABI,
          functionName: 'zeros',
          args: [BigInt(i)],
        });
        zeros.push(BigInt(z));
      }

      const pathElements: string[] = [];
      const pathIndices: number[] = [];
      let currentIndex = leafIndex;
      let currentLevel = [...leaves];
      for (let i = 0; i < MERKLE_LEVELS; i++) {
        const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : zeros[i];
        pathElements.push(F.toString(F.e(sibling.toString())));
        pathIndices.push(currentIndex % 2);

        const nextLevel: bigint[] = [];
        for (let j = 0; j < currentLevel.length; j += 2) {
          const left = currentLevel[j];
          const right = j + 1 < currentLevel.length ? currentLevel[j + 1] : zeros[i];
          const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
          nextLevel.push(BigInt(F.toString(parent)));
        }
        currentLevel = nextLevel.length ? nextLevel : [zeros[i + 1] ?? 0n];
        currentIndex = Math.floor(currentIndex / 2);
      }

      const root = await readContract<`0x${string}`>({
        address: pool as Address,
        abi: POOL_ABI,
        functionName: 'getLastRoot',
      });

      const nullifierHashBn = poseidon([F.e(noteData.nullifier)]);
      const nullifierHash = ('0x' + F.toString(nullifierHashBn, 16).padStart(64, '0')) as `0x${string}`;

      const spent = await readContract<boolean>({
        address: pool as Address,
        abi: POOL_ABI,
        functionName: 'nullifierHashes',
        args: [nullifierHash],
      });
      if (spent) throw new Error('This note has already been withdrawn.');

      // 4. Generate the zero-knowledge proof (direct withdrawal: no relayer/fee/refund).
      setStatus('Generating zero-knowledge proof (this can take 5–15s)…');
      const input = {
        root: BigInt(root).toString(),
        nullifierHash: F.toString(nullifierHashBn),
        recipient: BigInt(recipient).toString(),
        relayer: '0',
        fee: '0',
        refund: '0',
        nullifier: noteData.nullifier,
        secret: noteData.secret,
        pathElements,
        pathIndices,
      };

      const { proof } = await snarkjs.groth16.fullProve(
        input,
        '/circuits/withdraw.wasm',
        '/circuits/withdraw_final.zkey',
      );

      const pA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint];
      const pB = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ] as [[bigint, bigint], [bigint, bigint]];
      const pC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint];

      // 5. Submit the withdrawal.
      setStatus('Confirm the withdrawal in your wallet…');
      const hash = await writeContract({
        address: pool as Address,
        abi: POOL_ABI,
        functionName: 'withdraw',
        args: [pA, pB, pC, root, nullifierHash, recipient as Address, ZERO_ADDRESS, 0n, 0n],
        value: 0n,
      });

      setStatus(`Withdrawal sent (${hash.slice(0, 10)}…). Waiting for confirmation…`);
      await waitForReceipt(hash);
      setStatus('Withdrawal confirmed.');
      return hash;
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      console.error(e);
      setStatus('Error: ' + (err.shortMessage || err.message || String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { withdraw, status, loading };
}
