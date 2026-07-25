# Control Panel v14: Design System, Nav, and Agents Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dark, Linear/Vercel-inspired design system (tokens, a missing `Input` primitive, a reusable status indicator), applied to the nav and the Agents home page. Piece 1 of 3 (v15: Activity page, v16: Skills page + dialogs + responsive audit).

**Architecture:** Token values live entirely in `app/globals.css` — every existing shadcn primitive (`Button`, `Badge`, `Card`, `AlertDialog`, etc.) already references them via Tailwind utility classes, so changing the tokens cascades automatically with zero edits to those files (confirmed by reading each one). New: `components/ui/input.tsx`, `components/status-dot.tsx`. Modified: nav, agent card, add-company form (becomes a collapsed disclosure), avatar form, the two commit-message fields, and the home page's own spacing/grid.

**Tech Stack:** Tailwind v4 CSS custom properties (`@theme inline`), shadcn-style primitives, `lucide-react` (already installed, previously unused).

## Global Constraints

- No business-logic changes anywhere — every Server Action call site touched by the `Input` swap (`registerCompany`, `setAvatar`/`removeAvatar`, `saveSkillContent`) must be called with the exact same arguments as before; only the input element changes from `Textarea` to `Input`.
- Do NOT edit `components/ui/{button,badge,card,alert-dialog,sheet,scroll-area,separator}.tsx` — the token change cascades through them automatically. If a visual check suggests one of them needs a change, stop and flag it rather than editing silently (the plan assumes zero changes needed there; if that assumption is wrong, that's worth surfacing, not quietly working around).
- Existing 186 tests must keep passing unchanged — this slice is CSS/JSX only, no test file should need editing.
- Live verification is required at the end (Task 6) — screenshots, not just "the build succeeded."

---

### Task 1: Design tokens, Input primitive, StatusDot

**Files:**
- Modify: `app/globals.css`
- Create: `components/ui/input.tsx`
- Create: `components/status-dot.tsx`

**Interfaces:**
- Produces: the new CSS custom properties (`--success`, `--warning`, plus the redefined base palette), `Input`, `StatusDot({ status })` — every later task consumes these.

- [ ] **Step 1: Read the current `app/globals.css` in full.**

- [ ] **Step 2: Replace the `:root` block's values and add `--success`/`--warning`**

Replace the existing `:root { ... }` block with:

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

In the existing `@theme inline { ... }` block, add two new lines alongside the existing `--color-destructive: var(--destructive);` line:
```css
  --color-success: var(--success);
  --color-warning: var(--warning);
```

Leave every other line in the file (the `@import`s, `@custom-variant dark`, the rest of `@theme inline`, the `body { ... }` rule) exactly as they are.

- [ ] **Step 3: Write `components/ui/input.tsx`** (shadcn's standard `Input`, matching this project's existing `textarea.tsx` conventions)

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 4: Write `components/status-dot.tsx`**

```tsx
import type { ActivityStatus } from "@/lib/adapters/types"

const STATUS_DOT_CLASS: Record<ActivityStatus, string> = {
  done: "bg-success",
  "needs-attention": "bg-destructive",
  unknown: "bg-warning",
}

export function StatusDot({ status }: { status: ActivityStatus }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all 186 tests pass unchanged (no test touches CSS or these two new, not-yet-wired-in files).

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/ui/input.tsx components/status-dot.tsx
git commit -m "feat: dark design tokens, Input primitive, StatusDot component"
```

---

### Task 2: Nav restyle

**Files:**
- Modify: `components/nav.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (pure Tailwind classes + `lucide-react` icons, which cascade the new tokens automatically via `text-foreground`/`text-primary`/etc.).
- Produces: nothing for later tasks.

- [ ] **Step 1: Replace `components/nav.tsx`'s entire content**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, Activity, BookOpen } from "lucide-react"

const LINKS = [
  { href: "/", label: "Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/skills", label: "Skills", icon: BookOpen },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-border bg-card px-4 py-3 text-sm">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

Note: this changes `Nav` from a Server Component to a Client Component (`usePathname` requires it) — this is expected and fine; `app/layout.tsx` does not need any change, it already just renders `<Nav />` as a child.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav.tsx
git commit -m "feat: restyle nav with dark theme, active state, and icons"
```

---

### Task 3: Agent card restyle

**Files:**
- Modify: `components/agent-card.tsx`

**Interfaces:**
- Consumes: `StatusDot` (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read the current `components/agent-card.tsx` in full** (shown in this plan below is its exact current content as of this writing — confirm it hasn't changed before editing).

- [ ] **Step 2: Replace `components/agent-card.tsx`'s entire content**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { TriggerPollButton } from "@/components/trigger-poll-button"
import { VerifyButton } from "@/components/verify-button"
import { DailyTeamLogButton } from "@/components/daily-team-log-button"
import { RemoveCompanyButton } from "@/components/remove-company-button"
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
import { StatusDot } from "@/components/status-dot"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
}

const KIND_BADGE_CLASS: Record<Agent["kind"], string> = {
  pipeline: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "command-set": "border-violet-500/30 bg-violet-500/10 text-violet-400",
  "report-log": "border-teal-500/30 bg-teal-500/10 text-teal-400",
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
}: AgentCardProps) {
  return (
    <Card className="transition-colors hover:border-border/80">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <AgentAvatar imageUrl={avatarUrl ?? null} />
            {agent.name}
          </span>
          <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
            {agent.kind}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <StatusDot status={latestActivity.status} />
              {latestActivity.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
            </p>
          </div>
        )}
        {launchdHealth && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/agent-card.tsx
git commit -m "feat: restyle agent card with status-dot and kind-badge coloring"
```

---

### Task 4: Add-company disclosure, avatar form, avatar, home page spacing

**Files:**
- Modify: `components/add-company-form.tsx`
- Modify: `components/agent-avatar-form.tsx`
- Modify: `components/agent-avatar.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Input` (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read the current content of all 4 files in full** before editing.

- [ ] **Step 2: Replace `components/add-company-form.tsx`'s entire content** (Input swap + collapsed-by-default disclosure)

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { registerCompany } from "@/lib/register-company"

export function AddCompanyForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit() {
    setPending(true)
    setMessage(null)
    const result = await registerCompany(name, rootPath)
    setPending(false)
    if (result.ok) {
      setName("")
      setRootPath("")
      setMessage(`Registered "${result.company.name}"`)
      setOpen(false)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add a company
      </Button>
    )
  }

  return (
    <div className="max-w-sm space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Add a company</h2>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second Co" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Local directory path</label>
        <Input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/AI-Native/second-co"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending || !name || !rootPath}>
          {pending ? "Adding…" : "Add company"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Replace `components/agent-avatar-form.tsx`'s entire content** (Input swap only, same logic)

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setAvatar } from "@/lib/set-avatar"
import { removeAvatar } from "@/lib/remove-avatar"

export function AgentAvatarForm({ agentId, currentUrl }: { agentId: string; currentUrl: string | null }) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl ?? "")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSave() {
    setPending(true)
    const result = await setAvatar(agentId, url)
    setPending(false)
    if (result.ok) {
      setMessage(null)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  async function handleRemove() {
    setPending(true)
    const result = await removeAvatar(agentId)
    setPending(false)
    if (result.ok) {
      setUrl("")
      setMessage(null)
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://... or data:image/..."
        className="text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleSave} disabled={pending || !url}>
          Save avatar
        </Button>
        {currentUrl && (
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Modify `components/agent-avatar.tsx`** (minor restyle — add a ring so the avatar reads clearly against the new dark card background)

```tsx
export function AgentAvatar({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null
  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a static/local asset next/image can optimize
  return <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-border" />
}
```

- [ ] **Step 5: Modify `app/page.tsx`** (spacing/heading/grid only — every existing data-fetching line stays exactly as-is)

Replace only the `return (...)` block's JSX (leave every import and every line above `return` untouched):

```tsx
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
        <p className="text-sm text-muted-foreground">Status, avatars, and quick actions for every managed agent.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          const isTakeshiAgent = result.agent.id === "plh-takeshi-agent"
          const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
          const isPlhOps = result.agent.id === "plh-ops"
          const isRegisteredCompany = !["plh-takeshi-agent", "ai-company-starter-main", "plh-ops"].includes(
            result.agent.id
          )
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
              pollStatus={isTakeshiAgent ? pollStatus : undefined}
              showVerifyButton={isAiCompanyStarterMain}
              showDailyTeamLogButton={isPlhOps}
              removable={isRegisteredCompany}
              avatarUrl={avatarByAgentId[result.agent.id] ?? null}
            />
          )
        })}
      </div>
      <AddCompanyForm />
    </main>
  )
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/add-company-form.tsx components/agent-avatar-form.tsx components/agent-avatar.tsx app/page.tsx
git commit -m "feat: collapse add-company into a disclosure, swap Textarea to Input, restyle home page"
```

---

### Task 5: Commit-message fields — Input swap only

**Files:**
- Modify: `components/skill-editor.tsx`
- Modify: `components/skill-history.tsx`

**Interfaces:**
- Consumes: `Input` (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read the current content of both files in full** before editing.

- [ ] **Step 2: In `components/skill-editor.tsx`**, change the `Textarea` import to also import `Input`:
```tsx
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
```
(keep `Textarea` — it's still used for the main content-editing field; only the commit-message field changes). Replace the commit-message field's `Textarea` element:
```tsx
<Textarea
  rows={1}
  value={commitMessage}
  onChange={(e) => setCommitMessage(e.target.value)}
  placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
