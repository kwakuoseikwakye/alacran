# Gated Template Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Tasks 12-13 are CONTROLLER-ONLY — do not dispatch them to a subagent.** They touch a real GitHub account and a real Vercel deployment and must only run after the controller explicitly asks the human partner for confirmation, per this project's standing safety rules.

**Goal:** Move the reusable template source (`templates/company-starter/` +
all 7 packs) out of the packaged `.app`/`.deb` entirely, behind a new
license-gated backend, so a downloaded build can no longer be unzipped for
free access to the framework — while a company a user actually creates
stays exactly as local and unaffected as it is today.

**Architecture:** Two repos. `control-panel` (this repo) loses the bundled
template files from its packaged output and gains a small fetch-and-cache
module gated by the app's existing license machinery. A new, separate,
private repo `alacran-template-server` holds the real template content plus
one license-validating API route, deployed to Vercel. In dev/test/CI
(`NODE_ENV !== "production"` or `LICENSE_BYPASS=1`), `control-panel` keeps
reading `templates/` locally exactly as today — nothing about local
development, the test suite, or CI changes.

**Tech Stack:** TypeScript, Node's `node:fs/promises`, Vitest (both repos),
Vercel serverless functions (Node runtime) for the new repo.

## Global Constraints

- A company a user creates keeps working exactly as it does today — fully
  local files, no new runtime dependency on network/license once created.
- **Gate everything**: the base skeleton (`templates/company-starter/`) and
  all 7 packs, not just the 6 differentiated ones.
- **Fetch once, cache locally**, gated by the app's *existing*
  `REVALIDATE_MS` (1 day) / `OFFLINE_GRACE_MS` (7 days) cadence from
  `lib/license/license-status-impl.ts` — reuse these constants, never
  redefine them.
- **Dev/test/CI must not require network or a real license.** When
  `isEnforced()` is false (mirroring `lib/license/license-actions.ts`'s
  existing rule: `NODE_ENV === "production" && !LICENSE_BYPASS`), template
  reads come straight from local `templates/` on disk, exactly as today.
- The new backend never trusts a client-side "already validated" claim — it
  re-validates the license key against Lemon Squeezy itself on every
  request.
- No new UI. Existing error-message plumbing (`result.message` surfaced by
  `components/add-company-form.tsx`) absorbs new failure strings.
- Executable bit: any file under `.claude/hooks/*.sh` must be written with
  mode `0o755` — this is the one place file permissions matter (verified:
  exactly the 5 hook scripts in `templates/company-starter/.claude/hooks/`
  are `755`; every other template file is plain `644`).
- All template file content is plain text (verified: no binary files exist
  anywhere under `templates/`) — a `Record<string, string>` JSON map is a
  safe wire format, no zip/tar handling needed.
- Per this project's standing safety rule: any live verification touching
  real company creation uses a freshly-created, self-destroyed `/tmp`
  directory only.
- Run `npx tsc --noEmit`, `npx vitest run`, `npm run build` (in whichever
  repo a task touches) after every code task; both must stay clean.

---

### Task 1: `lib/template-fetch/fetch-template.ts` — remote fetch call

**Files:**
- Create: `lib/template-fetch/fetch-template.ts`
- Test: `lib/template-fetch/fetch-template.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_SERVER_URL` from `lib/branding.ts` (does not exist yet
  — Task 6 adds it; for this task, add a temporary local default so the
  file compiles standalone: `const DEFAULT_SERVER_URL = "https://REPLACE-ME.vercel.app"`
  used only if no `serverUrl` argument is passed — Task 6 will wire the
  real import and this task's own tests don't depend on it).
- Produces: `FetchLike` type, `TemplateFetchResult` type,
  `fetchTemplateFiles(target, licenseKey, serverUrl?, fetchFn?)` — used by
  Task 4's orchestrator.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/template-fetch/fetch-template.test.ts
import { describe, it, expect } from "vitest"
import { fetchTemplateFiles } from "./fetch-template"
import type { FetchLike } from "./fetch-template"

