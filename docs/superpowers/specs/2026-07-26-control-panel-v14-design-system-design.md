# AI-Native Control Panel — v14 Slice: Design System + Nav + Agents Page

## Status
Approved for implementation planning (2026-07-26). Brainstormed with the
visual companion (two mockup rounds, both approved by the user): dark
developer-tool aesthetic (Linear/Vercel-inspired), and — for a later
slice — grouped-by-day activity layout with older days collapsed.

## Problem

Real screenshots of all 3 pages (taken before this design work started,
not assumed from memory) surfaced concrete issues beyond "looks plain":
- Pure grayscale shadcn defaults — no color at all, so status text
  ("FAILED", "needs-attention") carries zero visual urgency despite being
  the single most actionable signal on the page.
- Several single-line fields (avatar URL, company name/path, commit
  messages) use multi-line `Textarea` because no `Input` primitive exists
  yet — visually oversized, placeholder text implies multi-line content
  that was never intended.
- The "Add a company" form has the same visual weight as an agent card,
  competing for attention with the actual agents.
- No real responsive behavior below `sm:` — never verified at an actual
  phone width.
- (Separately, `/activity` has a structural scale problem — 12,000+px of
  unbroken scroll with no grouping. That's this project's next slice,
  v15; this slice's token/primitive work is what v15 builds on.)

This is the first of 3 slices for the full pass (decomposed per the
brainstorming skill's guidance, since the full scope touches nearly every
component):
1. **This slice (v14)**: design tokens, the missing `Input` primitive, a
   reusable status indicator, nav, and the Agents (home) page.
2. **v15**: Activity page restructure (grouped-by-day, collapsed older
   entries, pinned Needs Attention).
3. **v16**: Skills page + dialogs + a full responsive audit (375/768/1280px)
   across all 3 pages.

No functional/business-logic change anywhere in any of the 3 — this is
purely the visual + layout layer on top of what already works.

## Goals (this slice)

- Replace `app/globals.css`'s token values with a dark-only palette
  (Linear/Vercel-inspired: near-black backgrounds, one indigo accent,
  three semantic status colors) — dark-only, not a light/dark toggle,
  per the user's explicit choice (this is a personal, single-operator
  tool kept open for hours; building and maintaining two full palettes
  doesn't earn its cost here).
- A new `components/ui/input.tsx` (shadcn's standard `Input` — this
  project has `Textarea` but never added `Input`), and swap every
  single-line field currently misusing `Textarea` to it: avatar URL,
  "Add a company" name/path, and the two commit-message fields
  (`SkillEditor`/`SkillHistory` — touched here even though those
  components mostly belong to v16's Skills-page pass, because the
  *primitive* itself and its first real usages belong with the
  foundational token slice, not scattered across later slices).
- A new `components/status-dot.tsx` — a small colored-dot + label,
  mapping `ActivityStatus` (`"done" | "needs-attention" | "unknown"`) to
  the new semantic colors, reusable here (agent cards) and in v15
  (activity board) without duplicating the mapping.
- Restyle `components/nav.tsx`: dark treatment, an active-route
  indicator (`usePathname`), small `lucide-react` icons per link
  (already an installed, unused dependency).
- Restyle the Agents home page: `app/page.tsx` (spacing, heading,
  responsive grid — 1 column base, 2 at `sm:`, room to go to 3 on wide
  screens given card min-width), `components/agent-card.tsx` (status-dot
  integration, kind-badge coloring, spacing/type hierarchy), and turn
  `components/add-company-form.tsx` into a collapsed-by-default
  disclosure (a small "+ Add company" trigger) instead of an
  always-open form with equal weight to real agent cards.

## Non-goals

- No `/activity` restructuring (v15) or `/skills` restructuring (v16) —
  those components get only what's unavoidable here (the `Input` swap
  for the two commit-message fields; nothing else).
