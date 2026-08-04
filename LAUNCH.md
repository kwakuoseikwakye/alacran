# LAUNCH.md — 4-Day Launch Runbook

> **HISTORICAL — the commercial launch this document plans did not happen.**
> On 2026-08-04 Alacrán was released as free, MIT-licensed open source instead.
> The license gate, the Lemon Squeezy checkout, the subscription price and the
> planned server-side template gating are all gone from the codebase. Read this
> file as a record of how the product was built and what was decided along the
> way — not as a live runbook. Anything below about payments, trials, licence
> keys or gated templates no longer describes the software.
>
> The parts still worth reading: the packaging decisions (browser-runner over
> Electron), the macOS notarization gap, and the honest open-items list.

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

- **Active stage:** Days 1-4 of the original plan are functionally **DONE**.
  Name, price, and checkout are real and live (not placeholders) — see Locked
  decisions. `.dmg` builds, is ad-hoc signed, and a user has verified it opens.
  A public `alacran-releases` GitHub repo serves the download, with the site's
  download link now tracking `/releases/latest` instead of a pinned tag. The
  license gate, Connect page, and an update-notification banner (checks GitHub
  once a day, dismissible, never phones home beyond that) are all merged. The
  landing site was fully rebuilt since the last handoff entry below: clean URLs
  (no `.html`), an org-chart "Orchestrate" diagram (replacing one with a real
  10px node-overlap bug), a live "Execute" board simulating the actual
  runner/diff/commit flow, a plain-English explainer section, a 12-question FAQ
  audited against the actual codebase (not aspirational claims), and a full
  15-section "How to use" guide. The bundled `templates/company-starter/` was
  also fully translated to English (previously partly Japanese).
- **What a fresh session should NOT assume:** this doc's Day 1-4 checkboxes
  below are stale (written 2026-07-28, before most of the above). Trust this
  Current Position block and the Session handoff log over the checkboxes.
