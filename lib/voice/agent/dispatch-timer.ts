/**
 * The countdown between "the assistant heard a task" and "it is typed into the agent".
 *
 * Plain functions with the clock injectable, so the rules can be tested without a browser:
 * one countdown at a time, a send happens at most once per spoken task, and a stop is always safe.
 * Nothing here sends anything; the strip decides what firing means.
 */

export const DISPATCH_SECONDS = 5

// Grows for the life of the page; fine at spoken-task volume.
const claimed = new Set<string>()

/** True once per nonce, so a strip that mounts twice, or twice over, still sends once. */
export function claimDispatch(nonce: string): boolean {
  if (!nonce || claimed.has(nonce)) return false
  claimed.add(nonce)
  return true
}

let active: (() => void) | null = null

export const isDispatchActive = () => active !== null

/** Stops the running countdown, if any. Returns whether there was one. */
export function cancelActiveDispatch(): boolean {
  if (!active) return false
  active()
  return true
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void }

const realTimers: Timers = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (id) => clearInterval(id as ReturnType<typeof setInterval>),
}

export function startDispatchTimer(
  opts: { seconds: number; onTick: (left: number) => void; onFire: () => void; onCancel?: () => void },
  timers: Timers = realTimers
): { cancel: () => void } {
  // Never two at once: the older countdown stops, so only the newest task can be sent.
  if (active) active()
  let left = opts.seconds
  let done = false
  const finish = () => {
    if (done) return false
    done = true
    timers.clear(id)
    if (active === cancel) active = null
    return true
  }
  const cancel = () => {
    if (finish()) opts.onCancel?.()
  }
  const id = timers.set(() => {
    left -= 1
    if (left > 0) return opts.onTick(left)
    if (finish()) opts.onFire()
  }, 1000)
  active = cancel
  opts.onTick(left)
  return { cancel }
}

/**
 * Phrases that stop a pending send. Deliberately broad: a missed stop sends a task the owner did not
 * mean, while a false stop only costs them one more sentence. Matching is on whole words, so "know"
 * and "notes" are not stops; curly and straight apostrophes both count.
 */
const CANCEL =
  /\b(?:cancel|stop|wait|hold (?:on|up|it)|hang on|abort|never ?mind|don['’]?t|do not|not (?:that|yet)|nope|nah|no|scratch that|undo|wrong|forget (?:it|that)|leave it|skip (?:it|that)|ignore that)\b/i

export const isCancelWords = (text: string): boolean => CANCEL.test(text)

/** A cancel word spoken this soon after the task appeared is most likely part of the same sentence. */
export const SAME_UTTERANCE_MS = 700

export const heardCancel = (text: string, shownAt: number, now: number): boolean =>
  isCancelWords(text) && now - shownAt >= SAME_UTTERANCE_MS
