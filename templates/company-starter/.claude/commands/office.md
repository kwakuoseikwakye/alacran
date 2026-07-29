---
name: office
description: Start, stop and remove the office visualisation (bundled pixel-agents version)
---

# /office - an office where you can watch your company working

Arguments: $ARGUMENTS (empty = start / stop / status / uninstall)

You (Claude) carry out the steps below. Judge the success or failure of each step by the command's
exit code and standard output, and report the result in the user's language. Avoid technical jargon
and use the metaphor of "opening up / clocking off / packing up".

## No arguments (start)

1. Run `python3 tools/office/office.py doctor`.
   If it fails: relay the stated reason, explain how to install Node, and stop.
   - mac: `brew install node` (if Homebrew isn't installed, see https://brew.sh )
   - Windows: install the LTS build from https://nodejs.org/
   - Tell them to type `/office` again after installing
2. Run `python3 tools/office/office.py install-hook`.
   If it fails: show the failure output as-is and stop.
3. Run `python3 tools/office/office.py start`.
   If it fails: show the output (the reason and the log path) as-is, read the last 20 lines of the
   log, and summarise the cause in one line.
4. Open the URL from the `URL: http://localhost:<port>` line of the output in a browser
   (`open <URL>` on mac; otherwise present the URL and have them click it).
5. Smoke test: the very session in which you typed `/office` started before the office opened, so it
   does not appear in the office (hooks are loaded at session start).
   Starting a subagent within this session won't appear either, for the same reason, so start one new
   session in the background after opening and show that. From the repository root, run the following
   in the background and move on without waiting for it to finish:
   `claude -p "Start one Explore subagent, have it look up the list of headings in this repository's README.md, summarise the result in one line, and finish"`
   Meanwhile, ask the participant: "In the office in your browser, one member of staff has just come in
   to work (and will bring an assistant along partway through). Can you see them?"
6. If they can see it: close with "Your office is open. From here on, just work in Claude Code as usual
   and you'll be able to watch your company working."
   If they can't: run `python3 tools/office/office.py status` and report the situation with that output attached.
   Also explain the following: because hooks are loaded at session start, activity from sessions that were
   already open before the office first started (including the session in which you typed `/office`) may not
   appear. In that case, quit Claude Code and reopen it (or start it in a new terminal), and assign work to
   staff in that session — then it will appear.

## stop

Run `python3 tools/office/office.py stop` and report the result.

## status

Run `python3 tools/office/office.py status`, show the status output as-is, and summarise it in one line.

## uninstall

Before running, get confirmation: "This will completely remove the office (stopping the server and cleaning
up the configuration). Is that OK?" Then run `python3 tools/office/office.py uninstall` and report the result.

## Notes

- All runs of office.py are performed with the repository root (the top of this template) as the current directory
- The server only shows sessions under this template (by design). If you also want to see other projects, use
  Watch All Sessions in Settings at the bottom left of the screen
