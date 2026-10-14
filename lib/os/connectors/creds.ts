import fs from "node:fs"
import path from "node:path"

/**
 * The charset a .env key name must match, in either direction: what
 * parseEnvFile accepts on read, and what any writer (e.g.
 * save-company-credential-impl.ts) must accept before it persists a key —
 * one export so the two can't drift apart.
 */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of content.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const stripped = line.startsWith("export ") ? line.slice(7) : line
    const eq = stripped.indexOf("=")
    if (eq <= 0) continue
    const key = stripped.slice(0, eq).trim()
    if (!ENV_KEY_PATTERN.test(key)) continue
    let value = stripped.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function envLocalPath(): string {
  return (
    process.env.FOUNDER_OS_ENV_LOCAL ??
    process.env.ALACRAN_ENV_LOCAL ??
    path.join(process.cwd(), ".env.local")
  )
}

export function readEnvLocal(overridePath?: string): Record<string, string> {
  const file = overridePath ?? envLocalPath()
  try {
    return parseEnvFile(fs.readFileSync(file, "utf8"))
  } catch {
    return {}
  }
}

export function upsertEnvLocal(values: Record<string, string>, overridePath?: string): void {
  const file = overridePath ?? envLocalPath()
  let raw = ""
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch {
    raw = ""
  }
  const lines = raw.length > 0 ? raw.split("\n") : []
  const pending = new Map(Object.entries(values))
  const next = lines.map((line) => {
    const key = line.trim().replace(/^export /, "").split("=")[0]?.trim()
    if (key && pending.has(key)) {
      const v = pending.get(key)!
      pending.delete(key)
      return `${key}=${v}`
    }
    return line
  })
  while (next.length > 0 && next[next.length - 1] === "") next.pop()
  for (const [key, v] of pending) next.push(`${key}=${v}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, next.join("\n") + "\n", { mode: 0o600 })
}

export function removeEnvLocal(keys: string[], overridePath?: string): void {
  const file = overridePath ?? envLocalPath()
  let raw = ""
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch {
    return
  }
  const drop = new Set(keys)
  const next = raw
    .split("\n")
    .filter((line) => !drop.has(line.trim().replace(/^export /, "").split("=")[0]?.trim() ?? ""))
  fs.writeFileSync(file, next.join("\n"), { mode: 0o600 })
}

export function runtimeEnv(overridePath?: string): Record<string, string | undefined> {
  return { ...process.env, ...readEnvLocal(overridePath) }
}
