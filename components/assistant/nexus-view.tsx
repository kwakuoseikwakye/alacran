"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react"
import { MessageSquare, Settings2, X } from "lucide-react"
import { NexusOrb } from "./nexus-orb"
import { AgentLiveRegion } from "./agent-parts"
import { ProposalCard } from "./proposal-card"
import { orbMode, type AgentDisplay } from "@/lib/voice/agent/agent-state"
import {
  NEXUS_PALETTES, PALETTE_IDS, PRESENCE_MODES, SUGGESTIONS, greeting, nexusCopy, wordmark, type NexusState, type PaletteId,
} from "@/lib/voice/agent/nexus-model"
import type { AgentPrefs } from "@/lib/voice/agent/agent-preferences"
import type { AgentLine, ToolFeedItem } from "@/components/use-elevenlabs-agent"
import type { AssistantCompany } from "@/components/assistant/assistant-stage"

export type NexusPanel = "none" | "conversation" | "settings"

export type NexusViewProps = {
  name: string
  display: AgentDisplay
  lines: AgentLine[]
  toolFeed: ToolFeedItem[]
  liveYou: string
  error: string | null
  micNote: string
  canFixMic: boolean
  onFixMic: () => void
  /** The mic is open right now. */
  talking: boolean
  prefs: AgentPrefs
  calm: boolean
  focus: boolean
  panel: NexusPanel
  typed: string
  companies: AssistantCompany[]
  levelRef: { current: number | null }
  binsRef: { current: Uint8Array | null }
  onTyped: (text: string) => void
  onSend: (text: string) => void
  onToggleMic: () => void
  onPanel: (panel: NexusPanel) => void
  onFocus: () => void
  onPrefs: (patch: Partial<AgentPrefs>) => void
  onClose?: () => void
  /** Line ids whose card the owner already acted on. Defaults to the view's own record. */
  actedIds?: ReadonlySet<number>
}

type IconName = NexusState | "pause" | "play" | "focus" | "mic" | "send" | "spark"

