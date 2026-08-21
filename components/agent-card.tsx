import os from "node:os"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import { VerifyButton } from "@/components/verify-button"
import { AdvancedOnly } from "@/components/advanced-only"
import { DailyTeamLogButton } from "@/components/daily-team-log-button"
import { RemoveCompanyButton } from "@/components/remove-company-button"
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
import { StatusDot } from "@/components/status-dot"
import { CompanySetupWizard } from "@/components/company-setup-wizard"
import { InstallDailyTeamLogButton } from "@/components/install-daily-team-log-button"
import { UpdateSkillsButton } from "@/components/update-skills-button"
import { PortableAgentFileButton } from "@/components/portable-agent-file-button"
import { AddPackButton, type AvailablePack } from "@/components/add-pack-button"
import { BrandIcon } from "@/components/brand-icon"
import { BackupCompanyButton } from "@/components/backup-company-button"
import { CompanyOwnershipSheet } from "@/components/company-ownership-sheet"
import { AiExecutorPicker } from "@/components/ai-executor-picker"
import { GoogleAccountsPicker } from "@/components/google-accounts-picker"
import { OpenTerminalButton } from "@/components/open-terminal-button"
import { GetStartedButton } from "@/components/get-started-button"
import { McpServersSheet } from "@/components/mcp-servers-sheet"
import type { McpServer } from "@/lib/mcp-servers-config"
import { CompanyGuide } from "@/components/company-guide"
import { NO_INTEGRATION_STATUS } from "@/lib/get-integration-status"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  showEditCompanyButton?: boolean
  showBackupButton?: boolean
  showOwnershipButton?: boolean
  showVisibleRunOption?: boolean
  integrationStatus: string
  showInstallDailyTeamLogButton?: boolean
  /** Set only when this company's vendored skills are behind the app's. */
  skillsUpdate?: { installedTag: string | null; bundledTag: string }
  showPortableAgentFileButton?: boolean
  availablePacks?: AvailablePack[]
  showOpenTerminalButton?: boolean
  showGetStartedButton?: boolean
  showAiExecutorPicker?: boolean
  showGoogleAccountsPicker?: boolean
  showMcpButton?: boolean
  showCompanyGuide?: boolean
  hasOntology?: boolean
  aiExecutorId?: string
  mcpServers?: McpServer[]
  googleAccounts?: string[]
  availableGoogleAccounts?: string[]
  /** Position in the grid, which drives the staggered entrance animation. */
  index?: number
}

