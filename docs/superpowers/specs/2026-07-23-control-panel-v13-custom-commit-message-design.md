# AI-Native Control Panel — v13 Slice: User-Typed Commit Messages for Skill Edits

## Status
Approved for implementation planning (2026-07-23). Scoped autonomously
per standing delegation. Deliberately taken out of backlog order ahead of
v11 (reusable template mechanism — needs real architectural scoping) and
v12 (Higgsfield avatars — borders the deferred UI pass) since this one is
small and unambiguous.

## Problem

v4's `saveSkillContent` always generates the commit message
`Edit <fileName> via AI-Native control panel`. There's no way to say what
actually changed and why — every skill/command edit's git history looks
identical regardless of content.

## Goals

- An optional "Commit message" field in `SkillEditor`'s confirm-save
  dialog (the natural point — it's already where the user reviews the
  diff and commits). Left blank, behavior is byte-identical to today
  (the existing auto-generated message). Typed, that exact text (trimmed)
  becomes the commit message instead.
- Same treatment for `SkillHistory`'s revert action, since it calls the
  same `saveSkillContent` action — a revert is also "write this content,
  commit," and the same optional-message affordance should apply there
  too rather than being edit-only.
- Reject (not truncate) an overly long message at the boundary, matching
  this project's established validation discipline.

## Non-goals

- No commit message history/autocomplete/templates.
- No change to `saveSkillContentImpl`'s other behavior (the dual-gate
  path-containment + known-skill check, the no-op-when-unchanged case,
  the commit failure handling) — this only affects which string becomes
  the commit message.
- No multi-line commit message support beyond what a single-line input
  naturally allows (a plain text input's Enter key doesn't insert a
  newline, so this isn't something to specially guard against).

## Architecture

```
lib/
├── save-skill-content.ts        # MODIFIED: new optional 3rd param
└── save-skill-content-impl.ts   # MODIFIED: new optional 4th param (after execFn)
components/
├── skill-editor.tsx             # MODIFIED: commit-message field in confirm dialog
└── skill-history.tsx            # MODIFIED: same field in its revert confirm dialog
```

### `lib/save-skill-content-impl.ts`

**Parameter ordering is the one subtlety here**: the existing signature is
`saveSkillContentImpl(filePath, newContent, execFn?)`, and
`save-skill-content-impl.test.ts` (already shipped, must NOT be edited)
calls it with `execFn` as the 3rd positional argument in several tests.
Adding `customMessage` as a NEW 3rd parameter would silently break every
one of those calls (the injected fake `execFn` would be reinterpreted as
`customMessage`). Instead, `customMessage` becomes a NEW 4th parameter,
`execFn` stays exactly where it is:

```ts
saveSkillContentImpl(filePath: string, newContent: string, execFn?: ExecFileFn, customMessage?: string)
```

This is slightly unusual ordering (a real domain parameter after a DI
seam) but is the only option that keeps the existing, already-shipped
test file passing completely unchanged — the same "preserve exact
behavior for existing callers" discipline this project has applied
before (v6's `resolveKnownSkillPath` extraction, v9's `file-lock`
extraction).

Message selection:
```ts
const MAX_COMMIT_MESSAGE_LENGTH = 500
const trimmed = customMessage?.trim()
if (trimmed && trimmed.length > MAX_COMMIT_MESSAGE_LENGTH) {
  return { saved: false, message: `Commit message is too long (max ${MAX_COMMIT_MESSAGE_LENGTH} characters)` }
}
const commitMessage = trimmed || `Edit ${fileName} via AI-Native control panel`
```
This check runs BEFORE the file write (reject at the boundary, no partial
state) — same position as the existing no-op-when-unchanged check.

### `lib/save-skill-content.ts`

```ts
export async function saveSkillContent(
  filePath: string,
  newContent: string,
  customMessage?: string
): Promise<{ saved: boolean; message: string }> {
  return saveSkillContentImpl(filePath, newContent, undefined, customMessage)
}
```
`customMessage` is a real domain parameter (like `commandId`/
`relativeOutputPath` elsewhere in this app) — this is fine on the
`"use server"` boundary; only DI seams (`execFn`) must stay off it, which
this preserves (the public action never exposes `execFn`).

### `components/skill-editor.tsx`

New state `commitMessage` (string, default `""`), reset alongside `draft`
in `startEditing`/`cancelEditing`. A new field inside the confirm dialog,
above the existing diff or below it (implementer's choice, kept
consistent with `skill-history.tsx`'s placement below), labeled "Commit
message (optional)" with a placeholder showing the exact default that
will be used if left blank (computed the same way the backend computes
it: `Edit ${path.basename(path)} via AI-Native control panel` — computed
client-side purely for placeholder display, not sent anywhere). On
confirm, `saveSkillContent(path, draft, commitMessage || undefined)`.

### `components/skill-history.tsx`

Same treatment for the revert confirm dialog: a `revertCommitMessage`
state, the same field, `saveSkillContent(path, newContent, revertCommitMessage || undefined)`
in `handleConfirmRevert`.

## Error handling

- Overly long message → typed refusal before any write, exactly like
  every other boundary-validation in this app.
- Everything else (no-op-when-unchanged, path-containment/known-skill
  gates, commit failure) is completely unchanged — this slice only adds
  one new input to `saveSkillContentImpl`, it doesn't touch any existing
  code path's logic.

## Testing

- `lib/save-skill-content-impl.test.ts` (existing, unmodified) must pass
  completely as-is — the regression proof that the new 4th parameter
  doesn't disturb any existing caller.
- New tests: custom message used verbatim when provided and non-empty;
  default message used when `customMessage` is blank/whitespace-only/
  omitted; overly-long message rejected before any write occurs (assert
  the fake `execFn`/file content are untouched).
- Manual live-test (real, required, reusing the established safe target):
  edit `ai-company-starter-main`'s `stock-note.md` with a real custom
  commit message (e.g. "TEST: verifying custom commit messages, safe to
  revert"), confirm `git log -1` shows exactly that message, then revert
  the change (restoring original content) using a second custom message,
  leaving the file net-zero — same discipline as every prior live test
  against this file. Never test against `plh-takeshi-agent` or
  `plh-ops`.
