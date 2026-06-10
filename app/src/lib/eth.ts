// Thin adapter over wagmi core actions.
//
// wagmi 2.19.x (pinned by @privy-io/wagmi's peer range) ships action parameter
// types that don't line up cleanly with viem 2.52's `ReadContractParameters` /
// `WriteContractParameters` (the EIP-7702 `authorizationList` / chain-account
// inference change). The runtime behaviour is correct and well-tested; only the
// generic *types* are brittle. We isolate that single `any` boundary here so the
// rest of the app stays fully typed.
import {
  readContract as coreRead,
  writeContract as coreWrite,
  waitForTransactionReceipt as coreWait,
} from 'wagmi/actions';
import type { Abi, Address, Hash } from 'viem';
import { wagmiConfig } from '../wagmi';

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export function readContract<T = unknown>(call: ContractCall): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return coreRead(wagmiConfig, call as any) as Promise<T>;
}

export function writeContract(call: ContractCall & { value?: bigint }): Promise<Hash> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return coreWrite(wagmiConfig, call as any) as Promise<Hash>;
}

export function waitForReceipt(hash: Hash) {
  return coreWait(wagmiConfig, { hash });
}
