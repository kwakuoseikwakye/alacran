# v15: Activity page restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session hit its subagent-spawn cap during v14; if
> that cap is still in effect, execute every task directly instead of
> dispatching implementer/reviewer subagents — read each target file
> first, apply the step's code exactly, run the listed test commands
> after every step, and self-review the whole branch before merging.

**Goal:** Replace `/activity`'s flat 3-column status board with a pinned
"Needs Attention" section plus a day-grouped, collapsible history feed, so
the page is no longer a single 12,000+px column.

**Architecture:** One new pure helper (`groupActivitiesByDay`), one new
small presentational component (`ActivityDayGroup`), and an in-place
rework of `ActivityBoard` to compose them. No Server Action, adapter, or
data-fetching changes — `app/activity/page.tsx` is untouched.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4,
existing shadcn `Card`/`Sheet`/`ScrollArea` primitives, Vitest.

## Global Constraints

- Do NOT edit `app/activity/page.tsx`, `lib/get-all-activities.ts`,
  `lib/adapters/types.ts`, or any adapter — this slice is presentation-only.
- Do NOT edit any `components/ui/*` primitive — reuse `Card`, `Sheet`,
  `SheetContent`, `SheetHeader`, `SheetTitle`, `ScrollArea` exactly as
  `components/activity-board.tsx` already imports them today.
- The existing `openActivity` / `selected` / `detail` / `detailError`
  state machine and the `Sheet` detail view in `activity-board.tsx` must
  be preserved byte-for-byte in behavior (same Server Action call, same
  loading/error rendering) — only the list/grouping above it changes.
- `groupActivitiesByDay` takes an optional second parameter (reference
  "now", in epoch seconds) defaulting to the real clock, so tests never
  depend on the actual wall-clock date.
- "Today"/"Yesterday"/absolute-date labeling must compare calendar dates
  (year/month/day in local time), never raw timestamp subtraction.
- Needs Attention section renders only when at least one activity has
  `status === "needs-attention"` — no empty-state box when there are none.
- Only the first (newest) day group is expanded by default; every other
  day group starts collapsed.

---

### Task 1: `groupActivitiesByDay` helper

**Files:**
- Create: `lib/group-activities-by-day.ts`
- Test: `lib/group-activities-by-day.test.ts`

**Interfaces:**
- Consumes: `Activity` type from `lib/adapters/types.ts` (`id`, `agentId`,
  `type`, `timestamp` (epoch seconds), `title`, `status`, `detailPath` —
  already defined, no changes).
- Produces: `ActivityDayGroup = { key: string; label: string; activities:
  Activity[] }` and `groupActivitiesByDay(activities: Activity[], nowSeconds?:
  number): ActivityDayGroup[]` — Task 3 imports both from this file.

- [ ] **Step 1: Write the failing tests**

Create `lib/group-activities-by-day.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { groupActivitiesByDay } from "./group-activities-by-day"
import type { Activity } from "./adapters/types"

function ts(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m, d, h, min, 0).getTime() / 1000
}

function makeActivity(id: string, timestamp: number): Activity {
  return {
    id,
    agentId: "test-agent",
    type: "test",
    timestamp,
    title: id,
    status: "done",
    detailPath: "/tmp/test",
  }
}

describe("groupActivitiesByDay", () => {
  const now = ts(2026, 6, 15, 18, 0) // reference instant: July 15, 2026, 6pm local

  it("returns an empty array for no activities", () => {
    expect(groupActivitiesByDay([], now)).toEqual([])
  })

  it("labels the reference calendar day as Today", () => {
    const a = makeActivity("a1", ts(2026, 6, 15, 9, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("Today")
    expect(groups[0].activities).toEqual([a])
  })

  it("labels the calendar day before the reference day as Yesterday", () => {
    const a = makeActivity("a1", ts(2026, 6, 14, 23, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups[0].label).toBe("Yesterday")
  })

  it("labels older days with an absolute date", () => {
    const a = makeActivity("a1", ts(2026, 6, 10, 9, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups[0].label).toBe("July 10, 2026")
  })

  it("orders groups newest-day-first and activities within a group newest-first", () => {
    const older = makeActivity("older", ts(2026, 6, 10, 9, 0))
    const newerSameDay = makeActivity("newer-same-day", ts(2026, 6, 15, 14, 0))
    const earlierSameDay = makeActivity("earlier-same-day", ts(2026, 6, 15, 8, 0))
    const groups = groupActivitiesByDay([older, newerSameDay, earlierSameDay], now)
    expect(groups.map((g) => g.label)).toEqual(["Today", "July 10, 2026"])
    expect(groups[0].activities.map((a) => a.id)).toEqual(["newer-same-day", "earlier-same-day"])
  })

  it("puts activities under 24h apart but straddling local midnight into different day groups", () => {
    const lateYesterday = makeActivity("late-yesterday", ts(2026, 6, 14, 23, 30))
    const earlyToday = makeActivity("early-today", ts(2026, 6, 15, 0, 30))
    const groups = groupActivitiesByDay([lateYesterday, earlyToday], now)
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"])
    expect(groups[0].activities.map((a) => a.id)).toEqual(["early-today"])
    expect(groups[1].activities.map((a) => a.id)).toEqual(["late-yesterday"])
  })

  it("gives each group a stable, unique key", () => {
    const a = makeActivity("a", ts(2026, 6, 15, 9, 0))
    const b = makeActivity("b", ts(2026, 6, 10, 9, 0))
    const groups = groupActivitiesByDay([a, b], now)
    expect(new Set(groups.map((g) => g.key)).size).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/group-activities-by-day.test.ts`