/>
```
with:
```tsx
<Input
  value={commitMessage}
  onChange={(e) => setCommitMessage(e.target.value)}
  placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
/>
```
Leave every other line in the file untouched (the main `Textarea` for `draft`, the diff view, the confirm dialog structure, `handleConfirmSave`'s logic).

- [ ] **Step 3: In `components/skill-history.tsx`**, apply the identical substitution** for its commit-message field (`revertCommitMessage`). This file's ONLY `Textarea` usage is this one field (confirmed by reading the current file — there is no other `Textarea` in it), so REPLACE the `Textarea` import with `Input` entirely (do not keep both):
```tsx
import { Input } from "@/components/ui/input"
```
Then replace:
```tsx
<Textarea
  rows={1}
  value={revertCommitMessage}
  onChange={(e) => setRevertCommitMessage(e.target.value)}
  placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
/>
```
with:
```tsx
<Input
  value={revertCommitMessage}
  onChange={(e) => setRevertCommitMessage(e.target.value)}
  placeholder={`Edit ${path.split("/").pop() ?? path} via AI-Native control panel`}
/>
```
Leave every other line untouched.

- [ ] **Step 4: Verify types compile (this will also catch an unused `Textarea` import if Step 3 removed its only usage)**

Run: `npx tsc --noEmit`
Expected: no errors. If ESLint flags an unused import, remove it.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all 186 tests pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/skill-editor.tsx components/skill-history.tsx
git commit -m "feat: swap commit-message fields from Textarea to Input"
```

