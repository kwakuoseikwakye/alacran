# Control Panel v12: Agent Avatars (Display-Only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set an avatar image URL for any agent (static or v11-registered company) and see it on that agent's card. No Higgsfield integration in this slice — deferred until that MCP is reachable in a session.

**Architecture:** A small CRUD registry (`lib/avatars-registry.ts`, mirroring v11's `companies-registry.ts`) persists `agentId -> imageUrl` to the control panel's own `.data/avatars.json`. Two Server Actions, two small UI components, wired into `AgentCard` and `app/page.tsx`.

**Tech Stack:** Next.js Server Actions, Vitest with real temp-dir fixtures.

## Global Constraints

- All avatar bookkeeping lives in the control-panel repo's own `.data/` — never inside any agent's directory.
- Reject-at-the-boundary: unknown `agentId` or a URL not starting with `https://`, `http://`, or `data:image/` is rejected before any registry write.
- Zero-extra-parameter Server Actions — `registryPath` stays internal-only.
- TDD with real temp-dir fixtures — never touch the real `.data/avatars.json` or any real `~/AI-Native/` directory in a test.
- This slice never calls any Higgsfield tool — if one happens to be available when this is implemented, do not use it; the manual-URL flow is what ships here regardless.

---

### Task 1: Avatars registry (CRUD)

**Files:**
- Create: `lib/avatars-registry.ts`
- Create: `lib/avatars-registry.test.ts`

**Interfaces:**
- Produces: `AvatarEntry`, `getAvatars(registryPath?)`, `setAvatarImpl(agentId, imageUrl, registryPath?)`, `removeAvatarImpl(agentId, registryPath?)` — Task 2's Server Actions and Task 3's `app/page.tsx` consume these.

- [ ] **Step 1: Write the failing test `lib/avatars-registry.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "avatars-registry-data-"))
  registryPath = path.join(dataDir, "avatars.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: "/fake", kind: "pipeline" },
      { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake", kind: "command-set" },
    ],
  }))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("avatars-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    const { getAvatars } = await import("./avatars-registry")
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    await writeFile(registryPath, "{ not json")
    const { getAvatars } = await import("./avatars-registry")
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("sets a new avatar for a known agent", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    const result = await setAvatarImpl("ai-company-starter-main", "https://example.com/a.png", registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", imageUrl: "https://example.com/a.png" },
    ])
  })

  it("accepts a data:image/ URI", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    const dataUri = "data:image/svg+xml,<svg></svg>"
    const result = await setAvatarImpl("ai-company-starter-main", dataUri, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([{ agentId: "ai-company-starter-main", imageUrl: dataUri }])
  })

  it("upserts — setting a second time for the same agent replaces the first", async () => {
    const { setAvatarImpl, getAvatars } = await import("./avatars-registry")
    await setAvatarImpl("ai-company-starter-main", "https://example.com/first.png", registryPath)
    await setAvatarImpl("ai-company-starter-main", "https://example.com/second.png", registryPath)
    expect(await getAvatars(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", imageUrl: "https://example.com/second.png" },
    ])
  })

  it("rejects an unknown agentId", async () => {
    const { setAvatarImpl } = await import("./avatars-registry")
    const result = await setAvatarImpl("not-a-real-agent", "https://example.com/a.png", registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown agent" })
  })

  it("rejects a URL with a disallowed scheme", async () => {
    const { setAvatarImpl } = await import("./avatars-registry")
    const result = await setAvatarImpl("ai-company-starter-main", "javascript:alert(1)", registryPath)
    expect(result).toEqual({ ok: false, message: "Image URL must start with https://, http://, or data:image/" })
  })

  it("removes an existing avatar", async () => {
    const { setAvatarImpl, removeAvatarImpl, getAvatars } = await import("./avatars-registry")
    await setAvatarImpl("ai-company-starter-main", "https://example.com/a.png", registryPath)
    const result = await removeAvatarImpl("ai-company-starter-main", registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAvatars(registryPath)).toEqual([])
  })

  it("reports not-found when removing an agent with no avatar set", async () => {
    const { removeAvatarImpl } = await import("./avatars-registry")
    const result = await removeAvatarImpl("ai-company-starter-main", registryPath)
    expect(result).toEqual({ ok: false, message: "Not found" })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/avatars-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/avatars-registry.ts`**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"

export type AvatarEntry = { agentId: string; imageUrl: string }

const DEFAULT_REGISTRY_PATH = path.join(process.cwd(), ".data", "avatars.json")

export async function getAvatars(registryPath: string = DEFAULT_REGISTRY_PATH): Promise<AvatarEntry[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hasAllowedScheme(imageUrl: string): boolean {
  return imageUrl.startsWith("https://") || imageUrl.startsWith("http://") || imageUrl.startsWith("data:image/")
}

export async function setAvatarImpl(
  agentId: string,
  imageUrl: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown agent" }
  }
  if (!hasAllowedScheme(imageUrl)) {
    return { ok: false, message: "Image URL must start with https://, http://, or data:image/" }
  }

  const avatars = await getAvatars(registryPath)
  const withoutExisting = avatars.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify([...withoutExisting, { agentId, imageUrl }], null, 2), "utf-8")
  return { ok: true }
}

