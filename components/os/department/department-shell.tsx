import Link from "next/link"
import { ConnectorStatusStrip, type DepartmentConnector } from "./connector-status-strip"
import { RunAgentButton } from "./run-agent-button"
import { CreateRecordButton } from "./create-record-button"

export type DepartmentTab = "overview" | "records" | "settings"

export function DepartmentShell({
  departmentName,
  headlineMetric,
  companyId,
  currentTab,
  connectors,
  owningAgent,
  commandId,
  children,
}: {
  departmentName: string
  headlineMetric: { label: string; value: string }
  companyId: string
  currentTab: DepartmentTab
  connectors: DepartmentConnector[]
  owningAgent?: string
  commandId?: string
  children: React.ReactNode
}) {
  const tabs: { id: DepartmentTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "records", label: "Records" },
    { id: "settings", label: "Settings" },
  ]

  const basePath = `/c/${companyId}/${departmentName.toLowerCase()}`

  return (
    <>
      <header className="dash-topbar a-rise">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">Department</p>
            <h1>{departmentName}</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {headlineMetric.label}: <strong className="text-foreground">{headlineMetric.value}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <CreateRecordButton
              departmentName={departmentName}
              companyId={companyId}
              variant="header"
            />
            <RunAgentButton
              departmentName={departmentName}
              owningAgent={owningAgent}
              commandId={commandId}
              companyId={companyId}
            />
            <Link
              href={`/c/${companyId}/activity`}
              className="px-3 py-1.5 rounded text-xs font-mono border border-border bg-card hover:bg-muted/40 text-foreground transition-colors"
            >
              View Activity
            </Link>
          </div>
        </div>
      </header>

      <div className="dash-content">
        <ConnectorStatusStrip connectors={connectors} />

        <div className="brain-tabs" role="tablist">
          {tabs.map((t) => {
            const isActive = currentTab === t.id
            const href = t.id === "overview" ? basePath : `${basePath}?tab=${t.id}`
            return (
              <Link
                key={t.id}
                href={href}
                className="brain-tab"
                role="tab"
                aria-current={isActive ? "page" : undefined}
              >
                {t.label}
              </Link>
            )
          })}
        </div>

        <div className="pt-2">{children}</div>
      </div>
    </>
  )
}