describe("fetchTemplateFiles", () => {
  it("returns the files map when the server responds 200 with files", async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      json: async () => ({ files: { "README.md": "# Hi\n" } }),
    })
    const result = await fetchTemplateFiles("company-starter", "KEY", "https://example.test", fetchFn)
    expect(result).toEqual({ ok: true, files: { "README.md": "# Hi\n" } })
  })

  it("returns ok:false with the server's error message on a non-200 response", async () => {
    const fetchFn: FetchLike = async () => ({
      ok: false,
      json: async () => ({ error: "License is not valid" }),
    })
    const result = await fetchTemplateFiles("company-starter", "BAD-KEY", "https://example.test", fetchFn)
    expect(result).toEqual({ ok: false, message: "License is not valid" })
  })

  it("returns a generic message if the response is missing both files and an error", async () => {
    const fetchFn: FetchLike = async () => ({ ok: false, json: async () => ({}) })
    const result = await fetchTemplateFiles("company-starter", "KEY", "https://example.test", fetchFn)
    expect(result).toEqual({
      ok: false,
      message: "Could not fetch templates — check your license and connection.",
    })
  })

  it("returns a clear message if the network call throws", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network down")
    }
    const result = await fetchTemplateFiles("company-starter", "KEY", "https://example.test", fetchFn)
    expect(result).toEqual({
      ok: false,
      message: "Could not reach the template server. Check your connection and try again.",
    })
  })

  it("POSTs the license key and target to <serverUrl>/api/get-template", async () => {
    let sentUrl = ""
    let sentBody: string | undefined
    const fetchFn: FetchLike = async (url, init) => {
      sentUrl = url
      sentBody = init.body as string
      return { ok: true, json: async () => ({ files: {} }) }
    }
    await fetchTemplateFiles("packs/sales", "KEY-123", "https://example.test", fetchFn)
    expect(sentUrl).toBe("https://example.test/api/get-template")
    expect(JSON.parse(sentBody!)).toEqual({ license_key: "KEY-123", target: "packs/sales" })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/template-fetch/fetch-template.test.ts`
Expected: FAIL — module `./fetch-template` does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/template-fetch/fetch-template.ts
export type FetchLike = (
  url: string,
  init: RequestInit
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

export type TemplateFetchResult =
  | { ok: true; files: Record<string, string> }
  | { ok: false; message: string }

const DEFAULT_SERVER_URL = "https://REPLACE-ME.vercel.app"

const defaultFetch: FetchLike = (url, init) => fetch(url, init)

export async function fetchTemplateFiles(
  target: string,
  licenseKey: string,
  serverUrl: string = DEFAULT_SERVER_URL,
  fetchFn: FetchLike = defaultFetch
): Promise<TemplateFetchResult> {
  try {
    const res = await fetchFn(`${serverUrl}/api/get-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ license_key: licenseKey, target }),
    })
    const data = (await res.json()) as { files?: Record<string, string>; error?: string }
    if (!res.ok || !data.files) {
      return {
        ok: false,
        message: data.error ?? "Could not fetch templates — check your license and connection.",
      }
    }
    return { ok: true, files: data.files }
  } catch {
    return { ok: false, message: "Could not reach the template server. Check your connection and try again." }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/template-fetch/fetch-template.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add lib/template-fetch/fetch-template.ts lib/template-fetch/fetch-template.test.ts
git commit -m "Add fetchTemplateFiles: license-gated remote template fetch"
```

---

### Task 2: `lib/template-fetch/template-cache.ts` — local JSON cache

**Files:**
- Create: `lib/template-fetch/template-cache.ts`
- Test: `lib/template-fetch/template-cache.test.ts`

**Interfaces:**
- Consumes: `dataPath` from `../data-dir` (existing).
- Produces: `CachedTemplate` type, `readCache(target, filePath?)`,
  `writeCache(target, files, cachedAt, filePath?)` — used by Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/template-fetch/template-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readCache, writeCache } from "./template-cache"

let dir: string
let filePath: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "template-cache-test-"))
  filePath = path.join(dir, "cache.json")
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("template cache", () => {
  it("returns null when nothing has been cached yet", () => {
    expect(readCache("company-starter", filePath)).toBeNull()
  })

  it("round-trips a written cache", () => {
    writeCache("company-starter", { "README.md": "# Hi\n" }, 12345, filePath)
    expect(readCache("company-starter", filePath)).toEqual({
      files: { "README.md": "# Hi\n" },
      cachedAt: 12345,
    })
  })

  it("creates parent directories that don't exist yet", async () => {
    const nested = path.join(dir, "a", "b", "cache.json")
    writeCache("packs/sales", { "x.yaml": "version: 1\n" }, 1, nested)
    expect(readCache("packs/sales", nested)).toEqual({ files: { "x.yaml": "version: 1\n" }, cachedAt: 1 })
  })

  it("returns null for unparseable JSON rather than throwing", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises")
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, "not json", "utf-8")
    expect(readCache("company-starter", filePath)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/template-fetch/template-cache.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/template-fetch/template-cache.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { dataPath } from "../data-dir"

export type CachedTemplate = { files: Record<string, string>; cachedAt: number }

function defaultPathFor(target: string): string {
  return dataPath("template-cache", `${target}.json`)
}

export function readCache(target: string, filePath: string = defaultPathFor(target)): CachedTemplate | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as CachedTemplate
  } catch {
    return null
  }
}

export function writeCache(
  target: string,
  files: Record<string, string>,
  cachedAt: number,
  filePath: string = defaultPathFor(target)
): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify({ files, cachedAt }, null, 2), "utf-8")
}
```

Note: `target` may contain a `/` (e.g. `"packs/sales"`) — `defaultPathFor`
deliberately lets this create a nested `template-cache/packs/sales.json`
path rather than sanitizing the slash; `mkdirSync(..., { recursive: true })`
already handles creating that nested directory.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/template-fetch/template-cache.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/template-fetch/template-cache.ts lib/template-fetch/template-cache.test.ts
git commit -m "Add local JSON cache for fetched template files"
```

---

### Task 3: `lib/template-fetch/read-local-templates.ts` — dev/test/CI local reader

**Files:**
- Create: `lib/template-fetch/read-local-templates.ts`
- Test: `lib/template-fetch/read-local-templates.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_MANIFEST` from `../company-template-manifest`
  (existing).
- Produces: `readLocalTemplateFiles(target, templatesRoot)` — used by
  Task 4's orchestrator whenever `enforced` is false.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/template-fetch/read-local-templates.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

vi.mock("../company-template-manifest", () => ({
  TEMPLATE_MANIFEST: [".claude/hooks", "README.md", "secrets"],
}))

const { readLocalTemplateFiles } = await import("./read-local-templates")

let templatesRoot: string

beforeEach(async () => {
  templatesRoot = await mkdtemp(path.join(tmpdir(), "read-local-templates-"))
  await mkdir(path.join(templatesRoot, "company-starter", ".claude", "hooks"), { recursive: true })
  await writeFile(path.join(templatesRoot, "company-starter", ".claude", "hooks", "format-check.sh"), "#!/bin/sh\n")
  await writeFile(path.join(templatesRoot, "company-starter", ".claude", "hooks", ".DS_Store"), "junk")
  await writeFile(path.join(templatesRoot, "company-starter", "README.md"), "# Starter\n")
  await mkdir(path.join(templatesRoot, "company-starter", "secrets", "customers"), { recursive: true })
  await writeFile(path.join(templatesRoot, "company-starter", "secrets", "customers", ".gitkeep"), "")
  await mkdir(path.join(templatesRoot, "packs", "sales", "definitions", "ontology"), { recursive: true })
  await writeFile(
    path.join(templatesRoot, "packs", "sales", "definitions", "ontology", "company.yaml"),
    "customer: {}\n"
  )
})

afterEach(async () => {
  await rm(templatesRoot, { recursive: true, force: true })
})

describe("readLocalTemplateFiles", () => {
  it("flattens the base skeleton per TEMPLATE_MANIFEST, excluding .DS_Store", async () => {
    const files = await readLocalTemplateFiles("company-starter", templatesRoot)
    expect(files[".claude/hooks/format-check.sh"]).toBe("#!/bin/sh\n")
    expect(files["README.md"]).toBe("# Starter\n")
    expect(files["secrets/customers/.gitkeep"]).toBe("")
    expect(Object.keys(files)).not.toContain(".claude/hooks/.DS_Store")
  })

  it("flattens an entire pack directory when the target starts with packs/", async () => {
    const files = await readLocalTemplateFiles("packs/sales", templatesRoot)
    expect(files["definitions/ontology/company.yaml"]).toBe("customer: {}\n")
  })

  it("returns an empty map for a pack directory that does not exist", async () => {
    const files = await readLocalTemplateFiles("packs/does-not-exist", templatesRoot)
    expect(files).toEqual({})
  })

  it("returns an empty map for an unrecognized target", async () => {
    const files = await readLocalTemplateFiles("something-else", templatesRoot)
    expect(files).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/template-fetch/read-local-templates.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/template-fetch/read-local-templates.ts
import { readdir, readFile, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import path from "node:path"
import { TEMPLATE_MANIFEST } from "../company-template-manifest"

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function listFilesRecursive(absDir: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(absDir, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name === ".DS_Store") continue
    const parentAbs = (e as unknown as { parentPath?: string }).parentPath ?? absDir
    const relDir = path.relative(absDir, parentAbs)
    files.push(relDir ? path.join(relDir, e.name) : e.name)
  }
  return files
}

async function readManifestFiles(templateRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of TEMPLATE_MANIFEST) {
    const abs = path.join(templateRoot, entry)
    if (await isDirectory(abs)) {
      for (const rel of await listFilesRecursive(abs)) {
        files[path.join(entry, rel)] = await readFile(path.join(abs, rel), "utf-8")
      }
    } else if (await pathExists(abs)) {
      files[entry] = await readFile(abs, "utf-8")
    }
  }
  return files
}

async function readPackFiles(packRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  if (!(await pathExists(packRoot))) return files
  for (const rel of await listFilesRecursive(packRoot)) {
    files[rel] = await readFile(path.join(packRoot, rel), "utf-8")
  }
  return files
}

export async function readLocalTemplateFiles(target: string, templatesRoot: string): Promise<Record<string, string>> {
  if (target === "company-starter") {
    return readManifestFiles(path.join(templatesRoot, "company-starter"))
  }
  if (target.startsWith("packs/")) {
    return readPackFiles(path.join(templatesRoot, target))
  }
  return {}
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/template-fetch/read-local-templates.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/template-fetch/read-local-templates.ts lib/template-fetch/read-local-templates.test.ts
git commit -m "Add readLocalTemplateFiles for dev/test/CI local template reads"
```

---

### Task 4: `lib/license/is-enforced.ts` (extracted) + `lib/template-fetch/get-template-files.ts` (orchestrator)

**Files:**
- Create: `lib/license/is-enforced.ts`
- Modify: `lib/license/license-actions.ts` (use the extracted helper instead
  of its own private copy)
- Create: `lib/template-fetch/get-template-files.ts`
- Test: `lib/license/is-enforced.test.ts`
- Test: `lib/template-fetch/get-template-files.test.ts`

**Interfaces:**
- Consumes: `REVALIDATE_MS`, `OFFLINE_GRACE_MS` from
  `../license/license-status-impl` (existing); `readLocalTemplateFiles`
  (Task 3); `readCache`/`writeCache` (Task 2); `fetchTemplateFiles`
  (Task 1).
- Produces: `isEnforced()` (now shared/exported); `TemplateFilesResult`
  type; `getTemplateFiles(target, licenseKey, opts?)` — used by Task 5.

`license-actions.ts` currently defines its own private
`function isEnforced(): boolean { return process.env.NODE_ENV === "production" && !process.env.LICENSE_BYPASS }`.
Since that file has `"use server"` at the top, every export must be an
async Server Action — a plain sync boolean-returning export would break
that convention, so the helper needs its own small non-`"use server"` file
that both `license-actions.ts` and the new template-fetch orchestrator can
import.

- [ ] **Step 1: Write the failing test for the extracted helper**

```ts
// lib/license/is-enforced.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { isEnforced } from "./is-enforced"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV
  process.env.LICENSE_BYPASS = originalEnv.LICENSE_BYPASS
})

describe("isEnforced", () => {
  it("is false outside production", () => {
    process.env.NODE_ENV = "development"
    delete process.env.LICENSE_BYPASS
    expect(isEnforced()).toBe(false)
  })

  it("is true in production with no bypass", () => {
    process.env.NODE_ENV = "production"
    delete process.env.LICENSE_BYPASS
    expect(isEnforced()).toBe(true)
  })

  it("is false in production when LICENSE_BYPASS is set", () => {
    process.env.NODE_ENV = "production"
    process.env.LICENSE_BYPASS = "1"
    expect(isEnforced()).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/license/is-enforced.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the extracted helper and wire it into `license-actions.ts`**

```ts
// lib/license/is-enforced.ts
// The license gate — and, separately, gated template fetching — are only
// enforced in a production build (the packaged app), and can be bypassed
// with LICENSE_BYPASS=1 for the developer's own testing. `next dev` and
// bypass builds are never gated.
export function isEnforced(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.LICENSE_BYPASS
}
```

In `lib/license/license-actions.ts`, replace the private `isEnforced`
function and its comment with an import:

```ts
"use server"

import { validateLicenseImpl } from "./validate-license-impl"
import { readLicense, writeLicense } from "./license-store"
import { licenseStatusImpl } from "./license-status-impl"
import type { LicenseStatus } from "./license-status-impl"
import { isEnforced } from "./is-enforced"

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return licenseStatusImpl({
    enforced: isEnforced(),
    now: Date.now(),
    read: () => readLicense(),
    write: (license) => writeLicense(license),
    validate: (key) => validateLicenseImpl(key),
  })
}

