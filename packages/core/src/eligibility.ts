import { CHAINS, ChainRpcError, type ChainId, type TokenHolding } from '@apecam/chain';
import { streams, users, wallets } from '@apecam/db';
import { holdingUsdValue, passesMarketGuard, type TokenQuote } from '@apecam/pricing';
import { ApiError, type AppConfig, type EligibilityCode } from '@apecam/shared';
import Decimal from 'decimal.js';
import { and, eq, inArray } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { ensureToken, type TokenRow } from './tokens';

export interface EligibilityInput {
  tokenHidden: boolean;
  userBanned: boolean;
  walletOwned: boolean;
  walletAlreadyLive: boolean;
  holding: TokenHolding | 'rpc_error';
  quote: TokenQuote | null;
  config: Pick<
    AppConfig,
    | 'go_live.min_usd'
    | 'go_live.min_liquidity_usd'
    | 'go_live.bonding_curve_min_mcap_usd'
    | 'go_live.bonding_curve_min_volume24h_usd'
  >;
}

export interface EligibilityResult {
  passed: boolean;
  reasons: EligibilityCode[];
  usdValue: string | null;
  minUsd: number;
  shortfallUsd: string | null;
}

/** Pure go-live rules (Dev Brief: go-live requirement). Every failing rule is reported, not just the first. */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: EligibilityCode[] = [];
  const minUsd = input.config['go_live.min_usd'];
  if (input.userBanned) reasons.push('USER_BANNED');
  if (!input.walletOwned) reasons.push('WALLET_NOT_OWNED');
  if (input.tokenHidden) reasons.push('TOKEN_HIDDEN');
  if (input.walletAlreadyLive) reasons.push('WALLET_ALREADY_LIVE');

  let usdValue: Decimal | null = null;
  if (input.holding === 'rpc_error') reasons.push('RPC_UNAVAILABLE');
  else if (!input.quote) reasons.push('PRICE_UNAVAILABLE');
  else {
    const guard = passesMarketGuard(input.quote, {
      minLiquidityUsd: input.config['go_live.min_liquidity_usd'],
      bondingCurveMinMcapUsd: input.config['go_live.bonding_curve_min_mcap_usd'],
      bondingCurveMinVolume24hUsd: input.config['go_live.bonding_curve_min_volume24h_usd'],
    });
    if (!guard) reasons.push('LOW_LIQUIDITY');
    usdValue = holdingUsdValue(input.holding.rawBalance, input.holding.decimals, input.quote.priceUsd);
    if (usdValue.lt(minUsd)) reasons.push('INSUFFICIENT_HOLDING');
  }

  const shortfall = usdValue && usdValue.lt(minUsd) ? new Decimal(minUsd).minus(usdValue) : null;
  return {
    passed: reasons.length === 0,
    reasons,
    usdValue: usdValue?.toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2) ?? null,
    minUsd,
    shortfallUsd: shortfall?.toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2) ?? null,
  };
}

export interface EligibilityCheck {
  result: EligibilityResult;
  token: TokenRow;
  wallet: typeof wallets.$inferSelect | undefined;
  holding: TokenHolding | 'rpc_error';
  quote: TokenQuote | null;
}

/** Gathers every input from DB, chain and price feed, then applies `evaluateEligibility`. */
export async function checkEligibility(
  deps: CoreDeps,
  args: { userId: string; walletId: string; chain: ChainId; contract: string },
): Promise<EligibilityCheck> {
  const now = deps.now?.() ?? new Date();
  const config = await deps.config();
  const token = await ensureToken(deps, args.chain, args.contract);

  const [user] = await deps.db.select().from(users).where(eq(users.id, args.userId));
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again');
  const [wallet] = await deps.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, args.walletId), eq(wallets.userId, args.userId)));
  const walletOwned = !!wallet && wallet.chainFamily === CHAINS[args.chain].family;

  const live = wallet
    ? await deps.db
        .select({ id: streams.id })
        .from(streams)
        .where(and(eq(streams.walletId, wallet.id), inArray(streams.status, ['starting', 'live'])))
    : [];

  let holding: TokenHolding | 'rpc_error' = {
    contract: token.contract,
    rawBalance: 0n,
    decimals: token.decimals ?? 0,
  };
  if (walletOwned) {
    try {
      holding = await deps.chains.get(args.chain).getBalance(wallet.address, token.contract);
    } catch (err) {
      if (!(err instanceof ChainRpcError)) throw err;
      holding = 'rpc_error';
    }
  }
  const quote = await deps.prices.getQuote(CHAINS[args.chain].dexscreener, token.contract).catch(() => null);

  const result = evaluateEligibility({
    tokenHidden: token.hidden,
    userBanned: !!user.bannedUntil && user.bannedUntil > now,
    walletOwned,
    walletAlreadyLive: live.length > 0,
    holding,
    quote,
    config,
  });
  return { result, token, wallet, holding, quote };
}
