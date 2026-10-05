'use client';

import { buildSiwsMessage } from '@apecam/shared';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import bs58 from 'bs58';
import { useState } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage } from 'wagmi';
import { useAuth } from '@/components/auth/auth-context';
import { Button } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/client/api';

interface NonceResponse {
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  statement: string;
  domain: string;
  uri: string;
}

/**
 * Link another wallet to the signed-in account (S2-6). The wallet currently selected in the extension
 * signs the same plain-text sign-in message; the session decides which account it joins.
 */
export function LinkWalletButtons() {
  const { me, refresh } = useAuth();
  const solana = useWallet();
  const { setVisible } = useWalletModal();
  const { address: evmAddress, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState<'solana' | 'evm' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const has = (family: string, address?: string) =>
    !!address &&
    !!me?.wallets.some((w) => w.family === family && w.address.toLowerCase() === address.toLowerCase());

  async function link(family: 'solana' | 'evm') {
    setBusy(family);
    setMsg(null);
    try {
      const n = await api<NonceResponse>('/api/auth/nonce', { body: {} });
      let message: string;
      let signature: string;
      if (family === 'solana') {
        if (!solana.publicKey || !solana.signMessage) throw new Error('Connect a Solana wallet first');
        message = buildSiwsMessage({
          domain: n.domain,
          address: solana.publicKey.toBase58(),
          statement: n.statement,
          uri: n.uri,
          version: '1',
          chainId: 'mainnet',
          nonce: n.nonce,
          issuedAt: n.issuedAt,
          expirationTime: n.expirationTime,
        });
        signature = bs58.encode(await solana.signMessage(new TextEncoder().encode(message)));
      } else {
        if (!evmAddress) throw new Error('Connect an EVM wallet first');
        message = createSiweMessage({
          domain: n.domain,
          address: evmAddress,
          statement: n.statement,
          uri: n.uri,
          version: '1',
          chainId: chainId ?? 1,
          nonce: n.nonce,
          issuedAt: new Date(n.issuedAt),
          expirationTime: new Date(n.expirationTime),
        });
        signature = await signMessageAsync({ message });
      }
      await api('/api/me/wallets', { body: { family, message, signature } });
      await refresh();
      setMsg({ ok: true, text: 'Wallet linked.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiRequestError ? err.message : (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const solAddr = solana.publicKey?.toBase58();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {solana.connected && solAddr && !has('solana', solAddr) ? (
          <Button size="sm" onClick={() => link('solana')} disabled={busy !== null}>
            {busy === 'solana' ? 'Sign in your wallet…' : `Link Solana ${solAddr.slice(0, 4)}…`}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setVisible(true)}>
            + Solana wallet
          </Button>
        )}
        {evmAddress && !has('evm', evmAddress) ? (
          <Button size="sm" onClick={() => link('evm')} disabled={busy !== null}>
            {busy === 'evm' ? 'Sign in your wallet…' : `Link EVM ${evmAddress.slice(0, 6)}…`}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => openConnectModal?.()}>
            + EVM wallet
          </Button>
        )}
      </div>
      <p className="text-xs text-subtle">
        Switch to the other wallet in your extension, then link it. Linking only signs a message; it never
        moves funds.
      </p>
      {msg && <p className={msg.ok ? 'text-emerald-light' : 'text-live'}>{msg.text}</p>}
    </div>
  );
}
