'use client';

import { robinhood } from '@apecam/chain';
import {
  connectorsForWallets,
  createAuthenticationAdapter,
  darkTheme,
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { createConfig, http, useAccount, WagmiProvider } from 'wagmi';
import { base, bsc, mainnet } from 'wagmi/chains';
import { api, ApiRequestError } from '@/lib/client/api';
import { AuthProvider, ME_KEY, useAuth } from './auth/auth-context';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Injected wallets always work; WalletConnect (mobile QR) only once a project id is configured.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'EVM wallets',
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        coinbaseWallet,
        injectedWallet,
        ...(wcProjectId ? [walletConnectWallet] : []),
      ],
    },
  ],
  { appName: 'APECAM', projectId: wcProjectId ?? 'apecam-local' },
);

const wagmiConfig = createConfig({
  chains: [robinhood, base, bsc, mainnet],
  connectors,
  transports: { [robinhood.id]: http(), [base.id]: http(), [bsc.id]: http(), [mainnet.id]: http() },
  ssr: true,
});

/**
 * SIWE through RainbowKit's authentication adapter. The server issues the nonce and verifies the
 * signature; RainbowKit only asks the wallet to sign a plain-text message.
 */
function EvmAuth({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { address } = useAccount();
  const pending = useRef<{ issuedAt: string; expirationTime: string; statement: string } | null>(null);
  const { me } = useAuth();

  const status: AuthenticationStatus =
    me === undefined
      ? 'loading'
      : me.user &&
          address &&
          me.wallets.some((w) => w.family === 'evm' && w.address === address.toLowerCase())
        ? 'authenticated'
        : 'unauthenticated';

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const n = await api<{ nonce: string; issuedAt: string; expirationTime: string; statement: string }>(
            '/api/auth/nonce',
            { body: {} },
          );
          pending.current = n;
          return n.nonce;
        },
        createMessage: ({ nonce, address, chainId }) =>
          createSiweMessage({
            domain: window.location.host,
            address,
            statement: pending.current?.statement,
            uri: window.location.origin,
            version: '1',
            chainId,
            nonce,
            issuedAt: pending.current ? new Date(pending.current.issuedAt) : new Date(),
            expirationTime: pending.current ? new Date(pending.current.expirationTime) : undefined,
          }),
        verify: async ({ message, signature }) => {
          await api('/api/auth/verify', { body: { family: 'evm', message, signature } });
          await qc.invalidateQueries({ queryKey: ME_KEY });
          return true;
        },
        signOut: async () => {
          await api('/api/auth/logout', { body: {} });
          await qc.invalidateQueries({ queryKey: ME_KEY });
        },
      }),
    [qc],
  );

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider
        theme={darkTheme({ accentColor: '#1d4ed8', borderRadius: 'large' })}
        modalSize="compact"
      >
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Client errors (4xx) will not fix themselves; retry only network/server failures, once.
            retry: (count, err) => count < 1 && !(err instanceof ApiRequestError && err.status < 500),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const solanaEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {/* Wallet Standard auto-detects Phantom, Solflare, Backpack; no per-wallet adapters needed. */}
        <ConnectionProvider endpoint={solanaEndpoint}>
          <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
              <AuthProvider>
                <EvmAuth>{children}</EvmAuth>
              </AuthProvider>
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
