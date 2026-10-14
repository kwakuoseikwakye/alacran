"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react"
import { elapsed } from "@/lib/agent-runs/run-view"
import { DESK_NAMES, STATE_WORDS, nextPollDelay, statusLine, type Office } from "@/lib/os/office/types"
import { planOffice, type OfficePlan } from "@/lib/os/office/plan"
import { Director, type Person } from "@/lib/os/office/director"
import { MOODS, moodFor, type MoodName } from "./office-moods"
import type { OfficeScene, SceneMode } from "./office-scene"

/** The office follows the app's theme, live: data-theme on <html> is the one source. */
function useAppMood(): MoodName {
  const [mood, setMood] = useState<MoodName>("dark")
  useEffect(() => {
    const read = () => setMood(moodFor(document.documentElement.dataset.theme))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])
  return mood
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const read = () => setReduced(query.matches)
    read()
    query.addEventListener("change", read)
    return () => query.removeEventListener("change", read)
  }, [])
  return reduced
}

type Scenery = { plan: OfficePlan; director: Director }

type SceneParams = {
  active: boolean
  mode: SceneMode
  scenery: Scenery | null
  moodName: MoodName
  reducedMotion: boolean
  office: Office | null
  visible: boolean
  following: string | null
  onSelect: (person: Person) => void
}

/** "unavailable" only when this machine cannot draw it (no WebGL, models failed); the stage keeps its space otherwise. */
type SceneStatus = "loading" | "ready" | "unavailable"

/** Mounts the 3D office into `host` while active. Rebuilds on a theme or plan change. */
function useOfficeScene(host: RefObject<HTMLDivElement | null>, params: SceneParams): SceneStatus {
  const { active, mode, scenery, moodName, reducedMotion, office, visible, following } = params
  const scene = useRef<OfficeScene | null>(null)
  const latest = useRef(office)
  latest.current = office
  const live = useRef({ visible, following })
  live.current = { visible, following }
  const select = useRef(params.onSelect)
  select.current = params.onSelect
  const [status, setStatus] = useState<SceneStatus>("loading")
  const [epoch, setEpoch] = useState(0)

  // Scenes on their way out: frozen on their last frame until the next one draws, then faded.
  const retiring = useRef<{ scene: OfficeScene; layer: HTMLDivElement; timer: ReturnType<typeof setTimeout> }[]>([])

  useEffect(() => {
    const stage = host.current
    if (!active || !stage || !scenery) return
    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    // Each scene draws in its own layer, so a rebuild (theme or room change) can crossfade.
    const layer = document.createElement("div")
    layer.className = "office-layer"
    stage.appendChild(layer)
    import("./office-scene")
      .then(({ mountOfficeScene }) =>
        mountOfficeScene(layer, scenery.plan, {
          mode,
          mood: MOODS[moodName],
          director: scenery.director,
          reducedMotion,
          onSelect: (person) => select.current(person),
          onContextLost: () => {
            // After sleep or a GPU reset: show the list, then build a fresh scene.
            setStatus("loading")
            retry = setTimeout(() => setEpoch((e) => e + 1), 500)
          },
        })
      )
      .then((mounted) => {
        if (disposed || !mounted) {
          mounted?.dispose()
          layer.remove()
          if (!disposed) setStatus("unavailable")
          return
        }
        scene.current = mounted
        if (latest.current) mounted.setOffice(latest.current)
        // A rebuild can finish inside the same render batch, so `status` never changes and the
        // effects below never run again: hand the new scene who is followed and whether it shows.
        mounted.setVisible(live.current.visible)
        mounted.follow(live.current.following)
        // The scene this one replaces fades out underneath it.
        for (const old of retiring.current.splice(0)) {
          clearTimeout(old.timer)
          old.layer.classList.add("office-layer-out")
          setTimeout(() => {
            old.scene.dispose()
            old.layer.remove()
          }, 320)
        }
        setStatus("ready")
      })
      .catch(() => {
        layer.remove()
        if (!disposed) setStatus("unavailable")
      })
    return () => {
      disposed = true
      clearTimeout(retry)
      const old = scene.current
      scene.current = null
      setStatus("loading")
      if (!old) return
      // Hold its last frame until the next scene draws; if none comes (closed, scrolled to
      // full-screen, unmounted) it goes anyway.
      old.setVisible(false)
      const entry = {
        scene: old,
        layer,
        timer: setTimeout(() => {
          retiring.current = retiring.current.filter((e) => e !== entry)
          old.dispose()
          layer.remove()
        }, 1500),
      }
      retiring.current.push(entry)
    }
  }, [active, mode, scenery, moodName, reducedMotion, epoch, host])

  useEffect(() => {
    if (office) scene.current?.setOffice(office)
  }, [office, status])
  useEffect(() => {
    scene.current?.setVisible(visible)
  }, [visible, status])
  useEffect(() => {
    scene.current?.follow(following)
  }, [following, status])
  return status
}

