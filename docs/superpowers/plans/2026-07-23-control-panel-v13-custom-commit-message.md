# Control Panel v13: User-Typed Commit Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user optionally type a commit message when saving a skill edit or reverting to a past revision, falling back to today's auto-generated message when left blank.

**Architecture:** `saveSkillContentImpl` gains a new optional 4th parameter (`customMessage`, added AFTER the existing `execFn` parameter to keep its already-shipped test file passing unchanged), used verbatim (trimmed) when non-empty, otherwise the existing default. Both `SkillEditor` and `SkillHistory` gain a small optional text field in their confirm dialogs.

**Tech Stack:** Next.js Server Actions, Vitest with real temp-dir fixtures, existing shadcn `Textarea`/`AlertDialog`.

## Global Constraints

- **`lib/save-skill-content-impl.test.ts` must pass completely UNCHANGED** — the new `customMessage` parameter is added AFTER the existing `execFn` parameter, never before it, specifically so every existing call site (which passes at most 3 positional args) is unaffected.
- **Reject, don't truncate**, an overly long custom message (`MAX_COMMIT_MESSAGE_LENGTH = 500`) — before any write, matching this app's established boundary-validation discipline.
- **No change to any other existing behavior** in `saveSkillContentImpl` (path-containment/known-skill gates, no-op-when-unchanged, commit-failure handling).
- **TDD with real temp-dir fixtures.**
- Only `ai-company-starter-main`'s `stock-note.md` may be used for the live test; never `plh-takeshi-agent` or `plh-ops`.

---

### Task 1: Backend — optional custom commit message

**Files:**
- Modify: `lib/save-skill-content-impl.ts`
- Modify: `lib/save-skill-content.ts`
- Create: `lib/save-skill-content-impl.test.ts` additions (append new tests to the EXISTING file, do not remove/reorder any existing test)

**Interfaces:**
- Produces: `saveSkillContentImpl(filePath, newContent, execFn?, customMessage?)`, `saveSkillContent(filePath, newContent, customMessage?)` — Task 2's UI consumes the latter.

- [ ] **Step 1: Read the current `lib/save-skill-content-impl.ts` and `lib/save-skill-content-impl.test.ts` in full** — confirm the existing test file's exact call signatures before making any change, so you're certain the new parameter's position doesn't disturb them.

- [ ] **Step 2: Write the new failing tests, appended to the END of the existing `lib/save-skill-content-impl.test.ts`** (do not touch any existing `it(...)` block above them)

```ts
  it("uses a custom commit message verbatim when provided", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    const result = await saveSkillContentImpl(skillFile, "new", fakeExec, "Fix the onboarding step")

    expect(result).toEqual({ saved: true, message: "Saved and committed" })
    expect(calls[1]).toContain("Fix the onboarding step")
  })

  it("trims whitespace from a custom commit message", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    await saveSkillContentImpl(skillFile, "new", fakeExec, "  spaced out  ")

    expect(calls[1]).toContain("spaced out")
  })

  it("falls back to the default message when customMessage is blank/whitespace-only", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    await saveSkillContentImpl(skillFile, "new", fakeExec, "   ")

    expect(calls[1]).toContain("Edit SKILL.md via AI-Native control panel")
  })

  it("rejects an overly long custom commit message before writing anything", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    let execCalled = false
    const fakeExec: ExecFileFn = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    const tooLong = "a".repeat(501)
    const result = await saveSkillContentImpl(skillFile, "new", fakeExec, tooLong)

    expect(result).toEqual({ saved: false, message: "Commit message is too long (max 500 characters)" })
    expect(execCalled).toBe(false)
    const written = await readFile(skillFile, "utf-8")
    expect(written).toBe("old")
  })
```

- [ ] **Step 3: Run the tests to verify the new ones fail (existing ones should still pass)**

