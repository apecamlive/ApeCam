import { ADMIN_KEY, E2E_ORIGIN, expect, signIn, test } from './fixtures';

test.describe('T-S4-E3 · moderation', () => {
  test('3 reports auto-blur a stream; admin kills it, bans another wallet, both land in the log', async ({
    page,
    playwright,
  }) => {
    // Three different viewers (separate cookie jars and IPs) report the same stream through the API.
    await page.goto('/');
    const feed = await (await page.request.get('/api/streams/live?tab=new')).json();
    const target = feed.items.find((i: { title: string }) => i.title === 'moon mission live');
    expect(target, 'seeded stream is live').toBeTruthy();
    for (let i = 0; i < 3; i++) {
      const ctx = await playwright.request.newContext({
        baseURL: E2E_ORIGIN,
        extraHTTPHeaders: { 'x-forwarded-for': `10.9.9.${i + 1}` },
      });
      await signIn(ctx);
      const res = await ctx.post('/api/reports', {
        headers: { origin: E2E_ORIGIN },
        data: { streamId: target.streamId, category: 'scam', reason: `e2e report ${i}` },
      });
      expect(res.status(), await res.text()).toBe(200);
      await ctx.dispose();
    }

    await signIn(page.request, ADMIN_KEY);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Moderation' })).toBeVisible();

    const item = page.getByRole('listitem').filter({ hasText: 'moon mission live' });
    await expect(item.getByText('auto-blurred')).toBeVisible();
    await expect(item).toContainText('3 reporters');

    await item.getByRole('button', { name: 'Kill stream' }).click();
    const kill = page.getByRole('dialog', { name: /Kill/ });
    await kill.getByLabel('Reason').fill('e2e: scam stream');
    await kill.getByRole('button', { name: 'Confirm' }).click();
    await expect(kill).toBeHidden();

    await page.getByRole('tab', { name: 'Live streams' }).click();
    await expect(page.getByText('moon mission live')).toHaveCount(0);
    const banRow = page.getByRole('listitem').filter({ hasText: 'ban target stream' });
    await banRow.getByRole('button', { name: 'Ban wallet' }).click();
    const ban = page.getByRole('dialog', { name: /Ban/ });
    await ban.getByLabel('Ban duration').selectOption('7d');
    await ban.getByLabel('Reason').fill('e2e: repeat offender');
    await ban.getByRole('button', { name: 'Confirm' }).click();
    await expect(ban).toBeHidden();
    await expect(page.getByText('ban target stream')).toHaveCount(0); // banning ends their streams

    await page.getByRole('tab', { name: 'Action log' }).click();
    await expect(page.getByText('e2e: scam stream')).toBeVisible();
    await expect(page.getByText('e2e: repeat offender')).toBeVisible();
  });

  test('regular users cannot open the moderation panel', async ({ page }) => {
    await signIn(page.request);
    await page.goto('/admin');
    await expect(page.getByText('This wallet has no moderator access.')).toBeVisible();
    const api = await page.request.get('/api/admin/reports');
    expect(api.status()).toBe(403);
  });
});
