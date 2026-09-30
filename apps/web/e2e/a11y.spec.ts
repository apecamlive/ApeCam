import AxeBuilder from '@axe-core/playwright';
import { expect, SEED, signIn, test } from './fixtures';

// T-S4-E4: no serious or critical axe violations (WCAG 2.1 A/AA) on the main pages.
const PAGES = [
  { name: 'Home', path: '/', ready: 'gm apes, charts + chill' },
  { name: 'Token room', path: SEED.apex, ready: '$APEX' },
  { name: 'Burn tracker', path: '/burn', ready: null },
  { name: 'About', path: '/about', ready: 'Tokenomics' },
  { name: 'Search', path: '/search?q=apex', ready: null },
];

async function audit(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
}

test.describe('T-S4-E4 · accessibility', () => {
  for (const p of PAGES) {
    test(p.name, async ({ page }) => {
      await page.goto(p.path);
      if (p.ready) await expect(page.getByText(p.ready).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await audit(page)).toEqual([]);
    });
  }

  test('Studio (signed in)', async ({ page }) => {
    await signIn(page.request);
    await page.goto('/go-live');
    await expect(page.getByRole('heading', { name: 'Go Live' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await audit(page)).toEqual([]);
  });
});
