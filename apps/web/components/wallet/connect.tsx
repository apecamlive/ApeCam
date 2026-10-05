'use client';

import { shortAddress } from '@apecam/shared';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useAuth } from '@/components/auth/auth-context';
import { Button, Modal } from '@/components/ui';

/** One entry point for both wallet families; the chain is detected by which wallet the user picks. */
export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { me, signedIn, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const { disconnect } = useDisconnect();

  if (loading)
    return (
      <Button size="sm" disabled>
        …
      </Button>
    );
  if (signedIn && me?.user) {
    const w = me.wallets[0];
    return (
      <div className="flex items-center gap-2">
        {(me.user.role === 'moderator' || me.user.role === 'admin') && (
          <Link
            href="/admin"
            className="hidden rounded-full bg-live/20 px-3 py-1.5 text-xs font-semibold text-live sm:inline"
          >
            Mod
          </Link>
        )}
        <Link
          href={w ? `/u/${w.address}` : '/'}
          className="glass hidden rounded-full px-3 py-1.5 font-mono text-xs hover:border-line-strong sm:inline"
        >
          {me.user.displayName ?? (w ? shortAddress(w.address) : 'signed in')}
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            disconnect();
            await signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant={compact ? 'dark' : 'white'}
        className={compact ? 'h-9 px-3.5 text-sm' : undefined}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01" />
        </svg>
        <span>
          Connect<span className={compact ? 'hidden lg:inline' : undefined}> wallet</span>
        </span>
      </Button>
      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openConnectModal } = useConnectModal();
  const { setVisible } = useWalletModal();
  const solana = useWallet();
  const { signedIn, signInSolana, solanaSigning, solanaError } = useAuth();
  const { isConnected } = useAccount();
  const asked = useRef<string | null>(null);

  // After a Solana wallet connects, ask it to sign in once (the user can retry from the modal).
  useEffect(() => {
    const key = solana.publicKey?.toBase58();
    if (!open || !solana.connected || !key || signedIn || asked.current === key) return;
    asked.current = key;
    void signInSolana();
  }, [open, solana.connected, solana.publicKey, signedIn, signInSolana]);

  useEffect(() => {
    if (signedIn && open) onClose();
  }, [signedIn, open, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Connect wallet">
      <div className="flex flex-col gap-3">
        <button
          className="glass flex items-center justify-between rounded-card px-4 py-3 text-left hover:bg-card-hover"
          onClick={() => {
            if (solana.connected) void signInSolana();
            else setVisible(true);
          }}
        >
          <span>
            <span className="block font-semibold">Solana</span>
            <span className="text-xs text-muted">Phantom, Solflare, Backpack</span>
          </span>
          <span className="tag">{solana.connected ? 'sign in' : 'connect'}</span>
        </button>
        <button
          className="glass flex items-center justify-between rounded-card px-4 py-3 text-left hover:bg-card-hover"
          onClick={() => {
            onClose();
            openConnectModal?.();
          }}
        >
          <span>
            <span className="block font-semibold">EVM</span>
            <span className="text-xs text-muted">Robinhood Chain, Base, BNB · MetaMask, Rabby, Coinbase</span>
          </span>
          <span className="tag">{isConnected ? 'sign in' : 'connect'}</span>
        </button>
        {solanaSigning && <p className="text-sm text-muted">Check your wallet to sign the message…</p>}
        {solanaError && <p className="text-sm text-live">{solanaError}</p>}
        <p className="text-xs text-subtle">
          Signing in is a free message signature, not a transaction. APECAM will never ask for your seed
          phrase or private key.
        </p>
      </div>
    </Modal>
  );
}
