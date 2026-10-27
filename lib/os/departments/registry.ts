import fs from "node:fs"
import path from "node:path"
import type { Department } from "@/lib/os/brain/types"
import type { Ontology } from "@/lib/os/ontology/schema"
import { readDefinitions } from "./definitions"
import { APP_OWNED_SLUGS, APP_RECORD_SLUGS } from "./rules"

export interface DepartmentRole {
  id: string
  name: string
  owns?: string
}

export type DepartmentSource = "built-in" | "app" | "custom" | "discovered"

export interface CompanyDepartment extends Department {
  slug: string
  recordsCount: number
  roles: DepartmentRole[]
  source: DepartmentSource
  /** Custom departments only: the owner's one-line purpose. */
  purpose?: string
}

const BASE_DEPARTMENTS: Array<Omit<CompanyDepartment, "recordsCount" | "roles" | "source">> = [
  {
    id: "dept-funnel",
    name: "Value Pipeline",
    slug: "funnel",
    tagline: "Inbound channels, core transformations, bottlenecks, delivered value.",
    color: "#3b82f6",
    order: 1,
  },
  {
    id: "dept-comms",
    name: "Communications",
    slug: "comms",
    tagline: "Gmail, WhatsApp, Beeper, Slack → safe read-only message sweeps.",
    color: "#8b5cf6",
    order: 2,
  },
  {
    id: "dept-content",
    name: "Content",
    slug: "content",
    tagline: "Publishing ideas, drafts, reviews, schedule, and distribution assets.",
    color: "#ec4899",
    order: 3,
  },
  {
    id: "dept-social",
    name: "Distribution",
    slug: "social",
    tagline: "Audience growth, connected platform metrics, and §6 Publication Gate.",
    color: "#06b6d4",
    order: 4,
  },
  {
    id: "dept-finances",
    name: "Finances",
    slug: "finances",
    tagline: "Every processor and recorded transaction in one plain ledger.",
    color: "#10b981",
    order: 5,
  },
]

/** Discovered app folders with their own name and wording. */
const APP_FOLDERS: Record<string, { name: string; tagline: string; color: string }> = {
  actions: { name: "Actions", tagline: "What your AI and jobs did outside the company, one line each.", color: "#e11d48" },
}

/** Read and opened from the Records page: the owner's departments, plain folders, and app logs like Actions. */
export function showsOnRecords(d: Pick<CompanyDepartment, "source" | "slug">): boolean {
  return d.source === "custom" || d.source === "discovered" || (d.source === "app" && (APP_RECORD_SLUGS as readonly string[]).includes(d.slug))
}

function formatDeptName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function countRecordsSync(deptDir: string): number {
  if (!fs.existsSync(deptDir)) return 0
  try {
    const entries = fs.readdirSync(deptDir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).length
  } catch {
    return 0
  }
}

/**
 * Dynamically resolves all departments for a company by discovering:
 * 1. The core application departments (Value Pipeline, Comms, Content, Distribution, Finances)
 * 2. Any departmental subfolders in `records/` (e.g. workflows, roadmap, support, sales)
 * 3. Any explicit departments or mapped roles defined in `definitions/ontology/company.yaml`
 */
