import path from "node:path"
import { readdir, readFile } from "node:fs/promises"
import { readLeads, readTransactions } from "../os/records/read"

/**
 * Status questions answered from the company's own records, with no AI call.
 *
 * "What's my pipeline?", "how much cash?", "what's waiting?" and "what did we
 * decide?" have exact answers on disk; sending them to the user's AI spent
 * thousands of tokens and several seconds to read the same numbers back. Only
 * short, clearly factual questions match — anything asking for judgement
 * ("should", "why", "draft", "plan"…) returns null and goes to the AI as before.
 */
export type LocalAnswerDeps = {
  leads: () => Promise<Array<{ name: string; stage: string; value: number }>>
  transactions: () => Promise<Array<{ type: string; amount: number; status: string }>>
  pendingCount: () => Promise<number | null>
  decisionTitles: () => Promise<string[]>
}

const NEEDS_JUDGEMENT = /\b(why|should|could|would|how (?:do|can|to|should)|draft|write|plan|improve|grow|compare|suggest|analy[sz]e|explain|help|idea|strategy|email|message)\b/i

const TOPICS = {
  pipeline: /\b(pipeline|leads?|deals?|prospects?)\b/i,
  cash: /\b(cash|balance|money|bank|revenue|income|expenses?|spent|spending|profit)\b/i,
  waiting: /\b(waiting|pending|approv\w*|to review|needs? me)\b/i,
  decisions: /\b(decide|decided|decisions?)\b/i,
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

export async function answerLocally(question: string, deps: LocalAnswerDeps): Promise<string | null> {
  const q = question.trim()
  if (!q || q.length > 90 || NEEDS_JUDGEMENT.test(q)) return null
  const topics = (Object.keys(TOPICS) as Array<keyof typeof TOPICS>).filter((t) => TOPICS[t].test(q))
  if (topics.length === 0) return null

  const parts: string[] = []
  for (const topic of topics) {
    if (topic === "pipeline") {
      const active = (await deps.leads()).filter((l) => l.stage !== "lost" && l.stage !== "won")
      if (active.length === 0) {
        parts.push("You haven't added any leads yet.")
      } else {
        const total = active.reduce((s, l) => s + (Number(l.value) || 0), 0)
        const top = [...active].sort((a, b) => b.value - a.value)[0]
        parts.push(`Your pipeline is ${usd(total)} across ${active.length} active lead${active.length === 1 ? "" : "s"}. The biggest is ${top.name} at ${usd(top.value)}.`)
      }
    } else if (topic === "cash") {
      const tx = await deps.transactions()
      if (tx.length === 0) {
        parts.push("You haven't recorded any money in or out yet.")
      } else {
        const cleared = tx.filter((t) => t.status === "cleared")
        const sum = (type: string, list = cleared) => list.filter((t) => t.type === type).reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const pendingIn = sum("income", tx.filter((t) => t.status === "pending"))
        parts.push(
          `Your records show ${usd(sum("income") - sum("expense"))} in cash (${usd(sum("income"))} in, ${usd(sum("expense"))} out).` +
            (pendingIn > 0 ? ` Another ${usd(pendingIn)} is still to come in.` : "")
        )
      }
    } else if (topic === "waiting") {
      const n = await deps.pendingCount()
      if (n === null) continue
      parts.push(n === 0 ? "Nothing is waiting for your OK." : `${n} change${n === 1 ? " is" : "s are"} waiting for your OK in Approvals.`)
    } else if (topic === "decisions") {
      const titles = (await deps.decisionTitles()).slice(0, 5)
      parts.push(titles.length === 0 ? "No decisions are recorded yet." : `Your most recent decisions:\n${titles.map((t) => `- ${t}`).join("\n")}`)
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null
}

/** The real sources, for a company folder. */
export function localAnswerDepsFor(rootPath: string, pendingCount: () => Promise<number | null>): LocalAnswerDeps {
  return {
    leads: async () => {
      const r = await readLeads(rootPath)
      return r.ok ? r.records : []
    },
    transactions: async () => {
      const r = await readTransactions(rootPath)
      return r.ok ? r.records : []
    },
    pendingCount,
    decisionTitles: async () => {
      const dir = path.join(rootPath, "docs", "decisions")
      const files = (await readdir(dir).catch(() => [] as string[]))
        .filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme"))
        .sort()
        .reverse()
        .slice(0, 5)
      return Promise.all(
        files.map(async (f) => {
          const text = await readFile(path.join(dir, f), "utf-8").catch(() => "")
          return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || f.replace(/\.md$/, "")
        })
      )
    },
  }
}
