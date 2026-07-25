# v16: Skills page, remaining dialogs, and responsive audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session hit its subagent-spawn cap (200/session)
> during v14 and it may still be in effect. If a task's implementer
> dispatch fails with a spawn-limit error, do not retry — execute that
> task (and any remaining tasks) directly instead: read the target file
> first, apply the step's code exactly, run the listed test commands,
> then self-review the whole branch before merging.

**Goal:** Fix four concrete, screenshot/code-confirmed issues found by a
real audit (not a hypothetical checklist): a mobile Sheet-width bug
affecting 3 components, dead `dark:` CSS classes in `DiffView`, a missed
`Textarea`→`Input` swap in `CompanyCommandRunner`, and missing kind-based
badge coloring on the Skills page.

**Architecture:** Four small, independent, presentation-only fixes across
existing files. No new components, no new Server Actions, no data-layer
changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4,
existing shadcn primitives (`Sheet`, `Input`, `Textarea`, `Badge`), Vitest.

## Global Constraints

- Do NOT edit `components/ui/sheet.tsx`, `components/ui/input.tsx`, or
  `components/ui/badge.tsx` — every fix in this plan is a **consumer**
  className/prop change, not a primitive change (the Sheet mobile-width
  bug is fixed per-consumer, matching this project's established
  don't-touch-`components/ui/*` discipline from v14).
- Do NOT edit `app/skills/page.tsx`, `app/activity/page.tsx`, or
  `app/page.tsx` — the audit found no issue with any of them.
- Do NOT edit `trigger-poll-button.tsx`, `daily-team-log-button.tsx`,
  `remove-company-button.tsx`, or `log-tail-view.tsx` — already checked,
  no fix needed.
- Every fix in this plan is presentation-only: no Server Action, adapter,
  or data-fetching logic changes anywhere in this plan.

---

### Task 1: Fix Sheet mobile width in all 3 consumers

**Files:**
- Modify: `components/activity-board.tsx`
- Modify: `components/skill-browser.tsx`
- Modify: `components/verify-button.tsx`

**Interfaces:** No prop/export changes — this is a className-only fix in
each file's existing `<SheetContent className="sm:max-w-xl">` usage.

- [ ] **Step 1: Read all 3 files first**

Read `components/activity-board.tsx`, `components/skill-browser.tsx`, and
`components/verify-button.tsx` in full. Confirm each still contains
exactly one `<SheetContent className="sm:max-w-xl">` occurrence. If any
file's surrounding code has drifted from what this plan expects, stop and
reconcile before editing.

- [ ] **Step 2: Change each occurrence**

In each of the 3 files, change:

```tsx
<SheetContent className="sm:max-w-xl">
```

to:

```tsx
<SheetContent className="w-full sm:max-w-xl">
```

This is the only change in this task — no other line in any of the 3
files is touched.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/activity-board.tsx components/skill-browser.tsx components/verify-button.tsx
git commit -m "fix: make detail Sheets full-width below the sm breakpoint"
```

---

### Task 2: Fix `DiffView` to use design-system tokens

**Files:**
- Modify: `components/diff-view.tsx` (full replacement)

**Interfaces:** No change to the exported `DiffView({ oldText, newText })`
signature — only the internal className logic changes.

- [ ] **Step 1: Read the current file**

Read `components/diff-view.tsx` in full — confirm it still matches:

```tsx
import { diffLines } from "diff"

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffLines(oldText, newText)
  return (
    <pre className="whitespace-pre-wrap text-xs">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "bg-green-500/20 text-green-700 dark:text-green-400"
              : part.removed
                ? "bg-red-500/20 text-red-700 dark:text-red-400 line-through"
                : ""
          }
        >
          {part.value}
        </span>
      ))}
    </pre>
  )
}
```

If it has drifted, stop and reconcile before editing.

- [ ] **Step 2: Replace with design-system tokens**

Replace the full file with:

```tsx
import { diffLines } from "diff"

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffLines(oldText, newText)
  return (
    <pre className="whitespace-pre-wrap text-xs">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "bg-success/20 text-success"
              : part.removed
                ? "bg-destructive/20 text-destructive line-through"
                : ""
          }
        >
          {part.value}
        </span>
      ))}
    </pre>
  )
}
```

`text-success` / `bg-success` / `text-destructive` / `bg-destructive` are
existing Tailwind utilities generated from this project's own
`--success`/`--destructive` CSS custom properties (`app/globals.css`,
v14) — the same tokens `components/status-dot.tsx` already uses. This
removes the previous `dark:` variants, which never activated in this
app (no element ever gets a `.dark` class).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/diff-view.tsx
git commit -m "fix: use design-system success/destructive tokens in DiffView"
```

---

### Task 3: Swap `CompanyCommandRunner`'s single-line fields to `Input`

**Files:**
- Modify: `components/company-command-runner.tsx`

**Interfaces:** No change to the exported `CompanyCommandRunner({
command })` signature. `CompanyCommandField.multiline: boolean` (from
`lib/company-commands/types.ts`) already exists and is unchanged.

- [ ] **Step 1: Read the current file**

Read `components/company-command-runner.tsx` in full — confirm the field
render block still matches:

