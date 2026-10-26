# CleanStream admin portal: setup and rollout

The website and paired backend are deployed for development in project
`dnuuhupoxjtwqzaqylvb`. Current receipts and unverified paths are in
[campaign operations](../CleanStreamLaundryApp/docs/operations.md). The unrelated
Supabase connector belongs to Gundex; do not reconnect or replace it.

The latest explicitly designated Owner is **jacob@cleanstreamlaundry.com**;
this supersedes the earlier jake address and the personal Google account.
This reference is not authorization to mutate roles or proof of hosted state.
Owner/Admin TOTP enforcement and audited multi-Owner management are implemented;
hosted acceptance remains pending. Initial bootstrap is database-operator-only;
additional Owners are granted through the authenticated Owner portal.

## Portal Permissions

The October 4 local implementation uses **Owner**, **Manager**, and
**Maintenance**. Owners retain full access and manage invitations, assignments,
staff roles, and additional Owners. Managers receive nonfinancial operations,
machine availability controls, maintenance, and a read-only team list at assigned
locations. Maintenance staff receive only the scoped maintenance queue, report
history, attachments, notes, and planning/status controls. Both non-Owner roles
are excluded from money, credits/refunds, reporting, pricing/payment setup,
financial exports, account recovery, and privilege changes.

Existing database Admin roles display as Manager; a private staff-access record
distinguishes Maintenance without changing the Auth role enum. Canonical MFA and
location boundaries remain. See [backend permissions and rollout](../CleanStreamLaundryApp/docs/admin-permissions.md).
The new migration and endpoint deployment must complete before these restrictions
are described as active on the hosted service.

## Review locally

From `CleanStreamWeb-CortinaQR`:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/admin/preview`. This development-only workspace uses synthetic data and temporary, in-memory changes. It never sends invitations, credits a balance, or calls the production admin service. Its QR tokens are samples and cannot start a machine. The production build excludes the preview.

Use `?state=empty`, `?state=error`, or `?state=loading` on preview routes to inspect those states. Actual sign-in and recovery screens are at `/admin` and `/admin/forgot-password`; do not submit those forms during synthetic QA.

Use `?role=Manager` or `?role=Maintenance` to review synthetic role views; omitted
roles default to Owner. This never assigns real permissions. Privileged role
changes require the real authenticated Owner flow, not this preview.

Real staging authentication also requires the existing frontend variables `VITE_SUPABASE_URL` and `VITE_ANON_KEY`. The anon/publishable browser key is different from the service-role key. The synthetic preview works without either variable.

Existing authenticated URLs remain compatible: `/home`, `/home/locations`, `/home/maintenance`, `/home/refunds`, `/home/employees`, `/home/transactions`, and `/home/audit`.

## Implementation boundaries

- Web: `src/admin/`, the route changes in `src/App.tsx`, and the operator/test scripts in this repository.
- Shared backend: `../CleanStreamLaundryApp/supabase/functions/admin-portal/`, `../CleanStreamLaundryApp/supabase/migrations/20260928135006_admin_portal_operations.sql`, the additive `20260928151021_admin_operations_extensions.sql`, and the additive local redirect/function configuration in that project's `supabase/config.toml`.
- Public pages and the existing atomic credit/ledger implementation are preserved. Shared Cortina orchestration now checks machine availability when quoting and before sending a start; a database trigger prevents new sessions racing an outage change. The checkout API contract is preserved. The portal calls `approveRefund`/`denyRefund` after checking scope; a database guard checks scope again within the existing resolution transaction.
- Other changes already present in `CleanStreamLaundryApp` are outside this rollout. Do not deploy all pending migrations or commit that entire working tree indiscriminately.

## Retained Deployment Checklist

This is the original rollout checklist, not a list of migrations to replay.
Consult current installed history and operations before using any command.

1. Restore Supabase project access for `dnuuhupoxjtwqzaqylvb`. Inspect the applied migration list and actual schemas, policies, grants, triggers, and role-management RPCs. Check existing Owner accounts and location assignments. Verify that Auth's profile-creation trigger ignores client-supplied roles. Do not infer production state from the synthetic SQL tests.
2. Verify the existing Cortina foundation, dryer options, product-code-selector migration, and atomic loyalty-credit resolution migrations are already applied. The portal expects `washer_size_rates`, `cortina_machine_config.product_codes`, `cortina_vend_sessions`, and `Refunds.admin_note/resolved_at/resolved_by/notification_sent_at`. A `transactions.cortina_vend_session_id` relationship is used when present; records without it are explicitly unattributed and visible only to Owners in the portal. Deploy any separate transaction-linking work through its own reviewed rollout.
3. Inspect actual legacy machine types, maintenance IDs/addresses, and enum values. The additive maintenance migration defaults old reports to Open and links only unique exact address matches. Ambiguous or missing mappings must remain Owner-only. Back up the database and test both portal migrations against a staging copy first.
4. Verify the expected service-role grants, existing customer read/insert policies, and payment functions. The migration revokes direct browser writes to management tables and direct update/delete of maintenance and credits. Current mobile inventory reads and maintenance submissions remain supported; test the deployed mobile version, not only repository code. Older admin browser bundles must be refreshed after rollout.
5. Verify custom SMTP, the sender domain, rate limits, and the actual invitation/recovery templates. Allow these exact Auth redirect URLs (retain all existing mobile/checkout redirect URLs):
   - `https://cleanstreamlaundry.com/admin/accept-invite`
   - `https://cleanstreamlaundry.com/admin/reset-password`
   - Staging equivalents only on the staging project.
