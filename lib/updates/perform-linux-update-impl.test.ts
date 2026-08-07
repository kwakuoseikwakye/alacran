import { describe, it, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { performLinuxUpdateImpl, type ExecFileFn, type FetchLike } from "./perform-linux-update-impl"

function fakeFetch(body: string, ok = true): FetchLike {
  return async () => ({ ok, arrayBuffer: async () => new TextEncoder().encode(body).buffer })
}

describe("performLinuxUpdateImpl", () => {
  it("downloads the .deb and installs it via pkexec dpkg -i", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linux-update-"))
    const debPath = path.join(dir, "Alacran.deb")
    try {
      const calls: { command: string; args: string[] }[] = []
      const execFn: ExecFileFn = async (command, args) => {
        calls.push({ command, args })
        return { stdout: "", stderr: "" }
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("fake-deb-bytes"), debPath)

      expect(result).toEqual({ ok: true })
      expect(await readFile(debPath, "utf-8")).toBe("fake-deb-bytes")
      expect(calls).toEqual([
        { command: "which", args: ["pkexec"] },
        { command: "pkexec", args: ["dpkg", "-i", debPath] },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("fails without writing anything when the download itself fails", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linux-update-"))
    const debPath = path.join(dir, "Alacran.deb")
    try {
      const execFn: ExecFileFn = async () => ({ stdout: "", stderr: "" })
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("", false), debPath)

      expect(result.ok).toBe(false)
      await expect(readFile(debPath, "utf-8")).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("falls back to a manual command when pkexec isn't installed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linux-update-"))
    const debPath = path.join(dir, "Alacran.deb")
    try {
      const execFn: ExecFileFn = async (command) => {
        if (command === "which") throw new Error("not found")
        throw new Error("should not reach pkexec")
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("bytes"), debPath)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.manualCommand).toBe(`sudo apt install ${debPath}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("falls back to a manual command when pkexec runs but dpkg fails (e.g. the user cancels)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linux-update-"))
    const debPath = path.join(dir, "Alacran.deb")
    try {
      const execFn: ExecFileFn = async (command) => {
        if (command === "which") return { stdout: "/usr/bin/pkexec", stderr: "" }
        throw new Error("Request dismissed")
      }
      const result = await performLinuxUpdateImpl(execFn, fakeFetch("bytes"), debPath)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe("Request dismissed")
        expect(result.manualCommand).toBe(`sudo apt install ${debPath}`)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
