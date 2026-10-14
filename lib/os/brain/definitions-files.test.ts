import { describe, it, expect, vi } from "vitest"
import { readDefinitionsTree } from "./definitions-files"

function entry(name: string, dir: boolean) {
  return { name, isDirectory: () => dir }
}

describe("readDefinitionsTree", () => {
  it("returns an empty tree when definitions/ doesn't exist yet", async () => {
    const readDirFn = vi.fn(async () => {
      throw Object.assign(new Error("no"), { code: "ENOENT" })
    })
    const tree = await readDefinitionsTree("/co", readDirFn)
    expect(tree).toEqual([])
  })

  it("reads nested files with their content, sorted alphabetically", async () => {
    const readDirFn = vi.fn(async (dir: string) => {
      if (dir === "/co/definitions") return [entry("ontology", true), entry("about.md", false)]
      if (dir === "/co/definitions/ontology") return [entry("company.yaml", false)]
      throw new Error("unexpected dir " + dir)
    })
    const readFileFn = vi.fn(async (file: string) => (file.endsWith("company.yaml") ? "customer: {}" : "hello"))
    const tree = await readDefinitionsTree("/co", readDirFn, readFileFn)

    expect(tree.map((n) => n.name)).toEqual(["about.md", "ontology"])
    const ontology = tree[1]
    if (ontology.kind !== "dir") throw new Error("expected dir")
    expect(ontology.children).toEqual([
      { name: "company.yaml", path: "definitions/ontology/company.yaml", kind: "file", content: "customer: {}" },
    ])
  })

  it("skips dotfiles", async () => {
    const readDirFn = vi.fn(async () => [entry(".DS_Store", false), entry("company.yaml", false)])
    const readFileFn = vi.fn(async () => "x")
    const tree = await readDefinitionsTree("/co", readDirFn, readFileFn)
    expect(tree.map((n) => n.name)).toEqual(["company.yaml"])
  })
})
