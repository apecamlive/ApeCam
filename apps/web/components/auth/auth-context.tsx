'use client';

import { buildSiwsMessage } from '@apecam/shared';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import bs58 from 'bs58';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, type MeResponse } from '@/lib/client/api';

interface NonceResponse {
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  statement: string;
  domain: string;
  uri: string;
}

interface AuthState {
  me: MeResponse | undefined;
  loading: boolean;
  signedIn: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  signInSolana: () => Promise<void>;
  solanaSigning: boolean;
  solanaError: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

export const ME_KEY = ['me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const wallet = useWallet();
  const [solanaSigning, setSigning] = useState(false);
  const [solanaError, setError] = useState<string | null>(null);
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => api<MeResponse>('/api/me'), staleTime: 30_000 });

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', { body: {} });
    await wallet.disconnect().catch(() => undefined);
    await refresh();
  }, [refresh, wallet]);

  /**
   * Sign In With Solana. Wallets with the `signIn` feature (Phantom, Solflare, Backpack) build and
   * sign the message in one step; older wallets get our message via `signMessage`. Never a transaction.
   */
  const signInSolana = useCallback(async () => {
    if (!wallet.publicKey) return;
    setSigning(true);
    setError(null);
    try {
      const n = await api<NonceResponse>('/api/auth/nonce', { body: {} });
      const fields = {
        domain: n.domain,
        address: wallet.publicKey.toBase58(),
        statement: n.statement,
        uri: n.uri,
        version: '1' as const,
        chainId: 'mainnet',
        nonce: n.nonce,
        issuedAt: n.issuedAt,
        expirationTime: n.expirationTime,
      };
      let message: string;
      let signature: string;
      if (wallet.signIn) {
        const out = await wallet.signIn(fields);
        message = new TextDecoder().decode(out.signedMessage);
        signature = bs58.encode(out.signature);
      } else if (wallet.signMessage) {
        message = buildSiwsMessage(fields);
        signature = bs58.encode(await wallet.signMessage(new TextEncoder().encode(message)));
      } else {
        throw new Error('This wallet cannot sign messages');
      }
      await api('/api/auth/verify', { body: { family: 'solana', message, signature } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSigning(false);
    }
  }, [wallet, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      me: me.data,
      loading: me.isLoading,
      signedIn: !!me.data?.user,
      refresh,
      signOut,
      signInSolana,
      solanaSigning,
      solanaError,
    }),
    [me.data, me.isLoading, refresh, signOut, signInSolana, solanaSigning, solanaError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