```tsx
        {command.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && " *"}
            </label>
            <Textarea
              rows={field.multiline ? 4 : 1}
              value={values[field.key] ?? ""}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={running}
            />
          </div>
        ))}
```

If it has drifted, stop and reconcile before editing.

- [ ] **Step 2: Add the `Input` import**

Add, alongside the existing `Textarea` import (keep `Textarea` — it's
still used for genuinely multi-line fields):

```tsx
import { Input } from "@/components/ui/input"
```

- [ ] **Step 3: Branch the field render on `field.multiline`**

Replace the field render block from Step 1 with:

```tsx
        {command.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && " *"}
            </label>
            {field.multiline ? (
              <Textarea
                rows={4}
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={running}
              />
            ) : (
              <Input
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={running}
              />
            )}
          </div>
        ))}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/company-command-runner.tsx
git commit -m "feat: use Input for single-line company-command fields"
```

---

### Task 4: Kind-based badge coloring on the Skills page

**Files:**
- Modify: `components/skill-browser.tsx`

**Interfaces:** No change to the exported `SkillBrowser({ results,
entries })` signature. Consumes `SkillEntry["kind"]` (`"skill" |
"command"`, from `lib/skills/types.ts`, unchanged).

- [ ] **Step 1: Read the current file**

Read `components/skill-browser.tsx` in full — confirm the badge render
still matches:

```tsx
                        <CardTitle className="flex items-center justify-between text-sm font-medium">
                          <span>{entry.name}</span>
                          <Badge variant="outline">{entry.kind}</Badge>
                        </CardTitle>
```

If it has drifted, stop and reconcile before editing.

- [ ] **Step 2: Add the `KIND_BADGE_CLASS` map**

Add this constant near the top of the file, after the imports (following
the exact pattern `components/agent-card.tsx` established in v14):

```tsx
const KIND_BADGE_CLASS: Record<SkillEntry["kind"], string> = {
  skill: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  command: "border-blue-500/30 bg-blue-500/10 text-blue-400",
}
```

- [ ] **Step 3: Apply it to the badge**

Change:

```tsx
                          <Badge variant="outline">{entry.kind}</Badge>
```

to:

```tsx
                          <Badge variant="outline" className={KIND_BADGE_CLASS[entry.kind]}>
                            {entry.kind}
                          </Badge>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/skill-browser.tsx
git commit -m "feat: color-code Skills page kind badges"
```

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v15 entry, if this plan runs right after v15) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v16 section**

Add, after the last existing section:

```markdown
## v16: Skills page, remaining dialogs, and responsive audit (piece 3 of 3)

The third and final slice of the visual/UX pass (v14: design system, nav,
Agents page; v15: Activity page restructure). Unlike v14/v15, this
slice's scope came from a direct audit — reading every remaining
dialog-bearing component and taking real Playwright screenshots at
375/768/1280px — rather than a mockup, and fixed exactly what that audit
found: detail Sheets (Activity, Skills, and the verify-results dialog)
were cramped and overlapping the page below the 640px breakpoint, because
each consumer's `sm:max-w-xl` only overrides the desktop width, leaving
the Sheet primitive's own mobile-width default (`w-3/4`) in place; the
diff view's added/removed text colors relied on a `dark:` Tailwind
variant that never activates in this dark-only app, so it's now using
this project's own `--success`/`--destructive` design tokens instead;
the company-command runner's single-line fields still used a `rows={1}`
`Textarea` (the one place v14's `Input`-primitive sweep missed); and the
Skills page's kind badges ("skill"/"command") had no color coding, unlike
the Agents page. Every other page and component, at every tested width,
was already correct — this slice touches only what the audit confirmed
needed it.

This completes the 3-slice visual/UX pass.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all existing tests passing (no new tests
in this plan; see the design spec's Testing section for why)
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port. Using Playwright (or equivalent):

1. Resize to 375px width. Open the Skills detail Sheet (click any skill
   card) — confirm it now fills the viewport width instead of leaving
   the underlying page visible on the left. Repeat for the Activity
   page's detail Sheet and the Agents page's "Run verify" results Sheet
   (`ai-company-starter-main`'s card).
2. Resize to 768px and 1280px — confirm the same three Sheets still cap
   at their desktop width (unchanged from before this slice).
3. Open a skill's edit view, make a trivial in-memory change (do not
   save), open the save-confirmation dialog to trigger `DiffView` —
   confirm added text now renders in the project's success-green rather
   than the previous light-mode-oriented green, and is clearly legible
   against the dark background. Cancel without saving.
4. Open the Skills page, confirm the kind badges ("skill"/"command") now
   show distinct colors matching the Agents page's badge-coloring style.
5. Open a company-command form (e.g. `ai-company-starter-main`'s
   `/decision` or `/digest` command via the Skills page's "Run" tab) —
   confirm single-line fields now render as the `Input` primitive (not a
   1-row Textarea). Do not actually run the command — confirming the
   field renders correctly does not require executing or committing
   anything, so there is nothing to revert afterward.
6. Take one full-page screenshot at 375px and one at 1280px for the
   record.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v16 Skills page, dialogs, and responsive audit in README"
```
