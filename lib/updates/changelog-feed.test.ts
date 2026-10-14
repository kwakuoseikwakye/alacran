import { describe, it, expect } from "vitest"
import { getChangelogFeedImpl } from "./changelog-feed"

describe("getChangelogFeedImpl", () => {
  const sampleMarkdown = `
## v158 (2026-09-05): Interactive Changelog (\`components/changelog-modal.tsx\`)

### What's new for you (feature, v0.54.0)

A What's New window, so you can see what each update changed.

- Open it from the version number at the bottom of the menu.

## v157 (2026-09-05): Live running agent indicator

### What's new for you (feature, v0.54.0)

A company's card tells you when an AI is working on it.

## v156 (2026-09-05): Two-tier intent routing

Internal only — no block, so this one never reaches the modal.
`

  it("returns feed with parsed entries and version comparison", async () => {
    const feed = await getChangelogFeedImpl({
      currentVersion: "0.52.0",
      readChangelog: () => sampleMarkdown,
      fetchReleaseDetails: async () => ({
        tagName: "v0.53.0",
        name: "Alacran v0.53.0",
        body: "Full release notes from GitHub",
        htmlUrl: "https://github.com/kwakuoseikwakye/alacran-releases/releases/tag/v0.53.0",
      }),
      platform: "linux",
    })

    expect(feed.currentVersion).toBe("0.52.0")
    expect(feed.latestVersion).toBe("v0.53.0")
    expect(feed.hasUpdate).toBe(true)
    expect(feed.canAutoUpdate).toBe(true)
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries.map((e) => e.id)).toEqual(["v158", "v157"])
    expect(feed.entries[0].version).toBe("0.54.0")
    expect(feed.releaseNotes?.body).toBe("Full release notes from GitHub")
  })

  it("handles offline state or missing release gracefully", async () => {
    const feed = await getChangelogFeedImpl({
      currentVersion: "0.53.0",
      readChangelog: () => sampleMarkdown,
      fetchReleaseDetails: async () => null,
      platform: "darwin",
    })

    expect(feed.hasUpdate).toBe(false)
    expect(feed.releaseNotes).toBeNull()
    expect(feed.canAutoUpdate).toBe(false) // darwin is false from server side
    expect(feed.entries).toHaveLength(2)
    // With no tag reachable, the newest changelog entry is not a stand-in for
    // "latest": its version is the release it shipped in, usually this one.
    expect(feed.latestVersion).toBe("0.53.0")
  })
})
