import { describe, expect, it } from "vitest"
import { createInputQueue, type InputItem } from "./input-queue"

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("createInputQueue", () => {
  it("merges keystrokes made in the same turn into one request", async () => {
    const sent: InputItem[][] = []
    const q = createInputQueue(async (items) => void sent.push(items))
    q.enqueue("a", "l")
    q.enqueue("a", "s")
    q.enqueue("b", "x")
    await tick()
    expect(sent).toEqual([[{ session: "a", data: "ls" }, { session: "b", data: "x" }]])
  })

  it("keeps one request in flight and sends what piled up, in order, after it", async () => {
    const sent: InputItem[][] = []
    let release!: () => void
    const q = createInputQueue((items) => {
      sent.push(items)
      return sent.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve()
    })
    q.enqueue("a", "1")
    await tick()
    q.enqueue("a", "2")
    q.enqueue("a", "3")
    await tick()
    expect(sent).toHaveLength(1)
    release()
    await tick()
    expect(sent).toEqual([[{ session: "a", data: "1" }], [{ session: "a", data: "23" }]])
  })

  it("keeps going after a failed request", async () => {
    const sent: InputItem[][] = []
    const q = createInputQueue(async (items) => {
      sent.push(items)
      if (sent.length === 1) throw new Error("server restarting")
    })
    q.enqueue("a", "1")
    await tick()
    q.enqueue("a", "2")
    await tick()
    expect(sent.map((batch) => batch[0].data)).toEqual(["1", "2"])
  })
})
