import Link from "next/link"
import { describeMemoryHealth, type HealthRow } from "@/lib/os/memory-health/describe"
import type { MemoryHealth } from "@/lib/os/memory-health/types"
import { MemoryHealthFix } from "./memory-health-fix"

function Row({ companyId, row }: { companyId: string; row: HealthRow }) {
  return (
    <li className="mh-row">
      <div>
        <b>{row.title}</b>
        <p>{row.why}</p>
      </div>
      {row.fix?.kind === "refresh" && <MemoryHealthFix companyId={companyId} label={row.fix.label} />}
      {row.fix?.kind === "finish" && (
        <Link className="mh-btn" href={`/c/${companyId}/agents`} title="Opens your company profile, where you can fill in what's missing.">
          {row.fix.label}
        </Link>
      )}
    </li>
  )
}

/** Memory health at the top of "What Alacrán knows": one line when all is well, a grouped card when not. */
export function MemoryHealthCard({ companyId, health }: { companyId: string; health: MemoryHealth }) {
  const view = describeMemoryHealth(health)
  if (view.kind === "hidden") return null
  if (view.kind === "unknown") {
    return (
      <section className="mh-card mh-strip" aria-label="Memory health">
        <p>{view.text}</p>
      </section>
    )
  }
  if (view.kind === "clean") {
    return (
      <section className="mh-card mh-strip" aria-label="Memory health">
        <p>{view.text}</p>
        {view.note && <small>{view.note}</small>}
      </section>
    )
  }
  return (
    <section className="mh-card" aria-labelledby="mh-title">
      <div className="mh-head">
        <h2 id="mh-title">Memory health</h2>
        <span className="mh-score">
          {view.score} <small>/ 100</small>
        </span>
        <span className="mh-pill">{view.pill}</span>
      </div>
      <div className="mh-bar" role="img" aria-label={`Memory health ${view.score} out of 100`}>
        <i style={{ width: `${view.score}%` }} />
      </div>
      {view.groups.map((g) => (
        <div key={g.heading}>
          <h3 className="mh-group">{g.heading}</h3>
          <ul className="mh-rows">
            {g.rows.map((row) => (
              <Row key={row.id} companyId={companyId} row={row} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
