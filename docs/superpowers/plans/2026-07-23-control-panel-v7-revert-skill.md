# AI-Native Control Panel v7 Slice: Revert a Skill to a Past Revision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Revert to this version" action to v6's History view, reusing v4's `saveSkillContent` action unchanged, plus fix a real Content/History state-sync gap this slice would otherwise inherit.

**Architecture:** Pure UI composition across three existing components (`SkillEditor`, `SkillHistory`, `SkillBrowser`) — no new `lib/` files, since reverting is mechanically identical to v4's existing save flow (write this content, commit it).

**Tech Stack:** Same as v1-v6 — Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui.

## Global Constraints

- No new Server Action and no new git wrapper anywhere in this slice — every write goes through the existing, unmodified `saveSkillContent` (v4).
- The revert confirmation dialog must diff CURRENT content vs. the TARGET revision's content — not the "what changed in that commit" diff already shown in the commit list (a different comparison that can differ if edits happened since that commit).
- The revert button must be disabled when current content already equals the target revision's content (mirrors `SkillEditor`'s existing `disabled={draft === savedContent}` pattern) and while `currentContent` is still `null` (not yet loaded).
- `SkillBrowser`'s `detail` state must update after ANY successful write (edit-save or revert) so switching Content ↔ History never shows stale content.

---

### Task 1: Fix the Content/History state-sync gap

**Files:**
- Modify: `components/skill-editor.tsx`
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SkillEditor`'s new `onSaved?: (newContent: string) => void` prop — consumed by `SkillBrowser` in this task, and by no one else (Task 3 will add the analogous wiring for `SkillHistory`'s own revert callback).

- [ ] **Step 1: Read the current `components/skill-editor.tsx` and `components/skill-browser.tsx` in full**

Both are existing files from v4/v6 — read before editing.

- [ ] **Step 2: Modify `components/skill-editor.tsx`**

Add an `onSaved` prop to the component signature and call it in `handleConfirmSave`:

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DiffView } from "@/components/diff-view"
import { saveSkillContent } from "@/lib/save-skill-content"

export function SkillEditor({
  path,
  initialContent,
  onSaved,
}: {
  path: string
  initialContent: string
  onSaved?: (newContent: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function startEditing() {
    setDraft(savedContent)
    setEditing(true)
    setMessage(null)
  }

  function cancelEditing() {
    setDraft(savedContent)
    setEditing(false)
    setMessage(null)
  }

  async function handleConfirmSave() {
    setPending(true)
    const result = await saveSkillContent(path, draft)
    setPending(false)
    setConfirmOpen(false)
    setMessage(result.message)
    if (result.saved) {
      setSavedContent(draft)
      setEditing(false)
      onSaved?.(draft)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap text-sm">{savedContent}</pre>
        <Button size="sm" variant="outline" onClick={startEditing}>
          Edit
        </Button>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[50vh] font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={draft === savedContent || pending}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                <DiffView oldText={savedContent} newText={draft} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Modify `components/skill-browser.tsx`**

Add `onSaved={(newContent) => setDetail(newContent)}` to the `<SkillEditor>` call site (the rest of the file is unchanged in this task — Task 3 will make the next round of edits to this same file):

```tsx
{!detailError && detail !== null && selected && (
  <SkillEditor path={selected.path} initialContent={detail} onSaved={(newContent) => setDetail(newContent)} />
)}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify the fix in the browser**

Run: `npm run dev`, open `/skills`, open any skill, click "Edit", make a small change, "Save", confirm it. Switch to "History", then switch back to "Content" — confirm the just-saved edit is still shown (NOT the pre-edit content). This is the regression that was latent before v6 added a second view to switch to. Stop the server after confirming.

- [ ] **Step 6: Commit**

```bash
git add components/skill-editor.tsx components/skill-browser.tsx
git commit -m "fix: keep skill content in sync across Content/History view switches"
```

---

### Task 2: Add the revert action to `SkillHistory`

**Files:**
- Modify: `components/skill-history.tsx`

**Interfaces:**
- Consumes: `saveSkillContent` from `lib/save-skill-content.ts` (existing, v4, unmodified); `DiffView`, `AlertDialog*` (existing).
- Produces: `SkillHistory`'s two new props (`currentContent`, `onReverted`) — consumed by `SkillBrowser` (Task 3).

- [ ] **Step 1: Read the current `components/skill-history.tsx` in full**

- [ ] **Step 2: Replace `components/skill-history.tsx` entirely with**