export async function activateLicense(key: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, message: "Enter your license key" }
  try {
    const v = await validateLicenseImpl(trimmed)
    if (!v.valid) return { ok: false, message: v.message }
    writeLicense({ key: trimmed, lastValidatedAt: Date.now(), lastResult: "valid" })
    return { ok: true, message: "License activated" }
  } catch {
    return { ok: false, message: "Could not reach the license server. Check your connection and try again." }
  }
}
```

- [ ] **Step 4: Run to verify the extraction is clean**

Run: `npx vitest run lib/license/`
Expected: PASS — the pre-existing `license-status-impl.test.ts` /
`license-store.test.ts` / `validate-license-impl.test.ts` files are
unaffected; the new `is-enforced.test.ts` passes (3/3).

- [ ] **Step 5: Write the failing test for the orchestrator**

```ts
// lib/template-fetch/get-template-files.test.ts
import { describe, it, expect } from "vitest"
import { getTemplateFiles } from "./get-template-files"
import type { CachedTemplate } from "./template-cache"
import type { TemplateFetchResult } from "./fetch-template"

describe("getTemplateFiles", () => {
  it("reads local files directly when not enforced (dev/test/CI)", async () => {
    const result = await getTemplateFiles("company-starter", undefined, {
      enforced: false,
      readLocalFn: async () => ({ "README.md": "# local\n" }),
    })
    expect(result).toEqual({ ok: true, files: { "README.md": "# local\n" } })
  })

  it("returns a fresh cache without calling fetch, when enforced", async () => {
    let fetchCalled = false
    const result = await getTemplateFiles("company-starter", "KEY", {
      enforced: true,
      now: 1_000_000,
      readCacheFn: (): CachedTemplate | null => ({ files: { "README.md": "cached\n" }, cachedAt: 999_000 }),
      fetchFn: async (): Promise<TemplateFetchResult> => {
        fetchCalled = true
        return { ok: true, files: {} }
      },
    })
    expect(result).toEqual({ ok: true, files: { "README.md": "cached\n" } })
    expect(fetchCalled).toBe(false)
  })

  it("fetches and caches when the cache is stale and enforced", async () => {
    let written: { target: string; files: Record<string, string>; cachedAt: number } | null = null
    const result = await getTemplateFiles("company-starter", "KEY", {
      enforced: true,
      now: 2_000_000_000,
      readCacheFn: () => null,
      fetchFn: async () => ({ ok: true, files: { "README.md": "fresh\n" } }),
      writeCacheFn: (target, files, cachedAt) => {
        written = { target, files, cachedAt }
      },
    })
    expect(result).toEqual({ ok: true, files: { "README.md": "fresh\n" } })
    expect(written).toEqual({ target: "company-starter", files: { "README.md": "fresh\n" }, cachedAt: 2_000_000_000 })
  })

  it("fails when enforced, no cache, and no license key", async () => {
    const result = await getTemplateFiles("company-starter", undefined, {
      enforced: true,
      now: 1,
      readCacheFn: () => null,
    })
    expect(result).toEqual({ ok: false, message: "No license key found. Enter your license key, then try again." })
  })

  it("falls back to a stale-but-within-grace cache when the fetch fails", async () => {
    // age = 100_000_000ms (~1.16 days): past REVALIDATE_MS (1 day, so a
    // refetch is attempted) but well within OFFLINE_GRACE_MS (7 days, so a
    // failed refetch still falls back to the cache) — this is the only
    // combination that actually exercises the fetch-fails-then-fallback
    // branch; too-fresh a cache would return before ever calling fetchFn.
    const result = await getTemplateFiles("company-starter", "KEY", {
      enforced: true,
      now: 700_000_000,
      readCacheFn: () => ({ files: { "README.md": "stale\n" }, cachedAt: 600_000_000 }),
      fetchFn: async () => ({ ok: false, message: "network down" }),
    })
    expect(result).toEqual({ ok: true, files: { "README.md": "stale\n" } })
  })

  it("returns the fetch failure when the cache is also past the offline-grace window", async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000
    const result = await getTemplateFiles("company-starter", "KEY", {
      enforced: true,
      now: eightDaysMs + 1,
      readCacheFn: () => ({ files: { "README.md": "very stale\n" }, cachedAt: 0 }),
      fetchFn: async () => ({ ok: false, message: "network down" }),
    })
    expect(result).toEqual({ ok: false, message: "network down" })
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/template-fetch/get-template-files.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement**

```ts
// lib/template-fetch/get-template-files.ts
import path from "node:path"
import { isEnforced } from "../license/is-enforced"
import { REVALIDATE_MS, OFFLINE_GRACE_MS } from "../license/license-status-impl"
import { readLocalTemplateFiles } from "./read-local-templates"
import { readCache, writeCache, type CachedTemplate } from "./template-cache"
import { fetchTemplateFiles, type TemplateFetchResult } from "./fetch-template"

export type TemplateFilesResult = TemplateFetchResult

export async function getTemplateFiles(
  target: string,
  licenseKey: string | undefined,
  opts: {
    enforced?: boolean
    now?: number
    readLocalFn?: (target: string, templatesRoot: string) => Promise<Record<string, string>>
    readCacheFn?: (target: string) => CachedTemplate | null
    writeCacheFn?: (target: string, files: Record<string, string>, cachedAt: number) => void
    fetchFn?: (target: string, licenseKey: string) => Promise<TemplateFetchResult>
  } = {}
): Promise<TemplateFilesResult> {
  const enforced = opts.enforced ?? isEnforced()
  const now = opts.now ?? Date.now()
  const readLocalFn = opts.readLocalFn ?? readLocalTemplateFiles
  const readCacheFn = opts.readCacheFn ?? readCache
  const writeCacheFn = opts.writeCacheFn ?? writeCache
  const fetchFn = opts.fetchFn ?? fetchTemplateFiles

  if (!enforced) {
    const files = await readLocalFn(target, path.join(process.cwd(), "templates"))
    return { ok: true, files }
  }

  const cached = readCacheFn(target)
  const age = cached ? now - cached.cachedAt : Infinity

  if (cached && age < REVALIDATE_MS) {
    return { ok: true, files: cached.files }
  }

  if (!licenseKey) {
    return { ok: false, message: "No license key found. Enter your license key, then try again." }
  }

  const result = await fetchFn(target, licenseKey)
  if (result.ok) {
    writeCacheFn(target, result.files, now)
    return result
  }

  // Network/server hiccup — fall back to a stale-but-within-grace cache
  // rather than locking out an already-licensed user who's briefly offline.
  if (cached && age < OFFLINE_GRACE_MS) {
    return { ok: true, files: cached.files }
  }
  return result
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run lib/template-fetch/get-template-files.test.ts`
Expected: PASS (6/6).

- [ ] **Step 9: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add lib/license/is-enforced.ts lib/license/is-enforced.test.ts lib/license/license-actions.ts \
        lib/template-fetch/get-template-files.ts lib/template-fetch/get-template-files.test.ts
git commit -m "Add getTemplateFiles orchestrator: local reads when unenforced, cached+gated fetch when enforced"
```

---

### Task 5: Rewrite `createCompanyFromTemplateImpl` + its public wrapper

**Files:**
- Modify: `lib/create-company-from-template-impl.ts`
- Modify: `lib/create-company-from-template-impl.test.ts` (full rewrite)
- Modify: `lib/create-company-from-template.ts`

**Interfaces:**
- Consumes: `getTemplateFiles` (Task 4, as the default injectable);
  `readLicense` from `./license/license-store` (existing).
- Produces: `createCompanyFromTemplateImpl(name, rootPath, licenseKey,
  packTarget, registryPath?, execFn?, getTemplateFilesFn?)` — the new
  signature; `GetTemplateFilesFn` type.

- [ ] **Step 1: Write the failing tests (full rewrite of the existing file)**

```ts
// lib/create-company-from-template-impl.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { GetTemplateFilesFn } from "./create-company-from-template-impl"

let targetParentDir: string
let registryDir: string
let registryPath: string
let execCalls: { command: string; args: string[] }[]

async function fakeExecFn(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  execCalls.push({ command, args })
  if (args.includes("init")) {
    const dashCIndex = args.indexOf("-C")
    await mkdir(path.join(args[dashCIndex + 1], ".git"), { recursive: true })
  }
  return { stdout: "", stderr: "" }
}

const baseFiles: Record<string, string> = {
  ".claude/commands/decision.md": "# /decision\n",
  ".gitignore": "secrets/\n",
  "README.md": "# Starter\n",
  ".claude/hooks/format-check.sh": "#!/bin/sh\n",
}

function fakeGetTemplateFiles(
  packFiles: Record<string, string> | null = null,
  packOk = true
): GetTemplateFilesFn {
  return async (target: string) => {
    if (target === "company-starter") return { ok: true, files: baseFiles }
    if (!packOk) return { ok: false, message: "pack fetch failed" }
    return { ok: true, files: packFiles ?? {} }
  }
}

beforeEach(async () => {
  targetParentDir = await mkdtemp(path.join(tmpdir(), "template-target-parent-"))
  registryDir = await mkdtemp(path.join(tmpdir(), "template-registry-"))
  registryPath = path.join(registryDir, "companies.json")
  execCalls = []
})

afterEach(async () => {
  await rm(targetParentDir, { recursive: true, force: true })
  await rm(registryDir, { recursive: true, force: true })
})

describe("createCompanyFromTemplateImpl", () => {
  it("writes every file the base fetch returns", async () => {
    const target = path.join(targetParentDir, "new-co")
    const result = await createCompanyFromTemplateImpl(
      "New Co",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    expect(result.ok).toBe(true)
    expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
    expect(await readFile(path.join(target, ".gitignore"), "utf-8")).toBe("secrets/\n")
    expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
  })

  it("chmods .claude/hooks/*.sh files to 0o755", async () => {
    const target = path.join(targetParentDir, "new-co-hooks")
    await createCompanyFromTemplateImpl(
      "New Co Hooks",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    const mode = (await stat(path.join(target, ".claude", "hooks", "format-check.sh"))).mode & 0o777
    expect(mode).toBe(0o755)
  })

  it("writes a fresh HANDOFF.md rather than one from a fetched file", async () => {
    const target = path.join(targetParentDir, "new-co-2")
    await createCompanyFromTemplateImpl(
      "New Co 2",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    const handoff = await readFile(path.join(target, "HANDOFF.md"), "utf-8")
    expect(handoff).toContain("New here?")
  })

  it("runs git init, add, and commit via the injected exec function, scoped to the new directory", async () => {
    const target = path.join(targetParentDir, "new-co-3")
    await createCompanyFromTemplateImpl(
      "New Co 3",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", target, "init"] },
      { command: "git", args: ["-C", target, "add", "-A"] },
      { command: "git", args: ["-C", target, "commit", "-m", "Initial commit from company starter template"] },
    ])
  })

  it("registers the new company after scaffolding it", async () => {
    const target = path.join(targetParentDir, "new-co-4")
    const result = await createCompanyFromTemplateImpl(
      "New Co 4",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("New Co 4")
    expect(result.company.rootPath).toBe(target)
  })

  it("fails cleanly without fetching anything if the target path already exists", async () => {
    const target = path.join(targetParentDir, "already-exists")
    await mkdir(target)
    let fetchCalled = false
    const getTemplateFilesFn: GetTemplateFilesFn = async () => {
      fetchCalled = true
      return { ok: true, files: {} }
    }
    const result = await createCompanyFromTemplateImpl(
      "Dup",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      getTemplateFilesFn
    )
    expect(result.ok).toBe(false)
    expect(fetchCalled).toBe(false)
    expect(execCalls).toEqual([])
  })

  it("fails cleanly if the parent directory doesn't exist either", async () => {
    const target = path.join(targetParentDir, "missing-parent", "new-co")
    const result = await createCompanyFromTemplateImpl(
      "Dup2",
      target,
      "KEY",
      undefined,
      registryPath,
      fakeExecFn,
      fakeGetTemplateFiles()
    )
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  it("surfaces the base fetch's failure message and touches no disk", async () => {
    const target = path.join(targetParentDir, "base-fetch-fails")
    const getTemplateFilesFn: GetTemplateFilesFn = async () => ({ ok: false, message: "No license key found." })
    const result = await createCompanyFromTemplateImpl(
      "Fails",
      target,
      undefined,
      undefined,
      registryPath,
      fakeExecFn,
      getTemplateFilesFn
    )
    expect(result).toEqual({ ok: false, message: "No license key found." })
    await expect(stat(target)).rejects.toThrow()
  })

  describe("with a starter pack", () => {
    it("overlays the pack's files on top of the base skeleton", async () => {
      const target = path.join(targetParentDir, "packed-co")
      const result = await createCompanyFromTemplateImpl(
        "Packed Co",
        target,
        "KEY",
        "packs/software-engineering",
        registryPath,
        fakeExecFn,
        fakeGetTemplateFiles({
          "definitions/ontology/company.yaml": "customer: {}\n",
          ".claude/commands/code-review.md": "# /code-review\n",
        })
      )
      expect(result.ok).toBe(true)
      expect(await readFile(path.join(target, "definitions", "ontology", "company.yaml"), "utf-8")).toContain(
        "customer:"
      )
      expect(await readFile(path.join(target, ".claude", "commands", "code-review.md"), "utf-8")).toBe(
        "# /code-review\n"
      )
      // The base skeleton's own files must still be there too — a pack adds, it never replaces.
      expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
    })

    it("scaffolds identically to the base template when no pack is given", async () => {
      const target = path.join(targetParentDir, "unpacked-co")
      const result = await createCompanyFromTemplateImpl(
        "Unpacked Co",
        target,
        "KEY",
        undefined,
        registryPath,
        fakeExecFn,
        fakeGetTemplateFiles()
      )
      expect(result.ok).toBe(true)
      await expect(stat(path.join(target, "definitions", "ontology", "company.yaml"))).rejects.toThrow()
    })

    it("surfaces the pack fetch's failure message rather than silently dropping the pack", async () => {
      const target = path.join(targetParentDir, "pack-fetch-fails")
      const result = await createCompanyFromTemplateImpl(
        "Pack Fails",
        target,
        "KEY",
        "packs/sales",
        registryPath,
        fakeExecFn,
        fakeGetTemplateFiles(null, false)
      )
      expect(result).toEqual({ ok: false, message: "pack fetch failed" })
      await expect(stat(target)).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/create-company-from-template-impl.test.ts`
Expected: FAIL — old signature/behavior doesn't match.

- [ ] **Step 3: Implement**

```ts
// lib/create-company-from-template-impl.ts
import { mkdir, writeFile, stat, chmod } from "node:fs/promises"
import path from "node:path"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExecFileFn } from "./git-commit-file"
import { registerCompanyImpl, type RegisteredCompany } from "./companies-registry"
import { FRESH_HANDOFF_CONTENT } from "./company-template-manifest"
import { getTemplateFiles, type TemplateFilesResult } from "./template-fetch/get-template-files"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function writeFiles(rootPath: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(rootPath, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, "utf-8")
    if (relativePath.startsWith(".claude/hooks/") && relativePath.endsWith(".sh")) {
      await chmod(target, 0o755)
    }
  }
}

export type GetTemplateFilesFn = (
  target: string,
  licenseKey: string | undefined
) => Promise<TemplateFilesResult>

export async function createCompanyFromTemplateImpl(
  name: string,
  rootPath: string,
  licenseKey: string | undefined,
  packTarget: string | undefined,
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile,
  getTemplateFilesFn: GetTemplateFilesFn = getTemplateFiles
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  if (await pathExists(rootPath)) {
    return { ok: false, message: "This path already exists" }
  }
  if (!(await isDirectory(path.dirname(rootPath)))) {
    return { ok: false, message: "Parent directory does not exist" }
  }

  const base = await getTemplateFilesFn("company-starter", licenseKey)
  if (!base.ok) return base

  let merged: Record<string, string> = { ...base.files }
  if (packTarget) {
    const pack = await getTemplateFilesFn(packTarget, licenseKey)
    if (!pack.ok) return pack
    merged = { ...merged, ...pack.files }
  }

  try {
    await mkdir(rootPath)
    await writeFiles(rootPath, merged)
    await writeFile(path.join(rootPath, "HANDOFF.md"), FRESH_HANDOFF_CONTENT, "utf-8")

    await execFn("git", ["-C", rootPath, "init"])
    await execFn("git", ["-C", rootPath, "add", "-A"])
    await execFn("git", ["-C", rootPath, "commit", "-m", "Initial commit from company starter template"])
  } catch (err) {
    return {
      ok: false,
      message: `Failed to scaffold company: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return registerCompanyImpl(name, rootPath, registryPath)
}
```

Then update the public wrapper:

```ts
// lib/create-company-from-template.ts
"use server"

import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import type { RegisteredCompany } from "./companies-registry"
import { getCompanyStarterPack, DEFAULT_COMPANY_STARTER_PACK_ID } from "./company-starter-packs"
import { readLicense } from "./license/license-store"

export async function createCompanyFromTemplate(
  name: string,
  rootPath: string,
  packId: string = DEFAULT_COMPANY_STARTER_PACK_ID
): Promise<{ ok: true; company: RegisteredCompany } | { ok: false; message: string }> {
  const pack = getCompanyStarterPack(packId)
  const packTarget = pack.dirName ? `packs/${pack.dirName}` : undefined
  const licenseKey = readLicense()?.key
  return createCompanyFromTemplateImpl(name, rootPath, licenseKey, packTarget)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/create-company-from-template-impl.test.ts`
Expected: PASS (11/11).

- [ ] **Step 5: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean — check specifically for any other file importing the old
`createCompanyFromTemplateImpl`/`createCompanyFromTemplate` signatures
(`grep -rn "createCompanyFromTemplate" components/ lib/ --include=*.ts --include=*.tsx`)
and confirm none pass the old `templateSourcePath`/`packSourcePath`
arguments directly.

- [ ] **Step 6: Commit**

```bash
git add lib/create-company-from-template-impl.ts lib/create-company-from-template-impl.test.ts \
        lib/create-company-from-template.ts
git commit -m "Rewrite company scaffolding to consume gated template files instead of local paths"
```

---

### Task 6: Stop bundling `templates/` into packaged builds

**Files:**
- Modify: `lib/branding.ts`
- Modify: `scripts/package-macos.sh`
- Modify: `scripts/package-linux.sh`

**Interfaces:**
- Produces: `TEMPLATE_SERVER_URL` constant in `lib/branding.ts`, imported by
  `lib/template-fetch/fetch-template.ts` as its real default (replacing
  Task 1's temporary local `DEFAULT_SERVER_URL`).

- [ ] **Step 1: Add the branding constant**

In `lib/branding.ts`, add one line (keep the existing constants and header
comment as-is):

```ts
export const TEMPLATE_SERVER_URL = "https://REPLACE-ME.vercel.app" // set once alacran-template-server is deployed (Task 12-13)
```

- [ ] **Step 2: Wire it into `fetch-template.ts`**

In `lib/template-fetch/fetch-template.ts`, replace the local
`DEFAULT_SERVER_URL` constant and its usage:

```ts
import { TEMPLATE_SERVER_URL } from "../branding"

// ... (delete the old `const DEFAULT_SERVER_URL = "..."` line)

export async function fetchTemplateFiles(
  target: string,
  licenseKey: string,
  serverUrl: string = TEMPLATE_SERVER_URL,
  fetchFn: FetchLike = defaultFetch
): Promise<TemplateFetchResult> {
  // ...unchanged body...
}
```

- [ ] **Step 3: Remove the bundling line from both packaging scripts**

In `scripts/package-macos.sh`, delete this line (currently around line 64):

```bash
cp -R templates "$PAYLOAD/templates"
```

In `scripts/package-linux.sh`, delete the equivalent line (currently around
line 70), and update the header comment block (currently lines 9-13) that
explains what carries over unchanged — replace:

```
# This is NOT a port of package-macos.sh's launcher/Info.plist mechanics —
# .deb is a different packaging format end to end. What carries over
# unchanged is the payload itself: `.next/standalone` + `.next/static` +
# `templates/`, since `output: "standalone"` in next.config.ts is already
# platform-agnostic.
```

with:

```
# This is NOT a port of package-macos.sh's launcher/Info.plist mechanics —
# .deb is a different packaging format end to end. What carries over
# unchanged is the payload itself: `.next/standalone` + `.next/static`,
# since `output: "standalone"` in next.config.ts is already
# platform-agnostic. `templates/` is deliberately NOT bundled — template
# content is now fetched from a license-gated backend at company-creation
# time (see lib/template-fetch/).
```

- [ ] **Step 4: Rebuild macOS and confirm templates/ is gone from the payload**

```bash
bash scripts/package-macos.sh
find "dist/Alacrán.app/Contents/Resources/app/templates" 2>&1 | head -5
```

Expected: the `find` command errors with "No such file or directory" (the
directory no longer exists in the payload). Then clean up:

```bash
rm -rf dist
```

- [ ] **Step 5: Confirm dev-mode company creation still works unaffected**

```bash
npm run build && npx tsc --noEmit && npx vitest run
```

Expected: all clean — `npm run build`'s own dev-adjacent checks don't touch
packaging; this just confirms the source-level change compiles and the
full suite (which creates companies via injected fakes, not real local
`templates/` reads, per Task 5) still passes.

- [ ] **Step 6: Commit**

```bash
git add lib/branding.ts lib/template-fetch/fetch-template.ts scripts/package-macos.sh scripts/package-linux.sh
git commit -m "Stop bundling templates/ into packaged builds; wire TEMPLATE_SERVER_URL"
```

---

### Task 7: Full verification sweep + `LAUNCH.md` supersession note

**Files:**
- Modify: `LAUNCH.md`
- Modify: `README.md`

**Interfaces:** none — documentation + final verification only.

- [ ] **Step 1: Run the full verification suite**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: all clean.

- [ ] **Step 2: Confirm dev-mode (unenforced) company creation genuinely still reads local `templates/`**

Per this project's standing safety rule, use a disposable `/tmp` directory:

```bash
npx tsx -e "
import { createCompanyFromTemplate } from './lib/create-company-from-template'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gated-template-check-'))
  const rootPath = path.join(tmp, 'co')
  const result = await createCompanyFromTemplate('Test Co', rootPath, 'software-engineering')
  console.log('ok:', result.ok)
  console.log('has code-review command:', fs.existsSync(path.join(rootPath, '.claude/commands/code-review.md')))
  console.log('has README:', fs.existsSync(path.join(rootPath, 'README.md')))
  fs.rmSync(tmp, { recursive: true, force: true })
}
run()
"
```

Expected: `ok: true`, both existence checks `true` — confirming that with
`NODE_ENV` unset/`development` (i.e. `isEnforced() === false`), company
creation reads `templates/` locally with no network call and no license key
needed, exactly as before this plan.

- [ ] **Step 3: Add the `LAUNCH.md` supersession note**

In `LAUNCH.md`, find the Locked decisions entry:

```
- **[2026-07-28] Template delivery:** **bundle the cleaned generic template
  inside the app** (ships in the installer; works offline; no dependency on a
  public repo). v17's `TEMPLATE_MANIFEST` defines the clean file set; the copy
  source moves from the local `~/AI-Native/...` path to the bundled copy.
```

Append immediately after it:

```
  **SUPERSEDED 2026-07-31**: template content is no longer bundled into
  packaged builds. See
  `docs/superpowers/specs/2026-07-31-gated-template-delivery-design.md` —
  company creation in a packaged (production) build now fetches template
  files from a license-gated backend (`alacran-template-server`) on first
  use, cached locally per the app's existing license-revalidation window.
  Dev builds (`next dev`, `LICENSE_BYPASS=1`) are unaffected and still read
  `templates/` locally.
```

- [ ] **Step 4: Append the changelog entry to `README.md`**

Add after the most recent `## vNN` section:

```markdown
## v31: gated template delivery — the framework itself now requires a license

The reusable template source (`templates/company-starter/` and all 7
packs) is no longer bundled into packaged `.app`/`.deb` builds — confirmed
via a real rebuild that `Contents/Resources/app/templates/` no longer
exists in the payload. In a production build, company creation now fetches
template files from a new, separate, private repo
(`alacran-template-server`, deployed to Vercel) via one license-validating
API route, reusing the app's existing `REVALIDATE_MS`/`OFFLINE_GRACE_MS`
cadence (`lib/license/license-status-impl.ts`) to cache fetched files
locally and avoid hitting the network on every company creation. Dev/test/CI
(`NODE_ENV !== "production"` or `LICENSE_BYPASS=1`) are completely
unaffected — `lib/template-fetch/read-local-templates.ts` reads `templates/`
locally exactly as before, so local development and the test suite need no
network or real license key. A company a user has already created is
unaffected either way — this only changes where template *source* content
comes from before it's copied into a specific company. See
`docs/superpowers/specs/2026-07-31-gated-template-delivery-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add LAUNCH.md README.md
git commit -m "Document v31: gated template delivery supersedes bundled-template decision"
```

---

### Task 8: Scaffold the `alacran-template-server` repo

**Files (new repo at `/Users/nanaosei/AI-Native/alacran-template-server`):**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `lib/template-manifest.ts`
- Create: `templates/company-starter/**` (copied from control-panel)
- Create: `templates/packs/**` (copied from control-panel)
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Produces: the file layout Tasks 9-11 build on top of.

- [ ] **Step 1: Create the directory and initialize**

```bash
mkdir -p /Users/nanaosei/AI-Native/alacran-template-server
cd /Users/nanaosei/AI-Native/alacran-template-server
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "alacran-template-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "vercel dev"
  },
  "devDependencies": {
    "@vercel/node": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "templates"]
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
.vercel/
dist/
```

- [ ] **Step 5: Copy the template content verbatim from `control-panel`**

```bash
cp -R /Users/nanaosei/AI-Native/control-panel/templates/company-starter \
      /Users/nanaosei/AI-Native/alacran-template-server/templates/company-starter
cp -R /Users/nanaosei/AI-Native/control-panel/templates/packs \
      /Users/nanaosei/AI-Native/alacran-template-server/templates/packs
diff -r /Users/nanaosei/AI-Native/control-panel/templates/company-starter \
        /Users/nanaosei/AI-Native/alacran-template-server/templates/company-starter
diff -r /Users/nanaosei/AI-Native/control-panel/templates/packs \
        /Users/nanaosei/AI-Native/alacran-template-server/templates/packs
```

Expected: both `diff -r` commands produce no output (byte-identical copies).

- [ ] **Step 6: Write the duplicated manifest**

```ts
// lib/template-manifest.ts
// Duplicated from control-panel's lib/company-template-manifest.ts —
// two repos, one small array; not worth a shared package for this. Keep
// these two files in sync by hand if the manifest ever changes.
export const TEMPLATE_MANIFEST: string[] = [
  ".claude/hooks",
  ".claude/commands",
  ".claude/rules",
  ".claude/skills",
  ".claude/settings.json",
  "docs/templates",
  "docs/concepts",
  "docs/ai-company-beginner-guide.md",
  "docs/ai-company-beginner-guide-lp.html",
  "docs/ai-company-explainer.md",
  "docs/context-gathering-checklist.md",
  "docs/directory-map.md",
  "docs/feedback-collection.md",
  "docs/participant-guide.md",
  "docs/retreat-day-flow.md",
  "docs/setup-walkthrough.md",
  "docs/starter-manual.md",
  "docs/decisions/README.md",
  "docs/retros/README.md",
  "exercises",
  "scripts/verify.py",
  "scripts/cycle",
  "tests",
  ".github",
  ".gitignore",
  "LICENSE.md",
  "README.md",
  "CLAUDE.md",
  "definitions/README.md",
  "definitions/ontology/README.md",
  "definitions/hitl",
  "definitions/kpi/README.md",
  "definitions/cycles/README.md",
  "definitions/retro/README.md",
  "secrets",
  "state/README.md",
  "notes/README.md",
  "notes/inbox/README.md",
  "notes/market/.gitkeep",
  "notes/clients/.gitkeep",
  "notes/sops/.gitkeep",
  "notes/company/.gitkeep",
]
```

- [ ] **Step 7: Write `README.md`**

```markdown
# alacran-template-server

Private backend for [Alacrán](https://alacran.ai)'s starter company
templates. This repo exists for exactly one reason: `control-panel`'s
packaged `.app`/`.deb` no longer bundles `templates/company-starter/` or
`templates/packs/*` — those files live here instead, served only to
requests carrying a currently-valid Lemon Squeezy license key.

## What's here

- `templates/` — the real template content, copied verbatim from
  `control-panel`. Keep it in sync if `control-panel`'s templates change.
- `lib/template-manifest.ts` — duplicated from `control-panel`'s
  `lib/company-template-manifest.ts`.
- `lib/validate-license.ts` — calls Lemon Squeezy's license-validate API.
- `lib/read-template-files.ts` — flattens a manifest-driven directory tree
  into a `{ relativePath: content }` map.
- `api/get-template.ts` — the one route: validates the license key, then
  returns the requested target's files.

## Deploy

```bash
npm install
vercel --prod
```

Deploy this as a **private** Vercel project — it should never be public.
Once deployed, set `control-panel`'s `lib/branding.ts`'s
`TEMPLATE_SERVER_URL` to the real deployment URL.

## Testing

```bash
npm install
npm test
```
```

- [ ] **Step 8: Commit**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
git add -A
git commit -m "Scaffold alacran-template-server: package.json, tsconfig, copied templates, manifest"
```

---

### Task 9: `lib/validate-license.ts` (alacran-template-server)

**Files (in `/Users/nanaosei/AI-Native/alacran-template-server`):**
- Create: `lib/validate-license.ts`
- Test: `lib/validate-license.test.ts`

**Interfaces:**
- Produces: `FetchLike`, `LicenseValidation` types, `validateLicense(key,
  fetchFn?)` — used by Task 11.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/validate-license.test.ts
import { describe, it, expect } from "vitest"
import { validateLicense } from "./validate-license"
import type { FetchLike } from "./validate-license"

describe("validateLicense", () => {
  it("reports valid when Lemon Squeezy returns valid:true", async () => {
    const fetchFn: FetchLike = async () => ({ json: async () => ({ valid: true, error: null }) })
    expect(await validateLicense("KEY", fetchFn)).toEqual({ valid: true, message: "License active" })
  })

  it("reports invalid with the server's error message when valid:false", async () => {
    const fetchFn: FetchLike = async () => ({ json: async () => ({ valid: false, error: "license_key not found" }) })
    expect(await validateLicense("KEY", fetchFn)).toEqual({ valid: false, message: "license_key not found" })
  })

  it("POSTs the license key to the LS validate endpoint", async () => {
    let sentBody: string | undefined
    const fetchFn: FetchLike = async (_url, init) => {
      sentBody = init.body as string
      return { json: async () => ({ valid: true }) }
    }
    await validateLicense("ABC-123", fetchFn)
    expect(JSON.parse(sentBody!)).toEqual({ license_key: "ABC-123" })
  })

  it("propagates a thrown network error to the caller", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network down")
    }
    await expect(validateLicense("KEY", fetchFn)).rejects.toThrow("network down")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/validate-license.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/validate-license.ts
export type FetchLike = (url: string, init: RequestInit) => Promise<{ json: () => Promise<unknown> }>

export type LicenseValidation = { valid: boolean; message: string }

const LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate"

const defaultFetch: FetchLike = (url, init) => fetch(url, init)

export async function validateLicense(key: string, fetchFn: FetchLike = defaultFetch): Promise<LicenseValidation> {
  const res = await fetchFn(LS_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ license_key: key }),
  })
  const data = (await res.json()) as { valid?: boolean; error?: string | null }
  return {
    valid: Boolean(data.valid),
    message: data.error ?? (data.valid ? "License active" : "License is not valid"),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/validate-license.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
git add lib/validate-license.ts lib/validate-license.test.ts
git commit -m "Add validateLicense: Lemon Squeezy license check"
```

---

### Task 10: `lib/read-template-files.ts` (alacran-template-server)

**Files (in `/Users/nanaosei/AI-Native/alacran-template-server`):**
- Create: `lib/read-template-files.ts`
- Test: `lib/read-template-files.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_MANIFEST` from `./template-manifest` (Task 8).
- Produces: `readTemplateFiles(target, templatesRoot)` — used by Task 11.

This is the same manifest-driven flattening logic as `control-panel`'s
`lib/template-fetch/read-local-templates.ts` (Task 3) — duplicated
intentionally, since this repo has no dependency on `control-panel` and the
logic is small enough not to warrant a shared package.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/read-template-files.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

vi.mock("./template-manifest", () => ({
  TEMPLATE_MANIFEST: [".claude/hooks", "README.md", "secrets"],
}))

const { readTemplateFiles } = await import("./read-template-files")

let templatesRoot: string

beforeEach(async () => {
  templatesRoot = await mkdtemp(path.join(tmpdir(), "read-template-files-"))
  await mkdir(path.join(templatesRoot, "company-starter", ".claude", "hooks"), { recursive: true })
  await writeFile(path.join(templatesRoot, "company-starter", ".claude", "hooks", "format-check.sh"), "#!/bin/sh\n")
  await writeFile(path.join(templatesRoot, "company-starter", ".claude", "hooks", ".DS_Store"), "junk")
  await writeFile(path.join(templatesRoot, "company-starter", "README.md"), "# Starter\n")
  await mkdir(path.join(templatesRoot, "company-starter", "secrets", "customers"), { recursive: true })
  await writeFile(path.join(templatesRoot, "company-starter", "secrets", "customers", ".gitkeep"), "")
  await mkdir(path.join(templatesRoot, "packs", "sales", "definitions", "ontology"), { recursive: true })
  await writeFile(
    path.join(templatesRoot, "packs", "sales", "definitions", "ontology", "company.yaml"),
    "customer: {}\n"
  )
})

afterEach(async () => {
  await rm(templatesRoot, { recursive: true, force: true })
})

describe("readTemplateFiles", () => {
  it("flattens the base skeleton per TEMPLATE_MANIFEST, excluding .DS_Store", async () => {
    const files = await readTemplateFiles("company-starter", templatesRoot)
    expect(files[".claude/hooks/format-check.sh"]).toBe("#!/bin/sh\n")
    expect(files["README.md"]).toBe("# Starter\n")
    expect(files["secrets/customers/.gitkeep"]).toBe("")
    expect(Object.keys(files)).not.toContain(".claude/hooks/.DS_Store")
  })

  it("flattens an entire pack directory when the target starts with packs/", async () => {
    const files = await readTemplateFiles("packs/sales", templatesRoot)
    expect(files["definitions/ontology/company.yaml"]).toBe("customer: {}\n")
  })

  it("returns an empty map for a pack directory that does not exist", async () => {
    expect(await readTemplateFiles("packs/does-not-exist", templatesRoot)).toEqual({})
  })

  it("returns an empty map for an unrecognized target", async () => {
    expect(await readTemplateFiles("something-else", templatesRoot)).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/read-template-files.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/read-template-files.ts
import { readdir, readFile, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import path from "node:path"
import { TEMPLATE_MANIFEST } from "./template-manifest"

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function listFilesRecursive(absDir: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(absDir, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name === ".DS_Store") continue
    const parentAbs = (e as unknown as { parentPath?: string }).parentPath ?? absDir
    const relDir = path.relative(absDir, parentAbs)
    files.push(relDir ? path.join(relDir, e.name) : e.name)
  }
  return files
}

async function readManifestFiles(templateRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of TEMPLATE_MANIFEST) {
    const abs = path.join(templateRoot, entry)
    if (await isDirectory(abs)) {
      for (const rel of await listFilesRecursive(abs)) {
        files[path.join(entry, rel)] = await readFile(path.join(abs, rel), "utf-8")
      }
    } else if (await pathExists(abs)) {
      files[entry] = await readFile(abs, "utf-8")
    }
  }
  return files
}

async function readPackFiles(packRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  if (!(await pathExists(packRoot))) return files
  for (const rel of await listFilesRecursive(packRoot)) {
    files[rel] = await readFile(path.join(packRoot, rel), "utf-8")
  }
  return files
}

export async function readTemplateFiles(target: string, templatesRoot: string): Promise<Record<string, string>> {
  if (target === "company-starter") {
    return readManifestFiles(path.join(templatesRoot, "company-starter"))
  }
  if (target.startsWith("packs/")) {
    return readPackFiles(path.join(templatesRoot, target))
  }
  return {}
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/read-template-files.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
git add lib/read-template-files.ts lib/read-template-files.test.ts
git commit -m "Add readTemplateFiles: manifest-driven directory-to-file-map flattening"
```

---

### Task 11: `api/get-template.ts` (alacran-template-server)

**Files (in `/Users/nanaosei/AI-Native/alacran-template-server`):**
- Create: `api/get-template.ts`
- Test: `api/get-template.test.ts`

**Interfaces:**
- Consumes: `validateLicense` (Task 9), `readTemplateFiles` (Task 10).
- Produces: `handleGetTemplateRequest(body, validateFn?, readFn?,
  templatesRoot?)` (pure, testable), and the default-exported Vercel
  handler that wraps it.

- [ ] **Step 1: Write the failing tests**

```ts
// api/get-template.test.ts
import { describe, it, expect } from "vitest"
import { handleGetTemplateRequest } from "./get-template"
import type { LicenseValidation } from "../lib/validate-license"

describe("handleGetTemplateRequest", () => {
  it("returns 400 when license_key or target is missing", async () => {
    expect(await handleGetTemplateRequest({})).toEqual({
      status: 400,
      body: { error: "license_key and target are required" },
    })
    expect(await handleGetTemplateRequest({ license_key: "KEY" })).toEqual({
      status: 400,
      body: { error: "license_key and target are required" },
    })
  })

  it("returns 403 with the validator's message when the license is invalid", async () => {
    const validateFn = async (): Promise<LicenseValidation> => ({ valid: false, message: "License expired" })
    const result = await handleGetTemplateRequest(
      { license_key: "BAD", target: "company-starter" },
      validateFn
    )
    expect(result).toEqual({ status: 403, body: { error: "License expired" } })
  })

  it("returns 200 with the files a valid license unlocks", async () => {
    const validateFn = async (): Promise<LicenseValidation> => ({ valid: true, message: "License active" })
    const readFn = async (target: string) => ({ [`${target}.txt`]: "content" })
    const result = await handleGetTemplateRequest(
      { license_key: "GOOD", target: "company-starter" },
      validateFn,
      readFn,
      "/unused-root"
    )
    expect(result).toEqual({ status: 200, body: { files: { "company-starter.txt": "content" } } })
  })

  it("never calls readFn when the license is invalid", async () => {
    let readCalled = false
    const validateFn = async (): Promise<LicenseValidation> => ({ valid: false, message: "no" })
    const readFn = async () => {
      readCalled = true
      return {}
    }
    await handleGetTemplateRequest({ license_key: "BAD", target: "company-starter" }, validateFn, readFn)
    expect(readCalled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- api/get-template.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// api/get-template.ts
import type { VercelRequest, VercelResponse } from "@vercel/node"
import path from "node:path"
import { validateLicense, type LicenseValidation } from "../lib/validate-license"
import { readTemplateFiles } from "../lib/read-template-files"

type RequestBody = { license_key?: string; target?: string }
type ResponseBody = { files?: Record<string, string>; error?: string }

export async function handleGetTemplateRequest(
  body: RequestBody,
  validateFn: (key: string) => Promise<LicenseValidation> = validateLicense,
  readFn: (target: string, templatesRoot: string) => Promise<Record<string, string>> = readTemplateFiles,
  templatesRoot: string = path.join(process.cwd(), "templates")
): Promise<{ status: number; body: ResponseBody }> {
  if (!body.license_key || !body.target) {
    return { status: 400, body: { error: "license_key and target are required" } }
  }

  const validation = await validateFn(body.license_key)
  if (!validation.valid) {
    return { status: 403, body: { error: validation.message } }
  }

  const files = await readFn(body.target, templatesRoot)
  return { status: 200, body: { files } }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const result = await handleGetTemplateRequest((req.body ?? {}) as RequestBody)
  res.status(result.status).json(result.body)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- api/get-template.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full suite for this repo**

Run: `npm test`
Expected: all tests across the repo pass (Tasks 9, 10, 11's tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
git add api/get-template.ts api/get-template.test.ts
git commit -m "Add /api/get-template: license-gated template file endpoint"
```

---

### Task 12 (CONTROLLER-ONLY — ask before executing): Create the private GitHub repo

**Do not dispatch this task to a subagent.** This creates a new repository
under the human partner's GitHub account — a shared-state action requiring
explicit confirmation first, per this project's standing safety rules
(the same rule already applied to creating `alacran-releases` and to
publishing macOS builds this session).

- [ ] **Step 1: Ask for explicit confirmation** before running anything —
      state plainly that this creates a new **private** repo named
      `alacran-template-server` under the authenticated `gh` account, and
      pushes the code from Tasks 8-11.
- [ ] **Step 2: On confirmation, create and push**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
gh repo create alacran-template-server --private --source=. --remote=origin
git push -u origin master
```

- [ ] **Step 3: Report the repo URL back to the human partner.**

---

### Task 13 (CONTROLLER-ONLY — ask before executing): Deploy to Vercel + wire the real URL

**Do not dispatch this task to a subagent.** Deploying a new project to
Vercel and then changing `control-panel`'s production configuration to
point at a live, real backend are both real, hard-to-silently-reverse
actions — ask first.

- [ ] **Step 1: Ask for explicit confirmation** before deploying — state
      plainly that this deploys `alacran-template-server` to Vercel as a
      **private** project, and that the resulting URL will then be baked
      into `control-panel`'s production build.
- [ ] **Step 2: On confirmation, deploy**

```bash
cd /Users/nanaosei/AI-Native/alacran-template-server
npm install
vercel --prod
```

Capture the printed production URL.

- [ ] **Step 3: Wire the real URL into `control-panel`**

In `control-panel/lib/branding.ts`, replace:

```ts
export const TEMPLATE_SERVER_URL = "https://REPLACE-ME.vercel.app" // set once alacran-template-server is deployed (Task 12-13)
```

with the real deployed URL (no trailing slash), and remove the trailing
comment now that it's no longer a placeholder.

- [ ] **Step 4: Live-verify end-to-end**

Per this project's standing safety rule, using a disposable `/tmp`
directory and a real (or Lemon Squeezy test-mode) license key: run a real
production build of `control-panel`, activate a real license, and create a
company from a real pack — confirm the resulting directory matches what a
local/dev-mode creation produces (same file set, same content, hook
scripts executable).

- [ ] **Step 5: Commit the real URL in `control-panel`**

```bash
cd /Users/nanaosei/AI-Native/control-panel
git add lib/branding.ts
git commit -m "Point TEMPLATE_SERVER_URL at the deployed alacran-template-server"
```
