# LAUNCH.md — 4-Day Launch Runbook

Living tracker for turning `control-panel` from a personal local tool into a
**downloadable product**. This is the cross-session source of truth for the
launch push — read **Current position** first, do the work, then update the
stage's **Status** + **Updates log** and append to the **Session handoff log**
so the next session (or the next you) resumes cleanly.

- **Goal:** ship a downloadable app users buy + install, that starts empty and
  walks them through creating their own AI company and connecting their own
  agent.
- **Deadline:** launch by **2026-08-01** (4 days from 2026-07-28).
- **This is NOT a feature slice.** It's a productization epic. Individual days
  may still be built with the normal brainstorm→spec→plan→build discipline, but
  this file is the epic-level tracker that spans them.

---

## How to use this doc (every session, read this)

1. Read **Current position** — it says which day/stage is active and the single
   next action.
2. Work the active stage's task checkboxes.
3. As you go: flip the stage **Status**, tick checkboxes, and write what
   happened + any decisions/blockers into that stage's **Updates log**.
4. At end of session: append one entry to the **Session handoff log** (bottom).
5. If a stage's plan changed, edit the stage in place — this doc is meant to be
   rewritten as reality lands, not preserved as first-draft fiction.

Status values: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `DONE` · `CUT`.

---

## Current position  ⬅️ resume here

- **Active stage:** Days 1-3 app-side all **BUILT** (v23-v27 + landing page),
  **plus v28 Connect page** (closes the one in-app golden-path gap: users can now
  see + get guided through connecting their Claude agent and Google, in-app).
  Two things still sit with the **user**: (a) verify the packaged `.app` on your
  Mac (done once already), (b) set up Lemon Squeezy + pick the price and swap the
  placeholders. Day 4 (end-to-end + demo) can't fully run until those land.
- **Overall:** Day 1 DONE (v23-v25). Day 2 build DONE (v26, browser-runner
  `.app`, server verified). Day 3 app-side DONE (v27 license gate + landing
  page); external LS setup + branding pending user.
- **Single next actions (user):** (1) `bash scripts/package-macos.sh` →
  right-click `dist/AI Company Panel.app` → Open → report. (2) Set up Lemon
  Squeezy, pick name+price, swap placeholders (see Day 3 "What YOU need to do").
  **Single next action (me):** Day 4 prep / whatever you point me at — most of
  Day 4 (real end-to-end buy→key→unlock, demo video) needs the LS + Mac steps
  above first.
- **Still-open (now user-blocking):** app name/brand/domain; exact price/trial;
  Lemon Squeezy account setup.
- **Days elapsed / remaining:** ~2 / 4.

Keep this block honest and current — it is the fastest way for a fresh session
to know where things stand.

---

## Locked decisions

These were decided with the user on 2026-07-28. Don't relitigate without them.

- **Launch scope:** full downloadable app in 4 days (not just a landing page /
  waitlist; not a private beta).
- **Repo strategy:** continue from THIS repo. Do **not** clone/fork. The
  "plugins" (`plh-takeshi-agent`, `plh-ops`) are already separate repos; the
  dashboard is already agent-agnostic (adapter pattern + `getEffectiveAgents`).
  The "split" = de-PLH the config + ship only the generic template.
- **Payments:** hosted provider with license keys — **Lemon Squeezy** (or
  Paddle) — chosen for out-of-the-box international tax/VAT + license-key
  generation + validation API. Do **not** build custom billing.
- **Auth model:** gate at the website (buy → license key → download). No in-app
  accounts UI on day 1; the app validates a license key on launch.
- **Delivery mechanism:** decided during Day 2. Electron is the primary target;
  the "packaged local server that opens the browser" is the guaranteed
  fallback so packaging can't sink the date.
- **[2026-07-28] Target audience for v1:** **CLI-comfortable early adopters** —
  prosumers/devs who can install Claude Code CLI + `gog`. Onboarding
  **detects** those deps and **guides** install if missing (no bundling /
  auto-install). Truly non-technical is a fast-follow, not a v1 blocker.
