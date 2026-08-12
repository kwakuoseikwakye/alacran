import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// A `${{ }}` expression is pasted into the run script's text before bash ever
// sees it, so any attacker-influenceable value interpolated into a `run:` is a
// command-injection sink. The rule is: values reach the shell through `env:`,
// which bash reads as data. This guards the fix, since the tempting one-liner
// (`run: echo "TARGET_TAG=${{ github.event.inputs.tag }}" >> "$GITHUB_ENV"`) is
// exactly what was here before and reads perfectly innocently.
const WORKFLOW_DIR = ".github/workflows"

describe("workflow shell injection", () => {
  const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml"))

  it("has workflows to check", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n")

    it(`${file} never interpolates an expression into a shell script`, () => {
      // Track the `run:` block by indentation: everything indented deeper than
      // the `run:` key belongs to its script, which is where `${{ }}` is unsafe.
      let scriptIndent: number | null = null
      const offenders: string[] = []

      for (const line of lines) {
        const indent = line.search(/\S/)
        if (indent === -1) continue
        if (scriptIndent !== null && indent <= scriptIndent) scriptIndent = null

        const runKey = /^\s*(- )?run:\s*(.*)$/.exec(line)
        if (runKey) {
          if (line.includes("${{")) offenders.push(line.trim())
          if (runKey[2].trim() === "|" || runKey[2].trim() === ">") scriptIndent = indent
          continue
        }
        if (scriptIndent !== null && line.includes("${{")) offenders.push(line.trim())
      }

      expect(offenders).toEqual([])
    })
  }

  it("package-linux.yml takes the dispatch tag via env and validates its shape", () => {
    const wf = readFileSync(join(WORKFLOW_DIR, "package-linux.yml"), "utf8")
    expect(wf).toContain("INPUT_TAG: ${{ github.event.inputs.tag }}")
    // Anything not vX.Y.Z is refused before it can reach $GITHUB_ENV, where a
    // newline would otherwise set arbitrary variables for every later step.
    expect(wf).toContain("^v[0-9]+\\.[0-9]+\\.[0-9]+$")
  })
})
