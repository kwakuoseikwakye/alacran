# v15: Activity page restructure — design spec

Piece 2 of the 3-slice visual/UX pass (v14 shipped the design system, nav,
and Agents page). This slice restructures `/activity` only.

## Problem

The current `/activity` page (`app/activity/page.tsx` +
`components/activity-board.tsx`) renders a fixed 3-column board — Needs
Attention / Done / Unknown — where each column lists every matching
activity with no grouping or limit. A real screenshot taken before this
work (`current-activity.png`, at 1280px width) measured **12,115px tall**:
the "Done" column alone has accumulated weeks of entries with nothing to
break them up. There's no way to see "what happened today" without
scrolling past everything.

## Approved direction (from the brainstorming mockup, "option A")

Two-part layout:

1. **Needs Attention — pinned, always expanded.** A section at the very
   top of the page listing every activity with `status === "needs-attention"`,
   regardless of date, sorted newest-first. This is the "don't make me
   hunt for it" section. If empty, the section itself is omitted (no
   empty-state box).
2. **History — grouped by calendar day, newest day first.** Every
   activity (all statuses, including ones also shown in Needs Attention —
   duplication here is fine and expected, since this section's job is
   complete chronological context, not triage) grouped into day buckets
   using the activity's local calendar date. Each day is a collapsible
   section:
   - **Today's group is expanded by default.** Every earlier day starts
     **collapsed**, rendered as a single clickable header row (date +
     count, e.g. "July 24 · 6 activities") that expands in place on
     click.
   - Within an expanded day group, activities render as a flat
     chronological list (newest first) — no per-status sub-columns. Each
     row keeps exactly what the current board already shows per activity
     (status dot, title, time) — no new per-row data. Cross-agent
     disambiguation is out of scope for this slice: `Activity` carries
     only `agentId`, not a resolved agent name, and adding that lookup is
     unrelated to the grouping restructure this slice targets.
   - Day headers use absolute dates ("July 24, 2026"), except the two
     most recent calendar days, labeled "Today" and "Yesterday" — this
     matches how the Agents page already renders absolute timestamps, so
     only the two special-cased labels are new.

Clicking any activity row (in either section) opens the existing detail
`Sheet` unchanged — same `getActivityDetail` Server Action, same
`ScrollArea`, same loading/error states. No change to data fetching:
`getAllActivities` / `mergeAndSortActivities` already return every
activity up front; this slice only changes how that flat array is
grouped and rendered client-side.

## Non-goals

- No pagination, infinite scroll, or date-range filtering — grouping and
  collapsing already solves the height problem; a further "load more"
  mechanism is not needed until proven necessary.
- No change to `getAllActivities`, `mergeAndSortActivities`, or any
  adapter — this is a presentation-only restructure of
  `components/activity-board.tsx` (which will be renamed in spirit but
  the file itself is reworked in place, not replaced, since it's the only
  consumer of the Sheet/detail logic).
- No change to the Agents (`/`) or Skills (`/skills`) pages — those are
  v14 (shipped) and v16 (not yet started) respectively.
- No new persisted state (e.g. "remember which days I expanded" across
  reloads) — collapse state resets to the default (today open, rest
  closed) on every page load, matching this project's existing
  `force-dynamic`, no-client-persistence convention.

## Component shape

- `components/activity-board.tsx` — reworked in place:
  - Splits the incoming `activities` prop into the pinned Needs Attention
    list and the day-grouped History list (plain array logic, no new
    Server Action).
  - Renders the Needs Attention section (if non-empty), then the History
    section as a list of day-group components.
  - Keeps the existing `selected` / `detail` / `detailError` state and
    `openActivity` function, and the existing `Sheet` detail view,
    unchanged.
- A new small helper, `lib/group-activities-by-day.ts`, pure and unit
  tested: takes `Activity[]`, returns an ordered array of
  `{ label: string; activities: Activity[] }` groups (newest day first,
  activities within a group newest first), using the user's local
  timezone (`Date` methods, no library). "Today"/"Yesterday" labels are
  computed by comparing calendar dates (year/month/day), not by
  timestamp subtraction, so a 2am activity yesterday and an 11pm activity
  today are correctly one calendar day apart even though they're less
  than 24 hours apart in absolute time.
- A new small presentational component, `components/activity-day-group.tsx`,
  holding its own `expanded` boolean state (default `true` only for the
  first/"Today" group, `false` otherwise — the parent tells it via an
  `defaultExpanded` prop whether it's the first group).

## Testing

- `lib/group-activities-by-day.test.ts`: empty input; single activity;
  multiple activities same day; activities spanning several days
  (ordering newest-first); "Today"/"Yesterday" boundary using two
  timestamps that are >24h apart in absolute terms but land on the
  literal same calendar day, and vice versa (a pair <24h apart that
  straddles local midnight) — this is the one genuinely tricky case
  worth a dedicated test.
- No new Server Action, so no new integration test beyond the existing
  `ActivityBoard` consumer — manual/live verification (real activity
  data from the three built-in agents, real click-to-expand, real
  detail-Sheet open) covers the rest, same as v14's Task 6.