- **[2026-07-28] Pricing model:** **free trial → monthly subscription** via
  Lemon Squeezy (native trial support). Exact price + trial length still TBD
  (see Open decisions).
- **[2026-07-28] Template delivery:** **bundle the cleaned generic template
  inside the app** (ships in the installer; works offline; no dependency on a
  public repo). v17's `TEMPLATE_MANIFEST` defines the clean file set; the copy
  source moves from the local `~/AI-Native/...` path to the bundled copy.
- **[2026-07-28] macOS signing (v1):** **ship unsigned** with clear
  "right-click → Open" instructions. Notarization is a fast-follow.
- **[2026-07-28] App name = `Alacrán`** (Spanish for scorpion). Brand built
  around it: UV-bioluminescence glow (cyan-green) + desert amber, day/night
  theme, glowing curled-tail scorpion mark. Applied to `lib/branding.ts`,
  `scripts/package-macos.sh` (→ builds `Alacrán.app`), the app tab title, and
  the landing page. Domain/logo-file still TBD.

---

## Open decisions (resolve before they block the relevant day)

_Resolved 2026-07-28 → moved to Locked decisions: target audience, pricing
model, template delivery, macOS signing._

- **[MED] Exact price + trial length.** The model is locked (free trial →
  monthly). Still need the actual number(s): monthly price and trial length
  (e.g. 7 or 14 days). Blocks: Day 3 Lemon Squeezy setup + landing page copy.
- **[RESOLVED 2026-07-28] App name = Alacrán** (see Locked decisions). Still to
  pick: a domain, and a real logo asset (the landing uses an inline SVG mark +
  🦂 favicon for now).
- **[MED] Lemon Squeezy checkout URL + real price** — the landing page and
  license gate use placeholders (`REPLACE-ME`, `$29/mo`) until the LS product
  exists. Blocks going live.

---

## Deadline math (targets, adjust as needed)

| Day | Target date | Theme |
|-----|-------------|-------|
| Day 1 | 2026-07-28 (today) | De-PLH + first-run onboarding + dependency detection |
| Day 2 | 2026-07-29 | Desktop packaging (Electron; browser fallback) |
| Day 3 | 2026-07-30 | Payments (Lemon Squeezy) + license gate + landing page |
| Day 4 | 2026-07-31 | End-to-end integration, test, demo video, buffer |
| Launch | 2026-08-01 | Go live |

---

## Day 1 — De-PLH + first-run onboarding + dependency detection

**Status:** DONE (2026-07-28) — shipped as v23/v24/v25, all merged to master
(258 tests green, build clean, live-verified).

**Goal:** a fresh install starts **empty** and walks the user from nothing to
their first working company. This is pure critical path and low-risk — do it
first regardless of every later decision (a packaged app that still hardcodes
your PLH data isn't shippable anyway).

**Why it's first:** everything else (packaging, license, landing) assumes the
app is a clean product, not your personal Kirirom dashboard.

**Tasks:**
- [ ] Brainstorm + spec this as a productization slice (e.g. `v23`).
- [ ] Remove the 3 hardcoded PLH agents from `lib/config.ts` (`AGENTS` /
      `ADAPTERS` / `SKILL_ADAPTERS`) so a fresh install has an empty agent list.
      Keep `lib/config.test.ts`'s drift-guard passing (it asserts AGENTS↔ADAPTERS
      parity — update it for the empty/minimal default).
- [ ] Make the removed PLH agents **re-registerable** so YOU don't lose your own
      daily use (register them as companies via the existing "Add a company"
      flow, or a dev-only seed). Note: this changes how you personally use the
      dashboard — flag before merging.
