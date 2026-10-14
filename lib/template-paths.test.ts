import { describe, it, expect, vi, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { resolveTemplatesDir, validateCompanyPath } from "./template-paths"
import { createCompanyFromTemplate } from "./create-company-from-template"
import { adoptFolder } from "./adopt-folder"
import { restoreCompanyImpl } from "./github/restore-company-impl"

describe("template-paths", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("resolveTemplatesDir", () => {
    it("locates the templates directory containing company-starter", () => {
      const dir = resolveTemplatesDir()
      expect(typeof dir).toBe("string")
      expect(fs.existsSync(path.join(dir, "company-starter"))).toBe(true)
      expect(fs.existsSync(path.join(dir, "packs"))).toBe(true)
    })

    it("throws an error when templates directory cannot be located", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false)
      expect(() => resolveTemplatesDir()).toThrow(
        "Unable to locate templates directory. Ensure company-starter exists."
      )
    })
  })

  describe("validateCompanyPath", () => {
    it("rejects empty or whitespace paths", () => {
      expect(validateCompanyPath("")).toEqual({
        ok: false,
        error: "Company destination path cannot be empty",
      })
      expect(validateCompanyPath("   ")).toEqual({
        ok: false,
        error: "Company destination path cannot be empty",
      })
      expect(validateCompanyPath(null as unknown as string)).toEqual({
        ok: false,
        error: "Company destination path cannot be empty",
      })
      expect(validateCompanyPath(undefined as unknown as string)).toEqual({
        ok: false,
        error: "Company destination path cannot be empty",
      })
    })

    it("rejects root filesystem '/'", () => {
      const res = validateCompanyPath("/")
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe("Invalid company path: cannot target system directory '/'")
      }
    })

    it("rejects blacklisted Unix system directories and their subdirectories", () => {
      const blacklisted = [
        "/System",
        "/System/Library",
        "/usr",
        "/usr/local/bin",
        "/bin",
        "/sbin",
        "/etc",
        "/etc/pam.d",
        "/var",
        "/var/log",
        "/Library",
        "/Library/Preferences",
        "/Applications",
        "/Applications/Utilities",
        "/private",
        "/private/tmp",
      ]

      for (const p of blacklisted) {
        const res = validateCompanyPath(p)
        expect(res.ok).toBe(false)
        if (!res.ok) {
          expect(res.error).toContain(`Invalid company path: cannot target system directory '${p}'`)
        }
      }
    })

    it("rejects lowercase system roots on case-insensitive filesystems", () => {
      const lowercaseRoots = [
        "/system",
        "/system/library",
        "/applications",
        "/applications/utilities",
        "/library",
        "/library/preferences",
        "/etc/passwd",
        "/usr",
        "/usr/bin",
        "/var",
        "/var/log",
        "/private",
      ]

      for (const p of lowercaseRoots) {
        const res = validateCompanyPath(p)
        expect(res.ok).toBe(false)
        if (!res.ok) {
          expect(res.error).toContain("Invalid company path: cannot target system directory")
        }
      }
    })

    it("rejects path traversal attempts that resolve to system directories", () => {
      const traversals = [
        "/Users/../etc",
        "/tmp/../bin",
        "/var/log/../../System/Library",
        "/Library/../etc/hosts",
      ]

      for (const t of traversals) {
        const res = validateCompanyPath(t)
        expect(res.ok).toBe(false)
        if (!res.ok) {
          expect(res.error).toContain("Invalid company path: cannot target system directory")
        }
      }
    })

    it("accepts valid non-system company paths and normalizes them", () => {
      const validPath = "/tmp/my-valid-company"
      const res = validateCompanyPath(validPath)
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.normalizedPath).toBe(path.resolve(validPath))
      }

      const relativeTraversal = "my-company/sub/../final"
      const relativeRes = validateCompanyPath(relativeTraversal)
      expect(relativeRes.ok).toBe(true)
      if (relativeRes.ok) {
        expect(relativeRes.normalizedPath).toBe(path.resolve("my-company/final"))
      }
    })
  })

  describe("security integration", () => {
    it("createCompanyFromTemplate rejects invalid system paths early", async () => {
      const res = await createCompanyFromTemplate("Evil Co", "/etc")
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.message).toContain("cannot target system directory '/etc'")
      }

      const lowerRes = await createCompanyFromTemplate("Evil Lower Co", "/system")
      expect(lowerRes.ok).toBe(false)
      if (!lowerRes.ok) {
        expect(lowerRes.message).toContain("cannot target system directory '/system'")
      }

      const emptyRes = await createCompanyFromTemplate("Empty Co", "   ")
      expect(emptyRes.ok).toBe(false)
      if (!emptyRes.ok) {
        expect(emptyRes.message).toBe("Company destination path cannot be empty")
      }
    })

    it("createCompanyFromTemplate handles template resolution errors gracefully without throwing", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false)
      const res = await createCompanyFromTemplate("Missing Template Co", "/tmp/valid-co")
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.message).toContain("Unable to locate templates directory")
      }
    })

    it("adoptFolder rejects invalid system paths early", async () => {
      const res = await adoptFolder("Adopt System", "/System")
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.message).toContain("cannot target system directory '/System'")
      }

      const lowerRes = await adoptFolder("Adopt Lower", "/applications")
      expect(lowerRes.ok).toBe(false)
      if (!lowerRes.ok) {
        expect(lowerRes.message).toContain("cannot target system directory '/applications'")
      }

      const emptyRes = await adoptFolder("Adopt Empty", "")
      expect(emptyRes.ok).toBe(false)
      if (!emptyRes.ok) {
        expect(emptyRes.message).toBe("Company destination path cannot be empty")
      }
    })

    it("adoptFolder handles template resolution errors gracefully without throwing", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false)
      const res = await adoptFolder("Missing Template Adopt", "/tmp/valid-co")
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.message).toContain("Unable to locate templates directory")
      }
    })

    it("restoreCompanyImpl rejects invalid system paths early", async () => {
      const execFn = vi.fn()
      const res = await restoreCompanyImpl(
        "Restore System",
        "https://github.com/example/repo.git",
        "/etc/target",
        undefined,
        execFn
      )
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.message).toContain("cannot target system directory '/etc/target'")
      }
      expect(execFn).not.toHaveBeenCalled()
    })
  })
})
