import { describe, it, expect, beforeEach, vi } from "vitest"
import { memoizedReadFile, clearFileMemo } from "./file-memo"

describe("memoizedReadFile", () => {
  beforeEach(() => clearFileMemo())

  it("reads once when mtime is unchanged", async () => {
    const read = vi.fn().mockResolvedValue("contents")
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    await memoizedReadFile("/a.yaml", read, stat)
    await memoizedReadFile("/a.yaml", read, stat)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("re-reads when mtime moves", async () => {
    const read = vi.fn().mockResolvedValue("contents")
    const stat = vi.fn()
      .mockResolvedValueOnce({ mtimeMs: 100 })
      .mockResolvedValueOnce({ mtimeMs: 200 })
    await memoizedReadFile("/a.yaml", read, stat)
    await memoizedReadFile("/a.yaml", read, stat)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("does not cache a rejection", async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("contents")
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    await expect(memoizedReadFile("/a.yaml", read, stat)).rejects.toThrow("ENOENT")
    await expect(memoizedReadFile("/a.yaml", read, stat)).resolves.toBe("contents")
  })
})