- [ ] **Bundle the cleaned generic template inside the app** (decision locked:
      bundle, not clone-on-first-run). v17's `TEMPLATE_MANIFEST` defines the
      clean file set; today `createCompanyFromTemplate` copies FROM the local
      `~/AI-Native/ai-company-starter-main` path — repoint that source to the
      bundled copy that ships in the installer (works offline, no user-side
      git/network needed for scaffolding).
- [ ] First-run experience: detect empty state → show a Welcome / "create your
      first company" screen instead of an empty grid.
- [ ] **Dependency detection (detect-and-guide, per locked audience decision):**
      on launch (or in onboarding), check for `claude` (Claude Code CLI) and
      `gog` on `PATH`; if missing, show a clear "install these to continue" step
      with links/commands. v1 does NOT auto-install — it guides CLI-comfortable
      users through it.
- [ ] Scrub for any other PLH/Kirirom hardcoding that would leak into a shipped
      build (grep `plh`, `takeshi`, `kirirom`, `nana@plh.life`, absolute
      `~/AI-Native/...` / `/Users/nanaosei/...` paths across `lib/` `app/`
      `components/`).

**Definition of done:** on a machine with an empty `.data/`, launching the app
shows onboarding, and a user can create their first company from the bundled
template and see it appear — with no PLH data anywhere and no assumption that
`~/AI-Native/*` exists.

**Cut if behind:** dependency auto-install (keep detect-and-guide only);
polished Welcome visuals (a plain screen is fine).

