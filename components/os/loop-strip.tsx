import { LOOP_BEATS, type LoopBeatId } from "@/lib/os/loop"

/**
 * A labelled ordered list, current beat marked with aria-current (and drawn
 * bold and underlined in CSS, so it is never colour alone). Static: no hooks,
 * usable from server and client components alike.
 */
export function LoopStrip({ current, className }: { current?: LoopBeatId; className?: string }) {
  return (
    <ol className={`loop-strip${className ? ` ${className}` : ""}`} aria-label="How Alacrán works">
      {LOOP_BEATS.map((beat) => (
        <li key={beat.id} aria-current={beat.id === current ? "step" : undefined}>
          {beat.label}
        </li>
      ))}
    </ol>
  )
}
