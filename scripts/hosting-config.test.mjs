import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = (source) => Object.fromEntries(
  config.headers.find((rule) => rule.source === source)?.headers.map(({ key, value }) => [key, value]) ?? [],
);

test('public SPA deep links keep their existing entrypoint', () => {
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('admin descendants and checkout are excluded from indexing', () => {
  for (const route of ['/admin/:path*', '/pay', '/home/(.*)']) {
    assert.equal(headers(route)['X-Robots-Tag'], 'noindex, nofollow, noarchive');
  }
  assert.equal(headers('/pay')['Cache-Control'], 'no-store');
});

test('sensitive URLs are not sent as referrers and the site cannot be framed', () => {
  const common = headers('/(.*)');
  assert.equal(common['Referrer-Policy'], 'no-referrer');
  assert.equal(common['X-Frame-Options'], 'DENY');
  assert.deepEqual(common['Content-Security-Policy'].split(';').map(directive => directive.trim()).sort(),
    ["base-uri 'none'", "frame-ancestors 'none'", "object-src 'none'"]);
  assert.equal(common['X-Content-Type-Options'], 'nosniff');
  assert.equal(common['Permissions-Policy'], 'camera=(self), geolocation=(), microphone=()');
});

test('association files retain JSON headers, matching application identities and payment paths', async () => {
  for (const file of ['apple-app-site-association', 'assetlinks.json']) {
    assert.equal(headers(`/.well-known/${file}`)['Content-Type'], 'application/json');
    assert.equal(headers(`/.well-known/${file}`)['Cache-Control'], 'public, max-age=3600');
  }
  const apple = JSON.parse(await readFile(new URL('../public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
  const android = JSON.parse(await readFile(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
  assert.ok(apple.applinks.details.some((entry) =>
    entry.appID === '3843FZGZ7T.com.cleanstreamlaundrysolutions.clenaStreamLaundryApp' &&
    entry.components.some((component) => component['/'] === '/pay')));
  assert.ok(android.some((entry) =>
    entry.relation.includes('delegate_permission/common.handle_all_urls') &&
    entry.target.package_name === 'com.cleanstreamlaundrysolutions.clean_stream_laundry_app' &&
    entry.target.sha256_cert_fingerprints.length > 0));
});
