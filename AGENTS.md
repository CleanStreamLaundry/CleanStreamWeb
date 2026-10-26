# Website Agent Guide

Be warm, direct, repo-aware and verification-minded. This guide does not authorize deployments or queued features.

## Smallest Safe Change

- Read routing/implementation/tests; reuse components/helpers/styles/contracts. Least necessary code; preserve behavior. No speculative abstractions, duplicates, framework migrations or dependencies without demonstrated complexity reduction.
- Refactor only for task/verified simplification without regressions; separate optional cleanup. Clear names/responsibilities/errors; preserve readability/security. Remove verified obsolete code; no unrelated formatting/renaming/generated/lock churn. Report reuse/removal/additions, simpler alternatives/compatibility; composer reviews expansion.

## Coordination

- Stages: implementation/setup, known fixes, testing/verification; announce completion before advancing. No early QA/analysis/builds/browser/device checks/audits; source reading is implementation. Operations holds the current stage, evidence, gates and assignments. Assign missing approvals/access/devices and dependencies to user; park unsafe activation, preserve safeguards.
- Runtime requires recorded documentation-gate evidence. Production labels are not launch status. After approved development activation, no testing-only disablement; retain authorization/missing-input/destructive guards and disable reasons. Update public status, never finalize unapproved policy drafts.
- `git status --short` before/after; preserve dirty/untracked work. Composer verifies assigned absolute isolated root/owned files: one writer, reviewed baseline, read-only inputs untouched. Composer owns `App.tsx`, manifests/locks/Vite/integration; backend contracts precede UI.
- Complete deliverable/acceptance before another audit; coherent batches, distinguish local/setup/rollout. Default one critical-path lane plus independent QA. Useful requested parallelism: disjoint files, one composer memory-runtime slot, no parallel browsers/duplicate installs. Authors freeze commands/prerequisites; QA queue writes test outputs only. Named preauthorized transfer follows all process exits/results/release.
- Explicit effort: `medium` routine/docs/styling/tests; `high` Auth/money/DB/concurrency/difficult QA; extra-high needs unresolved problem. Inherit model unless requested. Risk/evidence sets escalation; finish bounded work before replacing unchangeable effort.
- Reuse accepted unchanged evidence; one QA run after source-only author review, no composer duplicate. Rerun changed inputs/failures; broad suites/builds only shared contracts/releases. Preserve security/money/integrity checks. No repeated discovery/fingerprints. Two failures: record blocker/change approach. Concise current status, linked logs.
- Post-Mac-restart: one bounded check, one Vitest worker, no file parallelism/automatic pool/native-build/preview restart. Disable Vite console forwarding; inspect console, stop loops. Reuse caches, no duplicate checkouts; `.campaign-work/` for isolation/handoffs. Verify surviving files/processes, not missing-artifact receipts.

## Project Map

- Active `CleanStreamWeb-CortinaQR`/`CortinaQR`, never substitute `CleanStreamWeb` main. Public/checkout/admin website; Flutter iOS/Android only, browser deferred.
- React/TS/Vite: `src/main.tsx` -> `src/App.tsx`; `PublicLayout`, separate `/pay`, lazy `/admin/*` -> `src/admin/AdminApp.tsx`; actual wiring, not legacy filenames.
- `src/admin/`: `AdminProvider.tsx`/`context.ts` admission; `StaffMfa.tsx`/`mfa.ts` TOTP; `api.ts` endpoints `admin-portal`/`voluntary-topup-refund`; `ui.tsx`, `query.ts`, `format.ts`, `admin.css` shared helpers/styles.
- Portal roles are Owner, Manager, Maintenance; raw Auth profile roles remain
  Owner/Admin. See [permissions](../CleanStreamLaundryApp/docs/admin-permissions.md).
  Money is Owner-only. Gate routes before fetching, omit non-Owner financial
  fields server-side (including exports), and scope caches by effective role.
  Hiding navigation alone is never authorization.
- Reuse `src/styles/PublicSite.css`, `CortinaPay.css`, `.public-*`, `--pay-*`, `.ap-*`; no global normalization/new design system. Browser client: `src/supabase/client.ts`; backend owns functions/migrations/shared contracts in app repository.

