"use client"

import { useState, useTransition } from "react"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { describeOffer } from "@/lib/os/preferences/describe"
import type { PreferenceOffer } from "@/lib/os/preferences/offer"

export function offerResultText(r: { started: boolean; message: string }): string {
  return r.started ? "Started. The suggestions will show up in Approvals when they are ready." : r.message
}

/** Home's one-button offer. Pressing it starts the normal `learn-preferences` review; nothing changes until approved. */
export function PreferencesOffer({ companyId, offer }: { companyId: string; offer: PreferenceOffer }) {
  const view = describeOffer(offer)
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")
  return (
    <section className="pref-offer" aria-label="Preferences">
      <p>{view.text}</p>
      <button
        type="button"
        className="pref-btn"
        disabled={pending}
        title={view.title}
        onClick={() =>
          start(async () => {
            setNote("")
            try {
              setNote(offerResultText(await runCompanyCommand("learn-preferences", {}, companyId)))
            } catch {
              setNote("Couldn't start that. Try again.")
            }
          })
        }
      >
        {view.label}
      </button>
      {note && <small role="status">{note}</small>}
    </section>
  )
}
