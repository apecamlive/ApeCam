import { expect, SEED, signIn, test } from './fixtures';

const XSS_TITLE = '<img src=x onerror="window.__xss=1">xss check';

test.describe('T-S4-E1 · viewer', () => {
  test('Home → token room → sign in → chat → report', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('feed').getByText('gm apes, charts + chill')).toBeVisible();

    await page.getByTestId('feed').getByText('gm apes, charts + chill').click();
    await expect(page).toHaveURL(new RegExp(`${SEED.apex}\\?s=`));
    await expect(page.getByRole('heading', { name: '$APEX' })).toBeVisible();

    // Signed out: chat asks to connect instead of showing an input.
    await expect(page.getByLabel('Chat message')).toHaveCount(0);

    await signIn(page.request);
    await page.reload();
    const input = page.getByLabel('Chat message');
    await expect(input).toBeVisible();
    await input.fill('hello from e2e');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByLabel('Chat').getByText('hello from e2e')).toBeVisible();
    await expect(input).toHaveValue('');

    await page.getByRole('button', { name: 'Report', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this stream' });
    await dialog.getByRole('radio').first().click();
    await dialog
      .getByRole('button', { name: /report|submit|send/i })
      .last()
      .click();
    await expect(dialog.getByText(/Thanks/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('button', { name: 'Reported' })).toBeVisible();
  });

  test('T-S4-I4 · an XSS payload in a stream title renders as text and never runs', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.goto('/');
    await expect(page.getByTestId('feed').getByText(XSS_TITLE)).toBeVisible();
    await page.getByTestId('feed').getByText(XSS_TITLE).click();
    await expect(page.getByText(XSS_TITLE).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('unknown pages show the 404 page', async ({ page }) => {
    const res = await page.goto('/definitely-not-a-page');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Nothing live here')).toBeVisible();
    await page.getByRole('button', { name: 'Back to live streams' }).click();
    await expect(page).toHaveURL('/');
  });

  test('security headers on HTML responses', async ({ page }) => {
    const res = await page.goto('/about');
    const h = res!.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['permissions-policy']).toContain('camera=(self)');
    expect(h['x-powered-by']).toBeUndefined();
  });
});

test.describe('mobile @mobile', () => {
  test('Home and token room fit a phone screen with bottom navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('feed').getByText('gm apes, charts + chill')).toBeVisible();
    await expect(page.getByRole('navigation').last().getByText('Go Live')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.goto(SEED.apex);
    await expect(page.getByRole('heading', { name: '$APEX' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
});