- **Genuinely still open:**
  1. **macOS notarization.** The app is only ad-hoc signed
     (`codesign --sign -`), not Developer-ID-signed or notarized — confirmed
     via `security find-identity`, no Developer ID cert on this machine. Every
     download still hits Gatekeeper's "cannot verify" wall. Needs the user's
     own Apple Developer Program enrollment ($99/yr) — I can wire real signing
     + `notarytool` + stapling into `scripts/package-macos.sh` same-day once a
     cert exists, but can't obtain the cert myself.
  2. **Day 4's actual end-to-end walkthrough** (buy → download → install →
     license unlocks → create a company → connect Google → run `check-inbox` →
     see a result, without touching a terminal to unstick it) has not been run
     as a single recorded pass. Everything has been verified in pieces, not
     back-to-back as a first-time buyer would experience it.
  3. **The three feature asks from 2026-07-30 are all now shipped:**
     pre-built company starter templates, multi-model support (pluggable
     coding-agent CLI per company), and Linux packaging. See the Session
     handoff log for what each actually is and the two genuinely-remaining
     live-verification gaps in Open decisions below (the `.deb` build on
     real Debian, and the Codex/Aider CLIs' exact flags).
- **Days elapsed / remaining:** past the original 2026-08-01 target; the plan
  has organically extended into a broader hardening + content pass. Treat the
  date math below as historical, not a live deadline, unless re-confirmed.

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

_Resolved: target audience, pricing model, template delivery, macOS ad-hoc
signing, app name (Alacrán), Lemon Squeezy price (¥5,127/mo, 14-day trial) +
checkout URL (both live in `lib/branding.ts`, confirmed no longer
placeholders), real logo (`landing/logo.png`, generated from
`landing/scorpion.png`), domain (alacran.ai — contact@alacran.ai is live),
pre-built company starter templates (shipped 2026-07-30), multi-model
support shape (shipped 2026-07-30 — bring-your-own-key per provider, swap
the whole coding-agent CLI per company), Linux packaging format (shipped
2026-07-30), and the Linux `.deb` itself — a real, live download
(`.../alacran-releases/releases/latest/download/Alacran.deb`), verified via
`curl` returning HTTP 200 at the exact right file size — is now on the
landing page next to the macOS one, alongside a rewritten hero/CTA leading
with the AI-native/local-machine pitch (2026-07-30 — see Session handoff
log)._

- **[HIGH] macOS notarization.** Still ad-hoc signed only. See Current
  Position above for the exact blocker and what's needed to unblock it.
- **[MED] Get a real Debian/Ubuntu machine to confirm `apt install`/
  launch-from-menu.** The CI pipeline itself is now fully proven — dispatched
  for real, built the `.deb` on a genuine `ubuntu-latest` runner, and
  published it to the live `alacran-releases` release (confirmed via `gh
  release view` and a `curl` of the actual download URL). What's still
  unconfirmed is the END-USER side: nobody has actually run `apt install
  ./Alacran.deb` (or `dpkg -i` + `apt -f install`) on a real Debian/Ubuntu
  desktop and confirmed the app launches from the applications menu and the
  server boots correctly outside CI's headless self-test.
- **[MED] Run the OpenAI Codex CLI and Aider integrations against a real,
  authenticated account.** `lib/ai-executors.ts`'s `claude-code` flags are
  the pre-existing, already-proven behavior (moved, not rewritten). The
  `openai-codex`/`aider` flags were upgraded from best-effort docs guesses
  to confirmed-real: both CLIs were actually installed here (`npx
  @openai/codex`, `uvx --from aider-chat aider`) and their `--help` output
  was checked directly. That caught a real bug before it shipped —
  `--full-auto` isn't a real `codex exec` flag on the installed version
  (0.146.0); the actual non-interactive/no-approval flag is `--sandbox
  workspace-write`, now fixed. Aider's assumed flags (`--message`,
  `--yes-always`, `--no-auto-commits`) all checked out exactly as written.
  What's still unverified: neither CLI has been run end-to-end against a
  real authenticated model account from inside this app (no API
  key/subscription configured here) — the flag *shapes* are now confirmed
  real, but a live run's actual behavior (does the edit land, does the
  sandbox mode allow what a command needs) is not yet proven.
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
- **2026-07-30 — runbook brought current + three new feature asks scoped.**
  This doc had not been updated since 2026-07-28 despite ~15 more shipped
  commits (clean URLs, the Execute board, a full copy rewrite after a human
  reviewer couldn't tell what the app does, a plain-English explainer + FAQ +
  15-section how-to-use guide, a privacy audit that caught 3 overclaimed
  statements on the site, an update-notification banner, and a stale
  "placeholder price" label left on an already-final price). Rewrote Current
  Position and Open Decisions to match reality rather than 2026-07-28's state.
  **Three new feature requests logged, none started, each needs a decision
  before code:** (1) pre-built company templates (marketing/sales, software
  engineering) — checked `~/AI-Native/plh-takeshi-agent` (read-only, per the
  standing rule) as the requested reference: it has exactly one skill,
  `plh-dev-team`, a 6-role software-engineering pipeline (requirements
  analyst → architect → senior engineer → QA → code reviewer → release
  engineer). Confirmed via full-repo grep: **no marketing/sales content
  exists there at all** — a "sales" hit in `state/routing/` was an unrelated
  routing note about a copy-edit email. So a software-engineering template
  has real, strong reference material to draw from; a marketing/sales
  template would be designed fresh, not adapted from this repo. (2) Multi-
  model support (ChatGPT + open-source models) — flagged the real conflict:
  it contradicts the shipped "bring your own Claude, no second AI bill from
  us" pitch baked into pricing copy and the FAQ's privacy answer, and the
  fix depends on which of two very different shapes (user brings each
  provider's own key, vs. Alacrán mediates access) is chosen. (3) Linux
  (.deb) installer — `scripts/package-macos.sh` is macOS-specific top to
  bottom (`.app`/`hdiutil`/`codesign`); the Next.js standalone server
  underneath should run on Linux unmodified, but the packaging shell is a
  new build, not a port. **Next:** present this scoping back to the user and
  get direction on sequencing/decisions before writing any code for the
  three asks.
- **2026-07-30 — pre-built company starter templates shipped.** User chose
  to sequence templates first, deferring multi-model and the Linux
  installer. Built 3 new starter packs on top of the existing generic
  template, using an "overlay" architecture (one shared base skeleton
  copied via the existing generic `TEMPLATE_MANIFEST`, plus a small
  per-pack "pack" directory — just a filled-in ontology + 1-2 new
  `.claude/commands/*.md` files — copied on top) rather than duplicating 4
  full template trees, matching this codebase's own SSOT discipline.
  Packs: **Software engineering** (grounded in `plh-takeshi-agent`'s
  `plh-dev-team` pattern — repo/feature/release ontology, `/code-review` +
  `/plan-feature`); **Marketing & sales** (built fresh — that repo has no
  such content — lead/account/campaign ontology, `/draft-campaign` +
  `/follow-up-lead`); **Leadership team** (deliberately generalist
  CEO/COO/CFO-style ontology, positioned as the easiest pick for someone
  running day-to-day cross-functional operations, per the user's own
  framing — `/weekly-briefing`). New pack commands need zero registry
  wiring to show up on the Skills page — confirmed
  `lib/skills/generic-command-set.ts` already scans each company's own
  `.claude/commands/` dynamically. "Add a company" now shows a 4-card
  picker (native radio inputs styled as cards, no new UI primitive).
  Verified for real, not just unit tests: a throwaway `tsx` script exercised
  the real impl against real `templates/packs/*` dirs in disposable
  `mkdtemp` directories (all 3 packs land correctly, base "general" pack
  unaffected, one clean git commit per company); `scripts/verify.py`'s
  `ONTOLOGY-01` check flips from `INFO` to `PASS` for all 3 packed
  variants with zero new FAILs (the 2 pre-existing FAILs — missing
  `definitions/clients/` marker, unresolved `examples/harukaze-ec/`
  references — are the same known baseline gap in every case, unrelated to
  this work); and a full live Playwright pass against a throwaway dev
  server confirmed the real UI path end-to-end (picker renders, confirm
  dialog names the chosen pack, "Create & register" produces a real
  company directory on disk with the SE pack's ontology and both new
  commands present, one clean initial commit). `npx tsc --noEmit`, `npx
  vitest run` (341 tests passing, 66 files), and `npm run build` all clean.
  **Next:** commit and push this work, then pick a next step from the two
  explicitly-deferred asks (multi-model support, Linux/.deb installer) or
  the still-open macOS notarization / Day 4 end-to-end walkthrough items.
- **2026-07-30 — multi-model support + Linux packaging shipped.** User
  resolved both open forks up front: multi-model = bring-your-own-key per
  provider (each CLI manages its own auth; Alacrán never sees a key or a
  bill), and the mechanism = swap the whole coding-agent CLI per company,
  not just a few narrow features. Investigation (two parallel Explore
  passes) found only two real spawn sites hardcoding `"claude"` —
  `lib/company-commands/run-company-command-impl.ts` (every Skills-page
  Run-tab command) and `lib/daily-team-log/trigger-daily-team-log-impl.ts`
  — and confirmed prompt text itself has no Claude-specific coupling; only
  the surrounding CLI flags/permission syntax do.
  Built `lib/ai-executors.ts`: a small `AiExecutorId` → `{ binaryName,
  buildArgs, installHint }` registry with three executors — `claude-code`
  (flags moved verbatim from the old hardcoded spawn, byte-identical
  behavior, unit-tested against the exact old assertions), `openai-codex`
  (`codex exec <prompt> --full-auto --skip-git-repo-check`), and `aider`
  (`aider --message <prompt> --yes-always --no-auto-commits` — chosen
  specifically because Aider already supports Anthropic, OpenAI, and
  local/open-source models including Ollama through its own `--model`
  config, so it covers "other open source models" without a fourth
  executor). Per-company assignment lives in its own small registry file
  (`lib/ai-executor-registry.ts`, `dataPath("ai-executors.json")`),
  mirroring the existing `avatars-registry.ts` pattern exactly rather than
  touching `RegisteredCompany`'s schema. `run-company-command-impl.ts` now
  resolves and spawns whichever executor a company is assigned (default
  `claude-code`, unchanged for everyone who hasn't picked one); a native
  `<select>` (`components/ai-executor-picker.tsx`, no new UI primitive)
  shows on every `command-set` agent card. daily-team-log was deliberately
  left on Claude Code only — it's already a global, single-machine,
  single-scheduled-job feature (a known limitation since v20), not a
  per-company one, so generalizing it further didn't fit this slice.
  check-dependencies/onboarding's claude+gog gate was also left untouched
  on purpose — that's the app's base requirement to run at all, independent
  of which executor a given company later picks.
  **Honest gap:** only `claude-code`'s flags are live-proven (they're the
  pre-existing behavior). `openai-codex`/`aider`'s exact flags are best-
  effort from public docs — neither CLI is installed on this machine to
  test against, so treat them as wired-up-but-unverified until a real run
  confirms them (tracked in Open decisions).
  For Linux: investigation found no Electron anywhere in this repo — it was
  spiked and explicitly rejected (LAUNCH.md's own v26 history), and what
  shipped instead ("browser-runner") is already just a bash launcher +
  Next.js standalone server, no compiled/OS-specific binary. `next.config.ts`
  already sets `output: "standalone"`, so the payload itself needed zero
  changes for Linux. Wrote `scripts/package-linux.sh`: assembles the same
  standalone payload under `usr/lib/alacran/app`, a bash launcher using
  `xdg-open` (falls back to printing the URL) instead of macOS's `open`, a
  `.desktop` entry + reused `app/icon.png`, and a `DEBIAN/control` file
  (`Architecture: all`, `Depends: nodejs (>= 18)`), built with
  `dpkg-deb --build`. Also fixed `lib/data-dir.ts`, which hardcoded macOS's
  `~/Library/Application Support` even for a hypothetical Linux build —
  it now branches on an injectable `platform` param, using the XDG Base
  Directory default (`~/.local/share`, or `$XDG_DATA_HOME` if set) for
  anything non-macOS.
  **Honest gap:** `dpkg-deb` isn't installed on this (macOS) dev machine, so
  the script dry-run-verified everything up through real payload assembly
  and a real headless server self-test (booted the packaged `server.js`,
  curled it, got HTTP 200) using a stubbed `dpkg-deb` on `PATH` — but the
  actual `.deb` build and an `apt install`/launch-from-menu pass on real
  Debian have not been run (tracked in Open decisions).
  Verified for real: a live Playwright pass changed a company's executor
  from Claude Code to Aider through the real UI, confirmed the write
  landed in an isolated `ai-executors.json`, and confirmed it survives a
  full page reload. `npx tsc --noEmit`, `npx vitest run` (365 tests, 68
  files), and `npm run build` all clean. **Next:** commit this work; get a
  real Debian/Ubuntu machine or CI runner to finish verifying the `.deb`,
  and a machine with `codex`/`aider` installed to confirm their exact
  flags.
- **2026-07-30 — corrected the Codex CLI flags, rewrote the landing page to
  lead with multi-model, and added CI to actually build the `.deb`.** Before
  putting multi-model on the landing page as a headline claim, installed
  the real `codex`/`aider` CLIs here (`npx @openai/codex`, `uvx --from
  aider-chat aider`) and read their real `--help` output instead of trusting
  the docs-based guess from the previous entry. Found a real bug:
  `--full-auto` isn't a real `codex exec` flag on the installed version
  (0.146.0); fixed to the real one, `--sandbox workspace-write`. Aider's
  flags checked out exactly as written. Rewrote the landing page's hero,
  feature cards, Connect section, privacy-disclosure list, and FAQ to lead
  with "Claude, ChatGPT, or your own model," per direction — including
  correcting the privacy list, which used to claim prompts always go to
  Anthropic (no longer true once a workspace can be pointed elsewhere).
  Deliberately did not add a Linux download link, since no `.deb` exists
  yet; mirrored the copy changes across `pricing/` and `integrations/`.
  Then added `.github/workflows/package-linux.yml`: builds
  `scripts/package-linux.sh` on a real `ubuntu-latest` runner (confirmed via
  `gh repo view` that `alacran` is private source and `alacran-releases` is
  the public binaries repo, with an existing `v0.1.0` release holding
  `Alacran.dmg`/`Alacran.zip`), gated on `tsc`/`vitest` passing, triggered
  automatically on any `vX.Y.Z` tag push (the user's explicit choice over a
  manual-button trigger), and publishes the resulting `.deb` to the matching
  tag's release via `gh release upload`/`create`. Set the required
  `RELEASES_REPO_TOKEN` secret on the `alacran` repo by reusing the
  already-authenticated `gh` CLI token (the user's explicit choice over a
  separately-scoped dedicated token) — needed because the default
  `GITHUB_TOKEN` can't write to a different repo. **Not yet exercised
  end-to-end:** no version has been tagged and pushed since this workflow
  was added, so the real `dpkg-deb` build, the cross-repo publish, and a
  real `apt install` on Debian all remain unconfirmed until the next
  release. **Next:** next time a version is bumped and tagged, watch this
  workflow's first real run; once a `.deb` is actually published, add the
  Linux download link/section to the landing page that was deliberately
  held back this session.
- **2026-07-30 — the .deb went live, and the CTA now leads with it.**
  Dispatched `package-linux.yml` for real via `workflow_dispatch` (added a
  `tag` input so it could target the existing `v0.1.0` release directly,
  instead of needing a version bump/new tag that would've left that new
  release missing the manually-built macOS assets). Hit three real,
  previously-undiscovered bugs, each fixed and verified before moving on:
  (1) `npm ci` failed on the Ubuntu runner — `package-lock.json`'s
  Linux-x64 optional-native-binding subtree was out of sync, invisible from
  macOS since `npm ci` here never even resolves that subtree; switched to
  `npm install`, which reconciles instead of hard-failing. (2) The
  standalone `tsc --noEmit` step failed on a fresh checkout —
  `next-env.d.ts` (declares static-image-import types) is gitignored and
  only generated by an actual Next.js command, so it existed on this
  session's own dev machine by accident (months of prior `next dev`/`build`
  runs) but not on CI; removed the redundant step since `next build` itself
  already type-checks and generates that file first. (3) The **big** one:
  vitest failed with 20 failures across 6 files. Root-caused by actually
  reproducing Linux locally in Docker (Docker Desktop was already installed
  — much faster than round-tripping through Actions) — `lib/config.ts`
  computes `AGENTS`/`ADAPTERS`/`SKILL_ADAPTERS` at module-load time via
  existence-gating real `~/AI-Native/*` directories (`lib/builtin-agents.ts`).
  All three exist on this dev machine, so 6 test files had silently relied
  on that real disk state instead of properly mocking `./config`, passing
  "by accident" for this whole project's history. Fixed each to mock
  `./config` explicitly (`resolve-known-skill.test.ts`,
  `save-skill-content-impl.test.ts`, and `skill-history-impl.test.ts`'s
  shared `mockAgents()` helper now also mocks `SKILL_ADAPTERS`;
  `get-effective-agents.test.ts`'s imposter-collision test now mocks a fake
  static `plh-ops` entry instead of assuming a real one exists;
  `run-verify-impl.test.ts`'s first 4 tests now mock a fake
  `ai-company-starter-main` entry and dynamically import per test). Also
  fixed one more of my own: `data-dir.test.ts`'s blank-override test was
  missed when `resolveDataDirFrom` gained an explicit `platform` param
  earlier this session, so it silently defaulted to `process.platform`
  (darwin here, linux on the runner). Confirmed the full 365-test suite
  passes for real on Linux (run as the container's non-root `node` user,
  matching how GitHub Actions' runners actually execute jobs — an earlier,
  root-run pass showed 3 further failures in `chmod`-based "unreadable
  file" tests that turned out to be a Docker-as-root artifact, not a real
  CI issue, since root bypasses Unix permission bits; confirmed by
  re-running as non-root). One self-inflicted scare along the way: bind-
  mounting this working directory straight into the Docker containers meant
  `npm install` there overwrote local `node_modules` with Linux-native
  binaries, briefly breaking the macOS `next build` — fixed with a plain
  `rm -rf node_modules && npm install` (the committed `package-lock.json`
  itself was never touched). With all of that fixed, re-dispatched the
  workflow: fully green, and `Alacran.deb` (19.2 MB,
  `application/x-debian-package`) is now a real asset on the public
  `v0.1.0` release — confirmed via `gh release view` and a `curl` of
  `.../releases/latest/download/Alacran.deb` returning HTTP 200 at the
  exact right size.
  With a real download to point at, rewrote the landing page's hero and
  closing-CTA copy to foreground the actual pitch: an AI-native framework
  for organizing and running your AI company, entirely on your own
  machine — nothing uploaded, nothing kept anywhere else. New eyebrow ("An
  AI-native framework that stays on your machine"), rewritten hero-sub and
  final-section copy, a third hero button ("Download for Linux (.deb)")
  alongside the macOS one, the "Download and open it" step card, the
  Windows/Linux FAQ answer (no longer "not yet"), and the requirements
  lists on `docs/` and `how-to-use/` all updated to cover Linux honestly.
  Kept `how-to-use/index.html`'s detailed install/update walkthrough
  Mac-first (it's a deep, narrative, step-by-step guide) but added short,
  accurate Linux asides (`apt install ./Alacran.deb`) at the install and
  update steps rather than leaving Linux silently unmentioned there.
  Verified visually via a local static server + Playwright at both desktop
  and a 390px mobile viewport — the three-button hero row wraps cleanly at
  both sizes (`.hero-cta` already had `flex-wrap`). **Next:** get a real
  Debian/Ubuntu machine to confirm `apt install`/launch-from-menu actually
  works for an end user, not just CI's headless self-test.
