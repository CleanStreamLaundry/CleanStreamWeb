# Website Agent Guide

Be warm, direct, repo-aware, and verification-minded. Prefer the smallest safe change and least new code; preserve working behavior. This guide does not authorize deployments or queued features.

## Minimal-Change Rules

- Read active route wiring, implementation, and tests before editing. Reuse existing components, API helpers, styles, and backend contracts.
- No speculative abstractions, duplicate services, framework migrations, or new dependencies without a demonstrated reduction in complexity.
- Refactor only to support the task or clearly reduce duplication/dependencies/complexity without regressions. Keep optional cleanup separate.
- Use clear names, focused functions, explicit responsibilities, and consistent error handling. Do not trade readability or security for fewer lines.
- Remove replaced code after verification. Avoid unrelated formatting, renaming, generated files, and lockfile churn.
- Report reuse/removal/additions and why a simpler solution would not suffice. Composer reviews shared-file changes and unnecessary expansion.

## Work Efficiently

- Deliver coherent feature batches; do not repeat proposal/review cycles once scope and contracts are clear.
- Default to one implementation lane plus independent QA. Activate additional agents only for useful, independent critical-path work.
- Set delegated reasoning effort explicitly: `medium` for routine implementation, docs, styling, and straightforward tests; `high` for auth, payments, database changes, concurrency, and difficult QA. Extra-high requires a concrete unresolved problem. Keep the inherited model unless the user requests another.
- Choose effort by task risk, not the composer's setting. Escalate only with evidence; when in-place changes are unavailable, finish the bounded batch and set the next agent appropriately instead of restarting work.
- Run focused checks once during implementation and once independently in QA. Composer reviews evidence instead of routinely duplicating the same run. Rerun only for relevant changes or concrete failures.
- Reserve full suites/builds for shared-contract changes and release gates. Preserve security, financial, and data-integrity checks.
- Reuse accepted evidence with unchanged inputs. Inspect owned files and relevant dependencies rather than repeatedly fingerprinting the whole workspace.
- Read targeted sections and keep handoffs/status concise. After two failed attempts at the same check, record the blocker and change approach instead of repeating it.

## Project and Reference Map

- Active campaign checkout is `CleanStreamWeb-CortinaQR` on `CortinaQR`; `CleanStreamWeb` is a separate main worktree. Never silently substitute it.
- React/TypeScript/Vite: `src/main.tsx` mounts `src/App.tsx`. Public pages use `PublicLayout`; `/pay` is separate; `/admin/*` lazy-loads `src/admin/AdminApp.tsx`. Follow actual routing, not legacy dashboard filenames.
- Admin session/role state: `src/admin/context.tsx`; Edge API: `src/admin/api.ts`; shared UI: `src/admin/ui.tsx`; scoped styling: `src/admin/admin.css`.
- Reuse `src/styles/PublicSite.css`, `CortinaPay.css`, and existing `.public-*`, `--pay-*`, `.ap-*` boundaries. Do not globally normalize functioning surfaces or add another design system.
- Browser Supabase client: `src/supabase/client.ts`. Shared backend functions/migrations live in the companion app repository, not here. Backend agent owns those contracts.

Canonical references live in the app repository. These workspace links assume sibling checkouts; resolve the reviewed app checkout explicitly in isolated worktrees, and record its revision in handoffs. Do not duplicate references to fix a path assumption.

| Work | Shared reference |
| --- | --- |
| Database, auth, RLS, keys, account lifecycle | [Supabase](../CleanStreamLaundryApp/docs/supabase.md) |
| Themes, components, background refresh | [Theming](../CleanStreamLaundryApp/docs/theming.md) |
| Stripe, wallet, Cortina, refunds | [Payments](../CleanStreamLaundryApp/docs/payments.md) |
| Consent and transactional/marketing email | [Email](../CleanStreamLaundryApp/docs/email.md) |
| Firebase environments, notifications, release controls | [Firebase](../CleanStreamLaundryApp/docs/firebase.md) |
| Package security, toolchains, upgrade batches | [Dependencies](../CleanStreamLaundryApp/docs/dependencies.md) |
| Ownership, gates, validation, rollout | [Operations](../CleanStreamLaundryApp/docs/operations.md) |

[APP_FIX_PRIORITIES.md](../CleanStreamLaundryApp/APP_FIX_PRIORITIES.md) is a user return-to list, not instructions or an automatic work queue. Keep specialized [admin](ADMIN_PORTAL_SETUP.md) and [domain](CORTINA_DOMAIN_SETUP.md) runbooks, but verify old claims against current source and approvals.

## Safety and Coordination

- Check `git status --short` before/after edits. Preserve existing dirty/untracked work. Composer verifies the isolated writable root before dispatch; assignments name that absolute root and owned files. Read-only inputs are not edit targets. Use reviewed baselines and one writer per file.
- Runtime work waits for the documentation gate. Composer coordinates `App.tsx`, package/lockfiles, Vite/native integration, and cross-lane changes; backend defines contracts before UI consumes them.
- Client `VITE_*` values are public. Never expose service-role/provider secrets or access tokens in bundles, URLs, or logs. Keep privileged test helpers out of client source and use synthetic fixtures; remote Auth mutations are not harmless tests.
- Verify Clean Stream project/environment before remote inspection. No paid service, production deployment, destructive migration, or key retirement without explicit approval.
- Preserve unrelated cloud projects and connector accounts. Use an explicitly authorized browser session when its account is correct instead of replacing another project's connection.
- No new Supabase Realtime. Refresh cached content on meaningful events; bound polling to pending payments and never infer successful money/machine operations from UI state.
- Nonpersistent Auth clients can still share browser broadcast state. Disabling storage or token refresh does not establish isolation; verify cross-client effects before relying on temporary clients.
- Bind asynchronous mutations to the intended caller/attempt before dispatch; guard late results and URL cleanup against newer account/route state. UI cleanup cannot undo SDK/server side effects already started. Test delayed completion and departure/return, not just immediate results.
- `/admin/preview` is development-only synthetic state. Real auth/recovery forms can contact services; a local preview is not universally side-effect-free.
- `npm run admin:owner` performs privileged remote preflight; `--apply` enables mutations. Neither is permitted during documentation discovery. Never blanket-push migrations or publish unrelated dirty work.
- Required staff MFA and optional customer MFA are planned; existing role checks do not prove AAL2 enforcement. Do not label planned safeguards as live.

## Verification and Learning

- Start with `npm test -- <test-file>`, then relevant integration checks. `npm run typecheck` checks the whole site and its tests with strict settings; preserve those settings instead of suppressing errors. `typecheck:admin` and `typecheck:admin:edge` remain scoped checks.
- `test:admin:db`, `test:admin:edge`, and Edge type checking currently assume a sibling app checkout. Inspect/resolve that dependency before isolated-worktree validation.
- Use `npm run lint` and `npm run build` as separate checks; bundling is not type safety. Vitest excludes scripts and disables CSS, so independently verify backend harnesses, routing/DI, and visual behavior.
- Isolated checks must use the repository's actual lint/type/test configuration and reviewed dependency tree. Compare existing diagnostics separately; a clean reduced harness is not a clean integrated repository.
- Verify completed test-case counts, not only exit status or runner summaries. An interrupted loader or zero-case run is not a passing regression check.
- Docs-only work needs source/link/consistency checks, not deployment or installs. Record unrun/blocked checks honestly; synthetic/mocked tests do not establish production readiness.
- Handoff: paths, changed/preserved behavior, reuse/removal, commands/results, risks, and reference updates. Stop at gates/waves or significant failures; update AGENTS only with durable lessons and operations with changing evidence.
