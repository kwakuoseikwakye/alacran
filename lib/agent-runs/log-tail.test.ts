import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createLogTail } from "./log-tail"

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(tmpdir(), "log-tail-"))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("createLogTail", () => {
  it("returns complete new lines on each read", () => {
    const file = path.join(dir, "run.log")
    writeFileSync(file, "one\ntwo\n")
    const tail = createLogTail(file)
    expect(tail.read()).toEqual(["one", "two"])
    appendFileSync(file, "three\n")
    expect(tail.read()).toEqual(["three"])
    expect(tail.read()).toEqual([])
  })

  it("holds a line back until its newline arrives", () => {
    const file = path.join(dir, "run.log")
    writeFileSync(file, '{"type":"assi')
    const tail = createLogTail(file)
    expect(tail.read()).toEqual([])
    appendFileSync(file, 'stant"}\n')
    expect(tail.read()).toEqual(['{"type":"assistant"}'])
  })

  it("keeps a multibyte character that a read splits in half", () => {
    const file = path.join(dir, "run.log")
    writeFileSync(file, "café ✎\n")
    const tail = createLogTail(file, 1) // one byte per read
    const lines: string[] = []
    for (let i = 0; i < 20; i++) lines.push(...tail.read())
    expect(lines).toEqual(["café ✎"])
  })

  it("hands over a last line with no newline once the writer is gone", () => {
    const file = path.join(dir, "run.log")
    writeFileSync(file, "a\nb")
    const tail = createLogTail(file)
    expect(tail.readRest()).toEqual(["a", "b"])
  })

  it("is empty, not an error, before the file exists", () => {
    expect(createLogTail(path.join(dir, "missing.log")).read()).toEqual([])
  })
})

describe("createLogTail from an offset", () => {
  it("reads only what was written after the offset", () => {
    const file = path.join(dir, "run.log")
    writeFileSync(file, "old\n")
    const tail = createLogTail(file, undefined, 4)
    appendFileSync(file, "new\n")
    expect(tail.read()).toEqual(["new"])
  })
})
