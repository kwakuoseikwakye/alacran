import Link from "next/link"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { getCompanyDepartmentsDetailed, showsOnRecords } from "@/lib/os/departments/registry"
import { AddDepartmentDialog } from "@/components/os/departments/add-department-dialog"
import { Button } from "@/components/ui/button"
import { CANVA_DESIGN_TOOLS } from "@/lib/content-social/canva-tools"

export const dynamic = "force-dynamic"

export default async function RecordsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const company = (await getEffectiveAgents()).find((agent) => agent.id === companyId)
  if (!company) notFound()
  return <main className="dash-content space-y-6" aria-labelledby="records-title">
    <header><h1 id="records-title" className="text-3xl font-semibold">Your records</h1><p className="mt-2 text-muted-foreground">Find, add, and update the information you keep for {company.name}.</p></header>
    <nav aria-label="Record types" className="grid gap-4 sm:grid-cols-3">
      {[
        { route: "funnel", title: "Leads & customers", detail: "People and companies who might buy from you." },
        { route: "finances", title: "Money in & out", detail: "Sales, bills, and expenses you have recorded." },
        { route: "content-social", title: "Content & social", detail: CANVA_DESIGN_TOOLS.length > 0 ? "Posts Alacrán drafts and designs for you to approve." : "Posts Alacrán drafts for you to approve." },
      ].map((item) => <Link key={item.route} href={`/c/${companyId}/${item.route}`} className="rounded-xl border border-os-border bg-os-surface p-6 hover:bg-os-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <h2 className="text-lg font-semibold">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p><span className="mt-4 block text-sm text-os-accent">View records →</span>
      </Link>)}
    </nav>
    {(() => {
      const { departments, definitionsError } = getCompanyDepartmentsDetailed(company.rootPath, null)
      const mine = departments.filter(showsOnRecords)
      return (
        <section aria-labelledby="your-departments" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="your-departments" className="text-xl font-semibold">Your departments</h2>
            {definitionsError ? null : <AddDepartmentDialog companyId={companyId} trigger={<Button>Add department</Button>} />}
          </div>
          {definitionsError && <p role="alert" className="rounded-md border border-os-border p-3 text-sm">{definitionsError} You can still open departments, but adding or changing them is paused until it is fixed.</p>}
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a department for anything the three above don&apos;t cover, such as Legal or Support. It gets its own list of records, and a room in your office once it holds records.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-3">
              {mine.map((d) => (
                <li key={d.slug} className="min-w-0">
                  <Link href={`/c/${companyId}/records/${d.slug}`} className="block rounded-xl border border-os-border border-l-4 bg-os-surface p-5 hover:bg-os-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderLeftColor: d.color }}>
                    <h3 className="font-semibold [overflow-wrap:anywhere]">{d.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.source === "custom" ? d.purpose : d.source === "app" ? d.tagline : "A folder of records"}</p>
                    <span className="mt-3 block text-xs text-muted-foreground">{d.recordsCount} {d.recordsCount === 1 ? "record" : "records"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )
    })()}
  </main>
}
