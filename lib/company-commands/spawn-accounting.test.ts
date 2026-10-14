import { describe, it, expect, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getCompanyCommandResultImpl } from "@/lib/company-commands/company-command-result-impl"

describe("git spawn accounting", () => {
  it("spawns once when strays are wanted, zero times when they are not", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "spawn-data-"))
    const root = await mkdtemp(path.join(tmpdir(), "spawn-root-"))
    try {
      await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
      await writeFile(
        path.join(dataDir, "digest.run.json"),
        JSON.stringify({
          commandId: "digest", outputKind: "new-file-in-dir",
          outputPath: "notes/company/digests", before: [], beforeDirty: [],
        })
      )
      const spy = vi.fn(async () => ({ stdout: "", stderr: "" }))

      await getCompanyCommandResultImpl("digest", dataDir, root, spy, true)
      expect(spy, "wanted -> one git call").toHaveBeenCalledTimes(1)

      spy.mockClear()
      await getCompanyCommandResultImpl("digest", dataDir, root, spy, false)
      expect(spy, "hot path -> no git call at all").toHaveBeenCalledTimes(0)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  })
})
