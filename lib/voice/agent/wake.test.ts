import { describe, expect, it } from "vitest"
import { END_NOTE, WAKE_FAILED, createWakeQueue } from "./wake"

describe("createWakeQueue", () => {
  it("keeps what the owner typed and whether they turned the mic on, and replays it once", () => {
    const q = createWakeQueue()
    q.queueText("Brief me")
    q.queueText("And the inbox")
    expect(q.toggleTalk()).toBe(true)
    expect(q.drain()).toEqual({ texts: ["Brief me", "And the inbox"], talk: true })
    expect(q.drain()).toEqual({ texts: [], talk: false })
  })
  it("does not open the mic when the owner turned it off again before it woke up", () => {
    const q = createWakeQueue()
    q.toggleTalk()
    expect(q.toggleTalk()).toBe(false)
    expect(q.drain().talk).toBe(false)
  })
  it("forgets everything when waking fails, so nothing is sent later by surprise", () => {
    const q = createWakeQueue()
    q.queueText("Brief me")
    q.toggleTalk()
    q.clear()
    expect(q.drain()).toEqual({ texts: [], talk: false })
  })
  it("says how many typed messages it dropped, so the owner can be told they were not sent", () => {
    const q = createWakeQueue()
    q.queueText("Brief me")
    q.queueText("And the inbox")
    expect(q.clear()).toBe(2)
    expect(q.clear()).toBe(0)
  })
})

describe("wording", () => {
  it("never says call", () => {
    for (const note of [...Object.values(END_NOTE), ...Object.values(WAKE_FAILED)]) if (note) expect(note).not.toMatch(/\bcall/i)
  })
  it("tells the owner how to carry on after a quiet stop", () => {
    expect(END_NOTE.silence).toBe("I stopped listening after 2 minutes of quiet. Press the mic to talk again.")
    expect(END_NOTE.user).toBeNull()
  })
})
