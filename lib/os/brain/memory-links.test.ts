import { describe, expect, it } from "vitest"
import { buildLinkIndex, extractLinks, PATH_RE, WIKI_LINK_RE } from "./memory-links"

const paths = [
  "docs/decisions/a.md",
  "notes/company/sessions/s1.md",
  "notes/ideas.md",
  "definitions/ontology/Company.yaml",
]
const skills = [{ id: "digest", nodeId: "skill:digest" }]
const folders = {
  "definitions/": "hub:facts",
  "docs/decisions/": "hub:decisions",
  "notes/": "hub:notes",
  "notes/company/sessions/": "hub:sessions",
}
const index = buildLinkIndex(paths, skills, folders)

describe("extractLinks", () => {
  it("resolves [[stem]] and [[stem|alias]] case-insensitively", () => {
    expect(extractLinks("see [[IDEAS]] and [[company|the co]] and [[a#h]]", index, "x")).toEqual([
      "definitions/ontology/Company.yaml",
      "docs/decisions/a.md",
      "notes/ideas.md",
    ])
  })

  it("drops [[unknown]] and an ambiguous stem", () => {
    const dup = buildLinkIndex(["a/README.md", "b/README.md"], [], {})
    expect(extractLinks("[[readme]] [[unknown]]", dup, "x")).toEqual([])
  })

  it("resolves repo-relative path mentions that exist, ignores ones that don't", () => {
    expect(extractLinks("`docs/decisions/a.md` and docs/decisions/nope.md.", index, "x")).toEqual([
      "docs/decisions/a.md",
    ])
  })

  it("a folder mention links to that folder's hub", () => {
    expect(extractLinks("writes into notes/company/sessions/", index, "x")).toEqual(["hub:sessions"])
    expect(extractLinks("see (notes/other/)", index, "x")).toEqual(["hub:notes"])
  })

  it("a dead file path is dropped, not linked to its folder's hub", () => {
    expect(extractLinks("docs/decisions/nope.md", index, "x")).toEqual([])
    expect(extractLinks("notes/other/x.md", index, "x")).toEqual([])
  })

  it("/command mentions link to the skill", () => {
    expect(extractLinks("run /digest weekly", index, "x")).toEqual(["skill:digest"])
    expect(extractLinks("see https://x.com/digest", index, "x")).toEqual([])
  })

  it("never links to itself", () => {
    expect(extractLinks("[[ideas]] notes/ideas.md", index, "notes/ideas.md")).toEqual([])
  })

  it("exported regexes are safe to share between calls", () => {
    for (const re of [WIKI_LINK_RE, PATH_RE]) expect(re.lastIndex).toBe(0)
    extractLinks("[[ideas]] docs/decisions/a.md", index, "x")
    expect(extractLinks("[[ideas]]", index, "x")).toEqual(["notes/ideas.md"])
  })
})