6. Test delivery to an authorized test mailbox on staging, including new-user invitation, existing-user recovery, an expired/reused link, and password completion. Supabase's standard confirmation links work; custom templates may link to the matching `/admin` route with `token_hash` and `type=invite` or `type=recovery`. Never log the link or token.

## Deploy in a controlled window

1. Apply the reviewed `20260928135006_admin_portal_operations.sql` and then `20260928151021_admin_operations_extensions.sql` migrations through the project's normal migration mechanism after reconciling its applied history. Both are transactional. Together they include service-only RPC grants, scoped reads/exports, retained maintenance planning/history, an append-only operational audit log, availability controls, role-write protection, and location-aware credit resolution. Do not use a blanket database push while unrelated migrations are pending.
2. Deploy the `admin-portal` Edge Function. Its existing `verify_jwt=false` gateway configuration is paired with internal session/MFA/role checks; never remove those checks. `ADMIN_PORTAL_ORIGIN` selects the approved portal. The current entrypoint selects its named server key through `CLEANSTREAM_ADMIN_SECRET_KEY_NAME`; invalid explicit selection fails closed. It does not read an `ADMIN_ONBOARDING_ENABLED` flag. Never expose server keys in client configuration.
3. Redeploy `cortina-vend` and `stripeWebhook` with the updated `_shared/cortina.ts` after the new availability columns exist, before exposing the availability controls. Review the unrelated Stripe webhook work already present in the shared repository separately; do not publish it unintentionally. Smoke-test both card and loyalty wallet flows in the sandbox, including a payment that settles after an outage begins. Then deploy the web build with the existing hosting workflow. Confirm SPA rewrites serve `/admin/accept-invite`, `/admin/reset-password`, and `/home/*` correctly. Do not deploy the frontend alone while its backend is unavailable.
4. Complete approved first-Owner setup below, then verify current-session TOTP and the correct management scope in the testing stage. Invitations use the existing configured server transport and canonical authorization, not an extra onboarding switch.
5. Test an Admin account assigned to one location and one assigned to two. Verify direct URL and direct API denials; owner management; new/existing invitations and resend; logout and expiry; single-assignment removal; old reports; reopening with history; credit retry idempotency and notification warnings; transaction scope and processor references; audit ownership and field snapshots; maintenance assignments/priority/due-date history; filtered exports; outage/restore conflicts; and a checkout smoke test in the payment sandbox.

Invitation delivery and hosted authorization acceptance remain pending; access and
deployment are no longer blockers. Local checks do not replace those acceptance checks.

## Trusted first-owner procedure

Generate SQL for the explicitly approved existing Auth account. This command is
offline: no Supabase client, credential read, account creation, invitation, reset
email or remote preflight. It never executes the SQL:

```sh
npm run admin:owner -- --email jacob@cleanstreamlaundry.com
```

Use optional `--locations "1,2"` only with actual approved location IDs. Review the
generated transaction and execute separately as the trusted `postgres` operator
in the correct project. It requires one existing active account, rejects pending
deletion, reuses the existing serialized bootstrap, and records the initial role
change. Existing-Owner conflicts remain enforced by that function. It sends no
email and does not create an Auth user. `--apply` is retired and explicitly rejected.

Do not grant the bootstrap RPC back to service_role or use the reserved operator
API key to bypass its intended authority. After bootstrap, the Owner signs in with
their own existing credentials and required MFA. Additional Owner grants/removals
use the audited portal and last-Owner safeguards, not this initial bootstrap.

## Verification commands

Run from this web repository while the sibling backend is present:

```sh
npm test
npm run test:admin:db
npm run test:admin:edge
npm run typecheck:admin
npm run typecheck:admin:edge
npm run build
```

The database suite uses isolated PGlite PostgreSQL with a synthetic schema and both actual portal migrations. It also verifies actor-scoped audit records, append-only history, Auth deletion compatibility, maintenance planning, outage enforcement, transaction de-duplication, full exports, date boundaries, the 5,000-row export cap, and denial of forged management fields on customer submissions. It covers authorization, restrictive legacy-policy scope, browser privilege denial, owner bootstrap, atomic multi-location assignments, retained queues and pagination, maintenance conflict/reopen/history, configuration validation, and QR-token preservation. The Edge suite tests token-derived identity and dispatch boundaries. Existing component/repository tests remain part of the full web suite.

