import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { NETWORK, SUPPORTED_CHAIN_ID, USDC_DECIMALS } from '../config';
import { ERC20_ABI } from '../abi';

/// Live USDC balance for the connected account.
export function useUsdcBalance() {
  const { address } = useAccount();
  const usdc = NETWORK.usdc;

  const { data, refetch, isLoading } = useReadContract({
    chainId: SUPPORTED_CHAIN_ID,
    address: (usdc || undefined) as Address | undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdc) },
  });

  const raw = (data as bigint | undefined) ?? 0n;
  return {
    raw,
    formatted: formatUnits(raw, USDC_DECIMALS),
    refetch,
    isLoading,
  };
}
