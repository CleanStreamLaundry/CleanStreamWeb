# Cortina domain setup

The public payment route is `/pay?machine=<public_machine_token>`. Configure the production host to rewrite `/pay` to `index.html` so direct browser visits load the React app.

## Production host

- Vercel team: `CleanStreamLaundry`
- Vercel project: `clean-stream-web`
- Production domain: `https://cleanstreamlaundry.com`
- `www.cleanstreamlaundry.com` redirects permanently to the apex domain.
- GoDaddy A record `@` points to Vercel at `216.198.79.1`.

The domain, `/pay` SPA route, and Android association file were verified live on September 8, 2026. Only the apex website record was changed in GoDaddy; Outlook/Microsoft mail, autodiscover, MX, TXT, SIP, and related records were left unchanged.

Read-only recheck on September 29, 2026: both association URLs returned HTTP 200 with JSON content types and no redirect; their bodies matched the checked-in files. HTTPS `www` returned 308 to the apex. This confirms hosting responses, not production signing or physical-device link handling. No hosting/DNS settings changed.

Read-only HEAD recheck on September 30, 2026: HTTP apex redirects 308 to HTTPS; `/`, `/support`, `/privacy`, `/account-deletion`, and `/pay` return 200 HTML. Both association URLs return 200 JSON without redirects. HTTPS responses include HSTS and `nosniff`. The local anti-framing headers, `no-referrer` policy, and `/pay` `no-store`/`noindex` headers are not deployed: live `/pay` still reports `public, max-age=0, must-revalidate`. These checks establish routing/headers only, not rendered page content, signed-device association or checkout behavior. Deploy the reviewed header configuration only with production approval.

## iOS

Deploy `public/.well-known/apple-app-site-association` at:

`https://cleanstreamlaundry.com/.well-known/apple-app-site-association`

It must return HTTP 200 with `application/json` and no redirect. The checked-in app ID uses Apple Team ID `3843FZGZ7T` and the current production bundle ID `com.cleanstreamlaundrysolutions.clenaStreamLaundryApp`.

## Android

The deployed `public/.well-known/assetlinks.json` currently contains the Clean Stream test-build certificate so the connected Samsung can verify `/pay` during live-device testing.

Before the Play release:

1. Obtain the SHA-256 fingerprint for every production Play/App Signing certificate.
2. Add each production fingerprint to `sha256_cert_fingerprints` without removing the test fingerprint until device testing is complete.
3. Confirm the file returns HTTP 200 with `application/json` and no redirect.
4. Remove the test fingerprint after production builds have replaced the test build on field devices.
