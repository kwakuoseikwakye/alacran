---
name: api-connect
description: Use when the user wants to connect an external service's API, CLI, or webhook to Claude Code or their project - "connect the API for X", "I want to integrate with X", "set up an API key", "help me issue a token", "set it up", and so on. Any service is in scope (LINE/Notion/X/Google/Slack/payment/advertising APIs, etc.). Handles navigation to the key-issuing screen, safe hand-off into .env, and a connectivity check.
---

# api-connect - the API setup concierge

## Overview

Takes over the work of connecting an external service's API/CLI to a project, so the user has to do as little as possible.
The ideal: **all the user does is "log in" and "press the copy button and paste into .env"**.
Research, navigating to the right screen, creating config files and the connectivity check are all done by the AI.

**Principle: don't bombard them with questions.** Once you know the service name and the goal, confirm at most once and get moving.

## Iron rules (security)

**Follow these literally. There is no "just this once".**

1. **Don't let secrets into the chat, and don't put them there yourself.** Never ask the user to paste an API key,
   token, secret or password into the chat. If the user pastes one by mistake, tell them immediately: "revoke that key and reissue it".
2. **The only hand-off mechanism is pasting directly into a .env file.** The AI creates the .env with placeholders
   first, and the user only has to hit the copy button in the admin console and paste it into the relevant line of .env.
3. **The AI does not log in, enter passwords, or create accounts.** Take them as far as the login page and have the
   user do it. The same goes for CAPTCHAs.
4. **Don't display .env values.** Load them entirely inside the shell, e.g. `set -a; . ./.env; set +a`, and never
   `cat .env` or echo a value. Check that the connectivity-check output contains no keys before showing it.
5. **Don't perform irreversible operations without asking.** Choosing a provider, reissuing an existing token
   (which revokes the old one), changing a plan, configuring billing — explain the impact in one line and get approval first.
6. **The AI does not press buttons that accept terms, or create/submit buttons.** Buttons carrying something like
   "By creating ... you agree to Terms" (Create/Submit/Agree and create) are for the user to press, even when the
   operation is reversible. The AI sets everything up to the step right before (filled in and checked).

## Flow

### Step 0: Understand the goal
Establish the service name + what they want to do (e.g. send messages, post, read).
If only one of the two is unclear, ask once; if you know both, start immediately.

### Step 1: Research
Setup procedures change often (e.g. LINE changed where channel creation starts in September 2024).
**Don't work from memory — always look up the latest procedure on the web.** If you're in an environment where you
can delegate to a subagent (web-search type), delegate; where you can't (e.g. running inside a subagent), look it up
yourself with WebSearch/WebFetch. Only skipping it is forbidden; either actor is fine. What to research:

- The exact URL where the procedure starts (admin console, developer portal)
- The names of tabs and buttons on screen (down to "which button on which tab")
- The kind of credential (key/token/OAuth) and **which is the easiest to issue**
- **Any authorisation step needed after the key is issued** (sharing the resource, granting scopes, OAuth consent, etc.
  e.g. Notion returns 404 unless the integration is connected to the page; Slack needs scopes; Google needs a consent screen)
- The smallest API call usable for a connectivity check (a single curl), plus **the next-cheapest API call that
  verifies the user's actual goal (reading, writing, etc.)** — two calls in total
- Pitfalls (account type, permissions, irreversible choices, recent flow changes)

If you're in an environment that can run things in the background, do Step 2 in parallel while researching.
If you're running as a subagent and can't parallelise, sequential is fine.

### Step 2: Browser preparation (Claude in Chrome)
1. Confirm the connection with `tabs_context_mcp` and prepare a dedicated tab
2. Navigate to the target domain and take one screenshot
3. If something goes wrong here, handle it via "Troubleshooting" below. **Don't repeat the same failure 3 or more times**

### Step 3: Navigation
Following the researched procedure, the AI navigates to the key-issuing screen.
If there's a creation form, fill it in, and **have the user press only the final create/agree button** (iron rule 6).
If a key, integration or app of the same kind already exists, don't silently reuse it — offer a one-line choice:
"use the existing X, or create a new one?" (adding that a new one is safer if the purpose is different).

