import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Agent, Activity } from "@/lib/adapters/types"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import type { PollLockStatus } from "@/lib/adapters/poll-lock"
import { TriggerPollButton } from "@/components/trigger-poll-button"
import { VerifyButton } from "@/components/verify-button"
import { DailyTeamLogButton } from "@/components/daily-team-log-button"
import { RemoveCompanyButton } from "@/components/remove-company-button"
import { AgentAvatar } from "@/components/agent-avatar"
import { AgentAvatarForm } from "@/components/agent-avatar-form"
import { StatusDot } from "@/components/status-dot"
import { CompanySetupWizard } from "@/components/company-setup-wizard"
import { InstallDailyTeamLogButton } from "@/components/install-daily-team-log-button"
import { BrandIcon } from "@/components/brand-icon"
import { BackupCompanyButton } from "@/components/backup-company-button"
import { CompanyOwnershipSheet } from "@/components/company-ownership-sheet"
import { AiExecutorPicker } from "@/components/ai-executor-picker"
import { OpenTerminalButton } from "@/components/open-terminal-button"
import { ScheduledJobToggle } from "@/components/scheduled-job-toggle"
import { NO_INTEGRATION_STATUS } from "@/lib/get-integration-status"

type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  showScheduledJobToggle?: boolean
  pollStatus?: PollLockStatus
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
  showOpenTerminalButton?: boolean
  showAiExecutorPicker?: boolean
  aiExecutorId?: string
  /** Position in the grid — drives the staggered entrance animation. */
  index?: number
}

// Warm hues only, so the kind badges read as part of the venom-night palette
// rather than leftovers from the old indigo theme.
const KIND_BADGE_CLASS: Record<Agent["kind"], string> = {
  pipeline: "border-ember/30 bg-ember/10 text-ember",
  "command-set": "border-warning/30 bg-warning/10 text-warning",
  "report-log": "border-success/30 bg-success/10 text-success",
}

export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  showScheduledJobToggle,
  pollStatus,
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
  showOpenTerminalButton,
  showAiExecutorPicker,
  aiExecutorId,
  index = 0,
}: AgentCardProps) {
  // getIntegrationStatus returns prose; anything other than the "none" sentinel
  // means a real Google account is wired up, so show the product mark.
  const hasIntegration = integrationStatus !== NO_INTEGRATION_STATUS

  return (
    <Card
      className="a-rise transition-all duration-300 hover:-translate-y-0.5 hover:border-border/80 hover:shadow-[0_18px_40px_-26px_var(--primary)]"
      style={{ "--d": `${index * 70}ms` } as React.CSSProperties}
    >
      <CardHeader>
        {/* min-w-0: CardTitle is a grid item, whose automatic minimum size would
            otherwise stop the agent name ever truncating on narrow screens. */}
        <CardTitle className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-display font-bold">
            <AgentAvatar imageUrl={avatarUrl ?? null} />
            <span className="truncate">{agent.name}</span>
          </span>
          <Badge variant="outline" className={KIND_BADGE_CLASS[agent.kind]}>
            {agent.kind}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-destructive">Source unavailable: {error}</p>}
        {!error && !latestActivity && <p className="text-muted-foreground">No activity recorded yet.</p>}
        {!error && latestActivity && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <StatusDot status={latestActivity.status} />
              {latestActivity.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(latestActivity.timestamp * 1000).toLocaleString()} · {latestActivity.status}
            </p>
          </div>
        )}
        {launchdHealth &&
          (showScheduledJobToggle ? (
            <ScheduledJobToggle health={launchdHealth} />
          ) : (
            <p className="text-xs text-muted-foreground">
              launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
              {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
            </p>
          ))}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {hasIntegration ? (
            <BrandIcon id="gmail" tone="brand" className="size-3.5" />
          ) : (
            <span className="inline-block size-1.5 rounded-full bg-border" aria-hidden="true" />
          )}
          <span className="truncate">{integrationStatus}</span>
        </p>
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
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
          {showOpenTerminalButton && <OpenTerminalButton agentId={agent.id} />}
          {showBackupButton && <BackupCompanyButton agentId={agent.id} companyName={agent.name} />}
          {showOwnershipButton && <CompanyOwnershipSheet agentId={agent.id} companyName={agent.name} />}
          {showAiExecutorPicker && (
            <AiExecutorPicker agentId={agent.id} currentExecutorId={aiExecutorId ?? "claude-code"} />
          )}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
      </CardContent>
    </Card>
  )
}
