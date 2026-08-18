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

  return (
    <div
      className="bento-card a-rise"
      style={{ "--d": `${index * 70}ms` } as React.CSSProperties}
    >
      <div className="flex flex-col space-y-1.5 p-0 mb-4">
        {/* min-w-0: CardTitle is a grid item, whose automatic minimum size would
            otherwise stop the agent name ever truncating on narrow screens. */}
        <div className="flex min-w-0 items-center justify-between gap-2 text-lg font-semibold leading-none tracking-tight">
          <span className="flex min-w-0 items-center gap-2 font-display font-bold">
            <AgentAvatar imageUrl={avatarUrl ?? null} />
            <span className="truncate">{agent.name}</span>
          </span>
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
                removable={removable}
              />
            )}
            <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
              {agent.kind}
            </Badge>
          </span>
        </div>
      </div>
      <div className="p-0 space-y-3 text-sm flex-1 flex flex-col justify-end">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <StatusDot />
              {latestActivity.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
            </p>
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {hasIntegration ? (
            <BrandIcon id="gmail" tone="brand" className="size-3.5" />
          ) : (
            <span className="inline-block size-1.5 rounded-full bg-border" aria-hidden="true" />
          )}
          <span className="truncate">{integrationStatus}</span>
        </p>
        <div className="space-y-2 pt-1">
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {showSetupCompanyButton && (
            <CompanySetupWizard
              agentId={agent.id}
              companyName={agent.name}
              showVisibleRunOption={showVisibleRunOption}
            />
          )}
          {showEditCompanyButton && (
            <CompanySetupWizard
              agentId={agent.id}
              companyName={agent.name}
              mode="edit"
              showVisibleRunOption={showVisibleRunOption}
            />
          )}
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
          {showGetStartedButton && <GetStartedButton agentId={agent.id} />}
          {/* An `external` folder has exactly one action (v66), so hiding it
              in simple mode would leave that card with no buttons at all.
              For a real company, "opens a terminal" is the definition of the
              advanced surface. */}
          {showOpenTerminalButton &&
            (agent.kind === "external" ? (
              <OpenTerminalButton agentId={agent.id} />
            ) : (
              <AdvancedOnly>
                <OpenTerminalButton agentId={agent.id} />
              </AdvancedOnly>
            ))}
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
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
      </div>
    </div>
  )
}
