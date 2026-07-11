# tengaPOS Role Specification

This is the authoritative definition of every user role in tengaPOS: what it is for,
what it can do, what it must never do, and **where each rule is enforced**. Enforcement
always lives in at least two layers: the UI (routes/navigation) and the database
(row-level security / SECURITY DEFINER functions). The database layer is the source of
truth — the UI only reflects it.

There are two completely separate account universes:

| Universe | Table | Portal | Who they are |
|---|---|---|---|
| **Platform staff** | `app_users` | `/admin/super` or `/admin` | People who run tengaPOS itself |
| **Tenant users** | `users` (scoped by `tenant_id`) | `/app` | People who work at a client business |

A platform staff account never belongs to a tenant, and a tenant user can never reach
the admin portals (`AdminRoute`/`SuperAdminRoute` guards + RLS).

---

## Platform staff roles (`app_users.role`)

### 1. `super_admin` — Platform Owner
**Who:** The co-founder/developer. The top of the hierarchy: unlimited and total access.
**Portal:** `/admin/super` (login routes here automatically).

Can do everything, including exclusively:
- Approve, suspend, reinstate, and **delete** tenants (`super_admin_delete_tenants` RLS policy).
- Assign/override plans, module features, white-label branding, backup schedules, and
  dedicated technicians — on any plan tier (TenantModal, unrestricted).
- **Create platform staff accounts** (Admin / Tech Support) with a password, directly —
  there is no invitation system (`create-staff` edge function rejects any non-super_admin caller).
- **Delete client (vendor) accounts** (`manage-user` edge function, `delete` action is
  super_admin-only).
- Billing & revenue, subscriptions, pricing tiers, audit logs, ZIMRA compliance,
  backups overview, system health, system settings.
- Everything an Admin can do.

Cannot: nothing is restricted. This role must belong only to founders.

### 2. `admin` — Operations Staff
**Who:** Employed staff running day-to-day operations. **Explicitly restricted** — an
Admin is not a junior Super Admin.
**Portal:** `/admin`.

Can:
- Work support tickets (create, progress, resolve).
- Manage client users: create tenant users, edit name/role, suspend/reinstate,
  reset passwords (`manage-user` `create`/`reset_password`; `users` RLS UPDATE policy).
- Send announcements to tenant dashboards.
- View operational reports (read-only).
- Read notifications; manage own profile/password.

Cannot (enforced by `SuperAdminRoute` redirect + RLS/function checks):
- Approve/suspend/delete tenants or change plans and pricing.
- Create or manage platform staff.
- Delete client accounts.
- See billing/revenue, audit logs, backups, or system settings.

### 3. `tech_support` — Field/Remote Technician
**Who:** Technicians installing hardware and resolving device issues.
**Portal:** `/admin` (minimal navigation).

Can:
- Work assigned support tickets.
- Be assigned as the dedicated technician for Business/Enterprise tenants.

Cannot: everything else. Read-mostly access.

---

## Tenant (client business) roles (`users.role`)

All tenant data access is isolated per `tenant_id` by RLS — no tenant role can ever see
another business's data. Module availability is additionally limited by the tenant's
plan `features` (set at approval/purchase).

### 4. `vendor` — Business Owner
The account created at signup. Full control of their business:
- Everything: POS, inventory, orders, kitchen, transactions, reports, insights,
  staff, tasks, branches, fiscalisation (ZIMRA), payments, HR & payroll, settings.
- Chooses the plan, starts the 7-day free trial, pays via checkout.
- Invites/manages their own staff (tenant-level, `staff_invites`).
- Manages Paynow credentials and ZIMRA fiscal device for their business.

### 5. `shop_manager` — General Manager
Runs the business day-to-day for the owner. Same modules as vendor
**except** billing/plan decisions and white-label branding remain the vendor's.

### 6. `supervisor` — Shift Supervisor
Floor-level authority: POS, orders, transactions, inventory view, shift reports,
tasks. Can apply discounts and void items. No staff management, no settings,
no fiscal configuration.

### 7. `cashier` — Till Operator
POS, orders, and tasks only. Sells, takes payment, sends orders to the kitchen.
Cannot see reports, inventory management, or settings.

### 8. `shop_assistant` — Floor Assistant
POS and tasks only — the narrowest role.

Navigation enforcement for roles 4–8: `NAV_PERMISSIONS` in `src/stores/authStore.js`;
data enforcement: per-table tenant RLS policies.

---

## Lifecycle rules (who lets a client in)

1. **Signup** creates: auth user + tenant (`pending`) + vendor user + main branch
   (`handle_new_user` trigger).
2. The new vendor lands on **/checkout**: start the one-time 7-day free trial
   (`start_free_trial()` — validates server-side) **or** pay for a plan (Stripe/Paynow
   hosted checkout → webhook activates the plan).
3. Trial expiry is enforced **in the database**: the `expire-trials` pg_cron job
   suspends lapsed unpaid trials hourly; the app then routes them to checkout.
4. The Super Admin can always approve/activate/suspend any tenant manually, which
   overrides the above.

## Invariants (never violate)

- Super Admin ≠ Admin. Any feature that controls the platform (tenants, money, staff,
  system) is Super Admin-only.
- No invitation links for platform staff — the Super Admin creates accounts directly.
- Secrets (Stripe, Paynow platform keys, ZIMRA base URL) live only in Supabase edge
  function secrets; payment details never touch the app.
- Every privileged mutation writes an `audit_logs` row.
- Demo mode does not exist. Prospects use the 7-day free trial.
