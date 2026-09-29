import { randomBytes, randomUUID } from 'node:crypto';
import { normalizeAddress, type ChainFamily } from '@apecam/chain';
import { users, wallets, type Db } from '@apecam/db';
import { ApiError, parseSiwsMessage, SIGN_IN_STATEMENT, type KeyValueStore } from '@apecam/shared';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import { and, eq } from 'drizzle-orm';
import { verifyMessage } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import type { Session } from './session';

const NONCE_TTL_SEC = 300;
const CLOCK_SKEW_MS = 60_000;

export interface AuthConfig {
  /** Host shown in the message, e.g. `apecam.xyz` or `localhost:3000`. */
  domain: string;
  /** Full origin, e.g. `https://apecam.xyz`. */
  origin: string;
  /** EVM chain IDs a SIWE message may name: Robinhood 4663, Base 8453, BNB 56, Ethereum 1. */
  evmChainIds: number[];
}

export async function createNonce(kv: KeyValueStore, now: Date) {
  const nonce = randomBytes(12).toString('hex');
  await kv.set(`nonce:${nonce}`, now.toISOString(), NONCE_TTL_SEC);
  return {
    nonce,
    issuedAt: now.toISOString(),
    expirationTime: new Date(now.getTime() + NONCE_TTL_SEC * 1000).toISOString(),
    statement: SIGN_IN_STATEMENT,
  };
}

interface SignedFields {
  address: string;
  domain?: string;
  uri?: string;
  nonce?: string;
  issuedAt?: Date;
  expirationTime?: Date;
}

const invalid = (why: string) => new ApiError(401, 'INVALID_SIGNATURE', `Sign-in rejected: ${why}`);

function checkFields(f: SignedFields, cfg: AuthConfig, now: Date) {
  if (f.domain !== cfg.domain) throw invalid('wrong domain');
  if (!f.uri || new URL(f.uri).origin !== cfg.origin) throw invalid('wrong URI');
  if (!f.nonce) throw invalid('missing nonce');
  if (!f.expirationTime || f.expirationTime.getTime() <= now.getTime()) throw invalid('message expired');
  if (f.issuedAt && f.issuedAt.getTime() > now.getTime() + CLOCK_SKEW_MS)
    throw invalid('issued in the future');
}

/**
 * Verifies a plain-text sign-in signature (never a transaction) and returns the signer.
 * The nonce is consumed only after the signature checks out, so a forged attempt cannot burn a
 * legitimate user's nonce; GETDEL still guarantees each nonce logs in at most once.
 */
export async function verifySignIn(
  kv: KeyValueStore,
  cfg: AuthConfig,
  input: { family: ChainFamily; message: string; signature: string },
  now: Date,
): Promise<{ family: ChainFamily; address: string }> {
  let fields: SignedFields;
  if (input.family === 'evm') {
    const siwe = parseSiweMessage(input.message);
    if (!siwe.address || !siwe.chainId || !cfg.evmChainIds.includes(siwe.chainId))
      throw invalid('bad SIWE message');
    fields = { ...siwe, address: siwe.address };
    checkFields(fields, cfg, now);
    const ok = await verifyMessage({
      address: siwe.address,
      message: input.message,
      signature: input.signature as `0x${string}`,
    }).catch(() => false);
    if (!ok) throw invalid('signature does not match');
  } else {
    const siws = parseSiwsMessage(input.message);
    if (!siws?.address) throw invalid('bad SIWS message');
    fields = {
      address: siws.address,
      domain: siws.domain,
      uri: siws.uri,
      nonce: siws.nonce,
      issuedAt: siws.issuedAt ? new Date(siws.issuedAt) : undefined,
      expirationTime: siws.expirationTime ? new Date(siws.expirationTime) : undefined,
    };
    checkFields(fields, cfg, now);
    let ok: boolean;
    try {
      ok = ed25519.verify(
        bs58.decode(input.signature),
        new TextEncoder().encode(input.message),
        bs58.decode(siws.address),
      );
    } catch {
      ok = false;
    }
    if (!ok) throw invalid('signature does not match');
  }

  if (!(await kv.getdel(`nonce:${fields.nonce}`))) throw invalid('nonce unknown or already used');
  return { family: input.family, address: normalizeAddress(input.family, fields.address) };
}

/** Finds or creates the user that owns this wallet. */
export async function signInWallet(db: Db, signer: { family: ChainFamily; address: string }, now: Date) {
  const [existing] = await db
    .select({ wallet: wallets, user: users })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(and(eq(wallets.chainFamily, signer.family), eq(wallets.address, signer.address)));
  if (existing) {
    await db.update(wallets).set({ verifiedAt: now }).where(eq(wallets.id, existing.wallet.id));
    return { user: existing.user, wallet: existing.wallet };
  }
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({}).returning();
    const [wallet] = await tx
      .insert(wallets)
      .values({ userId: user!.id, chainFamily: signer.family, address: signer.address, verifiedAt: now })
      .returning();
    return { user: user!, wallet: wallet! };
  });
}

export function newSession(user: { id: string; role: Session['role'] }): Session {
  return { userId: user.id, sid: randomUUID(), role: user.role };
}
