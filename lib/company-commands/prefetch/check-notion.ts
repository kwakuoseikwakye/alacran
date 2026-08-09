import { readNotionToken } from "../../notion/read-notion-token"
import type { PrefetchContext, PrefetchFetchFn, PrefetchResult } from "./types"

const MAX_RESULTS = 10

// Confirmed against the real notion-sdk-js source (makenotion/notion-sdk-js,
// the official Notion JS SDK — verified via its GitHub source and cross-checked
// against its npm registry entry, not a summarized doc page) rather than
// assumed. Not run end-to-end against a live Notion workspace from this app
// yet — same honest bar this project already holds Codex/Aider's shipped
// flags to: shape confirmed real, live behavior unverified.
const NOTION_VERSION = "2025-09-03"
const NOTION_SEARCH_URL = "https://api.notion.com/v1/search"

const defaultFetch: PrefetchFetchFn = async (url, init) => {
  const res = await fetch(url, init)
  return { status: res.status, ok: res.ok, json: () => res.json() }
}

function plainText(richText: unknown): string {
  if (!Array.isArray(richText)) return ""
  return richText
    .map((t) => (t && typeof (t as { plain_text?: unknown }).plain_text === "string" ? (t as { plain_text: string }).plain_text : ""))
    .join("")
}

/** A page's title lives inside whichever of its properties has type "title";
 *  a database/data_source's title sits directly on the object. Handles both,
 *  and degrades to "" (never throws) if Notion's schema has drifted further
 *  than this was checked against. */
function extractTitle(obj: Record<string, unknown>): string {
  if (Array.isArray(obj.title)) {
    const t = plainText(obj.title)
    if (t) return t
  }
  const properties = obj.properties
  if (properties && typeof properties === "object") {
    for (const prop of Object.values(properties as Record<string, unknown>)) {
      const p = prop as { type?: unknown; title?: unknown }
      if (p?.type === "title") {
        const t = plainText(p.title)
        if (t) return t
      }
    }
  }
  return ""
}

export async function buildCheckNotionPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const token = await readNotionToken(ctx.agentRootPath, ctx.readFileFn)
  if (!token) {
    return {
      ok: false,
      message:
        'No Notion connection found for this company. Use the api-connect skill ("connect Notion") first — it saves NOTION_TOKEN to this repo\'s own .env, outside this app entirely.',
    }
  }

  const fetchFn = ctx.fetchFn ?? defaultFetch
  let res: Awaited<ReturnType<PrefetchFetchFn>>
  try {
    res = await fetchFn(NOTION_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: MAX_RESULTS,
      }),
    })
  } catch (err) {
    return { ok: false, message: `Could not reach the Notion API: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!res.ok) {
    const reason =
      res.status === 401
        ? "the token is invalid or expired — reconnect with the api-connect skill"
        : res.status === 403
          ? "the token lacks permission for this request"
          : `HTTP ${res.status}`
    return { ok: false, message: `Notion API request failed: ${reason}.` }
  }

  const body = (await res.json()) as { results?: unknown[] }
  const results = Array.isArray(body.results) ? body.results : []

  if (results.length === 0) {
    return {
      ok: true,
      text:
        "--- Notion search, most recently edited (control panel fetched this; you were not given Notion credentials or Bash access) ---\n" +
        '(no pages or databases are shared with this integration yet — share some from Notion\'s own "···" menu → "Connections" on each page, then re-run)',
    }
  }

  const lines = results.map((r) => {
    const obj = r as Record<string, unknown>
    const title = extractTitle(obj) || "(untitled)"
    const kind = obj.object === "database" || obj.object === "data_source" ? "database" : "page"
    const editedDate = typeof obj.last_edited_time === "string" ? obj.last_edited_time.slice(0, 10) : "unknown date"
    const url = typeof obj.url === "string" ? obj.url : "(no url)"
    return `- [${kind}] ${title} — edited ${editedDate} — ${url}`
  })

  return {
    ok: true,
    text: `--- Notion search, most recently edited (control panel fetched this; you were not given Notion credentials or Bash access) ---\n${lines.join("\n")}`,
  }
}