---

### Task 6: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: updated documentation, real visual + functional verification.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v14: design system, nav, and Agents page (piece 1 of 3)

The first of 3 slices for a full visual pass, brainstormed with real
screenshots of the app as it looked before this work (not assumed from
memory) and a browser-based mockup comparison. Dark, Linear/Vercel-
inspired palette (one indigo accent, three semantic status colors),
replacing the plain grayscale shadcn defaults — dark-only, not a
light/dark toggle, since this is a personal, single-operator tool kept
open for hours, not a multi-tenant product. A missing `Input` primitive
(this project only ever added `Textarea`) replaces every single-line
field that was awkwardly using a multi-line textarea. The "Add a
company" form — previously always-open with the same visual weight as a
real agent card — is now a collapsed disclosure. Nav gained an
active-route indicator and icons. No functional changes anywhere; every
existing action (register/remove a company, save/remove an avatar, edit
a skill, revert to a past revision) works exactly as before, just
restyled.

Two more slices follow: v15 restructures the Activity page (currently a
single 12,000+px column with no grouping), and v16 covers the Skills
page, remaining dialogs, and a full responsive audit at phone/tablet/
desktop widths.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all 186 tests pass, unchanged.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real visual + functional verification (required)**

Run `npm run dev`, load `/` in a browser (Playwright or equivalent) at
1280px width. Confirm:
- The dark palette renders (no leftover white backgrounds/light-mode
  artifacts anywhere on the page).
- At least one agent with `latestActivity.status === "needs-attention"`
  shows a red status dot, and at least one with `"done"` shows a green
  one (real data already provides both, confirmed during brainstorming
  screenshots).
- Kind badges are colored distinctly per `agent.kind`.
- "Add a company" starts collapsed; clicking it reveals the form with
  proper single-line `Input` fields (not oversized textareas).
- Nav shows the current route highlighted.
- Functional check (still real, still required — this is a styling
  pass, but every touched action must still work): register a
  disposable test company (a fresh `/tmp` directory with `.git` and
  `.claude`, same pattern as v11's live test — never `~/AI-Native/`),
  confirm it appears and can be removed again; set and remove an avatar
  using a `data:image/svg+xml,...` URI (same pattern as v12's live
  test); edit `ai-company-starter-main`'s `stock-note.md` with a typed
  commit message via the now-`Input`-based field, confirm the message
  lands in `git log`, then revert the change to leave the file
  net-zero — same discipline as v13's live test. Never touch
  `plh-takeshi-agent` or `plh-ops` directly.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the design system pass (piece 1 of 3)"
```
