# Application security and reliability review — 24 October 2026

## Scope and limits

Repository-wide static review of frontend routes/stores/data access, Supabase Edge Functions, SQL migrations and policies, the Vercel API/configuration, dependency lockfile, Windows print agent and Android print bridge. Build/lint/test tooling also traversed the application modules. This is a source review with targeted local reproductions, not an exhaustive penetration test or a certification that every screen is correct.

No production database, deployed function configuration, real credentials, payment gateway, fiscal device, Windows printer or Android device was available. No live attack requests, production writes, dependency upgrades or unrelated remediation were performed. Effective database grants, deployed migration order and Edge Function JWT gateway settings must be verified in the real project. Default gateway JWT verification does not replace tenant/role authorization; legacy public anon JWTs can also pass a signature-only gateway.

The new Siyaya receipt feature is documented separately in `siyaya-receipt-customer-details.md`. It does not remediate the existing findings below. Its dedicated RPC additionally rejects inactive/locked users.

## Highest-priority findings

### 1. High — payment and fiscal policies grant unrestricted client access

**Evidence:** `supabase/migrations/paynow_integration.sql:44` and `:48` create INSERT/UPDATE policies with unconditional checks and no `TO service_role`. Policy names beginning with `service_` have no security effect. A service-role request already bypasses RLS.

**Impact:** Where normal Supabase API table grants exist, tenant users can insert a session marked `paid` or change their own session's amount/status without Paynow confirmation. This falsifies the payment status displayed by the return page. Additional cross-tenant or anonymous write exposure depends on actual grants and applicable SELECT policies; it was not asserted or tested against production. This finding alone does not prove subscription activation can be forged.

**Reproduction:** Executed the supplied migration in PostgreSQL WASM with ordinary authenticated API table grants. An authenticated user inserted a `paid` session and changed its amount from 100 to 1 under the supplied policies.

**Also affected:** `supabase/migrations/zimra_fiscal_config.sql:65` and `:69` create unconditional public SELECT/UPDATE policies named `service_read_fiscal` and `service_update_fiscal`. With ordinary API grants, they expose every tenant's fiscal device configuration (including activation keys) and permit cross-tenant changes. No later checked-in migration removes these policies. A separate PostgreSQL policy reproduction confirmed cross-tenant reads and updates under ordinary authenticated grants.

**Fix:** Remove these public fiscal read/update policies and payment write policies and revoke client INSERT/UPDATE privileges. Keep tenant-scoped SELECT. Require verified gateway callbacks/server reconciliation for writes; add negative authorization tests.

### 2. High — fiscal functions trust caller-supplied tenant IDs while using service-role access

**Evidence:** `supabase/functions/zimra-register-device/index.ts:24`, `zimra-open-day/index.ts:17`, `zimra-submit-receipt/index.ts:50`, `zimra-close-day/index.ts:43` and `zimra-ping/index.ts:12`. These functions read fiscal configuration through service-role clients without resolving the caller or checking tenant membership/permission before acting.

**Impact:** A caller permitted to reach the function can target another tenant's fiscal device, open/close fiscal days or submit fiscal receipts. Gateway JWT validation, if enabled, only limits who can reach the endpoint; it does not enforce tenant ownership. Live exposure and device responses remain unverified.

**Fix:** Authenticate every request, resolve an active/unlocked user's tenant and permitted role server-side, and reject mismatched tenant/device IDs before loading configuration or contacting FDMS. Give scheduled/internal calls a separately verified service identity.

### 3. High — WhatsApp receipt signing does not authorize the object path

**Evidence:** `supabase/functions/send-whatsapp-receipt/index.ts:54` checks the caller against `tenant_id`, but `:75` signs arbitrary `storage_path` with a service-role client. The storage policies in `supabase/migrations/1786060000_whatsapp_receipts_addon.sql:117` scope objects by the first folder (tenant ID); service-role signing bypasses these policies.

**Impact:** A user in a tenant with the WhatsApp add-on can supply a known receipt path from another tenant and cause its signed download URL to be sent to a chosen WhatsApp number. Knowing/obtaining the foreign object path is a prerequisite; cross-tenant object enumeration was not demonstrated.

