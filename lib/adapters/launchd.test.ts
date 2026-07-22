import { describe, it, expect } from "vitest"
import { checkLaunchdJob } from "./launchd"

describe("checkLaunchdJob", () => {
  it("reports loaded with the parsed exit status", async () => {
    const fakeExec = async () => `{\n\t"LastExitStatus" = 0;\n\t"Label" = "com.plh.takeshi-agent";\n}`
    const health = await checkLaunchdJob("com.plh.takeshi-agent", fakeExec)
    expect(health).toEqual({ loaded: true, lastExitStatus: 0 })
  })

  it("reports not loaded when the exec call throws", async () => {
    const fakeExec = async () => {
      throw new Error("Could not find service")
    }
    const health = await checkLaunchdJob("com.missing-job", fakeExec)
    expect(health).toEqual({ loaded: false, lastExitStatus: null })
  })

  it("reports loaded with null exit status if the output doesn't match", async () => {
    const fakeExec = async () => "unexpected output"
    const health = await checkLaunchdJob("com.plh.takeshi-agent", fakeExec)
    expect(health).toEqual({ loaded: true, lastExitStatus: null })
  })
})
