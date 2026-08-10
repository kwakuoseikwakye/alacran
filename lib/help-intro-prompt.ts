/**
 * The seeded first message for the "Get Started" button
 * (open-interactive-terminal-with-help.ts). Generic on purpose — it works
 * for any company, built-in or freshly scaffolded, because it tells the
 * agent to go look rather than assuming what's there. This is an
 * unscoped interactive session (same as plain "Open in Terminal"), so the
 * agent already has real read access to everything it's asked to read.
 */
export const HELP_INTRO_PROMPT =
  "Read this company's definitions/ontology/company.yaml (if it exists) and every skill or command file under .claude/skills/ and .claude/commands/. Then introduce yourself in plain language, without any jargon: summarize in 2-3 sentences what this company is set up to do, list what you can actually help me run right now based on what's really installed here (not a generic list), and ask me what I'd like to start with."
