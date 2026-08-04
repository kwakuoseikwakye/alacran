# Gated template delivery — design spec

> **SUPERSEDED — NEVER SHIPPED.** This document describes a plan to gate the
> starter templates behind a paid license check. On 2026-08-04 Alacrán was
> released as free, MIT-licensed open source instead, and the license gate it
> depended on was deleted entirely. The templates ship in the open, on purpose.
> This file is kept only as a record of a direction that was considered and
> abandoned — nothing here is implemented, and none of it should be built.

## Problem

The packaged macOS `.app` (and Linux `.deb`) ship `templates/company-starter/`
and `templates/packs/*` as plain, uncompiled `.yaml`/`.md` files under
`Contents/Resources/app/templates/` — confirmed directly during a routine
rebuild on 2026-07-31. Anyone with the `.dmg`/`.zip`/`.deb` can extract this
directory via Finder's "Show Package Contents" (or a plain `unzip`/`dpkg -x`)
**without ever running the app or entering a license key.** The extracted
files are pure text and only need the Claude Code CLI to be useful — zero
ongoing dependency on Alacrán.

This defeats the subscription model: a single download (even an abandoned
trial) hands over the entire reusable template IP — including
`templates/company-starter/`'s hooks, rules (`hitl-gate.md`,
`definitions-touch.md`), and `verify.py`, which `CLAUDE.md` itself calls "the
core of the whole `~/AI-Native/` framework" — with no further reason to keep
paying.

**What is explicitly NOT the problem** (confirmed with the user, don't
relitigate): a company a user actually creates through the guided setup
stays fully theirs — local, untouched, no ongoing network dependency to use
it. Only the *reusable template source*, before it's copied into a specific
company, needs gatekeeping.

## Scope decisions (from brainstorming, 2026-07-31)

- **Gate everything**, including the base skeleton (`templates/company-starter/`)
  and all 7 packs — not just the 6 differentiated packs. The base skeleton is
  the more valuable IP per `CLAUDE.md`'s own framing; leaving it bundled
  would protect the least valuable part.
- **Fetch once, cache locally**, gated by the app's *existing* license-status
  check (`lib/license/license-status-impl.ts`'s `REVALIDATE_MS` /
  `OFFLINE_GRACE_MS` cadence) — no new network burden beyond what the app
  already requires just to be usable at all. Accepted trade-off: once cached
  in plaintext, a user who later lets their subscription lapse could still
  extract that local cache — this protects *first-time* extraction (must
  have had a valid license at least once), not months-later extraction after
  cancelling. The stricter "never persist in the clear" alternative was
  explicitly discussed and declined as more engineering than this warrants
  for v1.
- **New private repo + Vercel function**, not Cloudflare — reuses
  infra/account this project already uses for the landing site
  (`landing/vercel.json`).
- **Already-public `alacran-releases` downloads (as recent as 2026-07-30)
  already leaked the current templates** — accepted as sunk cost. This
  design only affects builds going forward; no retroactive mitigation is in
  scope.

## This supersedes a locked LAUNCH.md decision

`LAUNCH.md`'s 2026-07-28 entry locked: *"bundle the cleaned generic template
inside the app (ships in the installer; works offline; no dependency on a
public repo)."* This design **explicitly supersedes that decision**: company
creation now requires having validated a license at least once (within the
existing 7-day offline grace window) — before, it required nothing but the
local bundle. `LAUNCH.md` should be updated to record this supersession with
today's date when this ships, not left silently contradicting the new
behavior.

**Explicitly unchanged:** the license gate itself (`app/layout.tsx`,
`LICENSE_BYPASS=1` for dev) — this design adds a second, independent
license check inside the template-fetch path, not a replacement for the
existing app-wide gate.

## Architecture

Two repos, two roles:

- **`control-panel`** (this repo, ships to every user): loses
  `templates/company-starter/` and `templates/packs/*` entirely from both
  packaged builds (`scripts/package-macos.sh`, `scripts/package-linux.sh`).
  Keeps `lib/company-starter-packs.ts` (labels/descriptions/categories —
  UI copy, not file content) and `lib/company-template-manifest.ts` (the
  list of relative paths — structure, not content). Gains a small
  fetch-and-cache module (`lib/template-fetch/`).
- **`alacran-template-server`** (new, private, never shipped to anyone):
  holds the actual template file contents (moved verbatim from this repo)
  plus one API route. Deployed to Vercel as a private project.

**Flow:** on "Create company," the app checks a local cache under
`dataPath("template-cache/<target>/")`. If the cache is missing or stale —
staleness determined by the same `REVALIDATE_MS` (1 day) / `OFFLINE_GRACE_MS`
(7 days) cadence the app's own license check already uses — it calls
`alacran-template-server`'s API with the stored license key. The server
re-validates that key against Lemon Squeezy itself (the actual security
boundary; the client never self-certifies), and only then returns the
requested files. The app writes them to its cache, then proceeds exactly as
today: copy from cache into the new company's directory.

