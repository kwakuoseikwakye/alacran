import { describe, it, expect } from "vitest"
import { LOOP_BEATS } from "./loop"

describe("LOOP_BEATS", () => {
  it("is the four beats of how Alacrán works, in order", () => {
    expect(LOOP_BEATS.map((beat) => beat.id)).toEqual(["ask", "draft", "approve", "saved"])
    expect(LOOP_BEATS.map((beat) => beat.label)).toEqual(["You ask", "Alacrán drafts", "You approve", "Alacrán remembers it"])
  })
})
