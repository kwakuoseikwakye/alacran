import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { contained, dirtyPaths } from "@/lib/os/departments/safety"
import { applyGuide, parseBlock } from "./apply"
import type { RenderedGuide } from "./apply"
import { readGuideInputs } from "./inventory"
import { renderGuide } from "./render"

export const AGENTS_REL = "AGENTS.md"

export type GuideReason = "edited" | "dirty" | "malformed" | "unreadable-inputs" | "unsafe" | "unreadable"
export type GuideRefresh =
  | { status: "absent" | "unchanged" }
  | { status: "updated"; paths: string[] }
  | { status: "needs-attention"; reason: GuideReason; detail: string }
  | { status: "failed"; error: string }
export type GuideState =
  | { state: "not-added" | "up-to-date" | "stale" }
  | { state: "needs-attention"; reason: GuideReason; detail: string }
export type GuideDeps = { exec: ExecFileFn; packsRoot?: string }

const MALFORMED = {
  duplicate: "AGENTS.md has more than one operating-guide block. Remove the extra one by hand.",
  nested: "AGENTS.md has operating-guide markers inside each other. Fix them by hand.",
  unclosed: "AGENTS.md has an operating-guide marker without its partner. Fix it by hand.",
} as const
const EDITED = "The operating guide in AGENTS.md was edited by hand, so it was left as you wrote it."
const attention = (reason: GuideReason, detail: string) => ({ status: "needs-attention" as const, reason, detail })

export const PLAIN = "AGENTS.md couldn't be read or written."
const CHANGED = "AGENTS.md changed while the guide was being updated, so it was left as you saved it."

/**
 * Writes via a private temp file. `expected` is the exact text read earlier (null: the file did not exist);
 * if the target no longer matches it, nothing is published and "changed" comes back.
 */
