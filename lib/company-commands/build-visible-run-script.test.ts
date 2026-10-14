import { describe, it, expect } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { shQuote, buildVisibleRunScript, buildInteractiveTerminalScript } from "./build-visible-run-script"

const execFileAsync = promisify(execFile)

describe("buildInteractiveTerminalScript", () => {
  it("cd's into the given directory then execs the binary with no arguments", () => {
    const script = buildInteractiveTerminalScript({ binaryName: "claude", cwd: "/companies/acme" })
    const lines = script.split("\n")
    expect(lines).toContain(`CWD=${shQuote("/companies/acme")}`)
    expect(lines).toContain('cd "$CWD" || exit 1')
    expect(lines).toContain('exec "$BINARY"')
  })

  it("never embeds the cwd or binary name outside a quoted variable assignment", () => {
    const dangerous = { binaryName: "claude", cwd: "/tmp/acme'; rm -rf ~; echo '" }
    const script = buildInteractiveTerminalScript(dangerous)
    expect(script).toContain(`CWD=${shQuote(dangerous.cwd)}`)
    expect(script.split("\n").filter((l) => l.startsWith("cd "))).toEqual(['cd "$CWD" || exit 1'])
  })

  it("appends introArgs, each safely quoted, after the binary on the exec line", () => {
    const script = buildInteractiveTerminalScript({
      binaryName: "claude",
      cwd: "/companies/acme",
      introArgs: ["read everyone's skills; please don't 'rm -rf' anything"],
    })
    const lines = script.split("\n")
    expect(lines).toContain(
      `exec "$BINARY" ${shQuote("read everyone's skills; please don't 'rm -rf' anything")}`
    )
  })

  it("an empty introArgs array reproduces the exact no-argument exec line", () => {
    const script = buildInteractiveTerminalScript({ binaryName: "claude", cwd: "/companies/acme", introArgs: [] })
    expect(script.split("\n")).toContain('exec "$BINARY"')
  })
})

describe("shQuote", () => {
  it("wraps a plain string in single quotes", () => {
    expect(shQuote("/tmp/foo/bar")).toBe("'/tmp/foo/bar'")
  })

  it("escapes an embedded single quote", () => {
    expect(shQuote("/tmp/o'malley/lock")).toBe("'/tmp/o'\\''malley/lock'")
  })
})

describe("buildVisibleRunScript", () => {
  const input = {
    binaryName: "claude",
    argsFilePath: "/data/cmd.args",
    promptFilePath: "/data/cmd.prompt",
    logPath: "/data/cmd.log",
    lockPath: "/data/company-command.lock",
    cwd: "/companies/acme",
  }

  it("owns the lock's lifetime via trap on EXIT", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('trap \'rm -f "$LOCKPATH"\' EXIT')
  })

  it("uses cat -v on the prompt file, never a plain cat or echo", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('cat -v "$PROMPTFILE"')
    expect(script).not.toMatch(/^cat "\$PROMPTFILE"/m)
    expect(script).not.toContain("echo \"$PROMPT\"")
  })

  it("tees output into the exact log path passed in", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('tee -a "$LOGPATH"')
    expect(script).toContain(`LOGPATH=${shQuote(input.logPath)}`)
  })

  it("reads the args file with a while/read -d loop, never mapfile", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('while IFS= read -r -d "" item; do')
    expect(script).not.toContain("mapfile")
  })

  it("offers claude -c to continue the conversation after the run finishes", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('exec "$BINARY" -c')
  })

  it("disarms the EXIT trap after releasing its own lock, so closing the window at the take-over gate can't delete a later run's lock", () => {
    const script = buildVisibleRunScript(input)
    const lines = script.split("\n")
    const teeLineIndex = lines.findIndex((l) => l.includes("tee -a"))
    const disarmLineIndex = lines.findIndex((l) => l === "trap - EXIT")
    const releaseLineIndex = lines.findIndex((l) => l === 'rm -f "$LOCKPATH"')
    const secondReadIndex = lines.findIndex((l) => l.includes("Press Enter for an interactive session"))
    expect(teeLineIndex).toBeGreaterThan(-1)
    expect(disarmLineIndex).toBeGreaterThan(teeLineIndex)
    // Ordering is the whole fix: disarmed one line too late (after the
    // explicit release, or after the gate) is the same bug.
    expect(disarmLineIndex).toBeLessThan(releaseLineIndex)
    expect(disarmLineIndex).toBeLessThan(secondReadIndex)
  })

  it("discloses that the take-over session is unscoped, in the script's own printed output", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain("is NOT limited to what this command is allowed to do")
    const lines = script.split("\n")
    const disclosureIndex = lines.findIndex((l) => l.includes("is NOT limited to what this command is allowed to do"))
    const secondReadIndex = lines.findIndex((l) => l.includes("Press Enter for an interactive session"))
    // Disclosure has to be printed *before* the gate that offers take-over,
    // or it isn't a disclosure.
    expect(disclosureIndex).toBeGreaterThan(-1)
    expect(disclosureIndex).toBeLessThan(secondReadIndex)
  })

  it("embeds every path via a quoted variable assignment, never inline in the trap or cd lines", () => {
    const script = buildVisibleRunScript(input)
    // Regression guard: this is the only thing that makes the trap line
    // safe. If a future edit splices a raw path into `trap '...'` directly,
    // this test must fail.
    const lines = script.split("\n")
    expect(lines).toContain(`CWD=${shQuote(input.cwd)}`)
    expect(lines).toContain('cd "$CWD" || exit 1')
    expect(lines.filter((l) => l.startsWith("cd "))).toEqual(['cd "$CWD" || exit 1'])
  })

  it("never contains prompt text or field values literally — this function only ever receives paths", () => {
    // There is no prompt-text parameter on BuildVisibleRunScriptInput at all,
    // so this is a structural guarantee, not a runtime check. This test
    // documents that: even a shell-metacharacter-laden cwd only ever lands
    // inside a single quoted assignment.
    const dangerous = { ...input, cwd: "/tmp/acme'; rm -rf ~; echo '" }
    const script = buildVisibleRunScript(dangerous)
    expect(script).toContain(`CWD=${shQuote(dangerous.cwd)}`)
    expect(script.split("\n").filter((l) => l.startsWith("cd "))).toEqual(['cd "$CWD" || exit 1'])
  })

  it("the args-reading loop round-trips a NUL-delimited array under the real system bash, including an empty-string element", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "visible-run-args-"))
    try {
      const args = ["-p", "a prompt with spaces", "", "--flag"]
      const argsFile = path.join(dir, "cmd.args")
      await writeFile(argsFile, args.join("\0") + "\0")

      // Exercises the exact read-loop text buildVisibleRunScript emits,
      // without invoking a real claude/codex/aider binary. Printing with a
      // trailing newline (not NUL) keeps the assertion side simple; none of
      // this test's args contain a literal newline.
      const probeLines = [
        "#!/bin/bash",
        `ARGSFILE=${shQuote(argsFile)}`,
        "ARGS=()",
        'while IFS= read -r -d "" item; do',
        '  ARGS+=("$item")',
        'done < "$ARGSFILE"',
        'for a in "${ARGS[@]}"; do',
        '  printf "%s\\n" "$a"',
        "done",
      ]
      const scriptPath = path.join(dir, "probe.sh")
      await writeFile(scriptPath, probeLines.join("\n"), { mode: 0o755 })

      const { stdout } = await execFileAsync("/bin/bash", [scriptPath])
      const roundTripped = stdout.split("\n").slice(0, args.length)
      expect(roundTripped).toEqual(args)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
