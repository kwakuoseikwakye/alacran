import { describe, it, expect } from "vitest"
import { parseChangelog } from "./parse-changelog"
import { readLocalChangelogText } from "./changelog-feed"

describe("parseChangelog", () => {
  it("returns empty array on empty input", () => {
    expect(parseChangelog("")).toEqual([])
    expect(parseChangelog("   ")).toEqual([])
  })

  it("returns the authored block, not the engineering prose around it", () => {
    const markdown = `
# Changelog

## v157 (2026-09-05): Live running agent indicator on company cards

### What's new for you (feature, v0.54.0)

A company's card tells you when an AI is working on it right now.

- A pulsing green marker appears whenever an agent is running for it.
- It is still correct after you refresh the page.

Added live visual running-state indicators on company cards.

1. **Terminal Sessions Status (\`lib/terminal/sessions.ts\`)**: in-memory inspector.
2. **Real-time Event**: dispatches a custom DOM event, z-50 → z-70.
`
    const items = parseChangelog(markdown)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: "v157",
      version: "0.54.0",
      date: "2026-09-05",
      title: "A company's card tells you when an AI is working on it right now.",
      highlights: [
        "A pulsing green marker appears whenever an agent is running for it.",
        "It is still correct after you refresh the page.",
      ],
      category: "feature",
    })
  })

  it("skips an entry with no user-facing block entirely", () => {
    const markdown = `
## v162 (2026-09-06): CI can publish the .deb again

Not a code change to the app — a credential fix plus two documents.

## v161 (2026-09-06): sidebar order, and the X that closed nothing

### What's new for you (fix, v0.56.0)

The X now closes every pop-up window.
`
    const items = parseChangelog(markdown)
    expect(items.map((i) => i.id)).toEqual(["v161"])
  })

  it("keeps a wrapped bullet whole instead of cutting it at the line break", () => {
    const markdown = `
## v161 (2026-09-06): sidebar order

### What's new for you (fix, v0.56.0)

The X now closes every pop-up window,
in every corner of the app.

- The menu is in a more sensible order: Companies, Assistant, Connectors,
  Activity, Settings.
- Pop-ups appear in front of the menu.
`
    const [item] = parseChangelog(markdown)
    expect(item.title).toBe(
      "The X now closes every pop-up window, in every corner of the app."
    )
    expect(item.highlights[0]).toBe(
      "The menu is in a more sensible order: Companies, Assistant, Connectors, Activity, Settings."
    )
  })

  it("takes the category as declared, never from keywords in the prose", () => {
    // The body says "fix" three times. The old keyword guesser tested `fix`
    // first against the whole section and mislabelled v160 for exactly this.
    const markdown = `
## v160 (2026-09-05): AI voice assistant end-to-end latency optimizations

### What's new for you (improvement, v0.55.0)

The voice assistant answers noticeably faster.

Also fixes a bug: the fix for the earlier fix.
`
    expect(parseChangelog(markdown)[0].category).toBe("improvement")
  })

  it("keeps the release version optional and never exposes the slice number", () => {
    const markdown = `
## v163 (2026-09-07): the What's New window

### What's new for you (fix)

What's New shows what changed for you.
`
    const [item] = parseChangelog(markdown)
    expect(item.id).toBe("v163")
    expect(item.version).toBeUndefined()
  })

  it("orders entries newest-first and respects maxEntries", () => {
    const markdown = ["v1", "v2", "v3", "v4"]
      .map(
        (v) => `## ${v}: slice ${v}

### What's new for you (feature, v0.1.0)

Headline for ${v}.
`
      )
      .join("\n")

    expect(parseChangelog(markdown).map((i) => i.id)).toEqual([
      "v4",
      "v3",
      "v2",
      "v1",
    ])
    expect(parseChangelog(markdown, { maxEntries: 2 }).map((i) => i.id)).toEqual(
      ["v4", "v3"]
    )
  })
})

/**
 * The invariant runs against the real shipped CHANGELOG.md, not a fixture:
 * the failure mode being guarded is an author writing the next block in
 * engineering voice, which a fixture can never catch.
 */
describe("the shipped CHANGELOG.md", () => {
  const entries = parseChangelog(readLocalChangelogText())

  const LEAKS: Array<[string, RegExp]> = [
    ["a backticked identifier", /`/],
    ["a file path", /[\w.-]+\/[\w.-]+/],
    ["a source file extension", /\.(?:ts|tsx|js|jsx|mjs|css|md|json|ya?ml|sh|py)\b/i],
    ["a CSS class or id selector", /(?:^|\s)[.#][a-zA-Z][\w-]{2,}/],
    ["build/test tooling", /\b(?:tsc|eslint|vitest|npm|webpack|pkexec|localStorage)\b/i],
    ["a test count", /\d[\d,]*\s+(?:tests?|test suites?)\b/i],
    ["a CSS measurement", /\bz-\d+\b|\d+px\b/i],
    // v182 told users about "Zod schemas" and "atomically committed to Git"
    // past every pattern above; these words never mean anything to a user.
    ["developer vocabulary", /\b(?:zod|schemas?|atomically|stderr|stdout|ontology)\b/i],
  ]

  it("publishes entries for users to read", () => {
    expect(entries.length).toBeGreaterThan(5)
  })

  it("leaks nothing engineering-facing into any string it renders", () => {
    for (const entry of entries) {
      const strings = [entry.title, ...entry.highlights]
      for (const text of strings) {
        for (const [what, pattern] of LEAKS) {
          expect(
            pattern.test(text),
            `${entry.id} leaks ${what}: ${JSON.stringify(text)}`
          ).toBe(false)
        }
      }
    }
  })

  it("declares a real category and a plausible release version on every entry", () => {
    for (const entry of entries) {
      expect(["feature", "improvement", "fix"]).toContain(entry.category)
      if (entry.version !== undefined) {
        expect(entry.version, entry.id).toMatch(/^\d+\.\d+\.\d+$/)
      }
    }
  })

  it("omits the slices that changed nothing a user can see", () => {
    const ids = entries.map((e) => e.id)
    expect(ids).not.toContain("v162") // a CI token scope
    expect(ids).not.toContain("v154") // a design spec, no shipped code
    expect(ids).not.toContain("v150") // an internal follow-up
  })
})