async function writeAtomic(file: string, text: string, expected: string | null): Promise<"ok" | "changed"> {
  const tmp = `${file}.${randomUUID()}.tmp`
  const mode = await fs.stat(file).then((st) => st.mode & 0o777, () => 0o644)
  try {
    await fs.writeFile(tmp, text, { encoding: "utf8", flag: "wx", mode })
    await fs.chmod(tmp, mode)
    // ponytail: re-read to rename is microseconds, not zero; closing it fully needs the editor's cooperation (advisory lock)
    if (expected === null) {
      try {
        await fs.link(tmp, file) // no-clobber: EEXIST means someone created it meanwhile
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return "changed"
        throw err
      }
      return "ok"
    }
    const now = await fs.readFile(file, "utf8").catch(() => null)
    if (now !== expected) return "changed"
    await fs.rename(tmp, file)
    return "ok"
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

/** True when AGENTS.md is a symlink or resolves outside the company. */
async function unsafe(root: string, file: string): Promise<boolean> {
  try {
    if ((await fs.lstat(file)).isSymbolicLink()) return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
  return !(await contained(root, file))
}

export type Evaluation =
  | { kind: "absent" }
  | { kind: "attention"; reason: GuideReason; detail: string }
  | { kind: "current" }
  | { kind: "stale"; text: string; rendered: RenderedGuide }

export async function evaluate(root: string, deps: GuideDeps): Promise<Evaluation> {
  const file = path.join(root, AGENTS_REL)
  if (await unsafe(root, file)) return { kind: "attention", reason: "unsafe", detail: "AGENTS.md points outside this company, so it was left alone." }
  let text: string
  try {
    text = await fs.readFile(file, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" }
    throw err
  }
  const parsed = parseBlock(text)
  if (parsed.kind === "none") return { kind: "absent" }
  if (parsed.kind === "error") return { kind: "attention", reason: "malformed", detail: MALFORMED[parsed.error] }
  if (!parsed.untouched) return { kind: "attention", reason: "edited", detail: EDITED }
  if ((await dirtyPaths(root, [AGENTS_REL], deps.exec)).length) {
    return { kind: "attention", reason: "dirty", detail: "AGENTS.md has changes that aren't saved to history yet. Save or discard them first." }
  }
  const { inputs, problem } = await readGuideInputs(root, deps.packsRoot)
  if (problem) return { kind: "attention", reason: "unreadable-inputs", detail: problem }
  const rendered = renderGuide(inputs)
  return rendered.fingerprint === parsed.fingerprint && rendered.bodyHash === parsed.bodyHash ? { kind: "current" } : { kind: "stale", text, rendered }
}

/** Puts one evaluated stale guide on disk: the text written is `found.rendered`, and only if the file is still `found.text`. */
async function writeStale(root: string, found: { text: string; rendered: RenderedGuide }): Promise<GuideRefresh> {
  const next = applyGuide(found.text, found.rendered, "replace")
  if (!next.ok) {
    if (next.error === "edited") return attention("edited", EDITED)
    if (next.error === "missing") return { status: "absent" }
    if (next.error === "exists") return { status: "failed", error: "AGENTS.md could not be updated." }
    return attention("malformed", MALFORMED[next.error])
  }
  if ((await writeAtomic(path.join(root, AGENTS_REL), next.text, found.text)) === "changed") return attention("dirty", CHANGED)
  return { status: "updated", paths: [AGENTS_REL] }
}

/** Never throws and takes no lock: the department mutations call it while already holding the per-company lock. */
export async function refreshGuide(root: string, deps: GuideDeps): Promise<GuideRefresh> {
  try {
    const found = await evaluate(root, deps)
    if (found.kind === "absent") return { status: "absent" }
    if (found.kind === "attention") return attention(found.reason, found.detail)
    if (found.kind === "current") return { status: "unchanged" }
    return await writeStale(root, found)
  } catch {
    return { status: "failed", error: PLAIN }
  }
}

/**
 * Like refreshGuide, but writes only the proposal the owner was shown. `expected.id` is the body hash of the block that
 * was proposed and `expected.baseBodyHash` the body hash of the block then on disk. ONE evaluation both checks them and
 * supplies the text that is written, so what lands in AGENTS.md is exactly what was checked; if either differs the
 * result is `changed` and nothing is written. Never throws and takes no lock: the caller holds the per-company one.
 */
export async function refreshGuideIfUnchanged(
  root: string,
  deps: GuideDeps,
  expected: { id: string; baseBodyHash: string }
): Promise<GuideRefresh | { status: "changed" }> {
  try {
    const found = await evaluate(root, deps)
    if (found.kind === "absent") return { status: "absent" }
    if (found.kind === "attention") return attention(found.reason, found.detail)
    if (found.kind === "current") return { status: "unchanged" }
    const parsed = parseBlock(found.text)
    const base = parsed.kind === "ok" ? parsed.bodyHash : null
    if (found.rendered.bodyHash !== expected.id || base !== expected.baseBodyHash) return { status: "changed" }
    return await writeStale(root, found)
  } catch {
    return { status: "failed", error: PLAIN }
  }
}

export async function guideState(root: string, deps: GuideDeps): Promise<GuideState> {
  try {
    const found = await evaluate(root, deps)
    if (found.kind === "absent") return { state: "not-added" }
    if (found.kind === "attention") return { state: "needs-attention", reason: found.reason, detail: found.detail }
    return { state: found.kind === "current" ? "up-to-date" : "stale" }
  } catch {
    return { state: "needs-attention", reason: "unreadable", detail: PLAIN }
  }
}

export async function addGuide(
  root: string,
  deps: GuideDeps
): Promise<{ ok: true; paths: string[] } | { ok: false; code: "exists" | "malformed" | "portable" | "dirty" | "unsafe" | "failed"; error: string }> {
  try {
    const file = path.join(root, AGENTS_REL)
    if (await unsafe(root, file)) return { ok: false, code: "unsafe", error: "AGENTS.md points outside this company, so nothing was changed." }
    let text = ""
    let existed = true
    try {
      text = await fs.readFile(file, "utf8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      existed = false
    }
    if (!existed) {
      const claude = await fs.stat(path.join(root, "CLAUDE.md")).then(() => true, () => false)
      if (claude) return { ok: false, code: "portable", error: "This company keeps its working agreement in CLAUDE.md. Move it to AGENTS.md first, then add the guide." }
    }
    const parsed = parseBlock(text)
    if (parsed.kind === "error") return { ok: false, code: "malformed", error: MALFORMED[parsed.error] }
    if (parsed.kind === "ok") return { ok: false, code: "exists", error: "The operating guide is already in AGENTS.md." }
    if ((await dirtyPaths(root, [AGENTS_REL], deps.exec)).length) {
      return { ok: false, code: "dirty", error: "AGENTS.md has changes that aren't saved to history yet. Save or discard them first." }
    }
    const { inputs, problem } = await readGuideInputs(root, deps.packsRoot)
    if (problem) return { ok: false, code: "failed", error: problem }
    const applied = applyGuide(text, renderGuide(inputs), "append")
    if (!applied.ok) {
      if (applied.error === "exists") return { ok: false, code: "exists", error: "The operating guide is already in AGENTS.md." }
      if (applied.error === "duplicate" || applied.error === "nested" || applied.error === "unclosed") return { ok: false, code: "malformed", error: MALFORMED[applied.error] }
      return { ok: false, code: "failed", error: "AGENTS.md could not be updated." }
    }
    if ((await writeAtomic(file, applied.text, existed ? text : null)) === "changed") return { ok: false, code: "dirty", error: CHANGED }
    return { ok: true, paths: [AGENTS_REL] }
  } catch {
    return { ok: false, code: "failed", error: PLAIN }
  }
}