// Warm hues only, so the kind badges read as part of the venom-night palette
// rather than leftovers from the old indigo theme.
const KIND_BADGE_CLASS: Record<Agent["kind"], string> = {
  pipeline: "border-ember/30 bg-ember/10 text-ember",
  "command-set": "border-warning/30 bg-warning/10 text-warning",
  "report-log": "border-success/30 bg-success/10 text-success",
  // Muted on purpose: an external folder is the one kind this app doesn't
  // manage, so its badge shouldn't compete with the ones it does.
  external: "border-border bg-muted/40 text-muted-foreground",
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  showEditCompanyButton,
  showBackupButton,
  showOwnershipButton,
  showVisibleRunOption,
  integrationStatus,
  showInstallDailyTeamLogButton,
  skillsUpdate,
  showPortableAgentFileButton,
  availablePacks,
  showOpenTerminalButton,
  showGetStartedButton,
  showAiExecutorPicker,
  showGoogleAccountsPicker,
  showMcpButton,
  showCompanyGuide,
  hasOntology,
  aiExecutorId,
  mcpServers,
  googleAccounts,
  availableGoogleAccounts,
  index = 0,
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

  return (
    <div className="bento-card a-rise" style={{ "--d": `${index * 70}ms` } as React.CSSProperties}>
      {/* ------------------------------------------------------------ head */}
      {/* min-w-0 on both the row and the text column: without it the name is a
          grid item whose automatic minimum size stops it ever truncating. */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AgentAvatar imageUrl={avatarUrl ?? null} />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold leading-tight">{agent.name}</p>
            <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground" title={agent.rootPath}>
              {displayPath}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {showCompanyGuide && (
            <CompanyGuide
              companyName={agent.name}
              hasOntology={Boolean(hasOntology)}
              showOpenTerminalButton={showOpenTerminalButton}
              showGetStartedButton={showGetStartedButton}
              showSetupCompanyButton={showSetupCompanyButton}
              showEditCompanyButton={showEditCompanyButton}
              showBackupButton={showBackupButton}
              showOwnershipButton={showOwnershipButton}
              showAiExecutorPicker={showAiExecutorPicker}
              showGoogleAccountsPicker={showGoogleAccountsPicker}
              showMcpButton={showMcpButton}
              showSkillsUpdateButton={Boolean(skillsUpdate)}
              showPortableAgentFileButton={Boolean(showPortableAgentFileButton)}
              showAddPackButton={Boolean(availablePacks?.length)}
              removable={removable}
            />
          )}
          <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
            {agent.kind}
          </Badge>
        </span>
      </div>

      {/* ------------------------------------------------------------ state */}
      <div className="mt-4 space-y-1.5 text-sm">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <>
            <p className="flex items-center gap-2 font-medium">
              <StatusDot />
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

      {/* ---------------------------------------------------------- actions */}
      {/* Three tiers instead of one stack. Thirteen identical full-width outline
          buttons in a column is what this card used to be: no hierarchy, so the
          one thing you came to do looked exactly like "Avatar". Tier 1 is only
          rendered when something genuinely needs doing, tier 2 is the everyday
          pair, and the standing configuration lives behind a native <details>
          — which also makes every card the same height, so the grid stops
          looking ragged. */}
      {/* Top-flow, not `mt-auto`. Bottom-pinned actions align nicely only when
          cards hold similar amounts; one card with its More open makes the row
          tall and leaves a void through the middle of every other card — which
          is the same complaint the old `justify-end` layout earned. */}
      <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
        {/* The one primary action, first and solid. Everything below it is an
            offer ("something new is available") rather than the thing you came
            to do — those used to sit on top and push the real action down. */}
        {showSetupCompanyButton && (
          <CompanySetupWizard
            agentId={agent.id}
            companyName={agent.name}
            showVisibleRunOption={showVisibleRunOption}
          />
        )}
        {showGetStartedButton && <GetStartedButton agentId={agent.id} />}
        {showVerifyButton && <VerifyButton />}
        {showDailyTeamLogButton && <DailyTeamLogButton />}
        {/* An `external` folder has exactly one action (v66), so hiding it in
            simple mode would leave that card with no buttons at all. For a real
            company, "opens a terminal" is the definition of the advanced surface. */}
        {showOpenTerminalButton &&
          (agent.kind === "external" ? (
            <OpenTerminalButton agentId={agent.id} />
          ) : (
            <AdvancedOnly>
              <OpenTerminalButton agentId={agent.id} />
            </AdvancedOnly>
          ))}

        {/* Offers wrap as a chip row rather than stacking full width. None of
            these buttons sizes itself to the column (they have no `w-full`), so
            stacked they read as three ragged left-aligned stubs; inline they
            read as what they are — things newly available, not the action. */}
        {(showInstallDailyTeamLogButton || skillsUpdate || showPortableAgentFileButton) && (
          <div className="flex flex-wrap gap-2">
            {showInstallDailyTeamLogButton && (
              <InstallDailyTeamLogButton agentId={agent.id} companyName={agent.name} />
            )}
            {skillsUpdate && (
              <UpdateSkillsButton
                agentId={agent.id}
                companyName={agent.name}
                installedTag={skillsUpdate.installedTag}
                bundledTag={skillsUpdate.bundledTag}
              />
            )}
            {showPortableAgentFileButton && (
              <PortableAgentFileButton agentId={agent.id} companyName={agent.name} />
            )}
          </div>
        )}

        {/* Native <details>: no state, no JS, keyboard-operable and searchable
            by the browser's own find-in-page, which a hand-rolled disclosure is
            not. Deliberately uncounted — AdvancedOnly decides on the client
            whether two of these render at all, so any number rendered here
            would be wrong in simple mode. */}
        <details className="card-more">
          <summary>
            <span>More</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform" aria-hidden="true" />
          </summary>
          <div className="space-y-2 pt-2">
            {availablePacks && availablePacks.length > 0 && (
              <AddPackButton agentId={agent.id} companyName={agent.name} availablePacks={availablePacks} />
            )}
            {showEditCompanyButton && (
              <CompanySetupWizard
                agentId={agent.id}
                companyName={agent.name}
                mode="edit"
                showVisibleRunOption={showVisibleRunOption}
              />
            )}
            {showMcpButton &&
              // Already has connectors configured? Then this is live state, not
              // an advanced extra — same rule as the Connect page's executor and
              // Notion cards.
              ((mcpServers?.length ?? 0) > 0 ? (
                <McpServersSheet agentId={agent.id} companyName={agent.name} currentServers={mcpServers ?? []} />
              ) : (
                <AdvancedOnly>
                  <McpServersSheet agentId={agent.id} companyName={agent.name} currentServers={mcpServers ?? []} />
                </AdvancedOnly>
              ))}
            {showBackupButton && <BackupCompanyButton agentId={agent.id} companyName={agent.name} />}
            {showOwnershipButton && <CompanyOwnershipSheet agentId={agent.id} companyName={agent.name} />}
            {showAiExecutorPicker && (
              <AiExecutorPicker agentId={agent.id} currentExecutorId={aiExecutorId ?? "claude-code"} />
            )}
            {showGoogleAccountsPicker && (
              <GoogleAccountsPicker
                agentId={agent.id}
                currentAccounts={googleAccounts ?? []}
                availableAccounts={availableGoogleAccounts ?? []}
              />
            )}
            <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
            {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          </div>
        </details>
      </div>
    </div>
  )
}
