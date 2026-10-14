import { describe, expect, it } from "vitest"
import { describeOffer } from "./describe"

const label = (id: string) => ({ "make-posts": "Make posts", digest: "Weekly digest" })[id] ?? id

describe("describeOffer", () => {
  it("says what was noticed, in plain words, with a written button label and a tooltip", () => {
    const v = describeOffer({ commands: [{ id: "make-posts", revisions: 3 }] }, label)
    expect(v.text).toBe("You've asked for changes to Make posts 3 times. Alacrán can look for what you keep asking for and suggest preferences for you to approve.")
    expect(v.label).toBe("Learn from my feedback")
    expect(v.title).toBe("Reads your recent change requests and proposes preference lines for you to approve. Nothing changes until you approve it.")
  })
  it("names several commands and falls back to the id when a command has no label", () => {
    const v = describeOffer({ commands: [{ id: "make-posts", revisions: 3 }, { id: "digest", revisions: 4 }, { id: "x-unknown", revisions: 3 }] }, label)
    expect(v.text).toContain("Make posts, Weekly digest and x-unknown")
    expect(v.text).not.toMatch(/\.(md|yaml|json)\b/)
  })
})