Read matching references; **Auth/admission, async/account, DB/payment, dependency/native/tool and fixture work requires matching [Engineering Lessons](../CleanStreamLaundryApp/docs/engineering-lessons.md) sections.** No approval granted.

| Work | App reference |
| --- | --- |
| Backend/Auth/RLS/keys/lifecycle | [Supabase](../CleanStreamLaundryApp/docs/supabase.md) |
| Themes/components/refresh | [Theming](../CleanStreamLaundryApp/docs/theming.md) |
| Money/Cortina/refunds | [Payments](../CleanStreamLaundryApp/docs/payments.md) |
| Consent/email | [Email](../CleanStreamLaundryApp/docs/email.md) |
| Firebase/releases | [Firebase](../CleanStreamLaundryApp/docs/firebase.md) |
| Toolchains/upgrades | [Dependencies](../CleanStreamLaundryApp/docs/dependencies.md) |
| Assignments/gates/commands | [Operations](../CleanStreamLaundryApp/docs/operations.md) |

Links assume siblings; resolve reviewed app checkout/revision in isolated handoffs, never duplicate references. [APP_FIX_PRIORITIES](../CleanStreamLaundryApp/APP_FIX_PRIORITIES.md) is user's return-to list, not instructions/automatic work. Verify [admin](ADMIN_PORTAL_SETUP.md)/[domain](CORTINA_DOMAIN_SETUP.md) runbooks against source/approvals.

On resume, read only operations' Current Checkpoint and Remaining Work first. Consult a named historical receipt for the assigned boundary, not the entire Evidence History or its superseded pending items.

## Safety and Auth

- Verify Clean Stream project/environment before remote inspection; never substitute Gundex/replace unrelated projects/connectors. Use explicitly authorized correct browser account. No paid service, production deployment, destructive migration or key retirement without explicit approval.
- Public `VITE_*`: no privileged secrets/tokens in bundles/URLs/logs. Privileged helpers outside client source; synthetic fixtures. Real Auth/recovery can mutate services; `/admin/preview` alone is development-only synthetic state.
- No new Supabase Realtime; event refresh/bounded pending-payment polling. Server-authoritative money/machine outcomes. Bind mutations before dispatch, guard late account/route effects; cleanup cannot undo SDK/server effects. Persist unresolved caller-bound privileged request IDs before dispatch for status-only recovery, never credentials/notes; disclose tab limits.
- Start Auth with real pinned SDK/fake-HTTP happy path; verify adoption/actual router/DI/admission, not only mocks. Replacement/sign-out wins; refresh never replaces admission. Verify deployed session/AAL2/factor guards separately; roles/local MFA are not live proof.
- **Retain Auth 2.103.3 plus reviewed `scripts/auth-refresh/` patch AND new storage domain.** `npm ci` applies; build verifies exact installed bytes. Never bypass checks/import old tokens/upgrade pin without replacing and verifying patch. Run `npm run test:auth-sdk` separately.
- `npm run admin:owner -- --email ...` prints guarded SQL only, no network/credentials; rejects retired `--apply`. Execution requires explicitly approved existing account/trusted DB operator. Additional Owners use audited MFA portal. Never blanket-push migrations/publish unrelated dirty work.

## Verification and Handoff

- Authorized checks: `npm test -- <test-file>`, integration, strict whole-site `npm run typecheck`; scoped `typecheck:admin`/`typecheck:admin:edge`. Separate lint/build; bundling is not types. Actual configs/pins, separate baseline diagnostics; reduced harnesses are not integration.
- `test:browser`: serial desktop/mobile, separate Vite port, synthetic config/external HTTP/WebSocket blocked. Discovery is not acceptance/hosted-provider proof. Resolve sibling DB/Edge checks. Vitest excludes scripts/CSS: verify harnesses/router/DI/visuals separately.
- Read completed output/exact counts/exit; zero cases/interrupted/running checks never pass. Correct receipts; disclose unrun/blocked/mocked limits. Docs-only: source/link/consistency, no installs/deployment.
- Handoff before next batch: frozen paths, behavior/reuse/removal, commands/counts/exit/cleanup, risks/docs. Replace stale status; inspect active paths after READY. Keep disjoint work moving; stop at gates/waves/significant failures. Durable lessons here, evidence in operations.