Run: `npx vitest run lib/save-skill-content-impl.test.ts`
Expected: the 5 pre-existing tests PASS, the 4 new ones FAIL (function signature doesn't accept `customMessage` yet).

- [ ] **Step 4: Modify `lib/save-skill-content-impl.ts`**

Replace its entire content with:

```ts
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveKnownSkillPath } from "./resolve-known-skill"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

const MAX_COMMIT_MESSAGE_LENGTH = 500

export async function saveSkillContentImpl(
  filePath: string,
  newContent: string,
  execFn?: ExecFileFn,
  customMessage?: string
): Promise<{ saved: boolean; message: string }> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return {
      saved: false,
      message:
        resolved.reason === "outside-root"
          ? "Refusing to write a path outside configured agent directories"
          : "Refusing to write a path that is not a known skill/command file",
    }
  }

  let currentContent: string
  try {
    currentContent = await readFile(resolved.realPath, "utf-8")
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }

  if (currentContent === newContent) {
    return { saved: false, message: "No changes to save" }
  }

  const trimmedMessage = customMessage?.trim()
  if (trimmedMessage && trimmedMessage.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return {
      saved: false,
      message: `Commit message is too long (max ${MAX_COMMIT_MESSAGE_LENGTH} characters)`,
    }
  }

  try {
    await writeFile(resolved.realPath, newContent, "utf-8")
    const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)
    const fileName = path.basename(resolved.realPath)
    const commitMessage = trimmedMessage || `Edit ${fileName} via AI-Native control panel`
    await commitFile(resolved.agentRootPath, relativePath, commitMessage, execFn)
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 5: Run the test to verify everything passes**

Run: `npx vitest run lib/save-skill-content-impl.test.ts`
Expected: PASS, all 9 tests (5 pre-existing, unchanged, + 4 new).

- [ ] **Step 6: Modify `lib/save-skill-content.ts`**

Replace its entire content with:

```ts
"use server"

import { saveSkillContentImpl } from "./save-skill-content-impl"

export async function saveSkillContent(
  filePath: string,
  newContent: string,
  customMessage?: string
): Promise<{ saved: boolean; message: string }> {
  return saveSkillContentImpl(filePath, newContent, undefined, customMessage)
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (155 prior + 4 new = 159).

- [ ] **Step 8: Commit**

```bash
git add lib/save-skill-content-impl.ts lib/save-skill-content.ts lib/save-skill-content-impl.test.ts
git commit -m "feat: support an optional custom commit message when saving a skill edit"
```

---

### Task 2: UI — commit-message field in both confirm dialogs

**Files:**
- Modify: `components/skill-editor.tsx`
- Modify: `components/skill-history.tsx`

**Interfaces:**
- Consumes: `saveSkillContent(path, content, customMessage?)` (Task 1).
- Produces: nothing for later tasks — final integration point.

- [ ] **Step 1: Read the current content of both files in full** before editing (neither has changed since v7's slice, but confirm before assuming).

- [ ] **Step 2: Modify `components/skill-editor.tsx`**

Add a new state alongside the existing ones:
```tsx
const [commitMessage, setCommitMessage] = useState("")
```

In `startEditing`, reset it alongside `draft`:
```tsx
function startEditing() {
  setDraft(savedContent)
  setCommitMessage("")
  setEditing(true)
  setMessage(null)
}
```

In `cancelEditing`, reset it too:
```tsx
function cancelEditing() {
  setDraft(savedContent)
  setCommitMessage("")
  setEditing(false)
  setMessage(null)
}
```

In `handleConfirmSave`, pass the trimmed custom message (or `undefined` if empty):
```tsx
async function handleConfirmSave() {
  setPending(true)
  const result = await saveSkillContent(path, draft, commitMessage.trim() || undefined)
  setPending(false)
  setConfirmOpen(false)
  setMessage(result.message)
  if (result.saved) {
    setSavedContent(draft)
    setEditing(false)
    onSaved?.(draft)
  }
}
```

In the JSX, inside the `AlertDialogContent`, add a new field between `AlertDialogHeader` and `AlertDialogFooter`:
```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Commit message (optional)</label>
  <Textarea
    rows={1}
    value={commitMessage}
    onChange={(e) => setCommitMessage(e.target.value)}
    placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
  />
</div>
```

- [ ] **Step 3: Modify `components/skill-history.tsx`**

Add a new state alongside the existing ones:
```tsx
const [revertCommitMessage, setRevertCommitMessage] = useState("")
```

In `handleConfirmRevert`, pass the trimmed custom message:
```tsx
async function handleConfirmRevert() {
  setReverting(true)
  const result = await saveSkillContent(path, newContent, revertCommitMessage.trim() || undefined)
  setReverting(false)
  setConfirmOpen(false)
  setRevertMessage(result.message)
  if (result.saved) {
    onReverted(newContent)
  }
}
```

Add the `Textarea` import if not already present:
```tsx
import { Textarea } from "@/components/ui/textarea"
```

In the JSX, inside `AlertDialogContent`, add the same field between `AlertDialogHeader` and `AlertDialogFooter`:
```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Commit message (optional)</label>
  <Textarea
    rows={1}
    value={revertCommitMessage}
    onChange={(e) => setRevertCommitMessage(e.target.value)}
    placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
  />
</div>
```

Also reset `revertCommitMessage` to `""` in the existing `useEffect` (the one that resets `selectedIndex`/`revertMessage` when `path` changes) and in `selectCommit` (alongside `setRevertMessage(null)`), so a stale typed message from a previously-selected commit doesn't silently carry over to a different one.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/skill-editor.tsx components/skill-history.tsx
git commit -m "feat: add an optional commit-message field to the edit and revert dialogs"
```

---

### Task 3: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: updated documentation, a real verified live test.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v13: user-typed commit messages for skill edits

Both the skill editor's save dialog and the history view's revert dialog
now have an optional "Commit message" field. Left blank, the exact same
auto-generated message (`Edit <fileName> via AI-Native control panel`)
v4 always used is still what gets committed — nothing changes unless you
type something. Typed, that text becomes the commit message instead,
trimmed of surrounding whitespace and capped at 500 characters (rejected
outright above that, not truncated, matching every other length-validated
field in this app).
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (155 prior + 4 new = 159).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real live verification — `stock-note.md` only**

Run `npm run dev`, open `/skills`, open `ai-company-starter-main`'s
`stock-note` command.
1. Click Edit, make an inert change (e.g. re-add or remove the
   `<!-- verified via AI-Native control panel v4 -->` line, same as prior
   slices' live tests), type a custom commit message (e.g. "TEST:
   verifying custom commit messages, safe to revert"), Save.
2. Confirm via `git -C ~/AI-Native/ai-company-starter-main log -1 --format=%s -- .claude/commands/stock-note.md` that the commit message is EXACTLY the typed text.
3. Edit again, restore the original content, type a second custom message
   (e.g. "TEST: reverting the above, net-zero"), Save.
4. Confirm via `git -C ~/AI-Native/ai-company-starter-main diff HEAD~2 -- .claude/commands/stock-note.md` that the net content change across the two new commits is empty (leaving the file byte-identical to before this test), and confirm both commit messages in `git log --oneline -3` are exactly what was typed, not the auto-generated default.
5. Confirm `~/AI-Native/plh-takeshi-agent` was never touched (`git status --short` clean).

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document custom commit messages for skill edits"
```
