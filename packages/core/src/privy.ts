import type { EmbeddedWalletProvider } from './deps';

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
}

/**
 * Privy server API, used only to read a user's embedded EVM wallet (D7, Implementation Plan §4.10).
 * APECAM signs users in itself; Privy is configured with *custom auth* (our JWKS), so Privy knows our
 * users by our user id. Endpoint and payload must be confirmed in spike S6 (ADR 006) once the Privy app exists.
 */
export class PrivyEmbeddedWallets implements EmbeddedWalletProvider {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = 'https://auth.privy.io/api/v1',
  ) {}

  async getEvmWallet(userId: string): Promise<string | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/users/custom_auth/id`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'privy-app-id': this.appId,
        authorization: `Basic ${btoa(`${this.appId}:${this.appSecret}`)}`,
      },
      body: JSON.stringify({ custom_user_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Privy API ${res.status}`);
    const user = (await res.json()) as { linked_accounts?: PrivyLinkedAccount[] };
    const wallet = user.linked_accounts?.find(
      (a) => a.type === 'wallet' && a.wallet_client_type === 'privy' && a.chain_type === 'ethereum',
    );
    return wallet?.address?.toLowerCase() ?? null;
  }
}
