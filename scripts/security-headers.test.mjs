import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headersFor = (source) => Object.fromEntries(
  config.headers.find((rule) => rule.source === source).headers.map(({ key, value }) => [key.toLowerCase(), value]),
);

test('global CSP forbids base replacement and legacy embeds without restricting payment frames or connections', () => {
  const directives = Object.fromEntries(headersFor('/(.*)')['content-security-policy']
    .split(';').map((part) => part.trim().split(/\s+/, 2)));
  assert.deepEqual(directives, {
    'frame-ancestors': "'none'", 'base-uri': "'none'", 'object-src': "'none'",
  });
});

test('existing global privacy, framing and camera permissions remain intact', () => {
  const headers = headersFor('/(.*)');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['permissions-policy'], 'camera=(self), geolocation=(), microphone=()');
});

test('checkout no-store, indexing rules and universal-link responses remain intact', () => {
  assert.equal(headersFor('/pay')['cache-control'], 'no-store');
  for (const route of ['/pay', '/admin/:path*', '/home/(.*)']) {
    assert.equal(headersFor(route)['x-robots-tag'], 'noindex, nofollow, noarchive');
  }
  for (const route of ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json']) {
    assert.equal(headersFor(route)['content-type'], 'application/json');
    assert.equal(headersFor(route)['cache-control'], 'public, max-age=3600');
  }
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});
