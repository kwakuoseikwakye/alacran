import { describe, it, expect, vi } from "vitest"
import type { ChildProcess } from "node:child_process"
import { restartAppImpl, LINUX_LAUNCHER_PATH, type SpawnFn } from "./restart-app-impl"

describe("restartAppImpl", () => {
  it("spawns the launcher detached and unrefs it", () => {
    const unref = vi.fn()
    const spawnFn: SpawnFn = vi.fn(() => ({ unref }) as unknown as ChildProcess)

    restartAppImpl(spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(LINUX_LAUNCHER_PATH, [], { detached: true, stdio: "ignore" })
    expect(unref).toHaveBeenCalled()
  })

  it("accepts an override launcher path (for tests / non-default installs)", () => {
    const unref = vi.fn()
    const spawnFn: SpawnFn = vi.fn(() => ({ unref }) as unknown as ChildProcess)

    restartAppImpl(spawnFn, "/custom/path/alacran")

    expect(spawnFn).toHaveBeenCalledWith("/custom/path/alacran", [], { detached: true, stdio: "ignore" })
  })
})
