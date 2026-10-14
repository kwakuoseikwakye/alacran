import { writeFile, readFile, chmod } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { ENV_KEY_PATTERN } from "./os/connectors/creds"
import { defaultExecFile } from "./default-exec-file"
import type { ExecFileFn } from "./terminal-launch-command"

export type ReadFileFn = (filePath: string) => Promise<string>
const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * Whether `git check-ignore` says a company's own `.env` is covered by a
 * gitignore rule, checked with `-C repoRoot` so it reads that company's own
 * config rather than this app's.
 *
 * `git check-ignore` exits 0 when the path IS ignored, 1 when it is tracked
 * territory and NOT ignored, and anything else (no `.git` at all, git
 * missing from PATH, a corrupted repo, ...) when it couldn't even answer the
 * question. Only exit 1 is a real, positive "this company would leak the
 * key" — everything else collapses to "no repo", which
 * saveCompanyCredentialImpl treats as unblocked: see its own comment for why.
 */
export async function checkEnvGitignored(
  repoRoot: string,
  execFn: ExecFileFn
): Promise<"ignored" | "not-ignored" | "no-repo"> {
  try {
    await execFn("git", ["-C", repoRoot, "check-ignore", "-q", ".env"])
    return "ignored"
  } catch (err) {
    const code = (err as { code?: number | string }).code
    return code === 1 ? "not-ignored" : "no-repo"
  }
}

/**
 * A credential value becomes a line in a .env file. A newline would let one
 * value define a second variable. Same chokepoint reasoning as
 * isSafeAccountEmail in google-accounts-config.ts.
 */
export function isSafeCredentialValue(value: string): boolean {
  return !/[\n\r]/.test(value)
}

/**
 * `key` is interpolated straight into the file as `${key}=${value}`, so it
 * needs the same chokepoint as the value — a key containing a newline would
 * write a second variable into the company's `.env`. Shares ENV_KEY_PATTERN
 * with parseEnvFile (lib/os/connectors/creds.ts) rather than carrying its own
 * copy, so anything this writer accepts stays readable by the resolver, and
 * nothing this writer refuses was ever readable anyway.
 */
export function isSafeCredentialKey(key: string): boolean {
  return ENV_KEY_PATTERN.test(key)
}

/**
 * Rewrites one KEY=value line, leaving every other line — including the
 * comments the api-connect skill writes — exactly as it found them. An empty
 * value removes the line, which is how a company goes back to the machine
 * default.
 */
export function upsertCompanyEnvText(current: string, key: string, value: string): string {
  const lines = current.split("\n")
  const kept = lines.filter((l) => !l.trim().replace(/^export\s+/, "").startsWith(`${key}=`))
  const body = kept.join("\n").replace(/\n+$/, "")
  if (!value) return body ? `${body}\n` : ""
  return body ? `${body}\n${key}=${value}\n` : `${key}=${value}\n`
}

/**
 * Writes one credential into a company's own .env.
 *
 * Deliberately does NOT commit, unlike saveGoogleAccountsImpl: this file is
 * gitignored by templates/company-starter/.gitignore and must stay that way.
 * A secret in a company's git history is a secret in its backup.
 */
export async function saveCompanyCredentialImpl(
  agentId: string,
  key: string,
  value: string,
  readFileFn: ReadFileFn = defaultReadFile,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSafeCredentialKey(key)) {
    return { ok: false, message: "That isn't a usable credential name." }
  }
  if (!isSafeCredentialValue(value)) {
    return { ok: false, message: "That value contains a line break and can't be saved." }
  }
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }

  // A company adopted from an existing folder keeps its OWN .gitignore (or
  // none at all) rather than the one templates/company-starter ships, so the
  // "this file is gitignored" comment above is a claim about the template,
  // not a guarantee about every company. Refuse rather than write a key into
  // a folder that would keep it in plain, trackable sight — a company with
  // no git repo at all can't have this problem (nothing there to sweep the
  // file into later), so it is let through: see checkEnvGitignored's comment.
  const ignoreCheck = await checkEnvGitignored(agent.rootPath, execFn)
  if (ignoreCheck === "not-ignored") {
    return {
      ok: false,
      message:
        "This company's folder won't keep the key private — its .gitignore doesn't cover .env, " +
        "so a future commit there could publish it. Add .env to that folder's .gitignore, then try again.",
    }
  }

  const target = path.join(agent.rootPath, ".env")
  let current = ""
  try {
    current = await readFileFn(target)
  } catch (err) {
    // ENOENT is the normal first-credential case. Anything else (permission
    // denied, a directory where a file should be, ...) must NOT be treated
    // as "no prior content" — proceeding would overwrite the file and
    // destroy every other credential already in it.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, message: "That company's .env could not be read, so nothing was changed." }
    }
  }
  try {
    // 0600 BEFORE the content lands, so the key is never briefly
    // world-readable. writeFile's mode is only honoured when it CREATES the
    // file — an existing .env keeps whatever mode it already had — hence the
    // explicit chmod after, for the overwrite case. Same pattern as
    // lib/voice/settings-impl.ts's writeSettings.
    await writeFile(target, upsertCompanyEnvText(current, key, value), { encoding: "utf-8", mode: 0o600 })
    await chmod(target, 0o600).catch(() => {})
  } catch (err) {
    // A bare "use server" wrapper turns any throw into Next's redacted
    // production digest (see AGENTS.md) — return the real reason instead.
    const message = err instanceof Error ? err.message : "Failed to write credential"
    return { ok: false, message }
  }
  return { ok: true }
}
