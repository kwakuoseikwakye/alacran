import os from "node:os"
import { ExecutorGapNote } from "@/components/executor-gap-note"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import { VerifyButton } from "@/components/verify-button"
import { RemoveCompanyButton } from "@/components/remove-company-button"
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
import { UpdateSkillsButton } from "@/components/update-skills-button"
import { PortableAgentFileButton } from "@/components/portable-agent-file-button"
import { PortableSkillsButton } from "@/components/portable-skills-button"
import { AddPackButton, type AvailablePack } from "@/components/add-pack-button"
import { BrandIcon } from "@/components/brand-icon"
import { BackupCompanyButton } from "@/components/backup-company-button"
import { CompanyOwnershipSheet } from "@/components/company-ownership-sheet"
import { GoogleAccountsPicker } from "@/components/google-accounts-picker"
import { OpenTerminalButton } from "@/components/open-terminal-button"
import { RefreshOntologyButton } from "@/components/refresh-ontology-button"
import { McpServersSheet } from "@/components/mcp-servers-sheet"
import { CompanyCredentialRow } from "@/components/company-credential-row"
import { CompanyInboxPicker } from "@/components/company-inbox-picker"
import type { McpServer } from "@/lib/mcp-servers-config"
import type { CredentialRowFlag } from "@/lib/agent-card-flags"
import { CompanyGuide } from "@/components/company-guide"
import { NO_INTEGRATION_STATUS } from "@/lib/get-integration-status"
import { AdvancedOnly } from "@/components/advanced-only"
import { AgentTerminalStatus } from "@/components/agent-terminal-status"
import type { CompanyTerminalStatus } from "@/lib/terminal/sessions"
import {
  RefreshCw,
  ShieldCheck,
  PackagePlus,
  ArrowUpCircle,
  FileOutput,
  Share2,
  AtSign,
  CloudUpload,
  Shield,
  Terminal,
  Plug,
  ChevronRight,
  CreditCard,
  Hash,
  BookOpen,
  Mail,
  type LucideIcon,
} from "lucide-react"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  showVerifyButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  showEditCompanyButton?: boolean
  showBackupButton?: boolean
  showOwnershipButton?: boolean
  showVisibleRunOption?: boolean
  integrationStatus: string
  /** Set only when this company's vendored skills are behind the app's, or still only where Claude Code reads them. */
  skillsUpdate?: { installedTag: string | null; bundledTag: string; movesLocation?: true }
  showPortableAgentFileButton?: boolean
  showPortableSkillsButton?: boolean
  availablePacks?: AvailablePack[]
  showOpenTerminalButton?: boolean
  showGetStartedButton?: boolean
  showRefreshOntologyButton?: boolean
  showCheckMessagesButton?: boolean
  showVoiceAssistantButton?: boolean
  showGoogleAccountsPicker?: boolean
  showAiExecutorPicker?: boolean
  aiExecutorId?: string
  showMcpButton?: boolean
  showCompanyGuide?: boolean
  hasOntology?: boolean
  mcpServers?: McpServer[]
  mcpPool?: McpServer[]
  googleAccounts?: string[]
  availableGoogleAccounts?: string[]
  credentialRows?: CredentialRowFlag[]
  inboxOptions?: { slot: number; email: string }[]
  inboxSlot?: number | null
  terminalStatus?: CompanyTerminalStatus
  /** Position in the grid, which drives the staggered entrance animation. */
  index?: number
  /**
   * Which of the two shapes this renders.
   *
   * `"tile"` is the overview grid: identity and status, nothing to press,
   * because the whole tile is what you press. `"panel"` is the company you
   * have opened — a masthead and banded controls, no card chrome, since the
   * tile already showed you the card and a box inside a box says nothing.
   *
   * Not two layouts to keep in sync: every control is declared ONCE in
   * `controls` below and each shape arranges the same list.
   */
  layout?: "tile" | "panel"
}