**Fix:** Require an exact normalized tenant folder prefix and verify the stored receipt/order belongs to the caller's tenant before signing. Prefer resolving the storage path from a server-owned receipt record. Test foreign paths, traversal-like strings, inactive users and revoked add-ons.

### 4. High — normal checkout bypasses account lock/deactivation enforcement

**Evidence:** `supabase/migrations/1786310000_discount_review.sql:98` reads tenant and role directly from `users` and checks neither `is_locked` nor `is_active`. The SECURITY DEFINER checkout bypasses ordinary RLS. `enforce_lock_at_rls_layer.sql` updates `get_user_tenant_id()`, which this checkout does not use. The discount review function in the same migration has a similar direct identity lookup at `:58`.

**Reproduction:** Executed the actual current checkout function in PostgreSQL WASM with a minimal schema. A caller whose user row had `is_locked=true` and `is_active=false` successfully created an order and transaction. This confirms the function-body defect; live schema triggers could impose additional restrictions not present in this repository.

**Fix:** Centralize active/unlocked user and active-tenant checks in every SECURITY DEFINER entry point, not only RLS helpers. Test stale but valid JWTs after lock/deactivation.

### 5. High — checkout still trusts financial and actor metadata from the client

**Evidence:** `supabase/migrations/1786310000_discount_review.sql:161` accepts arbitrary ad-hoc lines with no catalog product ID for all tenant roles. `:203` persists client subtotal, tax, discount and user ID while validating only the gross-versus-total discount relationship. Branch ownership, claimed serving user and allowable checkout role are not checked by this function.

**Reproduction:** The actual checkout function accepted a locked cashier's ad-hoc item with total 1, stored tax 999 and recorded a different supplied `served_by` UUID in a minimal PostgreSQL schema. Foreign keys/constraints in a live schema may reject some nonexistent IDs; they do not establish caller ownership of valid IDs.

**Impact:** Audit attribution and tax/reporting totals can be falsified. Sending a catalog item as a custom line avoids that product's pricing/stock logic. Legitimate workshop labour is a valid custom-line use case, but it needs server authorization and provenance.

**Fix:** Derive actor ID from `auth.uid()`, check branch ownership/role, calculate monetary fields server-side, reject negative/invalid totals and item discounts, and restrict custom lines to an authorized workflow. Preserve existing discount and idempotency behavior with integration tests.

### 6. High — email/WhatsApp administrative endpoints fail open when no caller resolves

**Evidence:** `supabase/functions/send-tenant-email/index.ts:134` runs daily digest sends before authentication. The normal path at `:169` only rejects unauthorized callers inside `if (caller)`, so a failed/absent user lookup falls through as if it were the cron service identity. `send-whatsapp-notification/index.ts:57` repeats this pattern and accepts a supplied destination number.

**Impact:** Reachable requests without a resolved user can trigger platform-funded messages; daily digest mode can be triggered by any gateway-admitted caller. A legacy public anon JWT may pass the gateway yet resolve no user. Actual deployment admission settings remain unverified. Missing WhatsApp/SMTP configuration may currently prevent delivery but does not repair authorization.

**Fix:** Fail closed for all user authentication errors. Explicitly verify the service/cron credential on internal paths, and authorize active platform staff before processing any mode. Add rate limits and per-tenant quotas.

### 7. High — Paynow initiation has no tenant authorization or trusted price calculation

**Evidence:** `supabase/functions/paynow-initiate/index.ts:37` accepts `tenant_id`, `amount`, `items` and `return_url`, loads the selected tenant's integration credentials with a service-role client, and initiates the gateway request without authenticating/authorizing a caller or repricing a catalog-backed order.

**Impact:** An admitted caller can initiate payment sessions for a different tenant and arbitrary amount/cart content. This does not prove card theft or funds diversion: credentials and destination merchant remain server-side. It does enable unauthorized gateway activity and unreliable payment-to-order reconciliation.

**Fix:** Authenticate and derive tenant ownership, validate return URL against allowed application origins, build a server-priced pending order, then initiate payment using that order's immutable total/reference.