- **If a login screen appears**: stop, and tell the user "please log in in this tab and let me know when you're done".
  Never touch login credentials
- **Domains the extension isn't allowed on**: give concrete instructions — the Claude extension icon in the Chrome
  toolbar -> allow this site
- **If an irreversible choice appears** (creating a provider, linking a workspace, etc.), lay out the options and
  their impact one line each and wait for approval
- **The user may have got ahead of you and operated the browser themselves.** When resuming after waiting on the user,
  take a screenshot first to check the current state of the screen, and continue based on what's actually there even
  if it differs from what you expected

### Step 4: Handing over the key (.env)
1. Check for `.env` at the project root. Create it if absent, append if present (don't break existing lines)
2. Mark where to paste with a placeholder and a comment. **Use the conventional variable name for that service**
   (the name used in the official docs' curl examples and SDKs, e.g. `NOTION_TOKEN`, `SLACK_BOT_TOKEN`):
   ```bash
   # v paste the <key name> you copied in the <service> console after the = on this line
   NOTION_TOKEN=
   ```
3. Check that `.env` is in `.gitignore`. Add it if not
4. Narrow the user's instructions down to just "the button to press" and "the line to paste into". For example:
   "Press [Issue] on screen -> press [Copy] on the token that appears -> paste it after `NOTION_TOKEN=` in `.env` and save -> let me know when you're done"
   Point at the file with a `file://` link

### Step 4.5: Authorising the resource (sharing, scopes, consent)
Even with a valid key, many services need separate authorisation for the target resource (follow the procedure found
in research). Always include this in the Step 4 user instructions as a mandatory part of the happy path. For example:

- Notion: [•••] on the target page -> [Connections] to connect the integration (404 without it)
- Slack: grant the app the necessary scopes and reinstall
- Google: allow it on the OAuth consent screen

### Step 5: Connectivity check (two stages)
1. Load `.env` without displaying values
2. **Auth check**: confirm the key is valid with the smallest API call (e.g. the equivalent of `/users/me`)
3. **Goal check**: make one more API call that cheaply verifies what the user actually wants to do (read, send, etc.).
   Even with a valid key, a missing authorisation (Step 4.5) produces 0 results / 404 here, so it's only a success once both pass
4. Success: show the safe parts of the response (account name, bot name, etc.) and declare completion
5. Failure: narrow down the cause from the status code (401 = wrong or expired key, 403 = permissions/plan/scope,
   404 or 0 results = resource not connected or shared = a gap at Step 4.5). Cross-reference the pitfalls table and guide the fix

### Step 6: Wrapping up
- Append the same key name with an empty value to `.env.example` (for sharing with the team)
- Summarise in 2-3 lines what was configured and how to call it. Add one example of future code

## Claude in Chrome troubleshooting

| Symptom | What to do |
|---|---|
| `Permission denied for this action on this domain` | Tell the user: open the tab -> the Claude extension icon in the toolbar -> allow operating on this site |
| Tools not loaded | Load `mcp__claude-in-chrome__*` all at once with ToolSearch |
| Tab not found / invalid | Re-run `tabs_context_mcp` to get the latest tab ID. Don't reuse an old ID |
| The extension isn't responding | Ask the user to check that Chrome is running and the extension is enabled, via `chrome://extensions` |
| The page won't progress, e.g. a login loop | Stop after 2-3 attempts, report the situation to the user and ask for direction |

## What you must not do (red flags)

- Saying "paste the key here" in the chat -> **violates iron rule 1. Go back to the .env method**
- Pressing a Create/Submit button carrying terms acceptance because "creating it is reversible" -> **violates iron rule 6. Have the user press it**
- Checking only key connectivity (auth) and saying "done" -> it's only done once the goal API call also passes (the two stages of Step 5)
- `cat .env`, `echo $API_KEY`, posting a screenshot with a key visible -> **violates iron rule 4**
- Skipping research and working from a remembered procedure -> the procedure is out of date and you get stuck. **Always go through Step 1**
- Filling in a login form "for efficiency" -> **violates iron rule 3**
- Saying "setup complete" without a connectivity check -> it's only complete once you've finished Step 5
