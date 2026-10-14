import { describe, expect, it } from "vitest"
import { parseAckBatch, parseInputBatch } from "./input-batch"

describe("parseInputBatch", () => {
  it("accepts well-formed items", () => {
    expect(parseInputBatch({ type: "input-batch", items: [{ session: "abc", data: "ls\r" }] })).toEqual([
      { session: "abc", data: "ls\r" },
    ])
  })

  it("rejects an item whose session id isn't a valid id", () => {
    expect(parseInputBatch({ type: "input-batch", items: [{ session: "../x", data: "a" }] })).toBeNull()
  })

  it("rejects non-string data, a missing array, and oversized batches", () => {
    expect(parseInputBatch({ type: "input-batch", items: [{ session: "abc", data: 1 }] })).toBeNull()
    expect(parseInputBatch({ type: "input-batch" })).toBeNull()
    const many = Array.from({ length: 65 }, () => ({ session: "abc", data: "a" }))
    expect(parseInputBatch({ type: "input-batch", items: many })).toBeNull()
  })
})

describe("parseAckBatch", () => {
  const stream = "0b8a3c1e-2f4d-4a6b-9c8d-1e2f3a4b5c6d"

  it("accepts a stream id and whole, positive character counts", () => {
    expect(parseAckBatch({ type: "ack", stream, items: [{ session: "abc", n: 5000 }] })).toEqual({
      stream,
      items: [{ session: "abc", n: 5000 }],
    })
  })

  it("rejects counts that are not positive whole numbers", () => {
    for (const n of [0, -1, 1.5, "5", Number.POSITIVE_INFINITY]) {
      expect(parseAckBatch({ type: "ack", stream, items: [{ session: "abc", n }] })).toBeNull()
    }
  })

  it("rejects a malformed stream id or session id", () => {
    expect(parseAckBatch({ type: "ack", stream: "../etc", items: [{ session: "abc", n: 1 }] })).toBeNull()
    expect(parseAckBatch({ type: "ack", stream, items: [{ session: "a b", n: 1 }] })).toBeNull()
  })
})
