import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { mainnet, sepolia, foundry } from 'viem/chains';
import { SUPPORTED_CHAIN_ID } from './config';

const env = import.meta.env;

// The app targets ONE network per build (VITE_CHAIN_ID). We register only that
// chain so wagmi/Privy never reach out to other networks' public RPCs (which
// otherwise causes CORS errors like eth.merkle.io on load).
const activeChain =
  SUPPORTED_CHAIN_ID === foundry.id ? foundry : SUPPORTED_CHAIN_ID === sepolia.id ? sepolia : mainnet;

// Only the active chain is registered in `chains`, so wagmi never instantiates a
// client for (and never calls the RPC of) any other network. Transports for the
// other ids are defined only to satisfy the type; they are inert.
export const wagmiConfig = createConfig({
  chains: [activeChain],
  transports: {
    [mainnet.id]: http(env.VITE_MAINNET_RPC_URL || undefined),
    [sepolia.id]: http(env.VITE_SEPOLIA_RPC_URL || undefined),
    [foundry.id]: http('http://127.0.0.1:8545'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
