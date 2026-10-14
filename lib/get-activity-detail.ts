"use server"

import { readFile, stat } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"

export type ActivityDetail = { ok: true; content: string } | { ok: false; message: string }

/**
 * Read one activity's or file's content.
 *
 * **Returns a result rather than throwing**, which is v91's standing rule and
 * which this function was quietly violating. A `"use server"` action that is a
 * bare `return impl(...)` turns any throw into Next's redacted production
 * digest, so a user clicking an activity whose `detailPath` is a directory got:
 *
 *   "An error occurred in the Server Components render. The specific message is
 *    omitted in production builds to avoid leaking sensitive details…"
 *
 * …in place of the perfectly good sentence this function already had. Nobody
 * had seen it because the old Sheet only rendered on the activities you opened;
 * a permanent detail pane shows it on the first one that has no file.
 *
 * "No single file" is not an error, either — some activities are a directory of
 * output, which is a normal shape. It comes back as `ok: false` with a plain
 * sentence, and the caller decides how loudly to say it.
 */
export async function getActivityDetail(detailPath: string): Promise<ActivityDetail> {
  const result = await resolveWithinAgentRoot(detailPath)
  if (!result) {
    return { ok: false, message: "That file isn't inside a company Alacrán manages." }
  }
  try {
    const stats = await stat(result.realPath)
    if (stats.isDirectory()) {
      return { ok: false, message: "This run wrote a folder rather than a single file, so there's nothing to show here." }
    }
    return { ok: true, content: await readFile(result.realPath, "utf-8") }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
