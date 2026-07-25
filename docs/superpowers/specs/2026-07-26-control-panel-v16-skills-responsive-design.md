# v16: Skills page, remaining dialogs, and responsive audit — design spec

Piece 3 (final) of the visual/UX pass (v14 shipped the design system, nav,
and Agents page; v15 shipped the Activity page restructure). This slice
covers the Skills page, the dialogs neither v14 nor v15 touched, and a
real responsive audit at 375/768/1280px.

## Method

Unlike v14/v15's mockup-driven approach, this slice's scope comes from a
direct code + live-screenshot audit of the current app (not assumed from
memory), run before writing this spec:

- Read every remaining dialog-bearing component not already touched by
  v14 or v15: `skill-browser.tsx`, `company-command-runner.tsx`,
  `trigger-poll-button.tsx`, `verify-button.tsx`,
  `daily-team-log-button.tsx`, `remove-company-button.tsx`, `diff-view.tsx`,
  `log-tail-view.tsx`.
- Took real Playwright screenshots of all 3 pages (Agents, Activity,
  Skills) at 375px, 768px, and 1280px, plus the Skills detail Sheet at
  each width, running against the actual current app on a local dev
  server.

This surfaced four concrete, evidence-backed issues (not a hypothetical
audit checklist) — the rest of the app's pages already render correctly
at all three widths, confirmed by screenshot, and are explicitly **not**
touched by this slice.

## Findings and fixes

**1. Detail Sheets are cramped/overlapping below the `sm` breakpoint (real
bug, screenshotted at 375px).** `components/ui/sheet.tsx`'s base classes
are `w-3/4 ... sm:max-w-sm`. All three consumers —
`activity-board.tsx`, `skill-browser.tsx`, and `verify-button.tsx` — pass
`className="sm:max-w-xl"` to `SheetContent`, which only overrides the
`sm:` breakpoint's max-width; the mobile-width base class `w-3/4` (75%
viewport) is left in place in every one of them. At 375px this puts each
sheet at ~281px wide, leaving ~94px of the underlying page visible and
overlapping on the left, with the sheet's own content cramped into too
little width. **Fix:** change all three `className="sm:max-w-xl"`
occurrences to `className="w-full sm:max-w-xl"` — full width below the
`sm` breakpoint, the existing capped width at/above it. Confirmed at
768px and 1280px the current behavior is already correct (this is
purely a sub-640px bug), so only the mobile case changes.

**2. `DiffView`'s add/remove colors rely on a `dark:` variant that never
activates.** `app/globals.css` defines `@custom-variant dark (&:is(.dark
*))`, but no element in this app (checked `app/layout.tsx`) ever gets a
`.dark` class — this app is dark-only by design (v14), with no
light/dark toggle. `components/diff-view.tsx` currently renders added/
removed text as `text-green-700`/`text-red-700 dark:text-green-400
dark:text-red-400` — the `dark:` classes are dead code, and the
non-dark fallback colors (tuned for a light background) are legible but
inconsistent with this project's own dark-mode palette. **Fix:** replace
the raw Tailwind color classes with this project's own semantic tokens
from v14 (`text-success` / `text-destructive`, already defined in
`app/globals.css` and used by `StatusDot`), dropping the inert `dark:`
variants entirely.

**3. `CompanyCommandRunner`'s single-line fields still use `Textarea
rows={1}` instead of v14's `Input` primitive.** v14 swapped every
single-line field it touched (add-company form, avatar URL, both skill
commit-message fields) from `Textarea rows={1}` to the new `Input`
primitive, but didn't touch `company-command-runner.tsx` (it wasn't
identified at the time). Its per-field rendering already branches on
`field.multiline` (`rows={field.multiline ? 4 : 1}`) — genuinely
multi-line fields keep `Textarea`; fields where `field.multiline` is
`false` switch to `Input`, matching the rest of the app's post-v14
convention (this affects the `/decision`, `/create-epic`, `/digest`, and
other company-command forms rendered here — same underlying component,
different field configs).

**4. Skill entries have no kind-based coloring, unlike Agent cards
(v14).** `AgentCard` colors its kind badge (`pipeline`/`command-set`/
`report-log`) via a `KIND_BADGE_CLASS` map; `SkillBrowser`'s per-entry
badge (`SkillKind = "skill" | "command"`) is still a plain, uncolored
outline badge. **Fix:** add the equivalent small `KIND_BADGE_CLASS` map
for `SkillKind`'s 2 values in `skill-browser.tsx`, following the exact
pattern `agent-card.tsx` established — this is the only remaining place
in the app that renders a `kind`-shaped badge without v14's coloring.

## Non-goals

- No further changes to `app/page.tsx`, `app/activity/page.tsx`,
  `components/activity-board.tsx`, `components/activity-day-group.tsx`,
  or `components/nav.tsx` — those are v14/v15, already shipped, and the
  audit found no issues with them at any of the 3 widths.
- No changes to `app/skills/page.tsx` itself (container width, heading) —
  screenshotted at all 3 widths, no issue found; only the components it
  renders (`SkillBrowser` and what it opens) change.
- No pagination or virtualization for long skill lists — the audit found
  no overflow issue at any tested width; the grid already wraps correctly
  (`sm:grid-cols-2`).
- No changes to `trigger-poll-button.tsx`, `daily-team-log-button.tsx`,
  `remove-company-button.tsx`, or `log-tail-view.tsx` — read in full
  during the audit; each already uses only design-system tokens
  (`bg-muted`, `text-destructive`, etc.) with no hardcoded light-mode-
  oriented colors and no width issue at any tested breakpoint. Listed
  here explicitly so it's clear they were checked, not skipped.
  `verify-button.tsx` is the one exception — it shares finding 1's Sheet
  width bug and is fixed as part of that finding, not exempted here.
- No visual redesign of `CompanyCommandRunner`'s layout beyond the
  `Textarea`→`Input` swap for single-line fields — its structure (field
  list, Run button, log tail, diff, commit dialog) is otherwise unchanged.

## Testing

- No new pure-logic helpers in this slice (unlike v15's
  `groupActivitiesByDay`), so no new unit test file. `KIND_BADGE_CLASS`
  is a static lookup map, same shape as `agent-card.tsx`'s (untested
  there too — it's not logic, just a `Record` literal).
- Live/visual verification (same discipline as v14 Task 6 and v15 Task 4):
  re-screenshot the Skills detail Sheet at 375px to confirm it now fills
  the viewport width; re-trigger a real diff view to confirm the
  added/removed colors read clearly against the dark background; open a
  company-command form (e.g. `/decision` via `ai-company-starter-main`)
  to confirm single-line fields now render as `Input`; confirm the Skills
  page's kind badges now show the same coloring style as the Agents page.
  This is all read-only/no-commit verification except the company-command
  form check, which — if it goes as far as actually running a command —
  must follow this project's standing safe-test-target rule (disposable
  `/tmp` fixture or accepted real-content targets only, never
  `plh-takeshi-agent`/`plh-ops` directly); simply opening the form and
  confirming the `Input` renders does not require actually running the
  command, so the live check can stop there without needing to execute
  or commit anything.