- No light/dark toggle, no `next/font` custom typography (system font
  stack renders instantly with zero FOUC risk — not something requested,
  and this app doesn't need branded typography).
- No changes to `components/ui/{button,badge,card,alert-dialog,sheet,
  scroll-area,separator}.tsx` — all of them already reference CSS custom
  properties via Tailwind utility classes (`bg-primary`, `bg-card`,
  `text-foreground`, etc.), confirmed by reading each file directly, so
  the token change in `globals.css` cascades through them automatically.
  Task verification is a visual screenshot check, not a code edit.
- No new features, no changes to any `lib/` business logic, no changes
  to what any button/action actually does — purely visual + one
  structural change (the collapsed add-company disclosure).

## Architecture

```
app/
├── globals.css          # MODIFIED: dark-only tokens + success/warning
├── layout.tsx            # MODIFIED (if needed): verify no FOUC, base classes
└── page.tsx               # MODIFIED: spacing, responsive grid
components/
├── ui/input.tsx           # NEW: shadcn Input primitive
├── status-dot.tsx         # NEW: ActivityStatus -> colored dot + label
├── nav.tsx                 # MODIFIED: dark restyle, active state, icons
├── agent-card.tsx          # MODIFIED: status-dot, kind-badge color, spacing
├── add-company-form.tsx    # MODIFIED: Input swap, collapsed-by-default
├── agent-avatar-form.tsx   # MODIFIED: Input swap, restyle
├── agent-avatar.tsx        # MODIFIED: minor restyle (ring/border)
├── skill-editor.tsx        # MODIFIED: Input swap for commit-message field only
└── skill-history.tsx       # MODIFIED: Input swap for commit-message field only
```

### Token values (`app/globals.css`)

Replace the existing `:root` block's values (keep the same variable
names so every existing Tailwind utility class — `bg-primary`,
`text-foreground`, etc. — keeps working with zero call-site changes) and
add two new semantic tokens:

```css
:root {
  --radius: 0.625rem;
  --background: #0b0d12;
  --foreground: #e6e8eb;
  --card: #12151b;
  --card-foreground: #e6e8eb;
  --primary: #5865f2;
  --primary-foreground: #ffffff;
  --secondary: #1d2129;
  --secondary-foreground: #c7cbd3;
  --muted: #1d2129;
  --muted-foreground: #8b93a1;
  --accent: #1d2129;
  --accent-foreground: #e6e8eb;
  --destructive: #f75353;
  --success: #3ecf8e;
  --warning: #f5b93e;
  --border: #1d2129;
  --input: #1d2129;
  --ring: #5865f2;
}
```

Add `--color-success`/`--color-warning` to the existing `@theme inline`
block (mirroring how every other token is mapped there already) so
`bg-success`/`text-warning`/etc. Tailwind utilities become available the
same way `bg-primary`/`text-destructive` already are — no new build
config needed, Tailwind v4's `@theme inline` auto-generates matching
utilities for any custom property registered there.

### `components/status-dot.tsx`

```tsx
import type { ActivityStatus } from "@/lib/adapters/types"

const STATUS_STYLES: Record<ActivityStatus, { dot: string; label: string }> = {
  "done": { dot: "bg-success", label: "text-muted-foreground" },
  "needs-attention": { dot: "bg-destructive", label: "text-destructive" },
  "unknown": { dot: "bg-warning", label: "text-muted-foreground" },
}

export function StatusDot({ status }: { status: ActivityStatus }) {
  const style = STATUS_STYLES[status]
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
}
```
(Exact Tailwind class list finalized during implementation — this is the
shape, not necessarily the literal final file.)

### `components/ui/input.tsx`

Standard shadcn `Input` component (single-line `<input>` with the same
token-based styling treatment `Textarea` already uses) — added via the
same manual-file convention this project already follows for its other
`ui/` primitives (no `shadcn` CLI dependency assumed; write the file
directly, matching `textarea.tsx`'s existing structure).

## Error handling

N/A — no new logic, no new failure modes. The only "validation" is
visual: does contrast hold up (text readable against the new dark
backgrounds), does the collapsed add-company disclosure still submit
correctly through the existing `registerCompany` action unchanged.

## Testing

- No new `lib/` unit tests — this slice touches zero business logic.
  Existing 186 tests must keep passing unchanged (a pure CSS/JSX-styling
  change shouldn't touch any tested behavior, but every existing
  Server Action call site touched by the `Input` swap must still call
  the same actions with the same arguments).
- Manual verification (real, required): screenshot all changed states
  at 1280px width via Playwright, before/after comparison — home page
  (default and with the add-company disclosure expanded), and confirm
  status colors render correctly for at least one "needs-attention" and
  one "done" agent (real data already provides both, per the screenshots
  taken during brainstorming). Confirm the app still functions: register
  a company, save/remove an avatar, edit a skill and save with a typed
  commit message — using the same safe test targets already established
  in this project's history (a disposable `/tmp` directory for company
  registration, `stock-note.md` for the commit-message field) — this is
  a visual pass, but every action touched must still work, not just look
  different.

## Open items for v15/v16 (explicitly deferred, not decided here)

- Activity page grouped-by-day restructure (v15).
- Skills page, skill-editor/skill-history's remaining (non-input)
  styling, dialogs, and the full 375/768/1280px responsive audit (v16).