export async function removeAvatarImpl(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const avatars = await getAvatars(registryPath)
  if (!avatars.some((a) => a.agentId === agentId)) {
    return { ok: false, message: "Not found" }
  }
  const remaining = avatars.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify(remaining, null, 2), "utf-8")
  return { ok: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/avatars-registry.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (177 prior + 9 new = 186).

- [ ] **Step 6: Commit**

```bash
git add lib/avatars-registry.ts lib/avatars-registry.test.ts
git commit -m "feat: add an avatars registry (set/list/remove per agent)"
```

---

### Task 2: Server Actions

**Files:**
- Create: `lib/set-avatar.ts`
- Create: `lib/remove-avatar.ts`

**Interfaces:**
- Consumes: `setAvatarImpl`/`removeAvatarImpl` (Task 1).
- Produces: `setAvatar(agentId, imageUrl)`, `removeAvatar(agentId)` — Task 3's UI consumes both.

- [ ] **Step 1: Write `lib/set-avatar.ts`**

```ts
"use server"

import { setAvatarImpl } from "./avatars-registry"

export async function setAvatar(agentId: string, imageUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return setAvatarImpl(agentId, imageUrl)
}
```

- [ ] **Step 2: Write `lib/remove-avatar.ts`**

```ts
"use server"

import { removeAvatarImpl } from "./avatars-registry"

export async function removeAvatar(agentId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return removeAvatarImpl(agentId)
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/set-avatar.ts lib/remove-avatar.ts
git commit -m "feat: add set/remove-avatar server actions"
```

---

### Task 3: UI — avatar display, form, and wiring

**Files:**
- Create: `components/agent-avatar.tsx`
- Create: `components/agent-avatar-form.tsx`
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `setAvatar`/`removeAvatar` (Task 2), `getAvatars` (Task 1).
- Produces: nothing for later tasks — final integration point.

- [ ] **Step 1: Read the current content of `components/agent-card.tsx` and `app/page.tsx` in full** — both were modified by v11; confirm current state before editing.

- [ ] **Step 2: Write `components/agent-avatar.tsx`**

```tsx
export function AgentAvatar({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null
  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a static/local asset next/image can optimize
  return <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
}
```

- [ ] **Step 3: Write `components/agent-avatar-form.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
      <Textarea
        rows={1}
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

- [ ] **Step 4: Wire both into `components/agent-card.tsx`**

Add the imports:
```tsx
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
```

Add a new prop to `AgentCardProps`:
```tsx
avatarUrl?: string | null
```

Destructure it, and render `<AgentAvatar imageUrl={avatarUrl ?? null} />` inside `CardHeader`'s `CardTitle` (alongside the agent name — e.g. wrap the name and avatar together in a flex row), and render `<AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />` in `CardContent` alongside the other existing conditional buttons. Leave every other existing prop/render line untouched.

- [ ] **Step 5: Wire avatars into `app/page.tsx`**

Add the import:
```tsx
import { getAvatars } from "@/lib/avatars-registry"
```

Add `getAvatars()` to the existing top-level `Promise.all` that fetches `agents`/`adapters` (or a separate `await`, either is fine), then build a lookup map and pass it down:
```tsx
const avatars = await getAvatars()
const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
```
and pass `avatarUrl={avatarByAgentId[result.agent.id] ?? null}` to each `<AgentCard>` alongside its existing props.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/agent-avatar.tsx components/agent-avatar-form.tsx components/agent-card.tsx app/page.tsx
git commit -m "feat: add avatar display and set/remove form to agent cards"
```

---

### Task 4: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: updated documentation, a real verified live test.

- [ ] **Step 1: Update `README.md`**

Read the current file in full first. Add a new section after the most recent existing version section:

```markdown
## v12: agent avatars (display-only)

Every agent card (the 3 built-in agents and any v11-registered company)
now has an inline "Save avatar" field: paste an image URL
(`https://`/`http://`/`data:image/...`) and it's shown as a small round
image on the card. This slice is deliberately display-only — it does not
call Higgsfield's image-generation MCP, because that tool isn't reachable
in any session yet (added to local config via `claude mcp add`, but a
running session has to be started after that to see it). The registry
this slice ships (`agentId -> imageUrl`, a simple key-value set,
upserting on a second save) is exactly what a future "Generate with
Higgsfield" button would feed into — no changes needed here once that
tool is reachable, just a new button that calls it and passes the result
to the same `setAvatar` action.
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (177 prior + 9 new = 186).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Real live verification (required, fully local — no external dependency)**

Run `npm run dev`, load `/`. On any one of the 3 built-in agent cards,
paste a `data:image/svg+xml,...` inline data URI (a small inline SVG —
avoids any dependency on a real external image host) into the avatar
field and click "Save avatar." Confirm the image renders on the card.
Reload the page and confirm it's still there (persisted). Click
"Remove" and confirm it disappears and a reload doesn't bring it back.
Confirm `~/AI-Native/plh-takeshi-agent`, `~/AI-Native/ai-company-starter-main`,
and `~/AI-Native/plh-ops` were never touched (`git status --short` clean
in each — this feature never reads or writes anything inside any agent's
own directory, only the control-panel's own `.data/avatars.json`).

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document agent avatars (display-only)"
```
