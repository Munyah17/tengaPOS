# tengaPOS Desktop — Release & Update Process

Public download page: **https://www.tengapos.co.zw/download**
Download API: `GET {SUPABASE_URL}/functions/v1/desktop-license/v1/download?os=win32-x64&channel=stable` → `302` to a 5-min signed URL. Metadata: same path with `/info` suffix.
Artifact storage: private Supabase bucket **`desktop-releases`** (never public-enumerable). Release rows: `public.desktop_releases` + `public.desktop_release_artifacts`.

The page always serves the **latest published stable release** — a release only appears when a `desktop_releases` row exists with `channel='stable'` and `withdrawn_at IS NULL`. Drafts, test builds, and `beta` channel rows are invisible to the page.

## The desktop source lives elsewhere

The Electron app is a **separate repository** (built with `npm run desktop:dist` → `release/tengaPOS Setup <version>.exe`). This repo holds only the licensing backend + download plumbing. `.github/workflows/desktop-release.yml` is a copyable template for the desktop repo.

## Publishing a stable release

Two paths — either works; both land on `/download` immediately:

**A. Super Admin UI (manual, current path)**
1. In the desktop repo: `npm run desktop:dist`.
2. Web app → Super Admin → Desktop Fleet → **Publish Release** (SuperAdminDesktopReleases): pick the `.exe`, enter version + optional notes URL.
3. Client computes SHA-256, uploads to `desktop-releases`, then `POST /v1/releases` signs the manifest server-side and creates the release + artifact rows.

**B. CI (tag-driven)**
Copy `desktop-release.yml` into the desktop repo, set the three secrets listed at its bottom, push `v<version>` — it builds, validates prod config, checksums, uploads, publishes, and verifies the feed.

## Pre-publish verification checklist (mandatory)

- [ ] Installer built with production API URL `https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/desktop-license`
- [ ] Embedded public key = `/f/sYjfoRuA3sX8upBhhkQii2zB3MMwApftRPHgArZw=` (matches `DESKTOP_LICENSE_PRIVATE_KEY` secret)
- [ ] Clean VM: install → launch → activate a purchased `TGA-…` code → device appears in Super Admin fleet
- [ ] Close + reopen offline → app still fully functional (lease grace)
- [ ] SHA-256 on the download page matches the CI/publish checksum

## In-app update strategy

Already designed into the licensing contract — no electron-updater dependency:

- Device polls `GET /v1/releases/latest` → returns `update_available`, `version`, `rollout_pct`, signed `manifest`, or `up_to_date`.
- If an update is available: download via `/v1/download?os=…`, verify SHA-256 **and** the artifact ed25519 signature, apply on next launch. Local POS data lives outside the app folder — updates preserve it.
- `rollout_pct` enables staged rollout; `min_supported_version` forces upgrades; `withdrawn_at` kills a bad release instantly.
- Fallback: if an update fails, the user returns to `/download` and reinstalls the stable build manually — manual download always stays available.

## Current blockers

- `desktop-license` edge function + `DESKTOP_LICENSE_PRIVATE_KEY` secret are **not yet deployed** (CLI 403 — needs org-owner login or Dashboard deploy). Until then `/download` returns "Installer coming soon" and activation can't succeed.
- `stripe-webhook` redeploy needed for the `desktop_license` settlement branch.