**Updates log:**
- **2026-07-28** — Built as three merged slices:
  - **v23** — `buildBuiltins(exists)` in `lib/builtin-agents.ts`; `config.ts`
    loads built-ins only if their `~/AI-Native/*` dirs exist. Install-daily-team-log
    button gated on `plh-ops` presence; template strings genericized. Dev
    machine keeps all 3 agents (verified via Playwright — grid still shows them).
  - **v24** — committed `templates/company-starter/` snapshot (42 manifest
    paths, 117 files, scrub-verified clean; removed stray `__pycache__` so it
    doesn't propagate); `create-company-from-template.ts` repointed to the
    bundle. Live-verified: created a disposable company from the bundle with the
    genericized commit message, `check-inbox.md` present, no PLH data,
    `ai-company-starter-main` untouched.
  - **v25** — `checkDependencies()` (claude + gog via `which`) +
    `OnboardingWelcome`; `app/page.tsx` renders it when `agents.length === 0`.
    Live-verified by running the dev server with `HOME` pointed at an empty dir
    → onboarding rendered with real dep status (both ✓ installed) + "Add a
    company" CTA.
  - README/CLAUDE.md/memory updated. Cost note: the spawn cap (200/200) blocked
    subagent dispatch again (9th time), so all slices implemented directly.

---

## Day 2 — Desktop packaging

**Status:** BUILD DONE (2026-07-28), awaiting user verification on a real Mac.
Mechanism decided = **browser-runner** (not Electron), per the Day-2 fork
decision. Shipped as v26 (merged to master). Everything headless-verifiable is
green; the double-click / GUI parts need the user to run the artifact.

**How to build + try it (user, on your Mac):**
1. `bash scripts/package-macos.sh` → produces `dist/AI Company Panel.app`
   (the script self-tests the packaged server headlessly first).
2. In Finder, **right-click the .app → Open → Open** (it's unsigned for v1).
3. It should start the local server and open your browser to the app.
4. Report back what happens; I'll fix from there.

**Known rough edges to check / decide (feed back into the runbook):**
- **App name is a placeholder** ("AI Company Panel") — set `APP_NAME` at the top
  of `scripts/package-macos.sh` once the name is chosen (open decision).
- **Node.js required** on the user's machine (v1 assumption; the launcher shows a
  guided alert if it's missing). Bundling Node is a post-launch step.
- **Process lifecycle is rough for v1:** closing the browser tab does NOT stop the
  server; quitting the app process does. A menubar-app polish is post-launch.
- Confirm the app's own spawned `claude`/`gog` resolve when launched from Finder
  (the launcher prepends `/opt/homebrew/bin` etc. to PATH — verify on your setup).

**Goal:** a real downloadable artifact. **Time-box the Electron attempt — do
not let packaging perfection sink the launch.**

**Why it's the biggest risk:** the app is a Next.js *server* app (Server
Actions, `force-dynamic`, detached `claude -p` spawning, local FS + git). That's
fiddlier to wrap than a static frontend.

**Tasks:**
- [ ] Spike Electron wrapping (consider `nextron` boilerplate). Get `next start`
      running in the main process, a window opening the app, and spawned
      `claude -p` inheriting the correct `PATH`/env (this is the classic failure
      point — a packaged app often has a stripped PATH and can't find
      `claude`/`gog`).
- [ ] Confirm Server Actions + `force-dynamic` pages work inside the Electron
      runtime, not just `next dev`.
- [ ] **Mid-afternoon checkpoint:** if Electron is still fighting, switch to the
      fallback — a signed installer that starts the local server and opens the
      user's browser (what it does today, just packaged). Ship SOMETHING
      downloadable.
- [ ] Produce a downloadable installer for at least macOS (your platform).
- [ ] Signing decision (Open decision): notarize, ad-hoc sign, or ship unsigned
      with "right-click → Open" instructions.

**Definition of done:** a file you can download on a clean-ish machine, install,
and launch to a working app window (or auto-opened browser) that can spawn a
company command.

**Cut if behind:** Electron polish → browser fallback; notarization → unsigned +
instructions; Windows/Linux builds → macOS only for v1.

**Updates log:**
- **2026-07-28** — Fork decided: **browser-runner** over Electron (the app is a
  Next.js server app; my environment has no display to verify an Electron window;
  CLI-comfortable audience makes a browser launch fine; far lower risk). Spiked
  `output: "standalone"` — hit the multi-lockfile workspace-root bug (server.js
  nested under `.next/standalone/.claude/worktrees/...`), fixed with
  `outputFileTracingRoot: appDir` in `next.config.ts` → flat
  `.next/standalone/server.js`. Booted the standalone server headlessly: `/` and
  `/skills` both 200. Wrote `scripts/package-macos.sh` → builds
  `dist/<App>.app` (standalone payload + static + bundled `templates/` co-located
  so the `process.cwd()`-relative template path resolves; launcher ensures PATH,
  guided-alerts if Node missing, starts server + opens browser). **Independently
  verified the packaged .app's server serves HTTP 200** (dashboard) from the
  payload. Fixed a self-test PID-capture bug (`\$!` → `$!`). Merged as v26 (258
  tests green). Remaining = user verifies the double-click on their Mac (I can't
  launch a GUI). Cost note: no subagents (packaging is a spike + manual GUI
  verify, not subagent-transcribable; spawn cap also still blocking).

---

## Day 3 — Payments (Lemon Squeezy) + license gate + landing page

**Status:** APP-SIDE BUILT (2026-07-28) — license gate shipped (v27) + landing
page (`landing/index.html`). Remaining is the part only you can do: create the
Lemon Squeezy product + checkout, and swap the placeholder brand/price/URLs.

**What's built + verified (headless):**
- **License gate (v27, merged).** `lib/license/*`: validates a key against Lemon
  Squeezy's license API (no store secret needed — the key authenticates), caches
  the result, re-validates at most daily, and keeps a paying user working up to
  7 days offline. Enforced **only in a production build** (the packaged app) and
  bypassable with `LICENSE_BYPASS=1` — so `next dev` (your daily use) is never
  gated. Verified: dev → dashboard; prod + no key → gate; prod + `LICENSE_BYPASS=1`
  → dashboard. 14 unit tests cover offline grace / revalidation / invalid key.
  The gate lives in `app/layout.tsx`, so it wraps every page.
- **Landing page.** `landing/index.html` — a full **Alacrán-branded** marketing
  page (scorpion / UV-glow identity, day-night theme, glowing scorpion mark,
  staggered hero reveal + scroll animations), self-contained (inline CSS/JS/SVG,
  no external assets), content modeled on fleece.ai's "you decide · it executes ·
  approves before anything irreversible" thesis but grounded only in Alacrán's
  real features. Live preview (private): claude.ai/code/artifact/80654d67-997a-412b-b632-64931a77302a
  — swap the `REPLACE-ME` checkout/download/email + confirm the price before
  deploying.

**What YOU need to do to finish Day 3:**
1. Create the Lemon Squeezy product + a **subscription with a 14-day free trial**
   (or your chosen price/trial). Turn on **license keys** for it. Grab the
   checkout URL.
2. Swap the placeholders (all marked with TODO / `REPLACE-ME`):
   - `lib/branding.ts` — `APP_NAME`, `PRICE_LABEL`, `CHECKOUT_URL`.
   - `scripts/package-macos.sh` — `APP_NAME` (keep in sync with branding).
   - `landing/index.html` — app name, price, checkout URL, download URL, contact.
3. Deploy `landing/` to your host + domain; put the built `.app` download behind
   the purchase flow (LS "download after purchase", or a gated link).
4. Test the loop: buy → get a license key → open the app → paste the key on the
   gate → it validates and unlocks.

**Goal:** people can pay and get a working download; a page explains + sells it.

**Tasks:**
- [ ] Lemon Squeezy: create the product, checkout, and **license-key on
      purchase**. Confirm the license-validation API shape.
- [ ] App: validate the license key on launch — call LS validation, cache the
      result locally, allow an offline grace period so a flaky network doesn't
      lock out a paying user.
- [ ] License entry UX in the app (paste key on first launch; store it).
- [ ] Landing page: what it is + a demo GIF/video + pricing + checkout button +
      download link gated behind purchase/trial. Reuse
      `ai-company-beginner-guide-lp.html` (already in the template) as a
      starting point. Can be a separate tiny static site or a page here.
- [ ] Price + trial decision wired in (Open decision).

**Definition of done:** buy on the landing page → receive a license key +
download link → app accepts the key and unlocks.

**Cut if behind:** offline grace logic (require online validation for v1);
fancy landing visuals (ship a clean single-scroll page).

**Updates log:**
- **2026-07-28** — Built the app-side of Day 3 headlessly with placeholder
  brand/price (per "keep moving"). **v27 license gate** (merged): Lemon Squeezy
  key validation + `.data/license.json` cache + offline grace, prod-only
  enforcement with a `LICENSE_BYPASS` escape hatch, gate in `app/layout.tsx`,
  14 unit tests + live-verified all three paths (dev/prod-gate/prod-bypass).
  Hit the same incomplete-worktree-node_modules issue as v26 during the
  production build — fixed with `npm install` in the worktree (a worktree
  artifact, not a code issue). **Landing page** `landing/index.html`
  (committed to master): self-contained, dark, feature-grounded, placeholders
  marked. Everything external (LS account, real brand/price, deploy) is the
  user's — see "What YOU need to do" above.

---

## Day 4 — End-to-end integration, test, demo, buffer

**Status:** NOT STARTED

**Goal:** the whole funnel works once, on record, and the top breakages are
fixed.

**Tasks:**
- [ ] Full walk on the cleanest machine you can: buy → key + download → install →
      launch → license validates → dependency check → create company → connect
      Google (`api-connect`) → run `check-inbox` → see a result.
- [ ] Fix the top 3 breakages found in that walk.
- [ ] Record the demo video (this doubles as landing-page + launch-post content).
- [ ] Final go/no-go against the cut list; ship.

**Definition of done:** you (or a friendly tester) completed the funnel
end-to-end without you touching a terminal to unstick it, and it's on video.

**Cut if behind:** breadth of testing → the single golden path only; nice-to-have
polish → post-launch.

**Updates log:**
- _(append dated notes here as you work Day 4)_

---

## Cross-cutting risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Non-technical users lack Claude Code CLI + `gog` | App unusable on download for the stated target audience | Narrow v1 audience to CLI-comfortable early adopters; detect-and-guide onboarding; true non-technical = fast-follow |
| Electron can't cleanly run the Next server + spawn `claude` (PATH) | No native download by Day 2 | Browser-fallback installer; mid-Day-2 checkpoint to switch |
| Template assumes local `~/AI-Native/ai-company-starter-main` | Create-company breaks on a real user's machine | Bundle the cleaned template in the app (Day 1) |
| macOS Gatekeeper blocks unsigned app | Users can't open it | Notarize if time; else clear "right-click → Open" instructions |
| PLH/Kirirom data or paths leak into the shipped build | Privacy + broken install | Day 1 scrub grep; ship only v17's clean manifest |
| License validation offline lockout | Paying user can't use the app offline | Cache + offline grace period |

---

## Pre-agreed global cut list (in order things get dropped if behind)

1. macOS notarization/signing → ship unsigned + "right-click → Open" instructions.
2. Electron polish → browser-fallback download.
3. In-app accounts UI → license-key only.
4. Automated dependency install → detect-and-guide (user installs the CLIs).
5. Windows/Linux builds → macOS-only for v1.
6. Offline license grace → online validation required for v1.
7. Broad testing → single golden path only.

---

## Session handoff log (append-only)

Newest last. One short entry per work session: what moved, what's next, any
decision made. This is the narrative spine across sessions — keep it terse and
truthful.

- **2026-07-28 — planning.** Locked scope (full app in 4 days), repo strategy
  (continue, don't clone), payments (Lemon Squeezy), auth (website/license
  gate). Wrote this runbook. Nothing built yet. **Next:** start Day 1 (de-PLH +
  first-run onboarding); resolve the [HIGH] target-audience open decision early
  since it shapes onboarding depth.
- **2026-07-28 — decisions resolved.** Locked 4 of the 6 open decisions:
  audience = CLI-comfortable early adopters (detect-and-guide, no auto-install);
  pricing = free trial → monthly (Lemon Squeezy); template delivery = bundle in
  app; macOS = ship unsigned + right-click→Open for v1. Day 1 tasks firmed up
  accordingly. Remaining open (non-blocking for Day 1): exact price/trial length,
  app name/brand/domain. **Next:** brainstorm + spec + build Day 1.
- **2026-07-28 — Day 1 DONE.** Shipped v23 (existence-gated built-ins), v24
  (bundled `templates/company-starter/` + repointed create action), v25
  (`OnboardingWelcome` + `checkDependencies`). All merged to master, 258 tests
  green, build clean, each live-verified. App now starts empty on a fresh
  install and onboards to first-company creation; dev machine unchanged.
  **Next:** Day 2 — Electron packaging spike (browser fallback ready); pick an
  app name (needed for the Electron build).
- **2026-07-28 — Day 2 build DONE (browser-runner, v26).** Chose browser-runner
  over Electron. `output: "standalone"` + `outputFileTracingRoot` fix →
  `scripts/package-macos.sh` builds `dist/<App>.app`; packaged server verified
  serving 200 headlessly. Merged (258 tests). **Blocked on user Mac verify**
  (double-click). App name still a placeholder — needed for both the packaging
  script and Day 3's landing page. **Next:** user runs the .app on their Mac; I
  start Day 3 (Lemon Squeezy + license gate + landing page) in parallel.
- **2026-07-28 — Day 3 app-side DONE.** v27 license gate merged (272 tests) +
  `landing/index.html`. Built with placeholder brand/price per "keep moving."
  All the app-side, headless-verifiable parts of Days 1-3 are now done. The
  remaining launch work is user-owned + external: verify the .app on a Mac, set
  up Lemon Squeezy, choose the name/price, swap placeholders, deploy the landing
  page + download. **Next:** those user steps unblock Day 4 (real buy→key→unlock
  end-to-end + demo video).
- **2026-07-28 — user verified the .app runs on their Mac (no errors)** — Day 2
  packaging confirmed end-to-end. **Name chosen: Alacrán** (scorpion). Rebranded
  `lib/branding.ts` + packaging (→ `Alacrán.app`) + app tab title, and **rebuilt
  the landing page as a full scorpion-branded marketing site** (UV-glow/desert
  identity, animations, day/night, fleece-modeled content, all real features).
  Live preview: claude.ai/code/artifact/80654d67-997a-412b-b632-64931a77302a.
  Price + LS checkout remain placeholders (user setting up LS later). 272 tests
  green. **Next:** user sets up Lemon Squeezy + swaps checkout/price placeholders;
  then Day 4 end-to-end + demo.
- **2026-07-28 — v28 Connect page (in-app tool connection).** Closed the one
  genuine in-app hole on the buy→run golden path. New machine-global `/connect`
  page (nav + onboarding link): detect→guide→re-check for the **Claude agent**
  (`which claude`) and **Google** (`gog auth status -j` — clean JSON, no tokens).
  Not-connected cards show the exact connect command with a Copy button +
  Instructions link; Re-check re-probes. Read-only, no OAuth/credential storage,
  no `claude` spawn. 5 new tests (277 total green), tsc/build clean, live-verified
  connected + guidance paths. Spec: `docs/superpowers/specs/2026-07-28-control-panel-v28-connect-tools-design.md`.
  Deviation note: built directly on `master` (not a worktree) — small slice, and
  worktrees hit the empty-node_modules build gotcha (v26/v27). **Next:** user's LS
  + price steps unblock Day 4 end-to-end + demo.
- **2026-07-28 — landing v4 (3D logo + polish).** Replaced the hero
  logo with a **WebGL/Three.js 3D scorpion emblem** (`landing/logo3d.js`,
  vendored `landing/vendor/three.min.js` r160) — a curled segmented tail
  with stinger and pincers, metallic red, rim-lit, gentle idle motion;
  falls back to the SVG scorpion when WebGL/Three is unavailable. Made
  buttons **square with rounded corners** (`.btn` radius 999px→12px).
  **Removed Marketplace** (nav item, page, roadmap card). Verified headless
  (Chromium): 0 JS errors, canvas renders in light + dark. Preview (same
  URL, three.js inlined): claude.ai/code/artifact/450d8c28-599d-4467-871b-a4a8caa4422b .
  Best viewed via `open landing/index.html`.
- **2026-07-28 — landing v3 (multi-page site).** Restructured `landing/`
  into a proper static multi-page site sharing `landing/styles.css`:
  `index.html` + 7 section pages (use-cases, templates, marketplace,
  integrations, docs, how-to-use, pricing). Added a **liquid-glass floating
  navbar** (fully-rounded, blurred), a **3D glossy scorpion** logo (SVG
  gradients), **removed the visible section dividers**, **fixed + redesigned
  the orchestrate diagram** (SVG cards sized to fit labels, hub accent,
  travelling pulse), and marketing for **bring-your-own-agent + future
  integrations (not just Google) + create-your-own/auto-drafted skills**
  (tagged `soon`). Preview (home): claude.ai/code/artifact/450d8c28-599d-4467-871b-a4a8caa4422b .
  Nav links now resolve to real pages. Placeholders (checkout/price/download/
  email) still `REPLACE-ME`. Best viewed via `open landing/index.html`.
- **2026-07-28 — landing v2 (design iteration).** Per user: added a product
  navbar (Use cases / Templates / Marketplace / Integrations / Docs / How to use
  / Pricing), switched to a **red scorpion theme**, Geist type (buzz-vibe), and
  a **scroll-animated "02 — Orchestrate" diagram** (You → Alacrán → companies →
  workflows, links draw + nodes reveal on scroll) modeled on fleece.ai. Preview
  URL unchanged. Nav links are on-page anchors for now.
