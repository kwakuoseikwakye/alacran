import { describe, it, expect } from "vitest"
import { listChromeProfiles, findProfileForEmail, localStatePath, CLAUDE_EXTENSION_ID } from "./chrome-profiles"

// The real shape, trimmed: Chrome keys profiles by their directory name and
// records the signed-in address as `user_name`. "Profile 4" here has never
// been signed into, which is the case that must not become a match target.
const LOCAL_STATE = JSON.stringify({
  profile: {
    last_used: "Profile 2",
    info_cache: {
      Default: { user_name: "kwakuoseikwakye@gmail.com", gaia_name: "Nana Osei" },
      "Profile 2": { user_name: "sanuki@plh.life", gaia_name: "PLH Sanuki" },
      "Profile 3": { user_name: "Think.Innovation.Labs@gmail.com" },
      "Profile 4": { user_name: "", name: "Person 4" },
    },
  },
})

const read = (content: string) => async () => content
// Extensions are per-profile: only Default has the Claude one here, which is
// the shape that decides whether `claude --chrome` can reach that browser.
const readDir = async (dirPath: string) =>
  dirPath.includes("Default") ? [CLAUDE_EXTENSION_ID, "someotherextension"] : ["someotherextension"]
const throws = async () => {
  throw new Error("ENOENT")
}

describe("listChromeProfiles", () => {
  it("reads every signed-in profile, lowercased, with its own extension state", async () => {
    const got = await listChromeProfiles("darwin", "/Users/x", read(LOCAL_STATE), readDir)
    expect(got).toEqual([
      { directory: "Default", email: "kwakuoseikwakye@gmail.com", hasClaudeExtension: true },
      { directory: "Profile 2", email: "sanuki@plh.life", hasClaudeExtension: false },
      { directory: "Profile 3", email: "think.innovation.labs@gmail.com", hasClaudeExtension: false },
    ])
  })

  it("reports no extension rather than throwing when a profile has no Extensions dir", async () => {
    const explode = async () => {
      throw new Error("ENOENT")
    }
    const got = await listChromeProfiles("darwin", "/Users/x", read(LOCAL_STATE), explode)
    expect(got.every((p) => p.hasClaudeExtension === false)).toBe(true)
  })

  it("drops a profile nobody has signed into, rather than offering it as a target", async () => {
    const got = await listChromeProfiles("darwin", "/Users/x", read(LOCAL_STATE), readDir)
    expect(got.map((p) => p.directory)).not.toContain("Profile 4")
  })

  it("degrades to [] on a missing, unreadable or reshaped file", async () => {
    expect(await listChromeProfiles("darwin", "/Users/x", throws, readDir)).toEqual([])
    expect(await listChromeProfiles("darwin", "/Users/x", read("not json"), readDir)).toEqual([])
    expect(await listChromeProfiles("darwin", "/Users/x", read("{}"), readDir)).toEqual([])
    expect(await listChromeProfiles("darwin", "/Users/x", read('{"profile":{"info_cache":null}}'), readDir)).toEqual([])
  })

  it("has no state file on a platform this app does not build for", async () => {
    expect(localStatePath("win32", "/Users/x")).toBeNull()
    expect(await listChromeProfiles("win32", "/Users/x", read(LOCAL_STATE), readDir)).toEqual([])
  })

  it("knows both platform locations", () => {
    expect(localStatePath("darwin", "/h")).toContain("Library/Application Support/Google/Chrome/Local State")
    expect(localStatePath("linux", "/h")).toContain(".config/google-chrome/Local State")
  })
})

describe("findProfileForEmail", () => {
  it("matches case-insensitively, like every other address comparison here", async () => {
    const profiles = await listChromeProfiles("darwin", "/Users/x", read(LOCAL_STATE), readDir)
    expect(findProfileForEmail(profiles, "  KWAKUOseiKwakye@Gmail.com ")?.directory).toBe("Default")
    expect(findProfileForEmail(profiles, "think.innovation.labs@gmail.com")?.directory).toBe("Profile 3")
  })

  it("returns null for an address no profile is signed in as", async () => {
    const profiles = await listChromeProfiles("darwin", "/Users/x", read(LOCAL_STATE), readDir)
    expect(findProfileForEmail(profiles, "someone.else@gmail.com")).toBeNull()
  })
})
