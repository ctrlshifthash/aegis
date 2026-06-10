import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, type Address } from 'viem';
import { DENOMINATIONS, poolAddress, SUPPORTED_CHAIN_ID, type Denomination } from '../config';

export type PoolStats = Record<Denomination, number | null>;

const DEPOSIT_EVENT = parseAbiItem(
  'event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)',
);

/// Reads the live number of deposits (the anonymity-set size) in each pool from
/// on-chain Deposit logs. `null` means unknown / not configured / still loading.
export function useAllPoolStats(refreshKey = 0): PoolStats {
  // Pin to the supported chain so stats load even before a wallet is connected
  // (a bare usePublicClient() defaults to the first configured chain).
  const publicClient = usePublicClient({ chainId: SUPPORTED_CHAIN_ID });
  const [stats, setStats] = useState<PoolStats>({ '100': null, '1000': null, '10000': null });

  useEffect(() => {
    let cancelled = false;
    if (!publicClient) return;

    (async () => {
      let fromBlock = 0n;
      try {
        const current = await publicClient.getBlockNumber();
        fromBlock = current > 49000n ? current - 49000n : 0n;
      } catch {
        return;
      }

      await Promise.all(
        DENOMINATIONS.map(async (d) => {
          const pool = poolAddress(d);
          if (!pool) {
            if (!cancelled) setStats((s) => ({ ...s, [d]: null }));
            return;
          }
          try {
            const logs = await publicClient.getLogs({
              address: pool as Address,
              event: DEPOSIT_EVENT,
              fromBlock,
              toBlock: 'latest',
            });
            if (!cancelled) setStats((s) => ({ ...s, [d]: logs.length }));
          } catch {
            if (!cancelled) setStats((s) => ({ ...s, [d]: null }));
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, refreshKey]);

  return stats;
}