Expected: FAIL — `Cannot find module './group-activities-by-day'`

- [ ] **Step 3: Implement**

Create `lib/group-activities-by-day.ts`:

```ts
import type { Activity } from "./adapters/types"

export type ActivityDayGroup = {
  key: string
  label: string
  activities: Activity[]
}

function startOfLocalDayMs(timestampSeconds: number): number {
  const d = new Date(timestampSeconds * 1000)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatAbsoluteDate(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function groupActivitiesByDay(
  activities: Activity[],
  nowSeconds: number = Date.now() / 1000
): ActivityDayGroup[] {
  const todayStartMs = startOfLocalDayMs(nowSeconds)
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000

  const buckets = new Map<number, Activity[]>()
  for (const activity of activities) {
    const dayStartMs = startOfLocalDayMs(activity.timestamp)
    const bucket = buckets.get(dayStartMs)
    if (bucket) {
      bucket.push(activity)
    } else {
      buckets.set(dayStartMs, [activity])
    }
  }

  const sortedDayStarts = Array.from(buckets.keys()).sort((a, b) => b - a)

  return sortedDayStarts.map((dayStartMs) => {
    const dayActivities = buckets
      .get(dayStartMs)!
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)

    let label: string
    if (dayStartMs === todayStartMs) {
      label = "Today"
    } else if (dayStartMs === yesterdayStartMs) {
      label = "Yesterday"
    } else {
      label = formatAbsoluteDate(dayStartMs)
    }

    return { key: String(dayStartMs), label, activities: dayActivities }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/group-activities-by-day.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/group-activities-by-day.ts lib/group-activities-by-day.test.ts
git commit -m "feat: add groupActivitiesByDay helper for the Activity page restructure"
```

---

### Task 2: `ActivityDayGroup` component

**Files:**
- Create: `components/activity-day-group.tsx`

**Interfaces:**
- Consumes: `Activity` from `lib/adapters/types.ts`; `StatusDot` from
  `components/status-dot.tsx` (v14, `{ status: ActivityStatus }` prop);
  `Card`/`CardHeader`/`CardTitle`/`CardContent` from
  `components/ui/card.tsx` (unchanged import shape used by the current
  `activity-board.tsx`).
- Produces: `ActivityDayGroup` component with props `{ label: string;
  activities: Activity[]; defaultExpanded: boolean; onSelect: (activity:
  Activity) => void }` — Task 3 renders one of these per day group.

This task has no separate unit test: it's a thin presentational
component whose only real logic (grouping, labeling) already has full
coverage in Task 1, and its expand/collapse toggle is covered by Task 4's
live verification (click-to-expand on a real collapsed day).

- [ ] **Step 1: Implement**

Create `components/activity-day-group.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusDot } from "@/components/status-dot"
import type { Activity } from "@/lib/adapters/types"

export function ActivityDayGroup({
  label,
  activities,
  defaultExpanded,
  onSelect,
}: {
  label: string
  activities: Activity[]
  defaultExpanded: boolean
  onSelect: (activity: Activity) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{label}</span>
        <span className="text-xs">
          {activities.length} {activities.length === 1 ? "activity" : "activities"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Card key={activity.id} className="cursor-pointer" onClick={() => onSelect(activity)}>
              <CardHeader className="p-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <StatusDot status={activity.status} />
                  {activity.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                {new Date(activity.timestamp * 1000).toLocaleString()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/activity-day-group.tsx
git commit -m "feat: add ActivityDayGroup collapsible section component"
```

---

### Task 3: Rework `ActivityBoard`

