import { profileSeo, tokenSeo } from '@apecam/core';
import { shortAddress } from '@apecam/shared';
import { getDeps } from './deps';

/** Metadata lookups never break a page: when the DB is unreachable the page renders with generic metadata. */
export async function safeTokenSeo(chain: string, contract: string) {
  try {
    return await tokenSeo(await getDeps(), chain, contract);
  } catch {
    return null;
  }
}

export async function safeProfileSeo(address: string) {
  try {
    return await profileSeo(await getDeps(), address);
  } catch {
    return null;
  }
}

export function tokenLabel(seo: { ticker: string | null } | null, contract: string) {
  return seo?.ticker ? `$${seo.ticker}` : shortAddress(contract);
}

export function profileLabel(seo: { displayName: string | null } | null, address: string) {
  return seo?.displayName ?? shortAddress(address);
}
