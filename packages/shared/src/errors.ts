export const ELIGIBILITY_CODES = [
  'INSUFFICIENT_HOLDING',
  'LOW_LIQUIDITY',
  'PRICE_UNAVAILABLE',
  'TOKEN_HIDDEN',
  'USER_BANNED',
  'WALLET_ALREADY_LIVE',
  'WALLET_NOT_OWNED',
  'RPC_UNAVAILABLE',
] as const;
export type EligibilityCode = (typeof ELIGIBILITY_CODES)[number];

/** Error with a stable machine code, mapped to `{ error: { code, message } }` by the API layer. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
