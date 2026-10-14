import { describe, it, expect } from "vitest"
import {
  beginOutlookSignIn,
  ensureOutlookLauncher,
  LAUNCHER_MARKER,
  pollOutlookSignIn,
  readOutlookStatus,
  signOutOutlook,
  type RunCli,
} from "./outlook"

const ok = (value: unknown): RunCli => async () => ({ stdout: JSON.stringify(value), stderr: "" })
const fails = (stderr: string): RunCli => async () => {
  throw Object.assign(new Error("exit 1"), { stdout: "", stderr })
}

describe("ensureOutlookLauncher", () => {
  function disk(initial: Record<string, string> = {}) {
    const files = { ...initial }
    return {
      files,
      deps: {
        binDir: "/bin",
        node: "/opt/node",
        script: "/app/templates/tools/outlook-cli.mjs",
        read: async (f: string) => {
          if (!(f in files)) throw new Error("ENOENT")
          return files[f]
        },
        write: async (f: string, t: string) => void (files[f] = t),
        makeDir: async () => {},
      },
    }
  }

  it("writes a launcher that runs the script with this machine's node, passing every argument on", async () => {
    const d = disk()
    expect(await ensureOutlookLauncher(d.deps)).toBe("written")
    const text = d.files["/bin/alacran-outlook"]
    expect(text.startsWith("#!/bin/sh")).toBe(true)
    expect(text).toContain(LAUNCHER_MARKER)
    expect(text).toContain('exec "/opt/node" "/app/templates/tools/outlook-cli.mjs" "$@"')
  })

  it("leaves it alone when nothing changed, and rewrites it when the app moved", async () => {
    const d = disk()
    await ensureOutlookLauncher(d.deps)
    expect(await ensureOutlookLauncher(d.deps)).toBe("unchanged")
    expect(await ensureOutlookLauncher({ ...d.deps, node: "/new/node" })).toBe("written")
    expect(d.files["/bin/alacran-outlook"]).toContain("/new/node")
  })

  it("never overwrites a program somebody else put under that name", async () => {
    const d = disk({ "/bin/alacran-outlook": "#!/bin/sh\necho mine\n" })
    expect(await ensureOutlookLauncher(d.deps)).toBe("skipped")
    expect(d.files["/bin/alacran-outlook"]).toBe("#!/bin/sh\necho mine\n")
  })

  it("never throws", async () => {
    const d = disk()
    expect(await ensureOutlookLauncher({ ...d.deps, write: async () => Promise.reject(new Error("disk full")) })).toBe("skipped")
  })
})

describe("reading the sign-in through the command", () => {
  it("reports who is connected", async () => {
    expect(await readOutlookStatus(ok({ connected: true, account: { name: "Ama", email: "ama@x.com" }, scope: "x" }))).toEqual({
      connected: true,
      account: { name: "Ama", email: "ama@x.com" },
    })
  })

  it("is not connected when the command says so, fails, or prints nonsense", async () => {
    expect(await readOutlookStatus(ok({ connected: false }))).toEqual({ connected: false })
    expect(await readOutlookStatus(fails("boom"))).toEqual({ connected: false })
    expect(await readOutlookStatus(async () => ({ stdout: "not json", stderr: "" }))).toEqual({ connected: false })
  })
})

describe("signing in", () => {
  it("hands the page the code to show and the link to open", async () => {
    const begun = await beginOutlookSignIn(ok({ userCode: "ABCD", verificationUri: "https://login.microsoft.com/device", deviceCode: "D".repeat(40), expiresIn: 900, interval: 5 }))
    expect(begun).toMatchObject({ ok: true, userCode: "ABCD", verificationUri: "https://login.microsoft.com/device", interval: 5 })
  })

  it("says what went wrong in the command's own words", async () => {
    const begun = await beginOutlookSignIn(fails("error: Microsoft would not start a sign-in: blocked by your organisation\n"))
    expect(begun).toEqual({ ok: false, message: "Microsoft would not start a sign-in: blocked by your organisation" })
    expect((await beginOutlookSignIn(fails("something odd"))).ok).toBe(false)
    expect((await beginOutlookSignIn(ok({}))).ok).toBe(false)
  })

  it("passes only a well-formed code to the command, so nothing odd reaches its arguments", async () => {
    const seen: string[][] = []
    const spy: RunCli = async (args) => (seen.push(args), { stdout: JSON.stringify({ status: "pending" }), stderr: "" })
    expect(await pollOutlookSignIn("x; reboot now", spy)).toMatchObject({ status: "error" })
    expect(seen).toHaveLength(0)
    expect(await pollOutlookSignIn("A".repeat(30), spy)).toEqual({ status: "pending" })
    expect(seen[0]).toEqual(["auth", "poll", "--device-code", "A".repeat(30)])
  })

  it("passes the command's verdict through", async () => {
    expect(await pollOutlookSignIn("A".repeat(30), ok({ status: "ok", account: { name: "Ama", email: "ama@x.com" } }))).toMatchObject({ status: "ok" })
    expect(await pollOutlookSignIn("A".repeat(30), ok({ status: "expired" }))).toEqual({ status: "expired" })
    expect((await pollOutlookSignIn("A".repeat(30), fails(""))).status).toBe("error")
  })

  it("signs out", async () => {
    expect(await signOutOutlook(ok({ connected: false }))).toBe(true)
    expect(await signOutOutlook(fails("x"))).toBe(false)
  })
})
