/** What a terminal workspace is, with nothing in this file that touches the
 *  disk — the terminal page imports it, and a browser bundle cannot take
 *  `node:fs`. The reading and writing live in `workspaces.ts`. */
export type Workspace = {
  id: string
  name: string
  /** The AI this workspace's assistants run. Absent means "whatever the company
   *  has chosen", followed live, so changing the company's AI still moves it. */
  executorId?: string
}

/** Every company has this one. It holds the terminals that existed before
 *  workspaces did, and any session that names no workspace. */
export const DEFAULT_WORKSPACE_ID = "main"
export const DEFAULT_WORKSPACE_NAME = "Main"
export const MAX_WORKSPACE_NAME = 40
export const MAX_WORKSPACES_PER_COMPANY = 12

/** The name as it will be stored, or null when there is nothing to store. */
export function cleanWorkspaceName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.replace(/\s+/g, " ").trim()
  return name.length > 0 && name.length <= MAX_WORKSPACE_NAME ? name : null
}
