import React from "react"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { HealthMeter } from "@/components/os/doctor/health-meter"
import { StorageLayersGrid } from "@/components/os/doctor/storage-layers"
import { DiagnosticCheckList } from "@/components/os/doctor/diagnostic-check-list"
import { runDoctor } from "@/lib/os/doctor/engine"
import { inspectStorageLayers } from "@/lib/os/doctor/storage"
import { getActiveCompanyRoot } from "@/lib/os/active-company"

export const dynamic = "force-dynamic"

export default async function DoctorPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const companyRoot = await getActiveCompanyRoot(companyId)

  if (!companyRoot) {
    notFound()
  }

  const [doctorReport, storageReport] = await Promise.all([
    runDoctor(companyRoot),
    inspectStorageLayers(companyRoot),
  ])

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="System Doctor"
        subtext={`Diagnostic audit of local-first repository invariants, connectors, and plain-file health · ${new Date(
          doctorReport.timestamp
        ).toLocaleTimeString()}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthMeter report={doctorReport} />
        <StorageLayersGrid report={storageReport} />
      </div>

      <DiagnosticCheckList checks={doctorReport.checks} />
    </div>
  )
}
