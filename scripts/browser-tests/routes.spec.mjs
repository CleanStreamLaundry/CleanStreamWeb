/* global document, getComputedStyle, HTMLElement */
import { expect, test as base } from '@playwright/test';

const test = base.extend({
  serviceIsolation: [async ({ context, page }, use) => {
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4176') return route.continue();
      externalRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort();
    });
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      if (url.origin === 'ws://127.0.0.1:4176') {
        socket.connectToServer();
        return;
      }
      externalRequests.push(`GET ${url.origin}${url.pathname}`);
      return socket.close();
    });
    // Never send Auth, email, payment or analytics traffic to a real service.
    await use();
    expect(errors, 'uncaught browser errors').toEqual([]);
    expect(externalRequests, 'unexpected external requests').toEqual([]);
  }, { auto: true }],
});

for (const [path, heading] of [
  ['/', 'Clean Stream Laundry'],
  ['/support', 'Clean Stream support'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Service'],
  ['/account-deletion', 'Delete your Clean Stream account'],
  ['/newsletter', 'Newsletter preferences'],
  ['/missing-page', 'Page not found'],
]) {
  test(`direct load and refresh: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(root => root.clientWidth));
    for (const image of await page.locator('img').all()) {
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    }
  });
}

test('keyboard skip link, navigation focus and browser back', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#public-content')).toBeFocused();
  const support = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Support' });
  await support.focus();
  await expect(support).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Clean Stream support' })).toBeVisible();
  await expect(page.locator('#public-content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^Call\s*\(765\) 610-2114$/ })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Clean Stream Laundry', exact: true })).toBeVisible();
});

test('incomplete payment return is scrubbed and cannot start another payment', async ({ page }) => {
  await page.goto('/pay?session=browser-test-incomplete');
  await expect(page.getByRole('heading', { name: 'Confirmation unavailable' })).toBeVisible();
  await expect(page).toHaveURL('/pay?cortina_return=1');
  await expect(page.getByRole('button')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Confirmation unavailable' })).toBeVisible();
  await expect(page).toHaveURL('/pay?cortina_return=1');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('browser-test-incomplete');
  await page.getByRole('link', { name: 'Contact support' }).click();
  await expect(page.getByRole('heading', { name: 'Clean Stream support' })).toBeVisible();
});

test('missing machine has an honest failure and no payment action', async ({ page }) => {
  await page.goto('/pay');
  await expect(page.getByRole('heading', { name: 'Unable to continue' })).toBeVisible();
  await expect(page.getByText('This QR code does not identify a machine.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay|wallet/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unable to continue' })).toBeVisible();
  await expect(page.getByText('This QR code does not identify a machine.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay|wallet/i })).toHaveCount(0);
});

test('protected workspace returns a signed-out visitor to login', async ({ page }) => {
  await page.goto('/home/transactions');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  const password = page.locator('input[autocomplete="current-password"]');
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAccessibleName(/^Password(?:\s*Show(?: password)?)?$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

for (const path of ['/', '/newsletter']) {
  test(`text-only enlargement preserves layout and support access: ${path}`, async ({ page }) => {
    await page.goto(path);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const originalSize = await heading.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    // Simulate text-only enlargement, not native browser zoom. Snapshot before mutation.
    await page.evaluate(() => {
      const sizes = [...document.body.querySelectorAll('*')]
        .filter(node => node instanceof HTMLElement)
        .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
      for (const [node, size] of sizes) node.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    expect(await heading.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(originalSize * 2, 1);
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const hero = document.querySelector('.public-hero')?.getBoundingClientRect();
      const content = document.querySelector('.public-hero-content')?.getBoundingClientRect();
      return {
        width: root.clientWidth,
        scrollWidth: root.scrollWidth,
        heroFits: !hero || !content || (content.top >= hero.top - 2 && content.bottom <= hero.bottom + 2),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 2);
    expect(layout.heroFits).toBe(true);
    const support = path === '/'
      ? page.getByRole('link', { name: 'Get support', exact: true })
      : page.getByRole('link', { name: 'Contact support', exact: true });
    await support.focus();
    await expect(support).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Clean Stream support', exact: true })).toBeVisible();
  });
}
