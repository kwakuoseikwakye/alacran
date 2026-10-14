import { CheckCircle2 } from "lucide-react"

/**
 * The fourth beat of the loop, said out loud: shown on Home for a little while
 * after the first approval (see savedRecently), so "it's saved" is something a
 * person is told rather than something the card flying away implies.
 */
export function SavedNotice() {
  return (
    <section className="home-first-welcome" aria-labelledby="saved-notice-title" role="status">
      <span className="home-first-welcome-icon">
        <CheckCircle2 aria-hidden />
      </span>
      <div>
        <p>Saved</p>
        <h2 id="saved-notice-title">Your first draft is saved</h2>
        <span>Alacrán keeps it in your company&apos;s files.</span>
      </div>
    </section>
  )
}