### 8. High — profile responses expose Paynow integration keys to every tenant user

**Evidence:** `supabase/migrations/get_my_profile_rpc.sql:25` serializes the entire tenant row with `to_jsonb(t.*)` for any matching user, regardless of role. `paynow_integration.sql:7` adds `paynow_integration_key` to that row. `src/stores/authStore.js:464` persists the returned tenant object in browser local storage. The payment Edge Function's comment that the client never sees the integration key is therefore not upheld by the profile API.

**Impact:** Ordinary tenant staff, not only the account owner, receive and locally retain their merchant's Paynow integration secret. In conjunction with public payment-session writes, a leaked key increases the risk of forged signed payment callbacks. This is established by source data flow; no real credential was retrieved or printed.

**Fix:** Store gateway credentials in a separate server-only table or vault. Return an explicit allowlist of public tenant fields from profile APIs, expose only configuration-presence metadata to staff and use a vendor-authorized secret write endpoint. Clear previously cached keys and rotate affected merchant credentials through a coordinated process after fixing the exposure.

## Other material findings

### 9. High advisory / exposure-dependent — vulnerable locked dependencies

`npm audit` reported **15 affected dependency entries: 1 critical, 8 high, 5 moderate, 1 low**. These are advisory classifications, not 15 confirmed exploitable application paths.

| Dependency | Audit severity | Relevant context |
| --- | --- | --- |
| `dompurify` (transitive) | Critical | Multiple XSS advisories. Current receipt PDF generation uses jsPDF text APIs; exploit reachability through affected DOMPurify modes was not established. |
| `xlsx` (direct) | High | Prototype pollution and ReDoS advisories; `src/utils/exportUtils.js:120` parses imported data. npm reports no available fix in the current registry package line. |
| `vite` (direct dev) | High | Editor invocation/file-serving advisories; development server exposure matters. |
| `sharp` (direct dev) | High | Native image library advisories; runtime deployment exposure not established. |
| `brace-expansion`, `fast-uri`, `nanoid`, `source-map-js`, `zod` | High | Transitive dependencies; evaluate the specific consumers before claiming production reachability. |
| `vitest`, `@vitest/mocker`, `postcss-nested`, `postcss-selector-parser`, `tailwindcss` | Moderate | Mostly development/build tooling. |
| `serialize-javascript` | Low | Serialization advisory; assess build/runtime consumer context. |

Prioritize imported-file parsing and exposed development tools. Upgrade safely with frozen, reviewed lockfile changes and rerun compatibility tests. Do not run `npm audit fix --force`: the suggested Tailwind v4 upgrade conflicts with this app's deliberate Tailwind v3 support for older Android devices. Replace or update SheetJS through a supported trusted distribution after checking its current guidance.

