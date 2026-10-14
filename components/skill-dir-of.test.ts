import { describe, it, expect } from "vitest"
import { skillDirOf } from "./workspace"

/**
 * What "Remove skill" deletes. A wrong pattern here does not misdraw a
 * label — it deletes the wrong directory, and `.claude/skills` itself is one
 * bad quantifier away. Every case below is a path this app really produces.
 */
describe("skillDirOf", () => {
  const root = "/Users/x/AI-Native/acme"

  it("returns the skill's own folder for a SKILL.md", () => {
    expect(skillDirOf(`${root}/.claude/skills/code-review/SKILL.md`)).toBe(`${root}/.claude/skills/code-review`)
  })

  it("never matches a command, which is a single file the ordinary Delete covers", () => {
    expect(skillDirOf(`${root}/.claude/commands/digest.md`)).toBeUndefined()
  })

  it("never matches a file that merely lives beside a skill", () => {
    expect(skillDirOf(`${root}/.claude/skills/code-review/references/patterns.md`)).toBeUndefined()
    expect(skillDirOf(`${root}/.claude/skills/UPSTREAM-marketing.md`)).toBeUndefined()
  })

  it("cannot climb out and target the skills directory itself", () => {
    // The bug this exists to prevent: a quantifier that crosses `/` would make
    // the whole pack, or every pack, the delete target.
    expect(skillDirOf(`${root}/.claude/skills/SKILL.md`)).toBeUndefined()
    expect(skillDirOf(`${root}/.claude/skills/a/b/SKILL.md`)).toBeUndefined()
  })

  it("ignores anything outside .claude/skills", () => {
    expect(skillDirOf(`${root}/docs/SKILL.md`)).toBeUndefined()
    expect(skillDirOf(`${root}/AGENTS.md`)).toBeUndefined()
  })
})
