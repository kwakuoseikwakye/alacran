import Link from "next/link"
import {
  getConnectorTreatment,
  type DepartmentConnector,
} from "@/lib/os/departments/connectors"

export type { DepartmentConnector }

export function ConnectorStatusStrip({ connectors }: { connectors: DepartmentConnector[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 mb-4 text-xs">
      <span className="text-muted-foreground font-medium mr-1">Sources:</span>
      {connectors.map((c) => {
        const treatment = getConnectorTreatment(c.status)

        return (
          <Link
            key={c.id}
            href="/system/connectors"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono transition-colors ${treatment.badgeClass}`}
          >
            <span className={`size-1.5 rounded-full ${treatment.dotClass}`} />
            <span>{c.label}</span>
            {treatment.labelSuffix && (
              <span className="opacity-60 text-[10px]">{treatment.labelSuffix}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