```tsx
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DiffView } from "@/components/diff-view"
import { getSkillHistory, getSkillRevision } from "@/lib/skill-history"
import { saveSkillContent } from "@/lib/save-skill-content"
import type { SkillCommit } from "@/lib/skill-history-impl"

export function SkillHistory({
  path,
  currentContent,
  onReverted,
}: {
  path: string
  currentContent: string | null
  onReverted: (newContent: string) => void
}) {
  const [commits, setCommits] = useState<SkillCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [oldContent, setOldContent] = useState("")
  const [newContent, setNewContent] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertMessage, setRevertMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCommits(null)
    setError(null)
    setSelectedIndex(null)
    setRevertMessage(null)
    async function load() {
      const result = await getSkillHistory(path)
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
      } else {
        setCommits(result.commits)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [path])

  async function selectCommit(index: number) {
    if (!commits) return
    setSelectedIndex(index)
    setDiffLoading(true)
    setRevertMessage(null)
    const commit = commits[index]
    const olderCommit = commits[index + 1]

    const [newResult, oldResult] = await Promise.all([
      getSkillRevision(path, commit.sha),
      olderCommit ? getSkillRevision(path, olderCommit.sha) : Promise.resolve({ ok: true, content: "", message: "" }),
    ])
    setDiffLoading(false)
    setNewContent(newResult.ok ? newResult.content : "")
    setOldContent(oldResult.ok ? oldResult.content : "")
  }

  async function handleConfirmRevert() {
    setReverting(true)
    const result = await saveSkillContent(path, newContent)
    setReverting(false)
    setConfirmOpen(false)
    setRevertMessage(result.message)
    if (result.saved) {
      onReverted(newContent)
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!commits) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commit history for this file yet.</p>
  }

  const canRevert =
    selectedIndex !== null && !diffLoading && !reverting && currentContent !== null && currentContent !== newContent

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {commits.map((commit, index) => (
          <button
            key={commit.sha}
            onClick={() => selectCommit(index)}
            className={`block w-full rounded p-2 text-left text-sm ${selectedIndex === index ? "bg-muted" : ""}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{commit.sha.slice(0, 7)}</span>{" "}
            <span className="text-xs text-muted-foreground">{new Date(commit.date).toLocaleString()}</span>
            <p>{commit.message}</p>
          </button>
        ))}
      </div>
      {selectedIndex !== null && (
        <div className="space-y-2 border-t pt-2">
          {diffLoading ? (
            <p className="text-sm text-muted-foreground">Loading diff…</p>
          ) : (
            <DiffView oldText={oldContent} newText={newContent} />
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={!canRevert}>
            Revert to this version
          </Button>
          {revertMessage && <p className="text-xs text-muted-foreground">{revertMessage}</p>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to this version?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                {currentContent !== null && <DiffView oldText={currentContent} newText={newContent} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRevert}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: two errors at `SkillHistory`'s only current call site in `components/skill-browser.tsx` (missing the two new required props) — this is expected since Task 3 wires them up. Confirm the errors are exactly about the missing `currentContent`/`onReverted` props and nothing else, then proceed (Task 3 fixes this).

- [ ] **Step 4: Commit**

```bash
git add components/skill-history.tsx
git commit -m "feat: add revert-to-this-version action to SkillHistory"
```

---

### Task 3: Wire `SkillHistory`'s new props into `SkillBrowser`; real revert verification

**Files:**
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `SkillHistory`'s `currentContent`/`onReverted` props (Task 2).
- Produces: nothing new for later tasks — this is the integration point, with a REAL revert-then-restore verification against `ai-company-starter-main`'s `stock-note.md`.

- [ ] **Step 1: Read the current `components/skill-browser.tsx` in full** (it was already touched once in Task 1 — read its current state, don't assume the original v6 content)

- [ ] **Step 2: Update the `SkillHistory` call site in `components/skill-browser.tsx`**

Replace:
```tsx
{view === "history" && selected && <SkillHistory path={selected.path} />}
```
with:
```tsx
{view === "history" && selected && (
  <SkillHistory
    path={selected.path}
    currentContent={detail}
    onReverted={(newContent) => {
      setDetail(newContent)
      setView("content")
    }}
  />
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors — this resolves the two errors expected at the end of Task 2.

- [ ] **Step 4: Real revert-then-restore verification against `ai-company-starter-main`'s `stock-note.md`**

Run `npm run dev`, open `/skills`, open `ai-company-starter-main`'s `stock-note` command, click "History". You should see the same 3 commits confirmed in v6 (`72978ae` initial, `3a61d38` +inert-line, `b09625d` -inert-line — exact SHAs may differ if this repo has since had other commits, but the +line/-line pair for this file should still be identifiable by message and by which one adds vs. removes the `<!-- verified via AI-Native control panel v4 -->` line).

1. Select the **middle** commit (the one that ADDED the inert line). Confirm the revert confirmation dialog's diff shows the line being ADDED relative to current content (since current content doesn't have it). Click "Confirm & commit". Confirm success message, confirm the view switches back to "Content", confirm the Content view now shows the file WITH the inert line.
2. Click "History" again, select the **newest** commit (the one that REMOVED the inert line — i.e., today's current real content before this test). Confirm the revert dialog's diff shows the line being REMOVED relative to what's now current (since step 1 added it back). Click "Confirm & commit". Confirm success, confirm Content view now shows the file WITHOUT the inert line again — restored to its original state.
3. Run `git -C ~/AI-Native/ai-company-starter-main log --oneline -5 -- .claude/commands/stock-note.md` and confirm two NEW commits now exist beyond the three from v4/v6, and `git -C ~/AI-Native/ai-company-starter-main diff HEAD~2 -- .claude/commands/stock-note.md` (adjust the range to cover just these two new commits) shows an empty net diff — proving the two reverts cancelled out, leaving the file's real content unchanged overall, same discipline as v4's original live test.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add components/skill-browser.tsx
git commit -m "feat: wire revert action into the skill detail panel"
```

---

### Task 4: README update and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: updated documentation — no new runtime code.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after "v6: skill edit history":

```markdown
## v7: revert to a past skill revision

The History view's per-commit diff now has a "Revert to this version"
button. It reuses the exact same save action v4's editor uses — reverting
is just "write this historical content as the new current content, then
commit" — so there's no new write surface to reason about, only a new way
to supply what gets saved. The confirmation dialog diffs the file's
current content against the version you're reverting to (not the
in-commit diff shown above it, since edits since that commit could make
the two differ). Switching between Content and History always reflects
the latest saved/reverted content now, fixing a staleness gap that existed
since v6 added a second view to switch to.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all 88 tests pass, unchanged by this slice (no new backend logic, no new test files).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Final manual pass**

Run `npm run dev`, repeat the state-sync check from Task 1 (edit+save, switch views, confirm no staleness) and confirm the History view for `stock-note` still shows the now-5-commit history correctly. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document reverting a skill to a past revision"
```