/** The reference design's own line icons. */
function Icon({ name }: { name: IconName }) {
  const body: Record<IconName, ReactNode> = {
    pause: <path d="M8 6v12M16 6v12" />,
    play: <path d="m9 5 10 7-10 7Z" />,
    focus: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><circle cx="12" cy="12" r="3" /></>,
    idle: <><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></>,
    listening: <path d="M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4" />,
    thinking: <><path d="M12 3 21 12 12 21 3 12Z" /><path d="m12 7 5 5-5 5-5-5Z" /></>,
    speaking: <path d="M3 10v4m4-7v10m4-5v0m4-8v16m4-12v8" />,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8" /></>,
    send: <path d="m5 12 14 0m-6-6 6 6-6 6" />,
    spark: <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z" />,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="nx-icon">{body[name]}</svg>
}

function BrandMark() {
  return (
    <svg className="nx-mark" viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="16" ry="9" transform="rotate(-38 20 20)" />
      <ellipse cx="20" cy="20" rx="16" ry="9" transform="rotate(38 20 20)" />
      <circle cx="20" cy="20" r="3" />
      <path d="M20 3v4m0 26v4" />
    </svg>
  )
}

/** Icon button with a written tooltip (data-tip) and the same words for screen readers. */
function IconButton({ tip, onClick, pressed, expanded, className, buttonRef, children }: {
  tip: string
  onClick: () => void
  pressed?: boolean
  expanded?: boolean
  className?: string
  buttonRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <button type="button" ref={buttonRef} className={`nx-icon-btn${className ? ` ${className}` : ""}`} aria-label={tip} data-tip={tip}
      aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
      {children}
    </button>
  )
}

function Swatches({ palette, onPick }: { palette: PaletteId; onPick: (id: PaletteId) => void }) {
  return (
    <div className="nx-swatches" role="group" aria-label="Colour">
      {PALETTE_IDS.map((id) => (
        <button key={id} type="button" className="nx-swatch" style={{ "--swatch": NEXUS_PALETTES[id].hex } as CSSProperties}
          aria-label={`${NEXUS_PALETTES[id].name} colour`} data-tip={NEXUS_PALETTES[id].name} aria-pressed={palette === id} onClick={() => onPick(id)} />
      ))}
      <span className="nx-palette-name">{NEXUS_PALETTES[palette].name}</span>
    </div>
  )
}

/**
 * A proposal card offered once. Whether the line was already acted on is read when the card mounts: the card the
 * owner pressed keeps showing its own result, but a fresh mount (moved to the drawer, drawer reopened) shows a
 * note instead of a second Approve button.
 */
function OnceCard({ line, acted, onActed, companyName }: {
  line: AgentLine
  acted: boolean
  onActed: (id: number) => void
  companyName: (id?: string) => string | undefined
}) {
  const [actedAtMount] = useState(acted)
  if (!line.proposal) return null
  if (actedAtMount) {
    // A pending-send strip moved into the drawer mid-countdown is cancelled by the unmount, so "acted" would mislead.
    return line.proposal.fields.auto === "1"
      ? <p className="nx-muted">This task is no longer pending. Check Terminal to see whether it was sent.</p>
      : <p className="nx-muted">You already acted on this.</p>
  }
  return <ProposalCard proposal={line.proposal} companyName={companyName(line.proposal.companyId)} onActed={() => onActed(line.id)} />
}

function ConversationDrawer({ name, lines, toolFeed, slotId, companyName, acted, onActed, closeRef, onClose }: {
  name: string
  lines: AgentLine[]
  toolFeed: ToolFeedItem[]
  /** The line whose card is in the slot above the message box; its card is not repeated here. */
  slotId: number | undefined
  companyName: (id?: string) => string | undefined
  acted: ReadonlySet<number>
  onActed: (id: number) => void
  closeRef: Ref<HTMLButtonElement>
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-label="Conversation" className="nx-drawer">
      <div className="nx-panel-head">
        <h3>Conversation</h3>
        <button type="button" ref={closeRef} className="nx-text-btn" onClick={onClose} title="Close the conversation">Close</button>
      </div>
      <div className="nx-drawer-body">
        {lines.length === 0 ? <p className="nx-muted">Nothing said yet. Use the mic or type below.</p> : null}
        {lines.map((l) => (
          <div key={l.id} className={l.role === "you" ? "nx-line nx-line-you" : "nx-line"}>
            <p className="nx-line-who">{l.role === "you" ? "You" : name}</p>
            {l.text ? <p>{l.text}</p> : null}
            {l.proposal && l.id !== slotId ? <OnceCard key={l.id} line={l} acted={acted.has(l.id)} onActed={onActed} companyName={companyName} /> : null}
            {l.proposal && l.id === slotId ? <p className="nx-muted">Its card is above the message box.</p> : null}
          </div>
        ))}
        <h4 className="nx-section-label">WHAT I LOOKED UP</h4>
        <ul className="nx-feed">
          {toolFeed.length === 0 ? <li className="nx-muted">Nothing looked up yet.</li> : null}
          {toolFeed.map((t) => (
            <li key={t.id}>
              <span className="nx-muted">{new Date(t.at).toLocaleTimeString()}</span>{" "}
              {t.state === "running" ? "checking" : t.state === "done" ? "done" : "failed"}: {t.question}
              {t.detail ? <span className="nx-accent"> — {t.detail}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SettingsPopover({ prefs, onPrefs, closeRef, onClose }: {
  prefs: AgentPrefs
  onPrefs: (patch: Partial<AgentPrefs>) => void
  closeRef: Ref<HTMLButtonElement>
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-label="Settings" className="nx-popover">
      <div className="nx-panel-head">
        <h3>Settings</h3>
        <button type="button" ref={closeRef} className="nx-text-btn" onClick={onClose} title="Close the settings">Close</button>
      </div>
      <label className="nx-row">
        <span>Calm mode (still orb, no motion)</span>
        <select value={prefs.calm === null ? "auto" : prefs.calm ? "on" : "off"} title="Hold the orb still"
          onChange={(e) => onPrefs({ calm: e.target.value === "auto" ? null : e.target.value === "on" })}>
          <option value="auto">Follow my computer</option><option value="on">Always on</option><option value="off">Always off</option>
        </select>
      </label>
      <label className="nx-row">
        <span>High contrast orb</span>
        <input type="checkbox" checked={prefs.highContrast} title="Draw the orb in white for stronger contrast" onChange={(e) => onPrefs({ highContrast: e.target.checked })} />
      </label>
      <label className="nx-row">
        <span>Text size</span>
        <select value={prefs.textScale} title="Make the text in this panel larger"
          onChange={(e) => onPrefs({ textScale: Number(e.target.value) as AgentPrefs["textScale"] })}>
          <option value={1}>Normal</option><option value={1.25}>Large</option><option value={1.5}>Largest</option>
        </select>
      </label>
      <label className="nx-row">
        <span>Longest conversation (minutes)</span>
        <input type="number" min={1} max={60} value={prefs.maxMinutes} title="I stop listening after this many minutes"
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onPrefs({ maxMinutes: Math.min(60, Math.max(1, Math.round(n))) })
          }} />
      </label>
      <div className="nx-row">
        <span>Colour</span>
        <Swatches palette={prefs.palette} onPick={(palette) => onPrefs({ palette })} />
      </div>
      <p className="nx-muted">I also stop listening after 2 minutes of quiet. Voice and key are in Settings.</p>
    </div>
  )
}

/** The whole assistant screen, drawn from props. AgentStage owns the state; this owns no behaviour beyond layout. */
export function NexusView(p: NexusViewProps) {
  const waveRef = useRef<HTMLCanvasElement | null>(null)
  const state = orbMode(p.display)
  const copy = nexusCopy(p.display)
  const palette = NEXUS_PALETTES[p.prefs.palette]
  // A proposal arrives as its own line with no words; the reply line and the live region skip it.
  const replies = p.lines.filter((l) => l.role === "assistant" && l.text)
  const lastReply = replies.length ? replies[replies.length - 1].text : ""
  const waiting = p.display === "thinking" || p.display === "checking"
  const slot = [...p.lines].reverse().find((l) => l.proposal)
  const companyName = (id?: string) => p.companies.find((c) => c.id === id)?.name
  const live = state === "listening" || state === "speaking"
  const style = { zoom: p.prefs.textScale, "--nx-accent": palette.hex, "--nx-accent-rgb": palette.rgb } as CSSProperties
  const [ownActed, setOwnActed] = useState<ReadonlySet<number>>(() => new Set())
  const acted = p.actedIds ?? ownActed
  const markActed = (id: number) => setOwnActed((s) => new Set(s).add(id))

  // An opened panel takes focus; a closed one hands it back to the header button that opened it.
  const conversationBtn = useRef<HTMLButtonElement | null>(null)
  const settingsBtn = useRef<HTMLButtonElement | null>(null)
  const panelClose = useRef<HTMLButtonElement | null>(null)
  const prevPanel = useRef<NexusPanel>(p.panel)
  useEffect(() => {
    const prev = prevPanel.current
    prevPanel.current = p.panel
    if (p.panel === prev) return
    if (p.panel !== "none") panelClose.current?.focus()
    else (prev === "conversation" ? conversationBtn : settingsBtn).current?.focus()
  }, [p.panel])

  return (
    <section aria-label={`${p.name} assistant`} data-focus={p.focus} style={style} className="asst-root asst-agent nexus">
      <header className="nx-header">
        <div className="nx-brand">
          <BrandMark />
          <div>
            <div className="nx-wordmark">{wordmark(p.name)}</div>
            <div className="nx-brand-sub">PERSONAL INTELLIGENCE</div>
          </div>
        </div>
        <div className="nx-tools">
          <IconButton tip={p.calm ? "Resume motion" : "Pause motion"} pressed={p.calm} onClick={() => p.onPrefs({ calm: !p.calm })}>
            <Icon name={p.calm ? "play" : "pause"} />
          </IconButton>
          <IconButton tip={p.focus ? "Leave focus view" : "Focus view"} pressed={p.focus} onClick={p.onFocus} className="nx-wide-only">
            <Icon name="focus" />
          </IconButton>
          <IconButton tip="Conversation" buttonRef={conversationBtn} expanded={p.panel === "conversation"} onClick={() => p.onPanel(p.panel === "conversation" ? "none" : "conversation")}>
            <MessageSquare className="nx-icon" strokeWidth={1.5} aria-hidden />
          </IconButton>
          <IconButton tip="Settings" buttonRef={settingsBtn} expanded={p.panel === "settings"} onClick={() => p.onPanel(p.panel === "settings" ? "none" : "settings")}>
            <Settings2 className="nx-icon" strokeWidth={1.5} aria-hidden />
          </IconButton>
          {p.onClose ? (
            <IconButton tip="Close the assistant" onClick={p.onClose}>
              <X className="nx-icon" strokeWidth={1.5} aria-hidden />
            </IconButton>
          ) : null}
        </div>
      </header>

      <div className="nx-stage">
        <div className="nx-aura" aria-hidden="true" />
        <NexusOrb state={state} palette={p.prefs.palette} paused={p.calm} highContrast={p.prefs.highContrast} center={p.focus ? 0 : 0.1}
          levelRef={p.levelRef} binsRef={p.binsRef} waveRef={waveRef}
          label={`${p.name}'s orb, ${copy.presence.toLowerCase()}. Drag to turn it, use the arrow keys to orbit, or scroll to zoom.`} />
        <section className="nx-status" aria-label="What I am doing">
          <div className="nx-eyebrow">{copy.eyebrow}</div>
          <h2 className="nx-title">{copy.title}</h2>
          <p className="nx-copy">{copy.copy}</p>
          <div className="nx-signal" aria-hidden="true">
            <div className="nx-signal-header"><span>VOICE RHYTHM</span><span>{live ? "live" : "quiet"}</span></div>
            <canvas ref={waveRef} className="nx-wave" width={376} height={76} />
          </div>
        </section>
        <aside className="nx-presence" aria-label="Presence" inert={p.focus}>
          <div className="nx-section-label">PRESENCE</div>
          <ul className="nx-modes">
            {PRESENCE_MODES.map((m) => (
              <li key={m.id} className="nx-mode" aria-current={m.id === state ? "true" : undefined}>
                <Icon name={m.id} />
                <span><span className="nx-mode-name">{m.name}</span><span className="nx-mode-desc">{m.desc}</span></span>
              </li>
            ))}
          </ul>
          <div className="nx-palette">
            <span className="nx-palette-label">SPECTRUM</span>
            <Swatches palette={p.prefs.palette} onPick={(id) => p.onPrefs({ palette: id })} />
          </div>
        </aside>
        <div className="nx-scene-bottom">
          <span role="status" className="nx-presence-pill"><i />{copy.presence}</span>
          <p className="nx-orbit-help">Drag to orbit <span aria-hidden="true">·</span> Scroll to explore</p>
        </div>
      </div>

      <div className="nx-dock">
        {p.liveYou ? <p className="nx-you" aria-hidden="true">{p.liveYou}</p> : null}
        <div className="nx-reply-line" aria-hidden="true">
          <Icon name="spark" />
          <p className={waiting ? "nx-reply nx-waiting" : "nx-reply"}>{waiting ? "Finding a thread…" : lastReply || greeting(p.name)}</p>
        </div>
        <AgentLiveRegion text={lastReply} version={replies.length} />
        {p.error ? (
          <p role="alert" className="nx-alert">
            {p.error}
            {p.canFixMic ? (
              <button type="button" className="nx-link" title="Ask macOS to let Alacrán use the microphone again" onClick={p.onFixMic}>Fix microphone access</button>
            ) : null}
          </p>
        ) : null}
        {p.micNote ? <p role="status" className="nx-note">{p.micNote}</p> : null}
        {slot?.proposal ? (
          <div className="nx-card"><OnceCard key={slot.id} line={slot} acted={acted.has(slot.id)} onActed={markActed} companyName={companyName} /></div>
        ) : null}
        <form className="nx-composer" onSubmit={(e) => { e.preventDefault(); p.onSend(p.typed) }}>
          <button type="button" className="nx-mic" aria-pressed={p.talking} aria-label={p.talking ? "Turn the mic off" : "Turn the mic on"}
            data-tip={p.talking ? "Turn the mic off (Space)" : "Turn the mic on (Space)"} onClick={p.onToggleMic}>
            <Icon name="mic" />
          </button>
          <input className="nx-input" value={p.typed} onChange={(e) => p.onTyped(e.target.value)} aria-label={`Message ${p.name}`}
            placeholder={`Say something to ${p.name}…`} maxLength={500} autoComplete="off" />
          <button type="submit" className="nx-send" aria-label="Send message" data-tip="Send what you typed" disabled={!p.typed.trim()}>
            <Icon name="send" />
          </button>
        </form>
        <div className="nx-suggestions" role="group" aria-label="Suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="nx-suggestion" onClick={() => p.onSend(s)}><Icon name="spark" />{s}</button>
          ))}
        </div>
      </div>

      <footer className="nx-footer">
        <span className="nx-footer-left">{p.error ? "Something needs your attention" : copy.footer}</span>
        <span className="nx-keys">
          <kbd>SPACE</kbd>Mic on / off<span className="nx-sep" aria-hidden="true">/</span><kbd>ESC</kbd>Reset view
        </span>
      </footer>

      {p.panel === "conversation" ? (
        <ConversationDrawer name={p.name} lines={p.lines} toolFeed={p.toolFeed} slotId={slot?.id} companyName={companyName}
          acted={acted} onActed={markActed} closeRef={panelClose} onClose={() => p.onPanel("none")} />
      ) : null}
      {p.panel === "settings" ? <SettingsPopover prefs={p.prefs} onPrefs={p.onPrefs} closeRef={panelClose} onClose={() => p.onPanel("none")} /> : null}
    </section>
  )
}