// Type is secondary metadata, not a colour category. Keeping every badge
// neutral prevents a list of companies from turning into a decorative rainbow.
const KIND_BADGE_CLASS: Record<Agent["kind"], string> = {
  pipeline: "border-border bg-muted/40 text-muted-foreground",
  "command-set": "border-border bg-muted/40 text-muted-foreground",
  "report-log": "border-border bg-muted/40 text-muted-foreground",
  external: "border-border bg-muted/40 text-muted-foreground",
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  showVerifyButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  showEditCompanyButton,
  showBackupButton,
  showOwnershipButton,
  integrationStatus,
  skillsUpdate,
  showPortableAgentFileButton,
  showPortableSkillsButton,
  availablePacks,
  showOpenTerminalButton,
  showRefreshOntologyButton,
  showGoogleAccountsPicker,
  showMcpButton,
  showCompanyGuide,
  mcpServers,
  mcpPool,
  googleAccounts,
  availableGoogleAccounts,
  credentialRows,
  inboxOptions,
  inboxSlot,
  terminalStatus,
  index = 0,
  layout = "panel",
}: AgentCardProps) {
  // getIntegrationStatus returns prose; anything other than the "none" sentinel
  // means a real Google account is wired up, so show the product mark.
  const hasIntegration = integrationStatus !== NO_INTEGRATION_STATUS
  // The folder this card is actually about. Shown because a machine with three
  // companies of similar names is otherwise guesswork, and because it fills the
  // space the old `justify-end` layout left empty in the middle of every card.
  const homeDir = os.homedir()
  const displayPath = agent.rootPath.startsWith(homeDir)
    ? `~${agent.rootPath.slice(homeDir.length)}`
    : agent.rootPath

  /**
   * Every control, declared once.
   *
   * `band` is the taxonomy, and it is a real one rather than decoration: a
   * "run" control spawns the AI and ends in a diff you approve, a "knows"
   * control changes what the company IS, and a "wiring" control is about where
   * it lives and what it reaches. Those three answer three different questions
   * a person actually arrives with, which is why they are the headings.
   *
   * `blurb` is a CAPTION, deliberately not the guide's `*_BLURB` prose. Those
   * run to four sentences because the guide is a reading surface; under a
   * control, at 12px, in a two-column grid, that is a wall the eye skips. A
   * label labels, an example demonstrates, and nothing does double duty — the
   * guide still carries the full explanation, one click away.
   */
  type BandName = "run" | "knows" | "wiring"
  /** Tone is per CONTROL, not per band — see the note beside `.tone-*` in
   *  globals.css. Adjacent rows never share one; that, not the specific hue, is
   *  what the eye uses to tell one row from the next. */
  type Tone = "ember" | "green" | "amber" | "blue" | "cyan" | "lime" | "violet" | "rose"
  type Control = { band: BandName; icon: LucideIcon; tone: Tone; node: React.ReactNode; blurb: string }
  const when = (show: unknown, control: Control): Control[] => (show ? [control] : [])

  /**
   * The Stripe/Slack/Notion rows, built once each. Visibility is a property
   * of the row's OWN state, not a second copy of it: a company already using
   * its own key for a service must keep the only control that can change it
   * back even in simple mode (AGENTS.md — "simple mode must never hide
   * something already in use"), while a row nobody has touched yet is new
   * surface and defaults to Advanced (AGENTS.md — "a new user-facing feature
   * defaults to hidden for simple mode"). `alwaysShow` is read once below to
   * decide which of the two arrays each row lands in; the row itself is
   * declared exactly once either way.
   */
  const credentialControls: (Control & { alwaysShow: boolean })[] = [
    { key: "STRIPE_SECRET_KEY", label: "Stripe", icon: CreditCard, tone: "ember" as Tone,
      blurb: "Which Stripe account this company charges to — yours, or its own." },
    { key: "SLACK_BOT_TOKEN", label: "Slack", icon: Hash, tone: "lime" as Tone,
      blurb: "Which Slack this company's bot posts to — yours, or its own." },
    { key: "NOTION_API_KEY", label: "Notion", icon: BookOpen, tone: "violet" as Tone,
      blurb: "Which Notion workspace this company writes to — yours, or its own." },
  ].flatMap((spec) => {
    const row = credentialRows?.find((r) => r.credentialKey === spec.key)
    if (!row) return []
    return [
      {
        band: "wiring" as BandName,
        icon: spec.icon,
        tone: spec.tone,
        node: (
          <CompanyCredentialRow
            agentId={agent.id}
            label={spec.label}
            credentialKey={spec.key}
            source={row.source}
          />
        ),
        blurb: spec.blurb,
        alwaysShow: row.source === "company",
      },
    ]
  })

  const controls: Control[] = [
    ...when(showRefreshOntologyButton, {
      band: "run",
      icon: RefreshCw,
      tone: "blue",
      node: (
        <>
          <RefreshOntologyButton agentId={agent.id} />
          <ExecutorGapNote agentId={agent.id} need="outside-text" />
        </>
      ),
      blurb: "Reads what has happened since and shows you which lines are now out of date.",
    }),
    // "What did the chats say" and "Ask your company" used to sit here too,
    // removed at the owner's request (2026-09-25) to keep this panel clean.
    // Asking is the menu's Ask Alacrán; the chat check is still a command
    // under Automations.
    ...when(showVerifyButton, {
      band: "run",
      icon: ShieldCheck,
      tone: "cyan",
      node: <VerifyButton />,
      blurb: "Checks this company's folder for what it expects to find, and reports what is missing.",
    }),
    // Setting up / editing the company lives at the top of Company profile.
    ...when(availablePacks && availablePacks.length > 0, {
      band: "knows",
      icon: PackagePlus,
      tone: "violet",
      node: <AddPackButton agentId={agent.id} companyName={agent.name} availablePacks={availablePacks ?? []} />,
      blurb: "Another pack of ready-made commands and skills. Only adds — nothing here changes.",
    }),
    ...when(skillsUpdate, {
      band: "knows",
      icon: ArrowUpCircle,
      tone: "rose",
      node: (
        <UpdateSkillsButton
          agentId={agent.id}
          companyName={agent.name}
          installedTag={skillsUpdate?.installedTag ?? null}
          bundledTag={skillsUpdate?.bundledTag ?? ""}
          movesLocation={skillsUpdate?.movesLocation === true}
        />
      ),
      blurb: skillsUpdate?.movesLocation
        ? "Moves the ready-made skills to the folder every AI reads. Your own work is untouched."
        : "Replaces the ready-made skills with newer ones. Your own work is untouched.",
    }),
    ...when(showPortableAgentFileButton, {
      band: "knows",
      icon: FileOutput,
      tone: "ember",
      node: <PortableAgentFileButton agentId={agent.id} companyName={agent.name} />,
      blurb: "Moves this company's context to AGENTS.md, which every AI tool reads.",
    }),
    ...when(showPortableSkillsButton, {
      band: "knows",
      icon: Share2,
      tone: "blue",
      node: <PortableSkillsButton agentId={agent.id} companyName={agent.name} />,
      blurb: "Moves this company's commands to a shared folder, so Codex, Kiro, Kimi and Antigravity can run them too.",
    }),
    ...when(showGoogleAccountsPicker, {
      band: "wiring",
      icon: AtSign,
      tone: "blue",
      node: (
        <GoogleAccountsPicker
          agentId={agent.id}
          currentAccounts={googleAccounts ?? []}
          availableAccounts={availableGoogleAccounts ?? []}
        />
      ),
      blurb: "Which of your connected Google accounts belong to this company.",
    }),
    // Only the rows a company has already made its own — everything else
    // about this control lives in `credentialControls` above.
    ...credentialControls.filter((c) => c.alwaysShow),
    ...when(inboxOptions, {
      band: "wiring",
      icon: Mail,
      tone: "amber",
      node: <CompanyInboxPicker agentId={agent.id} options={inboxOptions ?? []} currentSlot={inboxSlot ?? null} />,
      blurb: "Which of this computer's inboxes this company reads.",
    }),
    ...when(showBackupButton, {
      band: "wiring",
      icon: CloudUpload,
      tone: "green",
      node: <BackupCompanyButton agentId={agent.id} companyName={agent.name} />,
      blurb: "A private copy on GitHub, so you can bring this company back on another computer.",
    }),
    ...when(showOwnershipButton, {
      band: "wiring",
      icon: Shield,
      tone: "violet",
      node: <CompanyOwnershipSheet agentId={agent.id} companyName={agent.name} />,
      blurb: "Where this company's data lives, and what leaves this computer.",
    }),
  ]

  /** Advanced-only controls, same shape. Kept separate because AdvancedOnly
   *  decides on the CLIENT, so the server cannot know whether a band ends up
   *  empty — each one wraps itself rather than the band being counted. */
  const advancedControls: Control[] = [
    // The other half of credentialControls — a row nobody has pointed at this
    // company's own account yet is new surface, so it starts behind Advanced.
    ...credentialControls.filter((c) => !c.alwaysShow),
    ...when(showOpenTerminalButton && agent.kind !== "external", {
      band: "wiring",
      icon: Terminal,
      tone: "cyan",
      node: (
        <>
          <OpenTerminalButton agentId={agent.id} />
          <ExecutorGapNote agentId={agent.id} need="opening-message" />
        </>
      ),
      blurb: "Opens a window in this company's folder and talks to your AI in plain English.",
    }),
    ...when(showMcpButton, {
      band: "wiring",
      icon: Plug,
      tone: "amber",
      node: (
        <McpServersSheet
          agentId={agent.id}
          companyName={agent.name}
          pool={mcpPool ?? []}
          currentServers={mcpServers ?? []}
        />
      ),
      blurb: "Tick which of this computer's tools this company's AI may use. Needs a one-minute sign-in after.",
    }),
    // Which AI runs this company is no longer here: it was advanced-only AND
    // behind this collapsed panel, so switching it was nearly undiscoverable.
    // It is now "Your AI" near the top of Company profile, in every mode.
  ]

  const band = (name: BandName) => controls.filter((c) => c.band === name)

  /** One row: glyph, the real button, and what it does — three columns, the
   *  same three every time, so the eye learns the shape once and then reads
   *  only the middle. The button's own label is still the title; repeating it
   *  beside the button would be two names for one thing. */
  const Action = ({
    icon: Icon,
    tone,
    node,
    blurb,
  }: {
    icon: LucideIcon
    tone: Tone
    node: React.ReactNode
    blurb: string
  }) => (
    <div className="company-action">
      {/* Both glyphs are decorative: the control between them is the row's
          real name, so announcing either would read the row out twice. */}
      <span className={`company-action-icon tone-${tone}`} aria-hidden="true">
        <Icon />
      </span>
      <div className="company-action-control">{node}</div>
      <p className="company-action-blurb">{blurb}</p>
      <span className="company-action-go" aria-hidden="true">
        <ChevronRight />
      </span>
    </div>
  )

  const Band = ({ title, items }: { title: string; items: Control[] }) =>
    items.length === 0 ? null : (
      <section className="company-band">
        <h3 className="company-band-title">{title}</h3>
        <div className="company-actions">
          {items.map((c, i) => (
            <Action key={i} icon={c.icon} tone={c.tone} node={c.node} blurb={c.blurb} />
          ))}
        </div>
      </section>
    )

  // ---------------------------------------------------------------- tile
  if (layout === "tile") {
    return (
      <div className="bento-card a-rise" style={{ "--d": `${index * 70}ms` } as React.CSSProperties}>
        {/* min-w-0 on both the row and the text column: without it the name is a
            grid item whose automatic minimum size stops it ever truncating.
            flex-wrap on the row, rather than letting the name column absorb the
            squeeze: the guide icon plus a long badge (e.g. "command-set") can
            add up to more than this card has spare on its own line, and a
            truncated company name is a worse outcome than that cluster
            wrapping to a second line under it. */}
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <AgentAvatar imageUrl={avatarUrl ?? null} id={agent.id} name={agent.name} />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold leading-tight">{agent.name}</p>
              <AdvancedOnly>
                <p className="truncate font-mono text-xs leading-tight text-muted-foreground" title={agent.rootPath}>
                  {displayPath}
                </p>
              </AdvancedOnly>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AgentTerminalStatus agentId={agent.id} initialStatus={terminalStatus} layout="badge" />
            <AdvancedOnly>
              <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
                {agent.kind}
              </Badge>
            </AdvancedOnly>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <AgentTerminalStatus agentId={agent.id} initialStatus={terminalStatus} layout="callout" />
          {error && <p className="text-destructive">Source unavailable: {error}</p>}
          {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
          {!error && latestActivity && (
            <>
              <p className="flex items-center gap-2 font-medium">
                {/* One colour, because every adapter hardcodes status "done"
                    (lib/adapters/*). Make this conditional if one ever reports
                    something else. */}
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span className="min-w-0 truncate">{latestActivity.title}</span>
              </p>
              <p className="pl-3.5 text-xs text-muted-foreground">
                {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
              </p>
            </>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {hasIntegration ? (
              <BrandIcon id="gmail" tone="brand" className="size-3.5" />
            ) : (
              <span className="inline-block size-1.5 rounded-full bg-border" aria-hidden="true" />
            )}
            <span className="truncate">{integrationStatus}</span>
          </p>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------- panel
  /**
   * No card chrome on purpose. The overview already showed you this company as
   * a card; opening it and getting the same card back, inside the pane, is a
   * box in a box that says nothing new. This is the pane's own content.
   *
   * **The masthead leads with what the company has been DOING**, not with its
   * name — the explorer beside it already carries the name and the path, and a
   * company is a thing that works while you are not looking. That sentence was
   * 11px of small print on the card; here it is the headline, with the one
   * thing you probably came to press sitting opposite it.
   */
  return (
    <div className="company-panel-body a-rise">
      {/* The masthead that stood here repeated Home's latest activity and
          carried Get Started, both removed at the owner's request
          (2026-09-25). Only the guide stays, opened from Company profile's
          "What else can I do here?", so it explains only buttons below. */}
      {showCompanyGuide && (
        <CompanyGuide
          showTrigger={false}
          companyName={agent.name}
          showOpenTerminalButton={showOpenTerminalButton}
          showGetStartedButton={false}
          showRefreshOntologyButton={showRefreshOntologyButton}
          showCheckMessagesButton={false}
          showSetupCompanyButton={showSetupCompanyButton}
          showEditCompanyButton={showEditCompanyButton}
          showBackupButton={showBackupButton}
          showOwnershipButton={showOwnershipButton}
          showGoogleAccountsPicker={showGoogleAccountsPicker}
          showMcpButton={showMcpButton}
          showSkillsUpdateButton={Boolean(skillsUpdate)}
          showPortableAgentFileButton={Boolean(showPortableAgentFileButton)}
          showAddPackButton={Boolean(availablePacks?.length)}
          removable={removable}
        />
      )}

      <Band title="Run something" items={band("run")} />
      <Band title="What it knows" items={band("knows")} />

      {(band("wiring").length > 0 || advancedControls.length > 0) && (
        <section className="company-band">
          <h3 className="company-band-title">What this company uses</h3>
          <div className="company-actions">
            {band("wiring").map((c, i) => (
              <Action key={i} icon={c.icon} tone={c.tone} node={c.node} blurb={c.blurb} />
            ))}
            {advancedControls.map((c, i) => (
              <AdvancedOnly key={`adv-${i}`}>
                <Action icon={c.icon} tone={c.tone} node={c.node} blurb={c.blurb} />
              </AdvancedOnly>
            ))}
            {/* An `external` folder has exactly one action (v66), so it is not
                advanced-gated — gating it would leave that company with none. */}
            {showOpenTerminalButton && agent.kind === "external" && (
              <Action
                icon={Terminal}
                tone="cyan"
                node={<OpenTerminalButton agentId={agent.id} />}
                blurb="Opens a window in this folder and talks to your AI in plain English."
              />
            )}
          </div>
        </section>
      )}

      {/* Quiet by design: a picture for fun, and the one destructive action,
          last and unemphasised. */}
      <footer className="company-footer">
        <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} companyName={agent.name} />
        {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
      </footer>
    </div>
  )
}
