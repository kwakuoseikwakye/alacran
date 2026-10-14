import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "yaml"
import { commitFile, type ExecFileFn } from "../git-commit-file"
import { defaultExecFile } from "../default-exec-file"
import { LeadsFileSchema, type Lead } from "../os/schemas/funnel"
import { PROSPECTS_DIR, isSafeProspectFileName, parseProspect } from "./prospects"

const LEADS_FILE = "records/funnel/leads.yaml"

function setField(frontmatter: string, key: string, value: string): string {
  const line = new RegExp(`^${key}:.*$`, "m")
  return line.test(frontmatter)
    ? frontmatter.replace(line, `${key}: ${value}`)
    : `${frontmatter.trimEnd()}\n${key}: ${value}\n`
}

export async function markProspectContactedImpl(
  rootPath: string,
  fileName: string,
  today: string,
  runRecordPath: string,
  execFn?: ExecFileFn
): Promise<{ ok: boolean; message: string }> {
  if (!isSafeProspectFileName(fileName)) {
    return { ok: false, message: "Invalid prospect file name." }
  }

  try {
    const filePath = path.join(rootPath, PROSPECTS_DIR, fileName)
    const text = await readFile(filePath, "utf-8")
    const end = text.indexOf("\n---", 3)
    if (!text.startsWith("---") || end === -1) {
      return { ok: false, message: "Prospect file frontmatter is unreadable." }
    }

    const leadsPath = path.join(rootPath, LEADS_FILE)
    const rawLeads = await readFile(leadsPath, "utf-8").catch(() => null)
    const parsedLeads = LeadsFileSchema.safeParse(
      rawLeads === null ? { schema_version: 1, records: [] } : parse(rawLeads)
    )

    if (!parsedLeads.success) {
      return { ok: false, message: "Fix records/funnel/leads.yaml syntax errors first." }
    }

    const prospect = parseProspect(fileName, text, "ready")
    const entryId = prospect.id

    const existingIndex = parsedLeads.data.records.findIndex((r) => r.id === entryId || r.name === prospect.company)
    const existingLead = existingIndex >= 0 ? parsedLeads.data.records[existingIndex] : undefined

    if (prospect.status === "contacted" && existingLead?.stage === "qualified") {
      return { ok: true, message: `Already marked ${prospect.company} as contacted.` }
    }

    const pending = await readFile(runRecordPath, "utf-8")
      .then((t) => JSON.parse(t) as { before?: unknown })
      .catch(() => null)

    if (pending && Array.isArray(pending.before) && !pending.before.includes(fileName)) {
      return { ok: false, message: "Approve this prospect before marking them as contacted." }
    }

    const updatedRecords = [...parsedLeads.data.records]

    if (existingIndex >= 0) {
      updatedRecords[existingIndex] = {
        ...updatedRecords[existingIndex],
        stage: "qualified",
        last_touch: today,
      }
    } else {
      const newLead: Lead = {
        id: entryId,
        name: prospect.company,
        stage: "qualified",
        source: "prospect-research",
        owner: "human",
        value: prospect.estimatedValue,
        currency: "USD",
        first_seen: today,
        last_touch: today,
        provenance: [
          {
            claim: `Researched contact: ${prospect.name} (${prospect.role})`,
            said_by: "agent",
            said_on: today,
            source: `${PROSPECTS_DIR}/${fileName}`,
          },
        ],
      }
      updatedRecords.push(newLead)
    }

    await mkdir(path.dirname(leadsPath), { recursive: true })
    await writeFile(leadsPath, stringify({ ...parsedLeads.data, records: updatedRecords }), "utf-8")

    const frontmatter = text.slice(4, end + 1)
    let updated = setField(frontmatter, "status", "contacted")
    updated = setField(updated, "contacted_on", today)
    updated = setField(updated, "updated", today)
    const newFileContent = `---\n${updated.trim()}\n---${text.slice(end + 4)}`
    await writeFile(filePath, newFileContent, "utf-8")

    const runner = execFn ?? defaultExecFile
    await commitFile(rootPath, `${PROSPECTS_DIR}/${fileName}`, `record outreach to ${prospect.company}`, runner)
    await commitFile(rootPath, LEADS_FILE, `update leads index for ${prospect.company}`, runner)

    return { ok: true, message: `Marked ${prospect.company} as contacted.` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
