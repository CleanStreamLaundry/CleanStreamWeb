import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4176'
    ? route.continue() : route.abort());
});

for (const kind of ['terms', 'privacy']) {
  test(`formatted ${kind} draft`, async ({ page }, info) => {
    await page.goto(`/${kind}`);
    const document = page.locator('.public-legal-document');
    await expect(document.getByRole('heading', { level: 2 })).toHaveCount(12);
    await expect(document).toContainText('Not approved or effective');
    await expect.poll(() => document.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(root => root.clientWidth));
    await page.screenshot({ path: info.outputPath(`${kind}-top.png`) });
    await document.getByRole('heading', { name: '12. Contact' }).scrollIntoViewIfNeeded();
    await expect(document.getByRole('link', { name: 'Email support' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${kind}-bottom.png`) });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(root => root.clientWidth));
    await document.getByRole('link', { name: 'Email support' }).scrollIntoViewIfNeeded();
    await expect(document.getByRole('link', { name: 'Email support' })).toBeVisible();
  });
}

for (const role of ['Manager', 'Maintenance']) {
  test(`${role} cannot open financial pages`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/admin/preview/transactions?role=${role}`);
    await expect(page.getByRole('heading', { level: 1, name: role === 'Manager' ? 'Overview' : 'Maintenance' })).toBeVisible();
    await expect(page.getByText('Loading workspace…')).toHaveCount(0);
    if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    }
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Transactions', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Loyalty Credits', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Top-Up Refunds', exact: true })).toHaveCount(0);
    if (role === 'Maintenance') await expect(nav.getByRole('link')).toHaveCount(1);
    else await expect(nav.getByRole('link', { name: 'Team', exact: true })).toBeVisible();
    if (await page.getByRole('button', { name: 'Close navigation', exact: true }).last().isVisible()) {
      await page.getByRole('button', { name: 'Close navigation', exact: true }).last().click();
    }
    await expect(page.getByText('Stripe net collections today')).toHaveCount(0);
    await expect(page.getByText('Collection coverage')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${role.toLowerCase()}.png`) });
    expect(errors).toEqual([]);
  });
}
