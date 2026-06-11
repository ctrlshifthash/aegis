import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, sepolia, foundry } from 'viem/chains';
import './index.css';
import App from './App';
import { wagmiConfig } from './wagmi';
import { SUPPORTED_CHAIN_ID } from './config';
import { PrivyAuthBridge, PreviewAuthProvider } from './auth';

const queryClient = new QueryClient();

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
const activeChain =
  SUPPORTED_CHAIN_ID === foundry.id ? foundry : SUPPORTED_CHAIN_ID === sepolia.id ? sepolia : mainnet;

// On a local chain (anvil 31337), smart-wallet SDKs (Coinbase, Base) and embedded
// wallets can't operate, so we restrict to injected/EVM wallets and skip the email
// path to keep the console clean. Real chains get the full wallet experience.
const isLocal = activeChain.id === foundry.id;

// Solana wallet connectors so Phantom-Solana (and other SVM wallets) can connect
// through Privy. NOTE: this only lets a Solana wallet LOG IN — the app's pools are
// EVM contracts, so a Solana wallet cannot deposit/withdraw (there is no Solana
// program). Wired per the dashboard's SVM toggle.
const solanaConnectors = toSolanaWalletConnectors();

function Root() {
  // Full mode: wallet login via Privy + Privy-aware wagmi.
  if (PRIVY_APP_ID) {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          loginMethods: isLocal ? ['wallet'] : ['wallet', 'email'],
          embeddedWallets: { createOnLogin: isLocal ? 'off' : 'users-without-wallets' },
          externalWallets: { solana: { connectors: solanaConnectors } },
          solanaClusters: [
            {
              name: 'mainnet-beta',
              rpcUrl:
                (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
                'https://api.mainnet-beta.solana.com',
            },
          ],
          defaultChain: activeChain,
          supportedChains: [activeChain],
          appearance: {
            theme: 'dark',
            accentColor: '#2775CA',
            walletList: ['detected_wallets', 'phantom', 'metamask', 'wallet_connect'],
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={wagmiConfig}>
            <PrivyAuthBridge>
              <App />
            </PrivyAuthBridge>
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    );
  }

  // Preview mode: no Privy app configured. Render the full themed app with wallet
  // login disabled (standard wagmi provider so read hooks still work).
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PreviewAuthProvider>
          <App />
        </PreviewAuthProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