Audit details include [SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), and [DOMPurify advisory](https://github.com/advisories/GHSA-55q2-fjhq-7xh7). Re-run audit when remediating because advisory data changes.

### 10. High functional impact — successful Paynow payments do not finalize POS orders

**Evidence:** `src/pages/POS.jsx:659` initiates a payment and clears the cart before redirect. `supabase/functions/paynow-initiate/index.ts` stores only simplified item names, quantities and prices in `payment_sessions.order_data`. `paynow-callback/index.ts:66` and `paynow-poll-status/index.ts` update session status only. `src/pages/PaymentReturn.jsx` displays that status; none of these paths invoke the atomic POS checkout or decrement stock.

**Impact:** A paid gateway session can exist without a corresponding POS order, stock movement or printable/reprintable POS receipt. The new customer details feature therefore cannot use this existing path; it directs captured-detail sales to cash/card rather than discarding entered information. No real gateway charge was performed during this review.

**Related path:** `src/lib/db.js:404` provides manual approval, but it only changes the session and inserts an unlinked transaction; it also has no atomic once-only guard. Repeating approval can insert duplicate sale transactions. `fetchPaymentSessions()` requests `users(name)`, and approval writes `manually_confirmed`, `confirmed_by` and `admin_note`, while the only checked-in payment-session migration defines neither that user relationship nor those columns. An existing production schema may contain manual additions, but a fresh schema from this migration cannot reproduce these screens.

**Fix:** Persist a complete immutable pending order first; finalize once on verified payment in a transaction keyed by the payment reference. Test duplicate/out-of-order callbacks, amount/currency mismatches, cancellation and reconciliation. Preserve pending carts until recovery is possible.

### 11. Medium — private API data is cached broadly and survives logout

**Evidence:** `vite.config.js:80` caches GET responses for all Supabase endpoints in the shared `supabase-api` cache for up to an hour. `src/stores/authStore.js:358` clears authentication state but does not purge Cache Storage, React Query or the Dexie database (`src/db/index.js`, single database name `tengaPOS`).

**Impact:** Sensitive purchase/customer data remains on shared tills after sign-out. Workbox cache isolation by authentication identity is not configured; exact cross-session response reuse also depends on response `Vary` headers and request URLs and was not demonstrated against the real backend. Intentional offline queues must not be deleted blindly as a remediation.

**Fix:** Exclude auth/private endpoints from generic runtime caching; partition permitted offline data by account/tenant, clear appropriate read caches on sign-out, and retain unsynced sales through an explicitly controlled recovery path. Test account switching while offline.

### 12. Medium — printer bridges rely on CORS headers rather than rejecting unauthorized requests

**Evidence:** `print-agent/TengaPOS-PrintAgent.ps1:164` adds CORS headers but accepts POST `/print` regardless of origin, reads any content type as JSON, and forwards arbitrary decoded bytes. `print-bridge-android/.../PrintBridgeService.kt:192` similarly dispatches print/drawer actions before adding CORS response headers. Both bind loopback, which limits network exposure.

**Impact:** Local applications can invoke hardware without pairing authentication; legacy browsers or contexts where a simple cross-origin/private-network request is admitted can cause print/drawer side effects even when the response is unreadable. Modern browser private-network restrictions may block website exploitation. No physical-device exploitation was attempted.

**Fix:** Reject disallowed origins before side effects, enforce JSON content type and size limits, and require a local pairing token for hardware operations. Treat local native clients explicitly rather than accepting missing origins by default.

### 13. Medium maintainability — lint fails and backend integration coverage is sparse

Baseline `npm run lint`: **158 errors and 19 warnings**. Categories include unused values, state updates in effects, purity checks and missing effect dependencies. The `process` global flagged in `api/paynow-proxy.js:18` is an ESLint environment configuration issue, not proof of a Node runtime exception. Do not treat every warning as a confirmed user-facing defect.

The original suite contained 27 tests in two formatter/import utility files, leaving payment, fiscal, authorization and RLS behavior without demonstrated automated coverage. This change adds 11 tests (38 total). The new test/helper files pass focused ESLint; unrelated existing lint errors remain unchanged.

## Validation and next steps

- Frozen dependency installation completed on Node 24 using a writable npm cache.
- Existing and feature unit suites passed: **38 tests, five files**.
- Production build succeeded with legacy/PWA plugins; a local wrapper disables only the tracked version-counter write. Bundle-size warnings remain.
- Chromium rendered the landing page without uncaught errors. A sample-data POS checkout verified tenant gating and customer receipt display without uncaught errors; PDF contents were tested separately.
- PostgreSQL WASM executed the new migration twice and checked tenant authorization, lock handling, payload validation, preserved snapshots and atomic rollback (existing checkout stubbed for this isolated feature test).
- Separate local reproductions used the actual existing checkout function and actual payment-session policies to verify findings 1, 4 and parts of 5 with minimal schema assumptions.
- High-confidence tracked-file secret-pattern scan found no matching private-key blocks, Stripe live secret tokens, GitHub PATs or AWS access-key IDs. This narrow pattern check does not establish absence of all secrets, including Git history or deployment settings.
- Live authorization, deployed policy state, gateway payment flows and physical printing remain unverified.

Remediate findings 1–8 before relying on tenant isolation and payment records in production. Next, repair Paynow order finalization, update exposed dependencies, isolate offline caches and enforce printer pairing. Re-run integration tests against a staging Supabase project with real migrations and distinct test tenants before deployment.