## API contract

One route on the new server: `POST /api/get-template`

**Request:** `{ "license_key": string, "target": string }` where `target` is
either `"company-starter"` or `"packs/<packId>"` (e.g. `"packs/sales"`).

**Server logic:**
1. Call Lemon Squeezy's license-validate endpoint with `license_key` (the
   same call shape `validateLicenseImpl` already makes from `control-panel`
   — this logic is duplicated into the server repo, since it is now the
   actual security boundary, not just a UX check).
2. If invalid → `403` with a short JSON error message.
3. If valid → read the requested target's files from the server's own
   filesystem (the same manifest-driven approach `copyManifestEntry`/
   `TEMPLATE_MANIFEST` already implements client-side, moved server-side)
   and return `{ "files": { "relative/path.yaml": "<file contents>", ... } }`.
   All template content is small text (yaml/md), so plain JSON avoids
   needing zip/tar handling.

**Client side (new `lib/template-fetch/fetch-template.ts`):** same
injectable-fetch DI pattern already used by `validate-license-impl.ts`:

```ts
export type FetchLike = (url: string, init: RequestInit) => Promise<{ json: () => Promise<unknown>; ok: boolean }>

export type TemplateFetchResult =
  | { ok: true; files: Record<string, string> }
  | { ok: false; message: string }

export async function fetchTemplateFiles(
  target: string,
  licenseKey: string,
  fetchFn: FetchLike = defaultFetch
): Promise<TemplateFetchResult>
```

## Changes inside `control-panel`

1. **`lib/template-fetch/fetch-template.ts`** (new) — the injectable fetch
   call above, posting to `process.env.TEMPLATE_SERVER_URL + "/api/get-template"`.
2. **`lib/template-fetch/template-cache.ts`** (new) — reads/writes the local
   JSON cache under `dataPath("template-cache/<target>.json")` (shape:
   `{ files: Record<string,string>, cachedAt: number }`), and a
   `isCacheFresh(cachedAt, now)` helper reusing the same
   `REVALIDATE_MS`/`OFFLINE_GRACE_MS` constants imported from
   `lib/license/license-status-impl.ts` (not redefined — single source of
   truth for the timing policy).
3. **`lib/template-fetch/get-template-files.ts`** (new) — the orchestrator:
   check cache freshness → return cached `files` if fresh → else call
   `fetchTemplateFiles`, write the result to cache, return it → on fetch
   failure with no usable cache, return `{ ok: false, message }`.
4. **`lib/create-company-from-template-impl.ts`** (modified) — replace the
   two local `copyManifestEntry(...)` loops (base skeleton + pack overlay)
   with two calls to `getTemplateFiles(target, licenseKey)`, writing the
   returned `files` map into `rootPath` (same relative-path writing, same
   `.DS_Store`-equivalent filtering — there's no `.DS_Store` in a JSON map,
   so that filter simply becomes unnecessary for this path). Function keeps
   its existing `{ ok: true; company } | { ok: false; message }` return
   shape; the new failure mode ("couldn't reach the template server; check
   your connection and license") flows through the same channel. Its
   signature drops `templateSourcePath`/`packSourcePath` (no more local
   paths to resolve) and gains `licenseKey: string`.
5. **`lib/create-company-from-template.ts`** (the public `"use server"`
   wrapper, modified) — currently resolves `BUNDLED_TEMPLATE_PATH`/
   `PACKS_ROOT` as local constants and passes them to the impl; both
   constants are deleted. Instead it reads the stored license key via
   `lib/license/license-store.ts`'s existing `read()` (the same store
   `licenseStatusImpl` already reads) and passes `stored?.key` through to
   the impl as `licenseKey`. If no license is stored at all (shouldn't
   normally happen, since the app-wide gate already requires one), the impl
   surfaces this as the same "couldn't validate your license" failure
   `getTemplateFiles` would produce for an invalid key — no separate
   branch needed.
6. **`scripts/package-macos.sh` / `scripts/package-linux.sh`** (modified) —
   remove the step(s) that copy `templates/` into the payload. Both scripts
   already assemble the payload from an explicit file list; deleting
   `templates/` from that list is the fix, not a rewrite.
7. **`components/add-company-form.tsx`** — no new UI; the existing
   `message` state already surfaces `result.message` on failure, which now
   includes the new network/license failure text.
8. **`lib/company-template-manifest.ts`** — unchanged in shape (still the
   list of relative paths both repos agree on), but no longer the thing that
   makes files exist locally — it's now also referenced by the new server
   repo to know what to read from its own filesystem.

## The new `alacran-template-server` repo

Minimal shape:
- `templates/company-starter/` + `templates/packs/*` — moved verbatim from
  `control-panel` (a fresh initial commit is fine; git history doesn't need
  to carry over).
- `api/get-template.ts` — the route above, importing a duplicated copy of
  `TEMPLATE_MANIFEST` (two repos, one small array — not worth a shared
  package for this).