export function getCompanyDepartmentsDetailed(
  companyRoot?: string,
  ontology?: Ontology | null
): { departments: CompanyDepartment[]; definitionsError: string | null; definitionsRevision: string } {
  const deptMap = new Map<string, CompanyDepartment>()
  let definitionsError: string | null = null
  let definitionsRevision = "absent"

  // 1. Built-ins
  for (const base of BASE_DEPARTMENTS) {
    const recordsDir = companyRoot ? path.join(companyRoot, "records", base.slug) : ""
    deptMap.set(base.slug, { ...base, recordsCount: recordsDir ? countRecordsSync(recordsDir) : 0, roles: [], source: "built-in" })
  }

  let orderCounter = 6

  // 2. The owner's definitions. Built-ins win; a malformed file is reported, never guessed at.
  if (companyRoot) {
    const defs = readDefinitions(companyRoot)
    definitionsRevision = defs.revision
    if (!defs.ok) definitionsError = defs.error
    else {
      for (const def of defs.departments) {
        if (deptMap.has(def.slug)) continue
        deptMap.set(def.slug, {
          id: `dept-${def.slug}`,
          name: def.name,
          slug: def.slug,
          tagline: def.purpose,
          purpose: def.purpose,
          color: def.color,
          order: orderCounter++,
          recordsCount: countRecordsSync(path.join(companyRoot, "records", def.slug)),
          roles: [],
          source: "custom",
        })
      }
    }
  }

  // 3. Discovered folders under records/
  if (companyRoot) {
    const recordsRoot = path.join(companyRoot, "records")
    if (fs.existsSync(recordsRoot)) {
      try {
        for (const entry of fs.readdirSync(recordsRoot, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith(".")) continue
          const slug = entry.name.toLowerCase()
          if (slug === "company") continue
          const fileCount = countRecordsSync(path.join(recordsRoot, entry.name))
          const existing = deptMap.get(slug)
          if (existing) {
            existing.recordsCount = fileCount
          } else {
            const name = APP_FOLDERS[slug]?.name ?? formatDeptName(slug)
            deptMap.set(slug, {
              id: `dept-${slug}`,
              name,
              slug,
              tagline: APP_FOLDERS[slug]?.tagline ?? `Operational department records for ${name}.`,
              color: APP_FOLDERS[slug]?.color ?? (slug === "workflows" ? "#f59e0b" : slug === "roadmap" ? "#14b8a6" : "#a3a3a3"),
              order: orderCounter++,
              recordsCount: fileCount,
              roles: [],
              source: (APP_OWNED_SLUGS as readonly string[]).includes(slug) ? "app" : "discovered",
            })
          }
        }
      } catch {
        // Soft fail if directory read fails
      }
    }
  }

  // 4. Map roles from ontology into departments
  if (ontology?.org?.roles) {
    for (const role of ontology.org.roles) {
      const text = [role.id, role.name, role.owns ?? ""].join(" ").toLowerCase()
      let assignedSlug = ""

      if (text.includes("finance") || text.includes("accounting") || text.includes("ledger") || text.includes("tax")) {
        assignedSlug = "finances"
      } else if (text.includes("funnel") || text.includes("sales") || text.includes("crm") || text.includes("deal") || text.includes("pipeline")) {
        assignedSlug = "funnel"
      } else if (text.includes("content") || text.includes("writing") || text.includes("copy") || text.includes("blog")) {
        assignedSlug = "content"
      } else if (text.includes("social") || text.includes("audience") || text.includes("distribution") || text.includes("community")) {
        assignedSlug = "social"
      } else if (text.includes("comm") || text.includes("support") || text.includes("inbox") || text.includes("message")) {
        assignedSlug = "comms"
      } else if (text.includes("developer") || text.includes("architecture") || text.includes("release") || text.includes("ci/cd")) {
        // If workflows department exists, assign there; otherwise funnel/value creation
        assignedSlug = deptMap.has("workflows") ? "workflows" : "funnel"
      } else {
        // Check if role text contains any discovered department slug
        for (const [slug] of deptMap) {
          if (text.includes(slug)) {
            assignedSlug = slug
            break
          }
        }
      }

      if (assignedSlug && deptMap.has(assignedSlug)) {
        deptMap.get(assignedSlug)!.roles.push({
          id: role.id,
          name: role.name,
          owns: role.owns,
        })
      }
    }
  }

  return {
    departments: Array.from(deptMap.values()).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    definitionsError,
    definitionsRevision,
  }
}

export function getCompanyDepartments(companyRoot?: string, ontology?: Ontology | null): CompanyDepartment[] {
  return getCompanyDepartmentsDetailed(companyRoot, ontology).departments
}
