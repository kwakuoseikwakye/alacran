import { describe, it, expect, vi } from "vitest"
import type { ChildProcess } from "node:child_process"
import { restartAppImpl, LINUX_LAUNCHER_PATH, type SpawnFn } from "./restart-app-impl"

describe("restartAppImpl", () => {
  it("spawns the launcher detached and unrefs it", () => {
    const unref = vi.fn()
    const spawnFn: SpawnFn = vi.fn(() => ({ unref, on: vi.fn() }) as unknown as ChildProcess)

    restartAppImpl(spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(LINUX_LAUNCHER_PATH, [], { detached: true, stdio: "ignore" })
    expect(unref).toHaveBeenCalled()
  })

  it("accepts an override launcher path (for tests / non-default installs)", () => {
    const unref = vi.fn()
    const spawnFn: SpawnFn = vi.fn(() => ({ unref, on: vi.fn() }) as unknown as ChildProcess)

    restartAppImpl(spawnFn, "/custom/path/alacran")

    expect(spawnFn).toHaveBeenCalledWith("/custom/path/alacran", [], { detached: true, stdio: "ignore" })
  })

  // The existing two cases above are Linux's fixed /usr/bin/alacran. macOS has
  // no fixed path — the bundle is wherever the user dragged it.
  it("on darwin, reopens the bundle it is actually running from", () => {
    const unref = vi.fn()
    const spawnFn: SpawnFn = vi.fn(() => ({ unref, on: vi.fn() }) as unknown as ChildProcess)

    restartAppImpl(spawnFn, LINUX_LAUNCHER_PATH, "darwin", "/Volumes/External/Alacrán.app")

    expect(spawnFn).toHaveBeenCalledWith("open", ["-a", "/Volumes/External/Alacrán.app"], {
      detached: true,
      stdio: "ignore",
    })
    expect(unref).toHaveBeenCalled()
  })

  it("on darwin outside a bundle (dev), falls through rather than opening a guessed path", () => {
    const spawnFn: SpawnFn = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }) as unknown as ChildProcess)

    restartAppImpl(spawnFn, "/custom/alacran", "darwin", null)

    expect(spawnFn).toHaveBeenCalledWith("/custom/alacran", [], { detached: true, stdio: "ignore" })
  })
})
