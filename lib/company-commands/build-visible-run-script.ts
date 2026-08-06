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
    // Fires on the run finishing, an abort at the gate (Ctrl-C), or the
    // window simply being closed — a leaked lock wedges the company until
    // the app's stale-lock handling kicks in, so this must never be skipped.
    'trap \'rm -f "$LOCKPATH"\' EXIT',
    'cd "$CWD"',
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
    'rm -f "$LOCKPATH"',
    'echo "Finished — review and commit the diff in Alacrán."',
    'read -p "Press Enter for an interactive session, or close this window: "',
    'exec "$BINARY" -c',
    "",
  ]
  return lines.join("\n")
}
