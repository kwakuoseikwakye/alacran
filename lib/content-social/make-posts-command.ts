import type { CompanyCommand } from "../company-commands/types"
import { CANVA_DESIGN_TOOLS } from "./canva-tools"

export const POSTS_DIR = "notes/content/posts"

function postCount(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

const canvaSteps = (hasCanva: boolean) =>
  hasCanva
    ? `For each post, create the visual in the member's Canva with the Canva tools you have: a 1080x1080 Instagram post that fits the caption, then export it as a PNG. Put the design link in canva_design_url and the export download link in image_url, and set image_status: ok. If Canva fails or is not signed in, still write the post, set image_status: failed, and put one plain sentence in image_error saying what happened (for example "Canva needs you to sign in again."). You may only create, edit and export designs — never share, publish or delete anything in Canva.`
    : `There is no Canva connection for this job. Set image_status: none and leave canva_design_url and image_url out. Never share, publish or delete anything anywhere.`

export const MAKE_POSTS_COMMAND: CompanyCommand = {
  id: "make-posts",
  // No template .md: like orientation, the prompt is self-contained.
  commandFileName: "make-posts.md",
  label: "Make posts",
  fields: [
    { key: "topic", label: "What about?", required: true, multiline: true, placeholder: "e.g. our new weekend brunch menu" },
    { key: "count", label: "How many? (1–5)", required: false, multiline: false, placeholder: "3" },
    { key: "when", label: "When? (optional)", required: false, multiline: false, placeholder: "e.g. next week" },
  ],
  outputKind: "new-file-in-dir",
  outputPath: POSTS_DIR,
  untrustedInput: true,
  ...(CANVA_DESIGN_TOOLS.length > 0 ? { mcpTools: CANVA_DESIGN_TOOLS } : {}),
  buildPrompt: (fields, today) => {
    const n = postCount(fields.count)
    const when = fields.when?.trim()
    return `You are drafting Instagram posts for this company. Nothing you write is published: the member approves each post first.

Topic: ${fields.topic?.trim() ?? ""}
${when ? `Timing: ${when}` : "Timing: suggest sensible times in the next week."}

Read definitions/ontology/company.yaml for what the company offers and who it serves, and read the existing files in ${POSTS_DIR}/ for the company's voice. Do not repeat a post that already exists there.

Write exactly ${n} post${n === 1 ? "" : "s"}. Write each one as its own file: ${POSTS_DIR}/${today}-<short-slug>.md (lowercase letters, digits and hyphens in the slug). Use exactly this format:

---
type: post
status: draft
channel: instagram
title: <a short headline for the member>
suggested_time: <YYYY-MM-DD HH:MM>
canva_design_url: <link, only if made>
image_url: <export link, only if made>
image_status: <ok | failed | none>
image_error: <one plain sentence, only if failed>
created: ${today}
updated: ${today}
---

## Caption
<the caption, in the company's voice>

## Hashtags
<5 to 10 hashtags on one line>

## Alt text
<one sentence describing the image for people who cannot see it>

${canvaSteps(CANVA_DESIGN_TOOLS.length > 0)}

Rule: Stop at the gate. Posting is Publication — do not post, schedule, share or send anything. Create the folder if it does not exist, write only those ${n} files, and do not run any other commands.`
  },
}
