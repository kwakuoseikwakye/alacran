import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const BLACKLISTED_SYSTEM_ROOTS = [
  "/",
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/var",
  "/Library",
  "/Applications",
  "/private",
  "C:\\",
  "C:\\Windows",
  "C:\\Program Files",
]

export function resolveTemplatesDir(): string {
  const candidates = [
    path.join(process.cwd(), "control-panel", "templates"),
    path.join(process.cwd(), "templates"),
    path.join(__dirname, "..", "templates"),
    path.join(__dirname, "..", "..", "templates"),
  ]

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "company-starter"))) {
      return dir
    }
  }

  throw new Error("Unable to locate templates directory. Ensure company-starter exists.")
}

export function validateCompanyPath(inputPath: string): { ok: true; normalizedPath: string } | { ok: false; error: string } {
  if (!inputPath || typeof inputPath !== "string" || inputPath.trim().length === 0) {
    return { ok: false, error: "Company destination path cannot be empty" }
  }

  const normalized = path.resolve(path.normalize(inputPath.trim()))
  const lowerNormalized = normalized.toLowerCase()
  const lowerTmp = path.resolve(os.tmpdir()).toLowerCase()

  // Allow standard OS temporary directories (such as os.tmpdir(), which on macOS lives under /var/folders)
  const isTempDir =
    lowerNormalized.startsWith(lowerTmp) ||
    lowerNormalized.startsWith("/var/folders/") ||
    lowerNormalized.startsWith("/private/var/folders/")

  if (
    !isTempDir &&
    BLACKLISTED_SYSTEM_ROOTS.some((badRoot) => {
      const lowerBad = badRoot.toLowerCase()
      return lowerNormalized === lowerBad || lowerNormalized.startsWith(lowerBad + path.sep)
    })
  ) {
    return { ok: false, error: `Invalid company path: cannot target system directory '${normalized}'` }
  }

  return { ok: true, normalizedPath: normalized }
}
