import { E2E_ORIGIN, expect, signIn, test } from './fixtures';

// T-S4-E2 (partial): everything up to the moment video starts. Going live needs LiveKit + a funded wallet on a
// real chain; that part is covered by core tests (fakes) and the manual device matrix (T-S4-M1).
test.describe('T-S4-E2 · streamer (up to go-live)', () => {
  test('signed out: Studio asks to connect', async ({ page }) => {
    await page.goto('/go-live');
    await expect(page.getByText('Connect to go live')).toBeVisible();
  });

  test('signed in: wallet, steps, rules + 18+ confirmation gate the Go Live button', async ({ page }) => {
    const me = await signIn(page.request);
    await page.goto('/go-live');
    await expect(page.getByRole('heading', { name: 'Go Live' })).toBeVisible();
    await expect(page.getByText(me.address.slice(0, 6), { exact: false }).first()).toBeVisible();

    await expect(page.getByLabel('Stream title')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Broadcast source' })).toBeVisible();
    const goLive = page.getByRole('button', { name: '● Go Live' });
    await expect(goLive).toBeDisabled();

    await page.getByLabel('Stream title').fill('e2e stream');
    await page.getByText('I agree to the').click();
    await page.getByText('I am 18 or older.').click();
    await expect(goLive).toBeDisabled(); // still no eligible token picked
    await expect(page.getByText('Pick a token you hold at least $100 of to continue.')).toBeVisible();

    await expect(page.getByRole('link', { name: 'content rules', exact: true })).toHaveAttribute(
      'href',
      '/rules',
    );
  });

  test('the start API refuses without the 18+ confirmation', async ({ page }) => {
    const me = await signIn(page.request);
    const res = await page.request.post('/api/streams/start', {
      headers: { origin: E2E_ORIGIN },
      data: {
        chain: 'base',
        contract: '0x00000000000000000000000000000000000e2e01',
        walletId: me.wallet.id,
        title: 'no age check',
        source: 'camera',
        rulesAccepted: true,
        ageConfirmed: false,
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('AGE_NOT_CONFIRMED');
  });
});
