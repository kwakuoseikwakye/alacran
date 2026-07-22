# AI-Native Control Panel — v7 Slice: Revert a Skill to a Past Revision

## Status
Approved for implementation planning (2026-07-23).

## Problem

v6 shipped a read-only history/diff viewer for skill edits, deliberately
deferring any write action ("no revert/checkout-to-a-past-version action
— this is a viewer, not a write action"). This closes that gap: a "Revert
to this version" action from within the History view.

The key design insight that keeps this slice small: reverting to a past
revision is mechanically identical to v4's existing save flow — "write
this specific content as the file's new content, then commit" is exactly
what `saveSkillContent(path, content)` already does. No new Server Action,
no new git wrapper, no new security check is needed; this slice is almost
entirely UI composition on top of already-shipped, already-hardened
backend code (`lib/save-skill-content.ts` from v4, `lib/skill-history.ts`
from v6).

**A real interaction gap found while designing this, fixed as part of it:**
`SkillBrowser`'s Content/History toggle conditionally unmounts/remounts
`SkillEditor` on every view switch, and `SkillEditor`'s `initialContent`
prop comes from `SkillBrowser`'s own `detail` state — which v4/v6 never
updated after a successful save. Today: edit and save a skill, switch to
History, switch back to Content, and you'd see the pre-edit content again
(the file and git history are correct; only the displayed state is stale).
Reverting will hit the identical bug in the opposite direction (revert,
switch to Content, see pre-revert content), so this spec fixes the root
cause — keeping `SkillBrowser`'s `detail` state in sync after ANY
successful write, not just revert's own.

## Goals

- A "Revert to this version" button on the commit diff view already shown
  when a commit is selected in `SkillHistory` (v6).
- Clicking it opens a confirmation dialog showing the diff between the
  file's CURRENT live content and the historical version being reverted to
  (not the "what changed in that commit" diff already shown above it —a
  distinct comparison, since edits since that commit could mean the two
  diffs differ).
- Confirming calls the existing `saveSkillContent(path, historicalContent)`
  action unchanged — same single-file-scoped git commit v4 already
  produces, just with historical content instead of user-typed content.
- The button is disabled when the current content already matches the
  selected historical version (mirrors `SkillEditor`'s existing
  `disabled={draft === savedContent}` pattern) — no point reverting to
  what's already there.
- Fix the Content/History state-sync gap: after ANY successful write
  (edit-save from `SkillEditor`, or revert from `SkillHistory`),
  `SkillBrowser`'s `detail` state updates immediately, so switching
  between Content and History always reflects the true current content
  without needing to close and reopen the Sheet.

## Non-goals

- No new Server Action, no new git wrapper — this reuses
  `saveSkillContent`/`saveSkillContentImpl` (v4) and
  `getSkillRevision`/`getSkillHistory` (v6) exactly as they are.
- No "preview before revert" beyond the confirmation dialog's diff — no
  separate preview mode.
- No multi-file/bulk revert — one file, one revert action, same scope as
  every write action so far.
- No changes to `saveSkillContentImpl`'s commit message format (it already
  produces `Edit <fileName> via AI-Native control panel` regardless of
  whether the "new content" being saved came from a textarea edit or a
  historical revision — a distinct "Revert..." message is a nice-to-have,
  not required for this slice to work correctly, and changing it isn't
  needed for any stated goal above).

## Architecture

```
components/
├── skill-editor.tsx    # MODIFIED: adds an onSaved callback prop
├── skill-history.tsx   # MODIFIED: adds revert button + confirm dialog
└── skill-browser.tsx   # MODIFIED: wires onSaved/onReverted to keep `detail` in sync
```

No `lib/` changes at all — this is the first slice since v1 that adds zero
new backend files, reusing v4's and v6's Server Actions wholesale.

### `SkillEditor`

Gains an optional `onSaved?: (newContent: string) => void` prop, called
inside `handleConfirmSave` alongside the existing `setSavedContent`/
`setEditing(false)` whenever `result.saved` is true.

### `SkillHistory`

Gains two new props: `currentContent: string | null` (the file's live
content, fed from `SkillBrowser`'s existing `detail` state) and
`onReverted: (newContent: string) => void`. Adds:
- A "Revert to this version" button below the existing per-commit diff,
  disabled while the diff is loading, while a revert is in flight, or
  when `currentContent` already equals the selected revision's content.
- A confirmation `AlertDialog` (same component already used by
  `SkillEditor`) showing `DiffView oldText={currentContent} newText={<selected revision's content>}`
  — the current-vs-target-revision comparison, not the in-commit diff.
- On confirm: calls `saveSkillContent(path, <selected revision's content>)`
  directly (the unmodified v4 action). On success, calls `onReverted` with
  the new content and shows the returned message; on failure, shows the
  message without calling `onReverted`.

### `SkillBrowser`

Passes `onSaved={(newContent) => setDetail(newContent)}` to `SkillEditor`,
and `currentContent={detail}` plus
`onReverted={(newContent) => { setDetail(newContent); setView("content") }}`
to `SkillHistory` — switching back to the Content view after a successful
revert so the user immediately sees the result, consistent with how a
successful edit-save already returns `SkillEditor` to its own read mode.

## Error handling

- Identical to v4's existing save path, since this literally calls the
  same action: a failed revert (e.g. nothing changed, or a commit
  failure) shows `result.message` inline and does not call `onReverted`,
  so the History view's own state (selected commit, diff shown) is
  undisturbed and the user can try again or pick a different commit.
- If `currentContent` is still `null` (Content hasn't finished loading
  yet when History is opened first), the revert button stays disabled
  rather than allowing a revert with an unknown "before" state.

## Testing

- No new `lib/*.test.ts` files — there is no new backend logic to unit
  test; `saveSkillContentImpl`, `getSkillRevisionImpl`, and
  `resolveKnownSkillPath` are exercised exactly as already covered in v4
  and v6.
- Manual verification (two parts, both required):
  1. **State-sync fix**: edit and save a skill's content, switch to
     History, switch back to Content, confirm the saved edit is shown
     (not the pre-edit content) — proves the fix, which was previously
     unreachable-but-latent before v6 added a second view to switch to.
  2. **Real revert, left net-zero**: against `ai-company-starter-main`'s
     `stock-note.md` (already has known history from v4's live test —
     initial commit, +inert-line commit, -inert-line commit). Revert to
     the middle (+line) commit's content, confirm the file now has the
     line and a new commit was created; then revert again to the newest
     (-line) commit's content, confirming the file is restored to its
     original content and a second new commit was created. Net content
     change across both: zero, matching the discipline already
     established in v4's own live test.

## Open items for v8+ (explicitly deferred, not decided here)

- A distinct "Revert..." commit message (vs. reusing "Edit... via AI-Native
  control panel").
- Spawning real Claude Code sessions for `ai-company-starter-main`'s other
  9 slash-commands.
- Triggering `plh-ops`'s daily-team-log on demand.
- Live log streaming.
- Reusable template mechanism for a second "AI company."
- Higgsfield avatars.
- User-typed commit messages for skill edits.
- The UI/visual design pass (still deferred at the user's request).
