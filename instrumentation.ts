/**
 * Next.js runs register() once when the server process starts — including the
 * standalone server the packaged app launches — which is the one place in this
 * app that outlives any browser tab. That makes it the only honest home for
 * the daily-run ticker: schedules keep firing with every window closed, and
 * stop when you quit Alacrán.
 *
 * ponytail: a 60-second poll and a "HH:MM" comparison, not a cron parser.
 * Ceiling: daily-at-a-time only, minute granularity, and the app has to be
 * running (a laptop asleep at 07:00 gets its run when it wakes, not at 07:00).
 * Reach for a real cron expression or an OS-level launchd/systemd timer only
 * if someone actually needs sub-daily or app-closed runs.
 */
export async function register(): Promise<void> {
  // A positive `=== "nodejs"` guard with the import INSIDE it, not an early
  // return with the import after it. Next compiles this file for the edge
  // runtime too, substituting process.env.NEXT_RUNTIME with "edge" — which
  // makes this whole block dead code there, so webpack drops the import
  // rather than trying to bundle node:child_process for a runtime that has
  // no such thing. With the early-return shape the import sits outside the
  // dead branch and the edge build fails: every page 500s in `next dev`,
  // while `next build` passes because minification removes the unreachable
  // code before webpack complains.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runDueSchedulesImpl } = await import("./lib/schedules/schedules-impl")
    // Never let a bad tick take the server down: this runs unattended, forever.
    const tick = () => void runDueSchedulesImpl().catch(() => {})
    // unref so the timer alone never keeps the process alive.
    setInterval(tick, 60_000).unref()
    // Catch up immediately on launch, so opening the laptop at 09:00 still
    // gets you the 07:00 run rather than making you wait for the next tick.
    tick()
  }
}