## Recovery after rollout

If invitation delivery fails, stop issuing invitations and repair the existing
Auth delivery path; do not invent an unused environment flag. Keep invitation and
audit records. Prefer a scoped forward fix. An old web bundle does not restore
intentionally revoked database writes; never broaden permissions to make it work.

## Local visual review

Historical evidence below comes from the prior local admin-portal implementation report; its run date/artifact revision was not recorded here. It was not rerun for the 2026-09-29 documentation gate. Use [current QA baseline and exclusions](../CleanStreamLaundryApp/docs/operations.md#qa-baseline-2026-09-29) for fresh evidence.

The synthetic workspace was inspected in Chrome at 390×844, 768×1024, and 1440×1000. Review covered the persistent navigation and phone drawer, overview, machine inventory, maintenance/credit queues, Team, and the invitation, membership removal, machine, pricing, location, payment, maintenance, and credit dialogs. Sample workflows included a maintenance note/status update, a credit decision, staff invitation, and adding a machine with missing payment configuration. Sign-in, recovery, expired-link, queue failure, and empty-state screens were also inspected. No production emails or payments were sent.

This is a local visual and functional review, not a complete WCAG certification or a production acceptance test. Confirm keyboard/screen-reader behavior and actual long production content during staged acceptance; real session restoration, email delivery, payment configuration, and database policies still require the production/staging checks above.

## Operational additions

- **Transactions:** `/home/transactions` includes pending, successful, failed, refunded, and reversed Cortina attempts plus historical ledger entries. Linked ledger rows are not duplicated. Unattributed legacy records are Owner-only; the list does not infer a location from a description. A PaymentIntent ID alone is not treated as proof of payment. Failed/ambiguous records say Unconfirmed and expose references for investigation. No new charge, refund, or wallet mutation action is added to this screen.
- **Audit Log:** `/home/audit` is Owner-only and retains actor, timestamp, entity, operation, and whitelisted before/after fields. It covers machines, locations, washer pricing, payment setup, memberships, invitations, account roles, maintenance planning/status, and loyalty-credit resolution. Internal maintenance notes remain in report history. Access tokens, QR tokens, raw provider payloads, and balances are excluded. Audit recording starts when the migration is applied; it cannot reconstruct earlier changes. Writes outside portal RPCs are labeled System / trusted operator unless the existing credit resolver supplies its verified actor. Database superusers can still administer database objects; this is application-level append-only history, not an external tamper-proof archive.
- **Maintenance:** priority, assignee, and due date are additive. Assignees must currently have access to the report’s location; unresolved legacy location mappings never widen staff access. The queue supports assigned-to-me, unassigned, priority, overdue, and explicit date/location filters. Dates use America/Indiana/Indianapolis. Version checks reject concurrent edits; scheduling changes and notes are saved atomically in history. Customer mobile submissions retain their shape and always start Open, Normal, and unassigned.
- **Availability:** Owner-only outage/restore changes require a version match; taking a machine out of service requires a reason. This block is independent of the existing device status and Cortina payment configuration. Restoring service never changes payment configuration. Existing cycles and already-dispatched starts cannot be stopped by this control. An earlier open checkout can still settle; before dispatch, the updated payment functions attempt the existing idempotent card refund or wallet reversal. A failed compensation remains Support required for investigation. Do not enable this UI until both payment entrypoints use the updated shared module.
- **CSV exports:** transactions, maintenance, loyalty credits, team, machine inventory, and audit. The server rechecks role and location scope, applies the same filters across all pages, and rejects more than 5,000 matching rows rather than silently truncating. Exports use fixed columns, ISO timestamps, quoted UTF-8 CSV, and spreadsheet-formula neutralization. Machine exports distinguish payment configuration from out-of-service status. Exported customer/team data should stay within authorized operational use.

Historical validation reported for these additions (prior local implementation, run date/revision not recorded): 473 web tests, 27 portal PostgreSQL tests, 7 dispatcher tests, 39 Cortina/Stripe tests, and 14 transaction-history/credit tests passed; Admin/Edge TypeScript and a production Vite build passed. These totals were not rerun in the current documentation gate. Payment tests used synthetic stubs and database tests isolated fixtures; they do not establish production access, policy configuration, delivery, or device behavior. See the [current QA baseline](../CleanStreamLaundryApp/docs/operations.md#qa-baseline-2026-09-29) for fresh results and exclusions.

The extension was also reviewed at phone (390×844), tablet (768×1024), and desktop widths. The review exercised transaction details, a filtered CSV download, maintenance planning/history, outage/restoration dialogs, and audit entries, plus loading/error/empty states. Wide tables stay inside their panels. Keyboard changes to the due-date field were verified to persist in history; date-only controls use native browser behavior.
