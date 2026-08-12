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
 * A preset must also be a server Claude Code can actually sign in to, which
 * means its authorization server has to support Dynamic Client Registration
 * (RFC 7591) — Claude Code has no pre-registered client for an arbitrary MCP
 * server, so DCR is the only way it obtains a client_id. Every entry below
 * advertises a registration_endpoint; check that before adding one:
 *
 *   curl <origin>/.well-known/oauth-protected-resource<path>   # -> authorization_servers
 *   curl <as>/.well-known/oauth-authorization-server           # -> registration_endpoint
 *
 * Gmail / Google Calendar / Google Drive were listed here and were reported
 * as "cannot authenticate, always throws errors." Both halves measured
 * directly against the live endpoints rather than inferred:
 *
 *   1. Their authorization server is https://accounts.google.com/, which
 *      advertises NO registration_endpoint in either well-known document. No
 *      DCR means Claude Code can never get a client_id — sign-in cannot
 *      succeed. It needs a Google Cloud OAuth client the user creates, which
 *      a preset URL in a dropdown can't supply.
 *   2. They compound it by answering unauthenticated `initialize` AND
 *      `tools/list` with 200 and a full tool list, and never a 401 with
 *      WWW-Authenticate. So the client sees a healthy server, no OAuth flow
 *      is ever triggered, and the failure only surfaces per tool call as
 *      `isError: true` "Request is missing required authentication
 *      credential."
 *
 * Removed rather than fixed: Google in this app goes through `gog` (v22/v41),
 * which has its own working OAuth and is on the Connect page.
 *
 * mcp-presets.test.ts asserts every entry passes isSafeServerName and
 * isSafeServerUrl, so a typo'd addition here fails the suite rather than
 * being silently dropped on read.
 */
export const MCP_PRESETS: McpPreset[] = [
  { name: "canva", label: "Canva", url: "https://mcp.canva.com/mcp" },
  { name: "figma", label: "Figma", url: "https://mcp.figma.com/mcp" },
  { name: "lovable", label: "Lovable", url: "https://mcp.lovable.dev" },
  { name: "docusign", label: "Docusign", url: "https://mcp.docusign.com/mcp" },
  { name: "vercel", label: "Vercel", url: "https://mcp.vercel.com" },
  // freee (Japanese accounting/HR/invoicing). Added after the two-curl check
  // above, run live against the real endpoint rather than read off the README:
  // unauthenticated POST /mcp answers 401 with a WWW-Authenticate challenge
  // (the thing the Google presets never did), its own origin is the
  // authorization server, and it advertises
  // registration_endpoint https://mcp.freee.co.jp/register — so Claude Code
  // can complete DCR. freee also ships a local stdio server (`npx freee-mcp`),
  // which this UI deliberately doesn't support; the hosted one is the same
  // shape as every other entry here.
  { name: "freee", label: "freee", url: "https://mcp.freee.co.jp/mcp" },
]
