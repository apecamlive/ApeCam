import bs58 from 'bs58';
import {
  ChainRpcError,
  TokenNotFoundError,
  type ChainAdapter,
  type TokenHolding,
  type TokenMeta,
} from './types';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface SolanaAdapterOptions {
  /** Primary first; the next URL is tried when one fails (ADR 005). */
  rpcUrls: string[];
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type ParsedTokenAccount = {
  account: {
    data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } };
  };
};

type ParsedMint = {
  owner: string;
  data: {
    parsed?: {
      type: string;
      info: {
        decimals: number;
        extensions?: { extension: string; state: { name?: string; symbol?: string; uri?: string } }[];
      };
    };
  };
};

export class SolanaAdapter implements ChainAdapter {
  readonly chain = 'solana' as const;
  readonly family = 'solana' as const;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SolanaAdapterOptions) {
    if (!opts.rpcUrls.length) throw new Error('SolanaAdapter needs at least one RPC URL');
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  isValidAddress(address: string) {
    try {
      return bs58.decode(address).length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Sums every token account the owner holds for this mint. Works for SPL Token and Token-2022
   * (new pump.fun tokens are Token-2022, ADR 005): the mint filter lets the RPC resolve the program.
   */
  async getBalance(owner: string, mint: string): Promise<TokenHolding> {
    const res = await this.rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
      owner,
      { mint },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    let rawBalance = 0n;
    let decimals: number | undefined;
    for (const acct of res.value) {
      const amount = acct.account.data.parsed.info.tokenAmount;
      rawBalance += BigInt(amount.amount);
      decimals = amount.decimals;
    }
    // No token account means zero balance; decimals then come from the mint itself.
    decimals ??= (await this.getTokenMeta(mint)).decimals;
    return { contract: mint, rawBalance, decimals };
  }

  /** Non-zero balances across both token programs, summed per mint. Works on any Solana RPC. */
  async listHoldings(owner: string): Promise<TokenHolding[]> {
    const pages = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        this.rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
          owner,
          { programId },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ]),
      ),
    );
    const byMint = new Map<string, TokenHolding>();
    for (const acct of pages.flatMap((p) => p.value)) {
      const { mint, tokenAmount } = acct.account.data.parsed.info;
      const raw = BigInt(tokenAmount.amount);
      if (raw === 0n) continue;
      const prev = byMint.get(mint);
      byMint.set(mint, {
        contract: mint,
        rawBalance: (prev?.rawBalance ?? 0n) + raw,
        decimals: tokenAmount.decimals,
      });
    }
    return [...byMint.values()];
  }

  async getTokenMeta(mint: string): Promise<TokenMeta> {
    const res = await this.rpc<{ value: ParsedMint | null }>('getAccountInfo', [
      mint,
      { encoding: 'jsonParsed' },
    ]);
    const parsed = res.value?.data.parsed;
    if (
      !res.value ||
      ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(res.value.owner) ||
      !parsed ||
      parsed.type !== 'mint'
    ) {
      throw new TokenNotFoundError(`${mint} is not a token mint`);
    }
    const metadata = parsed.info.extensions?.find((e) => e.extension === 'tokenMetadata')?.state;
    return {
      contract: mint,
      decimals: parsed.info.decimals,
      name: metadata?.name || undefined,
      ticker: metadata?.symbol || undefined,
      metadataUri: metadata?.uri || undefined,
    };
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (const url of this.opts.rpcUrls) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) {
          // Invalid params (bad mint/owner) will fail on every RPC, so do not fall back.
          if (body.error.code === -32602) throw new TokenNotFoundError(body.error.message);
          throw new Error(`${method}: ${body.error.message}`);
        }
        return body.result as T;
      } catch (err) {
        if (err instanceof TokenNotFoundError) throw err;
        lastError = err;
      }
    }
    throw new ChainRpcError(`Solana RPC failed for ${method}`, lastError);
  }
}
