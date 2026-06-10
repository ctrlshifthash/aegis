import { mainnet, sepolia, foundry } from 'viem/chains';
import { parseUnits, type Address } from 'viem';

// USDC has 6 decimals everywhere.
export const USDC_DECIMALS = 6;

// Fixed denominations (in whole USDC). One pool contract is deployed per amount.
export const DENOMINATIONS = ['100', '1000', '10000'] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export function denomLabel(d: Denomination): string {
  return Number(d).toLocaleString('en-US') + ' USDC';
}

// Amount of one deposit in USDC base units, e.g. "100" -> 100_000000n.
export function denomUnits(d: Denomination): bigint {
  return parseUnits(d, USDC_DECIMALS);
}

interface NetworkConfig {
  chain: typeof mainnet | typeof sepolia | typeof foundry;
  name: string;
  explorerUrl: string;
  usdc: Address;
  pools: Record<Denomination, Address | ''>;
}

const env = import.meta.env;

const ZERO = '' as const;

// Pool addresses are filled in AFTER you run the deploy script (see contracts/).
// They come from env so the same build works across networks.
const MAINNET: NetworkConfig = {
  chain: mainnet,
  name: 'Ethereum',
  explorerUrl: 'https://etherscan.io',
  // Canonical Ethereum mainnet USDC (6 decimals).
  usdc: (env.VITE_MAINNET_USDC ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') as Address,
  pools: {
    '100': (env.VITE_MAINNET_POOL_100 ?? ZERO) as Address | '',
    '1000': (env.VITE_MAINNET_POOL_1000 ?? ZERO) as Address | '',
    '10000': (env.VITE_MAINNET_POOL_10000 ?? ZERO) as Address | '',
  },
};

const SEPOLIA: NetworkConfig = {
  chain: sepolia,
  name: 'Sepolia',
  explorerUrl: 'https://sepolia.etherscan.io',
  // On testnet there is no real USDC — set this to your deployed MockUSDC.
  usdc: (env.VITE_SEPOLIA_USDC ?? ZERO) as Address,
  pools: {
    '100': (env.VITE_SEPOLIA_POOL_100 ?? ZERO) as Address | '',
    '1000': (env.VITE_SEPOLIA_POOL_1000 ?? ZERO) as Address | '',
    '10000': (env.VITE_SEPOLIA_POOL_10000 ?? ZERO) as Address | '',
  },
};

// Local anvil / mainnet-fork (chainId 31337) for end-to-end testing in the browser.
const LOCAL: NetworkConfig = {
  chain: foundry,
  name: 'Localhost',
  explorerUrl: '',
  usdc: (env.VITE_LOCAL_USDC ?? ZERO) as Address,
  pools: {
    '100': (env.VITE_LOCAL_POOL_100 ?? ZERO) as Address | '',
    '1000': (env.VITE_LOCAL_POOL_1000 ?? ZERO) as Address | '',
    '10000': (env.VITE_LOCAL_POOL_10000 ?? ZERO) as Address | '',
  },
};

// Which network this build targets. Default: Ethereum mainnet (chainId 1).
//   VITE_CHAIN_ID=11155111 -> Sepolia testnet
//   VITE_CHAIN_ID=31337    -> local anvil / fork
const ACTIVE_CHAIN_ID = Number(env.VITE_CHAIN_ID ?? 1);

export const NETWORK: NetworkConfig =
  ACTIVE_CHAIN_ID === foundry.id ? LOCAL : ACTIVE_CHAIN_ID === sepolia.id ? SEPOLIA : MAINNET;
export const SUPPORTED_CHAIN_ID = NETWORK.chain.id;

export function poolAddress(d: Denomination): Address | '' {
  return NETWORK.pools[d];
}

export function isPoolConfigured(d: Denomination): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(NETWORK.pools[d]);
}

// Note format is intentionally distinct from any upstream project.
// aegis-<chainId>-<denom>-<base64(noteData)>
export const NOTE_PREFIX = 'aegis';

export function noteHeader(d: Denomination): string {
  return `${NOTE_PREFIX}-${SUPPORTED_CHAIN_ID}-${d}-`;
}
