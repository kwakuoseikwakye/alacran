"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AgentStage } from "@/components/assistant/agent-stage"
import { AssistantStage, type AssistantCompany } from "@/components/assistant/assistant-stage"
import type { AssistantPersona } from "@/lib/assistant/persona"
import type { VoiceProviderId } from "@/lib/voice/providers"
import type { AiExecutorId } from "@/lib/ai-executors"
import { CONDUCTOR_TOGGLE_EVENT } from "@/components/os/topbar"

const DOCK_OPEN_KEY = "alacran-dock-open"
const DOCK_EXPANDED_KEY = "alacran-dock-expanded"
const DOCK_WIDTH = "560px"
// Wide enough for the Nexus full layout (820px, NEXUS_WIDE_PX) on any window from about 1170px up.
const DOCK_WIDTH_EXPANDED = "clamp(560px, 70vw, 1280px)"
export const ASSISTANT_OPEN_EVENT = "alacran-open-assistant"

/**
 * Docks the existing assistant stage onto the right edge of every company
 * route, instead of it living on its own full-bleed `/assistant` page. The
 * stage itself (`components/assistant/*`) is unmodified — this only wraps it
 * and owns the open/closed/expanded state.
 *
 * `defaultOpen` is `?dock=open`, which is where the `/assistant` legacy
 * redirect lands (see the COMPANY_SCOPED table in lib/os/active-company.ts).
 * React state starts at that value (matching the server-rendered markup) and
 * corrects from localStorage in an effect afterwards — reading storage during
 * render would render a different tree on the server than the client, the
 * same hydration trap the sub-nav collapse toggle avoids in shell.tsx.
 *
 * The stage is only ever mounted while `open` — it is NOT kept alive at
 * zero width. `AssistantStage` runs a 60fps rAF loop for the orb plus several
 * other effects; hiding it with CSS would keep all of that running on every
 * company route whether or not anyone ever opens the dock. Losing in-dock
 * conversation state on close is no regression — before this dock existed,
 * the assistant was a separate page, and navigating away already discarded
 * it the same way.
 */
export function AssistantDock({
  companyId,
  defaultOpen,
  companies,
  voiceProviderId = "browser",
  voiceReady = true,
  persona = null,
  initialExecutorId,
  elevenlabsAgentReady = false,
  autoDispatchCompanies = [],
}: {
  companyId: string
  defaultOpen: boolean
  companies: AssistantCompany[]
  voiceProviderId?: VoiceProviderId
  voiceReady?: boolean
  persona?: AssistantPersona | null
  initialExecutorId: AiExecutorId
  elevenlabsAgentReady?: boolean
  autoDispatchCompanies?: string[]
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [expanded, setExpanded] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState("")

  useEffect(() => {
    try {
      // The URL already forced it open — storage doesn't get a vote on that
      // one, but the expanded choice is independent of how it was opened.
      if (!defaultOpen && window.localStorage.getItem(DOCK_OPEN_KEY) === "1") setOpen(true)
      if (window.localStorage.getItem(DOCK_EXPANDED_KEY) === "1") setExpanded(true)
    } catch {
      /* ignore — falls back to the defaults above */
    }
    // Only meant to run once, on mount, like the sub-nav's own correction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleToggle() {
      setOpen((prev) => {
        const next = !prev
        persist(next, expanded)
        return next
      })
    }
    window.addEventListener(CONDUCTOR_TOGGLE_EVENT, handleToggle)
    return () => window.removeEventListener(CONDUCTOR_TOGGLE_EVENT, handleToggle)
  }, [expanded])

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: string; companyId?: string }>).detail
      const prompt = detail?.prompt?.trim() ?? ""
      if (detail?.companyId && detail.companyId !== companyId) return
      setInitialPrompt(prompt)
      setOpen(true)
      persist(true, expanded)
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, handleOpen)
  }, [expanded, companyId])

  // The content pane reads --dock-w to glide aside (see .app-shell-main /
  // .os-dock in globals.css). Pinned to 0px on :root so a page that never
  // mounts this component is unaffected — and removed here on cleanup for
  // the same reason: if THIS instance stops mounting anywhere (no active
  // company, say) while the dock was last open, nothing would otherwise ever
  // put the variable back to 0.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--dock-w",
      open ? (expanded ? DOCK_WIDTH_EXPANDED : DOCK_WIDTH) : "0px"
    )
    return () => {
      document.documentElement.style.removeProperty("--dock-w")
    }
  }, [open, expanded])

  function persist(nextOpen: boolean, nextExpanded: boolean) {
    try {
      window.localStorage.setItem(DOCK_OPEN_KEY, nextOpen ? "1" : "0")
      window.localStorage.setItem(DOCK_EXPANDED_KEY, nextExpanded ? "1" : "0")
    } catch {
      /* ignore — the choice just won't survive a reload */
    }
  }

  function toggleOpen() {
    const next = !open
    setOpen(next)
    persist(next, expanded)
  }

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    persist(open, next)
  }

  return (
    <>
      <div className="os-dock-controls">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-controls="assistant-dock"
          className="os-dock-toggle"
          title={open ? "Close the assistant" : "Open the assistant"}
        >
          <span aria-hidden>{open ? "›" : "‹"}</span>
          <span className="sr-only">{open ? "Close the assistant" : "Open the assistant"}</span>
        </button>

        {open ? (
          <button
            type="button"
            onClick={toggleExpand}
            aria-pressed={expanded}
            className="os-dock-expand"
            title={expanded ? "Shrink the assistant" : "Expand the assistant"}
          >
            <span aria-hidden>{expanded ? "⤡" : "⤢"}</span>
            <span className="sr-only">
              {expanded ? "Shrink the assistant" : "Expand the assistant"}
            </span>
          </button>
        ) : null}
      </div>

      <aside id="assistant-dock" className="os-dock" aria-label={`Assistant — ${companyId}`}>
        {open ? (
          voiceProviderId === "elevenlabs" && voiceReady && elevenlabsAgentReady ? (
            // initialPrompt (a question handed over from the Ask page) is not forwarded to the agent screen in this slice.
            <AgentStage
              key={`${companyId}:agent:${persona ? "ready" : "setup"}`}
              companies={companies}
              persona={persona}
              initialScope={companyId}
              initialExecutorId={initialExecutorId}
              autoDispatchCompanies={autoDispatchCompanies}
              onClose={toggleOpen}
            />
          ) : (
            <>
              {voiceProviderId === "elevenlabs" ? (
                <p role="status" className="asst-root !block !h-auto border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
                  ElevenLabs isn&apos;t set up yet. Add your key and create the agent in{" "}
                  <Link className="underline" href="/system/settings">Settings</Link>.
                </p>
              ) : null}
              <AssistantStage
                key={`${companyId}:${persona ? "ready" : "setup"}`}
                initialScope={companyId}
                companies={companies}
                voiceProviderId={voiceProviderId}
                voiceReady={voiceReady}
                persona={persona}
                initialExecutorId={initialExecutorId}
                initialPrompt={initialPrompt}
                onInitialPromptUsed={() => setInitialPrompt("")}
                onClose={toggleOpen}
              />
            </>
          )
        ) : null}
      </aside>
    </>
  )
}
