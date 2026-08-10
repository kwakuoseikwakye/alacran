export type McpPreset = { name: string; label: string; url: string }

/**
 * Every URL here came from `claude mcp list` on a real machine, where the CLI
 * itself health-checked each one — not from vendor docs or memory. That
 * matters: v42 hit a web page describing Antigravity's CLI as "Anthropic's
 * official CLI for Claude," and an MCP endpoint is exactly the kind of value
 * that looks plausible when invented.
 *
 * Notion and GitHub are deliberately absent — their endpoints couldn't be
 * verified the same way, and Notion already has a working per-company path (a
 * NOTION_TOKEN in .env, placed by the api-connect skill).
 *
 * mcp-presets.test.ts asserts every entry passes isSafeServerName and
 * isSafeServerUrl, so a typo'd addition here fails the suite rather than
 * being silently dropped on read.
 */
export const MCP_PRESETS: McpPreset[] = [
  { name: "canva", label: "Canva", url: "https://mcp.canva.com/mcp" },
  { name: "figma", label: "Figma", url: "https://mcp.figma.com/mcp" },
  { name: "lovable", label: "Lovable", url: "https://mcp.lovable.dev" },
  { name: "gmail", label: "Gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
  { name: "google-calendar", label: "Google Calendar", url: "https://calendarmcp.googleapis.com/mcp/v1" },
  { name: "google-drive", label: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1" },
  { name: "docusign", label: "Docusign", url: "https://mcp.docusign.com/mcp" },
  { name: "vercel", label: "Vercel", url: "https://mcp.vercel.com" },
]
