import { ADMIN_KEY, E2E_ORIGIN, expect, signIn, test } from './fixtures';

// T-S5-E1: the emergency button end to end (launch checklist: "Tombol darurat tutup Go Live diuji").
// Streams are not ended here (other specs use them), and the mode is restored to "open" afterwards.
test.describe('T-S5-E1 · Go Live emergency button', () => {
  test('admin closes Go Live; a streamer sees it paused; admin reopens', async ({ page, browser }) => {
    await signIn(page.request, ADMIN_KEY);
    try {
      await page.goto('/admin');
      await page.getByRole('tab', { name: 'Go Live access' }).click();
      await page.getByRole('button', { name: 'Emergency: close Go Live' }).click();
      const dialog = page.getByRole('dialog', { name: /“Closed”/ });
      await dialog.getByLabel('Reason').fill('e2e drill');
      await dialog.getByRole('button', { name: 'Confirm' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('radio', { name: /^Closed/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('status').filter({ hasText: 'Go Live is paused' })).toBeVisible();

      // A regular streamer in a separate browser context.
      const other = await browser.newContext({
        baseURL: E2E_ORIGIN,
        extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.1' },
      });
      const streamer = await other.newPage();
      await signIn(streamer.request);
      await streamer.goto('/go-live');
      await expect(streamer.getByRole('heading', { name: 'Go Live is paused' })).toBeVisible();
      await expect(streamer.getByRole('button', { name: '● Go Live' })).toHaveCount(0);
      await other.close();

      await page.getByRole('radio', { name: /^Open/ }).click();
      const reopen = page.getByRole('dialog', { name: /“Open”/ });
      await reopen.getByLabel('Reason').fill('e2e drill over');
      await reopen.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByRole('radio', { name: /^Open/ })).toHaveAttribute('aria-checked', 'true');

      await page.getByRole('tab', { name: 'Action log' }).click();
      await expect(page.getByText('e2e drill over')).toBeVisible();
    } finally {
      // Never leave the shared E2E server closed, even if an assertion failed.
      await page.request.post('/api/admin/go-live', {
        headers: { origin: E2E_ORIGIN },
        data: { mode: 'open', reason: 'e2e cleanup' },
      });
    }
  });
});
