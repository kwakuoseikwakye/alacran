import { describe, it, expect } from "vitest"
import { parseFrontmatter } from "./parse-frontmatter"

describe("parseFrontmatter", () => {
  it("extracts name and description from well-formed frontmatter", () => {
    const content = "---\nname: piro\ndescription: Generates Kiro-compatible specs.\n---\n\n# piro\n"
    expect(parseFrontmatter(content)).toEqual({ name: "piro", description: "Generates Kiro-compatible specs." })
  })

  it("returns an empty object when there is no frontmatter", () => {
    const content = "# Just a heading\n\nSome body text.\n"
    expect(parseFrontmatter(content)).toEqual({})
  })

  it("returns whatever fields are present when one is missing", () => {
    const content = "---\nname: verify\n---\n\n# /verify\n"
    expect(parseFrontmatter(content)).toEqual({ name: "verify" })
  })

  it("ignores extra frontmatter fields", () => {
    const content = "---\nname: office\ndescription: Runs the office script.\nallowed-tools: Bash\n---\n"
    expect(parseFrontmatter(content)).toEqual({ name: "office", description: "Runs the office script." })
  })

  it("returns an empty object when the frontmatter block is never closed", () => {
    const content = "---\nname: broken\ndescription: no closing delimiter\n\n# body without closing ---\n"
    expect(parseFrontmatter(content)).toEqual({})
  })
})
