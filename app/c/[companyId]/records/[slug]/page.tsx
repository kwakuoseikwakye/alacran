import Link from "next/link"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { getCompanyDepartmentsDetailed, showsOnRecords } from "@/lib/os/departments/registry"
import { listDepartmentRecords, readDepartmentRecord } from "@/lib/os/departments/records"
import { SLUG_PATTERN } from "@/lib/os/departments/rules"
import { AddDepartmentDialog } from "@/components/os/departments/add-department-dialog"
import { AddRecordDialog } from "@/components/os/departments/add-record-dialog"
import { EditDepartmentDialog } from "@/components/os/departments/edit-department-dialog"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

/** Local calendar date of an ISO timestamp; the raw first 10 characters if it does not parse. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : new Intl.DateTimeFormat("en-CA").format(d)
}

export default async function DepartmentPage({
  params, searchParams,
}: { params: Promise<{ companyId: string; slug: string }>; searchParams: Promise<{ open?: string }> }) {
  const { companyId, slug } = await params
  const { open } = await searchParams
  const company = (await getEffectiveAgents()).find((a) => a.id === companyId)
  if (!company || !SLUG_PATTERN.test(slug)) notFound()
  const { departments, definitionsError, definitionsRevision } = getCompanyDepartmentsDetailed(company.rootPath, null)
  const dept = departments.find((d) => d.slug === slug)
  if (!dept || !showsOnRecords(dept)) notFound()
  // Written by Alacrán only: readable here, never added to or renamed.
  const appOwned = dept.source === "app"

  const records = await listDepartmentRecords(company.rootPath, slug)
  const opened = open && /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(open) ? await readDepartmentRecord(company.rootPath, slug, open) : null

  return (
    <main className="dash-content space-y-6" aria-labelledby="dept-title">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground [overflow-wrap:anywhere]"><Link className="underline" href={`/c/${companyId}/records`}>Your records</Link> / {dept.name}</nav>
      <header className="flex flex-wrap items-start justify-between gap-4 border-l-4 pl-4" style={{ borderColor: dept.color }}>
        <div className="min-w-0">
          <h1 id="dept-title" className="text-3xl font-semibold [overflow-wrap:anywhere]">{dept.name}</h1>
          <p className="mt-2 text-muted-foreground">{dept.source === "custom" ? dept.purpose : appOwned ? dept.tagline : "A records folder that isn't set up as a department yet."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!appOwned && <AddRecordDialog companyId={companyId} slug={slug} departmentName={dept.name} />}
          {dept.source === "custom" && !definitionsError && (
            <EditDepartmentDialog companyId={companyId} slug={slug} initial={{ name: dept.name, purpose: dept.purpose ?? "", color: dept.color ?? "#0369a1" }} revision={definitionsRevision} />
          )}
          {dept.source === "discovered" && !definitionsError && (
            <AddDepartmentDialog companyId={companyId} initialName={dept.name} adoptExisting trigger={<Button variant="outline">Give it a name and colour</Button>} />
          )}
        </div>
      </header>
      {definitionsError && <p role="alert" className="rounded-md border border-os-border p-3 text-sm">{definitionsError} Departments can be viewed but not changed until it is fixed.</p>}

      {opened ? (
        <article className="rounded-xl border border-os-border bg-os-surface p-6">
          <Link className="text-sm underline" href={`/c/${companyId}/records/${slug}`}>← All records</Link>
          <h2 className="mt-3 text-xl font-semibold">{opened.title}</h2>
          <p className="text-xs text-muted-foreground">Updated {shortDate(opened.updated)}</p>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm">{opened.body}</pre>
        </article>
      ) : records.length === 0 ? (
        <section className="rounded-xl border border-dashed border-os-border p-8 text-center">
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{appOwned ? "Alacrán adds a line here each time a job sends an email or you decide on a held step." : `Keep anything that belongs to ${dept.name} here: notes, agreements, decisions. Each one is a titled note.`}</p>
        </section>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Records in {dept.name}</caption>
          <thead><tr className="border-b border-os-border text-muted-foreground"><th className="py-2 pr-4 font-medium">Title</th><th className="py-2 font-medium">Updated</th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.file} className="border-b border-os-border/60">
                <td className="py-2 pr-4">
                  {r.kind === "markdown" ? <Link className="underline" href={`/c/${companyId}/records/${slug}?open=${encodeURIComponent(r.file)}`}>{r.title}</Link> : <span>{r.title} <span className="text-xs text-muted-foreground">(not shown here)</span></span>}
                </td>
                <td className="py-2 text-muted-foreground">{shortDate(r.updated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
