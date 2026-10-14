import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DISPATCH_SECONDS,
  cancelActiveDispatch,
  claimDispatch,
  heardCancel,
  isCancelWords,
  isDispatchActive,
  SAME_UTTERANCE_MS,
  startDispatchTimer,
} from "./dispatch-timer"

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cancelActiveDispatch()
  vi.useRealTimers()
})

function start() {
  const onTick = vi.fn()
  const onFire = vi.fn()
  const onCancel = vi.fn()
  const timer = startDispatchTimer({ seconds: DISPATCH_SECONDS, onTick, onFire, onCancel })
  return { onTick, onFire, onCancel, timer }
}

describe("startDispatchTimer", () => {
  it("counts down and fires exactly once after the full time", () => {
    const { onTick, onFire } = start()
    vi.advanceTimersByTime(DISPATCH_SECONDS * 1000 - 1)
    expect(onFire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFire).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onTick.mock.calls.map((c) => c[0])).toEqual([5, 4, 3, 2, 1])
    expect(isDispatchActive()).toBe(false)
  })

  it("sends nothing after a cancel", () => {
    const { onFire, onCancel, timer } = start()
    vi.advanceTimersByTime(2000)
    timer.cancel()
    vi.advanceTimersByTime(60_000)
    expect(onFire).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(isDispatchActive()).toBe(false)
  })

  it("cancelling twice, or after it fired, does nothing more", () => {
    const { onCancel, timer } = start()
    timer.cancel()
    timer.cancel()
    expect(onCancel).toHaveBeenCalledTimes(1)
    const second = start()
    vi.advanceTimersByTime(DISPATCH_SECONDS * 1000)
    second.timer.cancel()
    expect(second.onCancel).not.toHaveBeenCalled()
  })

  // Review focus 5: the spoken-cancel path and the dock-close path both land here.
  it("cancelActiveDispatch stops the running countdown and says whether there was one", () => {
    const { onFire, onCancel } = start()
    expect(isDispatchActive()).toBe(true)
    expect(cancelActiveDispatch()).toBe(true)
    expect(cancelActiveDispatch()).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(onFire).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // Review focus 4: never two at once.
  it("starting a second countdown cancels the first, so only the second can fire", () => {
    const first = start()
    const second = start()
    vi.advanceTimersByTime(DISPATCH_SECONDS * 1000)
    expect(first.onCancel).toHaveBeenCalledTimes(1)
    expect(first.onFire).not.toHaveBeenCalled()
    expect(second.onFire).toHaveBeenCalledTimes(1)
  })
})

describe("claimDispatch", () => {
  // Review focus 4: a strip that mounts twice still sends once.
  it("is true once per nonce", () => {
    expect(claimDispatch("n-1")).toBe(true)
    expect(claimDispatch("n-1")).toBe(false)
    expect(claimDispatch("n-2")).toBe(true)
  })

  it("never claims an empty nonce", () => {
    expect(claimDispatch("")).toBe(false)
  })
})

describe("isCancelWords", () => {
  it.each([
    "cancel that",
    "wait",
    "No, stop",
    "don't send it",
    "don’t send it",
    "do not send that",
    "never mind",
    "hold on a second",
    "hang on",
    "hold it",
    "nope",
    "nah",
    "scratch that",
    "undo that",
    "that's wrong",
    "abort",
    "forget it",
    "forget that",
    "leave it",
    "skip it",
    "skip that",
    "ignore that",
  ])("hears %s as a cancel", (text) => expect(isCancelWords(text)).toBe(true))

  it.each(["tidy the headings in notes", "I know what to do", "yes go ahead", "I know the notes", "knowledge base", "the skipper forgot the notes"])(
    "does not hear %s as a cancel",
    (text) => expect(isCancelWords(text)).toBe(false)
  )
})

describe("heardCancel", () => {
  it("ignores cancel words in the same utterance as the task", () => {
    expect(heardCancel("no, tidy the notes", 1000, 1100)).toBe(false)
  })
  it("ignores cancel words one millisecond inside the guard", () => {
    expect(heardCancel("cancel", 1000, 1000 + SAME_UTTERANCE_MS - 1)).toBe(false)
  })
  it("hears cancel words at the guard edge and later", () => {
    expect(heardCancel("cancel", 1000, 1000 + SAME_UTTERANCE_MS)).toBe(true)
    expect(heardCancel("cancel", 1000, 3000)).toBe(true)
  })
  it("never hears non-cancel text", () => {
    expect(heardCancel("yes go ahead", 1000, 9000)).toBe(false)
  })
})
