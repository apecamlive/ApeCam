import { describe, expect, it, vi } from 'vitest';
import { telegramNotifier } from './moderation';
import { PrivyEmbeddedWallets } from './privy';

describe('PrivyEmbeddedWallets', () => {
  it('reads the embedded EVM wallet from linked accounts, authenticating as the app', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            linked_accounts: [
              {
                type: 'wallet',
                wallet_client_type: 'metamask',
                chain_type: 'ethereum',
                address: '0xEXTERNAL',
              },
              { type: 'wallet', wallet_client_type: 'privy', chain_type: 'solana', address: 'SoLaNa' },
              { type: 'wallet', wallet_client_type: 'privy', chain_type: 'ethereum', address: '0xABCdef' },
            ],
          }),
        ),
    );
    const privy = new PrivyEmbeddedWallets('app-id', 'secret', fetchMock as never);
    expect(await privy.getEvmWallet('user-1')).toBe('0xabcdef');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://auth.privy.io/api/v1/users/custom_auth/id');
    expect(JSON.parse(init.body as string)).toEqual({ custom_user_id: 'user-1' });
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('app-id:secret')}`);
  });

  it('unknown user → null; server error → throws', async () => {
    expect(
      await new PrivyEmbeddedWallets(
        'a',
        's',
        (async () => new Response('', { status: 404 })) as never,
      ).getEvmWallet('u'),
    ).toBeNull();
    await expect(
      new PrivyEmbeddedWallets(
        'a',
        's',
        (async () => new Response('', { status: 500 })) as never,
      ).getEvmWallet('u'),
    ).rejects.toThrow('Privy API 500');
  });
});

describe('telegramNotifier', () => {
  it('posts the text to the configured chat', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    await telegramNotifier('TOKEN', '-100', fetchMock as never).send('🚨 alert');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage');
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: '-100', text: '🚨 alert' });
  });
});