- No UI, no database — Lemon Squeezy remains the sole license source of
  truth, exactly as today.
- Deployed to Vercel as a **private** project. The deploy URL becomes
  `TEMPLATE_SERVER_URL`, baked into `control-panel`'s production build via
  its existing env-var mechanism (same pattern as `LICENSE_BYPASS`).

## Error handling / offline behavior

- **Cache fresh** (per existing revalidation window): no network call at
  all — same offline behavior as today for a user who already created a
  company recently.
- **Cache stale/missing, network reachable, license valid:** fetch
  succeeds, cache refreshes, company creation proceeds normally.
- **Cache stale/missing, network unreachable:** company creation fails with
  a clear message ("Couldn't reach the template server — check your
  connection, then try again") rather than silently falling back to
  anything bundled (there is nothing bundled anymore).
- **Cache stale/missing, network reachable, license invalid/expired:**
  company creation fails with the server's `403` message surfaced directly
  (e.g. "Your license is no longer valid").

## Testing

- `lib/template-fetch/fetch-template.test.ts` — inject a fake `FetchLike`
  (mirrors `validate-license-impl.test.ts`'s existing pattern) covering:
  valid license → files returned; invalid license → `ok: false`; network
  throw → `ok: false` with a clear message.
- `lib/template-fetch/template-cache.test.ts` — fresh cache within window →
  used as-is; stale cache → treated as miss; missing cache → treated as
  miss. Uses an injectable `nowSeconds`-style clock parameter, matching this
  project's existing DI convention for wall-clock reads.
- `lib/create-company-from-template-impl.test.ts` (existing file, updated) —
  inject a fake `getTemplateFiles` the same way the file already injects
  `execFn`; existing assertions about the resulting company's file layout
  should pass unchanged since the *shape* written to `rootPath` doesn't
  change, only where the file contents come from.
- The `alacran-template-server` repo gets its own minimal test coverage
  (license-validate call, valid/invalid/target-not-found responses) — out
  of scope for `control-panel`'s own test suite.
- Live verification (per this project's standing safety rule: disposable
  `/tmp` directories only): create a company end-to-end against a real
  deployed `alacran-template-server` instance using a real (or sandboxed
  test-mode) Lemon Squeezy license key, confirming the resulting company
  directory matches what today's local-bundle copy produces byte-for-byte.

## Out of scope (explicitly deferred)

- Rate limiting / abuse protection on `alacran-template-server`'s API route
  — noted as a future hardening item, not a v1 blocker.
- The stricter "never persist the raw source in the clear" design (decrypt
  in-memory only, no plaintext cache) — declined in favor of the simpler
  cache-once approach for this iteration.
- Any retroactive action on already-public `alacran-releases` downloads.
- Any change to how a created company's own files are stored, shared, or
  protected — explicitly out of scope per the user's own framing.
- Migrating the Linux `.deb` CI pipeline (`.github/workflows/package-linux.yml`)
  to inject `TEMPLATE_SERVER_URL` — will need a small env-var addition to
  that workflow, called out here so it isn't missed, but the workflow
  change itself is mechanical and covered by the plan's packaging-script
  task, not a separate design concern.

## What needs your involvement

Matching this project's established pattern for external-account steps
(`LAUNCH.md`'s Lemon Squeezy setup was the same shape): I can write all the
code for both repos, but a few steps touch accounts/credentials that are
genuinely yours, not mine to act on unilaterally:

- **Creating the new private repo.** I can attempt this with `gh repo
  create --private` using the already-authenticated `gh` CLI this session
  already used for `alacran-releases` — but I'll ask before creating a new
  repo under your account, the same as any other shared-state action.
- **Deploying it to Vercel and wiring the production env vars**
  (none needed on the server side beyond what Lemon Squeezy already
  requires — no secret API key, since the license key itself authenticates,
  same as today's client-side validation call). I can likely drive much of
  this with the `vercel` CLI if you're already logged in locally, but the
  first-time project link and any dashboard-only steps may need you
  directly.
- **Setting `TEMPLATE_SERVER_URL` in `control-panel`'s own production build
  config** once the server's real deploy URL exists — small, but sequenced
  after the deploy above.

None of this blocks writing the code for both repos' logic — it only
blocks the final live-verification step in Testing above, which needs a
real deployed server to fetch against.

## Definition of done

- `templates/company-starter/` and `templates/packs/*` no longer exist in
  `control-panel`'s built `.app`/`.deb` payloads (confirmed via the same
  `find`/`grep` spot-check used to discover this problem).
- A fresh company created through the app, against a real deployed
  `alacran-template-server` and a valid test license key, produces a
  directory identical in structure and content to what today's local-bundle
  copy produces.
- An expired/invalid license, or no network on a cold cache, blocks company
  creation with a clear, specific error message — never a silent fallback.
- `npx tsc --noEmit`, `npx vitest run`, `npm run build` all clean in
  `control-panel`.
- `LAUNCH.md` records the supersession of its 2026-07-28 offline-bundling
  decision.