export function OfficeCard({ companyId }: { companyId: string }) {
  const router = useRouter()
  const card = useRef<HTMLElement>(null)
  const smallHost = useRef<HTMLDivElement>(null)
  const bigHost = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [office, setOffice] = useState<Office | null>(null)
  const [failing, setFailing] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [seen, setSeen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [following, setFollowing] = useState<string | null>(null)
  const followingRef = useRef(following)
  followingRef.current = following
  const [now, setNow] = useState(() => Date.now())
  // The spoken summary moves once per poll; `now` ticks every second for the full-screen clock.
  const [polledAt, setPolledAt] = useState(() => Date.now())
  const moodName = useAppMood()
  const reducedMotion = useReducedMotion()

  // One director per floor plan: it outlives scene rebuilds (theme switch, full-screen), so nobody jumps.
  const [scenery, setScenery] = useState<Scenery | null>(null)
  const sceneryKey = useRef("")
  const directorRef = useRef<Director | null>(null)
  useEffect(() => {
    if (!office) return
    const key = `${office.rooms.map((r) => r.id).join("|")}#${reducedMotion}`
    if (key !== sceneryKey.current || !directorRef.current) {
      sceneryKey.current = key
      const plan = planOffice(office.rooms)
      // The old director hands everyone over, so someone whose job opened a new room walks into it.
      directorRef.current = new Director(plan, { reducedMotion, from: directorRef.current })
      setScenery({ plan, director: directorRef.current })
    }
    directorRef.current.sync(office, Date.now())
  }, [office, reducedMotion])

  useEffect(() => {
    const element = card.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      setOnScreen(entry.isIntersecting)
      if (entry.isIntersecting) setSeen(true)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Poll only while someone can see it. A failure keeps the last good office and backs off.
  useEffect(() => {
    if (!onScreen && !expanded) return
    let cancelled = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (!document.hidden) {
        try {
          const response = await fetch(`/api/office/${encodeURIComponent(companyId)}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) })
          if (!response.ok) throw new Error(`office ${response.status}`)
          const next = (await response.json()) as Office
          if (cancelled) return
          failures = 0
          setOffice(next)
          setFailing(false)
        } catch {
          if (cancelled) return
          failures += 1
          setFailing(true)
        }
        const at = Date.now()
        setNow(at)
        setPolledAt(at)
      }
      if (!cancelled) timer = setTimeout(poll, nextPollDelay(failures))
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [companyId, onScreen, expanded])

  const close = useCallback(() => {
    setExpanded(false)
    setFollowing(null)
    requestAnimationFrame(() => expandButton.current?.focus())
  }, [])

  useEffect(() => {
    if (!expanded) return
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      if (followingRef.current) setFollowing(null)
      else close()
    }
    window.addEventListener("keydown", onKey)
    const ticker = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.removeEventListener("keydown", onKey)
      clearInterval(ticker)
    }
  }, [expanded, close])

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !overlay.current) return
    const focusable = [...overlay.current.querySelectorAll<HTMLElement>("button, a[href]")]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    // After a click on the picture the dialog itself holds focus: Tab goes back in, never out.
    if (document.activeElement === overlay.current) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const selectInCard = useCallback(
    (person: Person) => {
      if (person.href) router.push(person.href)
    },
    [router]
  )
  const selectInFull = useCallback((person: Person) => setFollowing(person.id), [])

  const smallStatus = useOfficeScene(smallHost, {
    active: seen && !expanded,
    mode: "card",
    scenery,
    moodName,
    reducedMotion,
    office,
    visible: onScreen,
    following: null,
    onSelect: selectInCard,
  })
  useOfficeScene(bigHost, {
    active: expanded,
    mode: "full",
    scenery,
    moodName,
    reducedMotion,
    office,
    visible: expanded,
    following,
    onSelect: selectInFull,
  })

  const workers = office?.desks.flatMap((desk) => desk.workers.map((worker) => ({ desk: desk.id, worker }))) ?? []
  const residents = scenery?.director.people.filter((p) => p.kind === "resident") ?? []
  const followed = following ? scenery?.director.people.find((p) => p.id === following) : undefined
  const stateWord = (p: Person) => (p.state === "idle" || p.state === "leaving" ? "Idle" : STATE_WORDS[p.state])

  return (
    <section ref={card} className="office-card" aria-labelledby="office-title">
      <div className="native-section-head">
        <h2 id="office-title">Who&apos;s working</h2>
        <button
          ref={expandButton}
          type="button"
          className="office-expand"
          onClick={() => setExpanded(true)}
          title="See the whole office full-screen. Drag to turn it, scroll to zoom, click someone to follow them."
        >
          Expand office
        </button>
      </div>

      <div
        ref={smallHost}
        className={`office-stage${failing ? " office-stale" : ""}${smallStatus === "unavailable" ? " office-stage-empty" : ""}`}
        data-mood={moodName}
      />

      <p className="office-summary" aria-live="polite">
        {statusLine(office, failing, polledAt)}
      </p>

      {/* The same work as the figures, for keyboards and screen readers; shown outright when there is no 3D. */}
      <ul className={smallStatus === "unavailable" ? "office-list" : "sr-only"}>
        {workers.map(({ desk, worker }) => {
          const text = `${worker.label}, ${STATE_WORDS[worker.state]} (${DESK_NAMES[desk]})`
          return <li key={worker.id}>{worker.href ? <Link href={worker.href}>{text}</Link> : text}</li>
        })}
        {office?.desks.map((desk) => (desk.note ? <li key={`note:${desk.id}`}>{desk.note}</li> : null))}
      </ul>

      {expanded && (
        <div ref={overlay} className="office-overlay" role="dialog" aria-modal="true" aria-label="Office, full-screen" data-mood={moodName} onKeyDown={trapFocus} tabIndex={-1}>
          <div ref={bigHost} className="office-overlay-stage" />
          <div className="office-chips" aria-label="Your AIs">
            {residents.map((p) => (
              <button
                key={p.id}
                type="button"
                className="office-chip"
                data-status={p.state === "leaving" ? "idle" : p.state}
                aria-pressed={following === p.id}
                onClick={() => setFollowing(p.id)}
                title={`Follow ${p.name}: ${stateWord(p)}`}
              >
                <span className="av" style={{ background: p.color }} />
                {p.name}
                <i className="st" />
              </button>
            ))}
          </div>
          {followed && (
            <div className="office-follow">
              <span className="av" style={{ background: followed.color }} />
              <b>{followed.name}</b>
              <span className="what">{followed.label ?? stateWord(followed)}</span>
              {followed.startedAt && <span className="when">{elapsed(followed.startedAt, null, now)}</span>}
              {followed.href && (
                <Link href={followed.href} className="office-open" title="Go to this work">
                  Open
                </Link>
              )}
              <button type="button" className="office-unfollow" onClick={() => setFollowing(null)} title="Stop following (Esc)">
                Stop following
              </button>
            </div>
          )}
          <p className="office-overlay-summary">{statusLine(office, failing, now)}</p>
          <button ref={closeButton} type="button" className="office-close" onClick={close} title="Back to Home (Esc)">
            Close office
          </button>
        </div>
      )}
    </section>
  )
}
