import type { ChainFamily, ChainId } from './registry';

export interface TokenHolding {
  contract: string;
  rawBalance: bigint;
  decimals: number;
}

export interface TokenMeta {
  contract: string;
  decimals: number;
  name?: string;
  ticker?: string;
  /** Metadata URI from chain (Token-2022 metadata extension). ERC-20 has none. */
  metadataUri?: string;
}

export interface ChainAdapter {
  readonly chain: ChainId;
  readonly family: ChainFamily;
  isValidAddress(address: string): boolean;
  getBalance(wallet: string, contract: string): Promise<TokenHolding>;
  getTokenMeta(contract: string): Promise<TokenMeta>;
  /** Every token with a non-zero balance (Studio "pick a token", S2-1). */
  listHoldings(wallet: string): Promise<TokenHolding[]>;
}

/** The RPC behind this chain cannot enumerate a wallet's tokens (e.g. plain public EVM RPC). */
export class HoldingsUnsupportedError extends Error {
  readonly code = 'HOLDINGS_UNSUPPORTED';
}

/** Network/RPC failure, as opposed to a legitimate zero balance. Maps to RPC_UNAVAILABLE. */
export class ChainRpcError extends Error {
  readonly code = 'RPC_UNAVAILABLE';
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** The contract/mint does not exist or is not a token. */
export class TokenNotFoundError extends Error {
  readonly code = 'TOKEN_NOT_FOUND';
}
