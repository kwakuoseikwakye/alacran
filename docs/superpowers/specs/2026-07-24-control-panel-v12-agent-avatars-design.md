# AI-Native Control Panel — v12 Slice: Agent Avatars (Display-Only)

## Status
Approved for implementation planning (2026-07-24). Scoped autonomously
per standing delegation, with one explicit user decision already made:
Higgsfield's MCP server isn't available in any session yet (added to
local config via `claude mcp add`, but the currently-running session
predates that change and a fresh session hasn't picked it up), so the
user chose to build the display mechanism now and wire up actual
generation later once the MCP tools are reachable.

## Problem

The backlog item was "optional Higgsfield-generated agent avatars." With
no image-generation tool actually callable right now, the generation
half can't be built today. The display half — a way to associate an
image with an agent and show it on its card — is fully independent of
*how* the image was produced, and is real, valuable groundwork: once
Higgsfield's MCP is reachable in a later session, that slice only needs
to add a "Generate" button that calls it and feeds the result into this
same mechanism.

## Goals

- A small per-agent avatar registry (works for the 3 static agents AND
  any v11-registered company — avatars are agent-identity-scoped, not
  tied to whether the agent is static or registered).
- A small inline form on each `AgentCard`: a URL field + Save/Remove,
  showing the current avatar image if one is set.
- The stored value is a plain image URL (`https://`, `http://`, or a
  `data:image/...` inline data URI) — validated at the boundary, nothing
  fancier. The user pastes a URL to an already-existing image (from
  Higgsfield's own web app, any other host, or a data URI) for now.

## Non-goals

- No actual Higgsfield MCP integration in this slice — deferred until
  the tool is reachable in a session (tracked as an explicit follow-up,
  not forgotten).
- No image upload widget, no local-file-path support (serving arbitrary
  local files over HTTP for this purely cosmetic feature isn't worth the
  new attack surface it would add — a plain URL field covers the same
  need with zero new file-serving code).
- No avatar cropping/resizing UI — the `<img>` is simply sized/rounded
  via CSS; if a pasted image is an unusual aspect ratio it'll just look
  a little off, not a bug worth solving here.
- Not part of the deferred general UI/visual-design pass — this is one
  narrow, previously-scoped-and-approved backlog item, not an opening to
  redesign anything else.

## Architecture

```
lib/
├── avatars-registry.ts      # NEW: CRUD, same shape as v11's companies-registry.ts
├── set-avatar.ts            # NEW: "use server"
├── remove-avatar.ts         # NEW: "use server"
components/
├── agent-avatar.tsx         # NEW: <img> if a URL is set, else nothing
├── agent-avatar-form.tsx    # NEW: URL field + Save/Remove
└── agent-card.tsx           # MODIFIED: renders both
app/page.tsx                 # MODIFIED: fetches avatars alongside agents, passes down
```

### `lib/avatars-registry.ts`

```ts
export type AvatarEntry = { agentId: string; imageUrl: string }
```
- `getAvatars(registryPath?): Promise<AvatarEntry[]>` — reads
  `.data/avatars.json` (control-panel's own repo, gitignored — same
  "bookkeeping stays in our own app" rule as v8/v9/v11), `[]` if missing/
  unparseable.
- `setAvatarImpl(agentId, imageUrl, registryPath?): Promise<{ok:true}|{ok:false,message:string}>`
  — validates: `agentId` matches a currently-known agent (via
  `getEffectiveAgents()` — reject an avatar for a nonexistent agent, same
  "reject at the boundary" discipline as every other write action);
  `imageUrl` starts with `https://`, `http://`, or `data:image/` (reject
  anything else, e.g. `javascript:`, a bare relative path, `file://`).
  UPSERTS (replaces any existing entry for that `agentId` — this is a
  key-value set, not an append-only log like the companies registry, so
  setting a new avatar for an agent that already has one just replaces
  it, no "duplicate" rejection).
- `removeAvatarImpl(agentId, registryPath?): Promise<{ok:true}|{ok:false,message:string}>`
  — removes the matching entry; `{ok:false, message:"Not found"}` if
  none exists for that id.

### Server Actions

`lib/set-avatar.ts` / `lib/remove-avatar.ts` — zero-extra-parameter
`"use server"` wrappers, same split as every other write action in this
app (`registryPath` stays internal-only).

### UI

`components/agent-avatar.tsx`: `{ imageUrl }: { imageUrl: string | null }`
— renders a small rounded `<img>` if `imageUrl` is set, otherwise renders
nothing (no placeholder graphic — an empty state is fine, matching how
this app already handles "no activity yet" elsewhere: plain, unstyled
absence, not a stand-in icon).

`components/agent-avatar-form.tsx`: `{ agentId, currentUrl }` — a URL
text field (pre-filled with `currentUrl` if set) + "Save" button (calls
`setAvatar`) + "Remove" button (calls `removeAvatar`, only shown/enabled
when `currentUrl` is already set). Shows the action's returned message
inline, matching every other form in this app.

`components/agent-card.tsx` gains a new prop `avatarUrl?: string | null`,
rendering `<AgentAvatar imageUrl={avatarUrl ?? null} />` near the title
and `<AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />`
in the card body, alongside the existing conditional buttons.

`app/page.tsx`: alongside its existing `getEffectiveAgents()`/
`getEffectiveAdapters()` fetch, add `getAvatars()` (no "use server"
needed — called directly from this Server Component, same as
`getEffectiveAgents` already is), build an `agentId -> imageUrl` lookup
map, and pass `avatarUrl={avatarMap[result.agent.id]}` into each
`<AgentCard>`.

## Error handling

- Unknown `agentId` (doesn't match any currently-known agent) or a
  malformed `imageUrl` → typed refusal before any registry write.
- Registry read failures degrade to `[]`, never throwing past the module
  boundary — same as every other config/registry read in this app.
- No validation that the URL actually resolves to a real, loadable
  image — that's the browser's job when it tries to render the `<img>`
  tag; a broken URL just shows a broken-image icon, not a server error.

## Testing

- `lib/avatars-registry.ts`: unit tests with real temp-dir fixtures for
  every validation branch (unknown agentId, bad URL scheme, missing
  field, successful set/upsert/remove), mocking `getEffectiveAgents()` to
  control which agent ids are "known" — never touching the real
  `.data/avatars.json` or a real `~/AI-Native/` directory.
- Manual live-test (required, no external dependency needed since this
  slice never calls Higgsfield): load the dashboard, set an avatar URL
  (any small public test image URL, e.g. a stable placeholder-image
  service, or a `data:image/svg+xml,...` inline data URI to avoid any
  external network dependency at all) on one of the 3 static agents,
  confirm it renders on the card and survives a page reload, then remove
  it and confirm it disappears. This is fully local (no real agent
  directory touched at all — avatars are dashboard-only cosmetic data).

## Open items for a future slice (explicitly deferred, not decided here)

- Real Higgsfield MCP integration: a "Generate with Higgsfield" button
  that calls the MCP's image-generation tool with a per-agent prompt
  (e.g. derived from `agent.name`/`agent.kind`), and feeds the resulting
  image URL into this same `setAvatar` action — buildable as a small,
  additive slice once the MCP tools are reachable in a session, with
  zero changes needed to what this slice ships.