**Files:**
- Modify: `components/activity-board.tsx` (full replacement of the JSX
  body; the `selected`/`detail`/`detailError` state and `openActivity`
  function are kept as-is)

**Interfaces:**
- Consumes: `groupActivitiesByDay` + `ActivityDayGroup` type (Task 1),
  `ActivityDayGroup` component (Task 2), `StatusDot` (v14).
- Produces: `ActivityBoard({ activities }: { activities: Activity[] })` —
  same exported name and prop shape `app/activity/page.tsx` already
  passes, so that file needs no changes.

- [ ] **Step 1: Read the current file**

Read `components/activity-board.tsx` in full before editing — confirm it
still matches the version quoted in the design spec (no unrelated drift
since the spec was written). If it has changed, stop and reconcile before
proceeding; do not blind-overwrite.

- [ ] **Step 2: Replace the file contents**

Replace all of `components/activity-board.tsx` with:

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusDot } from "@/components/status-dot"
import type { Activity } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { groupActivitiesByDay } from "@/lib/group-activities-by-day"
import { ActivityDayGroup } from "@/components/activity-day-group"

export function ActivityBoard({ activities }: { activities: Activity[] }) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function openActivity(activity: Activity) {
    setSelected(activity)
    setDetail(null)
    setDetailError(null)
    try {
      const content = await getActivityDetail(activity.detailPath)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  const needsAttention = activities
    .filter((a) => a.status === "needs-attention")
    .sort((a, b) => b.timestamp - a.timestamp)
  const dayGroups = groupActivitiesByDay(activities)

  return (
    <>
      <div className="space-y-6">
        {needsAttention.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-destructive">Needs Attention</h2>
            <div className="space-y-2">
              {needsAttention.map((activity) => (
                <Card
                  key={activity.id}
                  className="cursor-pointer border-destructive/30"
                  onClick={() => openActivity(activity)}
                >
                  <CardHeader className="p-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <StatusDot status={activity.status} />
                      {activity.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {dayGroups.map((group, index) => (
            <ActivityDayGroup
              key={group.key}
              label={group.label}
              activities={group.activities}
              defaultExpanded={index === 0}
              onSelect={openActivity}
            />
          ))}
        </div>
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">
            {detailError && <p className="text-destructive">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-sm">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (existing 186 + Task 1's 7 new = 193)

- [ ] **Step 4: Commit**

```bash
git add components/activity-board.tsx
git commit -m "feat: restructure ActivityBoard into pinned Needs Attention + day-grouped history"
```

---

### Task 4: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry, following this project's established per-slice
  changelog convention)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v14 entry, if this plan runs right after v14) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v15 section**

Add, after the last existing section:

```markdown
## v15: Activity page restructure (piece 2 of 3)

Second of 3 slices for the visual/UX pass (v14 shipped the design system,
nav, and Agents page). The `/activity` page previously rendered a fixed
3-column status board where each column listed every matching activity
with no grouping or limit — a real screenshot before this work measured
the page at 12,000+px tall. Replaced with two sections: a "Needs
Attention" list pinned at the top (always expanded, so nothing that needs
action is ever buried in scroll), and a day-grouped history feed below it
— today's activities expanded by default, every earlier day collapsed
into a one-line, click-to-expand header. No data-fetching or adapter
changes; this is a client-side grouping and rendering change only, using
a new pure `groupActivitiesByDay` helper (unit tested for the
midnight-straddling edge case) and a new `ActivityDayGroup` component.

One more slice follows: v16 covers the Skills page, remaining dialogs,
and a full responsive audit at phone/tablet/desktop widths.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port (check `lsof -i :3700` etc. first;
do not reuse a port already serving something else). Using Playwright (or
equivalent browser tool):

1. Navigate to `/activity`. Confirm: a "Needs Attention" section appears
   at the top only if at least one such activity exists in real data;
   below it, day groups appear newest-first with only the first
   (newest/"Today", or the newest day present if nothing happened today)
   expanded.
2. Click a collapsed day group's header — confirm it expands in place
   and shows its activities with status dot, title, and timestamp.
   Click it again — confirm it collapses.
3. Click an activity card (in either the Needs Attention section or a day
   group) — confirm the existing detail `Sheet` opens with the correct
   title and loads real file content via `getActivityDetail`, exactly as
   it did before this slice.
4. Take one full-page screenshot for the record.

This live check does not touch any repository's git history or write any
files (unlike v14's company/avatar/skill-commit tests) — `/activity` is
read-only — so there is nothing to revert afterward.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v15 Activity page restructure in README"
```
