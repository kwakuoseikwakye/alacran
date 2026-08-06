/**
 * Safely embed an arbitrary string as a single-quoted bash literal. Standard
 * technique: end the quote, insert an escaped literal quote, resume the
 * quote — so the result is safe to splice into generated script text
 * regardless of what characters the value contains.
 */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export type BuildVisibleRunScriptInput = {
  binaryName: string
  argsFilePath: string
  promptFilePath: string
  logPath: string
  lockPath: string
  cwd: string
}

/**
 * Generates the wrapper script a visible run executes inside a real Terminal
 * window. Verified against macOS's actual /bin/bash (3.2.57 — no `mapfile`,
 * confirmed by direct invocation) rather than assumed portable.
 *
 * Every bash line below that needs no JS interpolation is written as a
 * plain single-quoted JS string, deliberately never a template literal —
 * this avoids any collision between bash's own `${...}` array-expansion
 * syntax and JS template-literal interpolation. Only the six `BINARY=` /
 * `ARGSFILE=` / etc. lines below, which embed a real JS expression
 * (`shQuote(...)`), use template literals.
 */
export type BuildInteractiveTerminalScriptInput = {
  binaryName: string
  cwd: string
}

/**
 * Generates the wrapper script for "just open an interactive session here" —
 * no prompt, no allowlist, no lock, no gate. This is exactly what the user
 * would get by `cd`-ing into the company's directory and running the
 * executor themselves; the only thing this automates is the `cd` and the
 * Terminal window.
 */
export function buildInteractiveTerminalScript(input: BuildInteractiveTerminalScriptInput): string {
  const { binaryName, cwd } = input
  return [
    "#!/bin/bash",
    `BINARY=${shQuote(binaryName)}`,
    `CWD=${shQuote(cwd)}`,
    "",
    'cd "$CWD" || exit 1',
    'exec "$BINARY"',
    "",
  ].join("\n")
}

export function buildVisibleRunScript(input: BuildVisibleRunScriptInput): string {
  const { binaryName, argsFilePath, promptFilePath, logPath, lockPath, cwd } = input
  const lines = [
    "#!/bin/bash",
    `BINARY=${shQuote(binaryName)}`,
    `ARGSFILE=${shQuote(argsFilePath)}`,
    `PROMPTFILE=${shQuote(promptFilePath)}`,
    `LOGPATH=${shQuote(logPath)}`,
    `LOCKPATH=${shQuote(lockPath)}`,
    `CWD=${shQuote(cwd)}`,
    "",
    // Fires on an abort at the gate (Ctrl-C) or the window being closed
    // before the run starts. lib/file-lock.ts has no staleness check at
    // all (no PID liveness, no TTL, no sweep) — a leaked lock wedges this
    // company's commands permanently, until someone deletes the lock file
    // by hand. This trap is explicitly disarmed (`trap - EXIT`, below)
    // the moment the lock is released after a normal run finishes, so it
    // can never fire a second time and delete a later run's lock.
    'trap \'rm -f "$LOCKPATH"\' EXIT',
    'cd "$CWD" || exit 1',
    "",
    "ARGS=()",
    'while IFS= read -r -d "" item; do',
    '  ARGS+=("$item")',
    'done < "$ARGSFILE"',
    "",
    'echo "About to run: $BINARY (in $CWD)"',
    'echo "--- prompt ---"',
    // cat -v renders control characters visibly instead of letting the
    // terminal execute them — the gate's value depends on the user being
    // able to trust what they're reading before approving a run.
    'cat -v "$PROMPTFILE"',
    'echo "--- end prompt ---"',
    'read -p "Press Enter to run, or Ctrl-C to abort: "',
    "",
    '"$BINARY" "${ARGS[@]}" 2>&1 | tee -a "$LOGPATH"',
    // Disarm before the explicit release below. Past this point the lock
    // file at $LOCKPATH no longer belongs to this script — the app is free
    // to start a new run for the same company the moment it's gone — so a
    // still-armed trap firing on window-close or Ctrl-C at the take-over
    // gate would delete a *later* run's lock out from under it.
    "trap - EXIT",
    'rm -f "$LOCKPATH"',
    'echo "Finished — review and commit the diff in Alacrán."',
    'echo "The interactive session below is a normal Claude Code session — it is NOT limited to what this command is allowed to do."',
    'read -p "Press Enter for an interactive session, or close this window: "',
    'exec "$BINARY" -c',
    "",
  ]
  return lines.join("\n")
}
