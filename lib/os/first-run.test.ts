import { describe, it, expect } from "vitest"
import type { CompanyOntologyAnswers } from "@/lib/build-company-ontology"
import {
  firstRunStage,
  homeHeadline,
  attentionRowsShow,
  homeFocus,
  profileAnsweredFrom,
  runEndedEmpty,
  savedRecently,
  type FirstRunInput,
  type FirstRunStage,
} from "./first-run"

const base: FirstRunInput = { aiConnected: true, profileAnswered: true, pendingCount: 0, running: false }
const answers = (domain: string) =>
  ({ domain, stakeholders: [], valueFlow: { input: "", transform: "", output: "" }, bottleneck: "" }) as CompanyOntologyAnswers

describe("firstRunStage", () => {
  it("is done once the first approval has happened, whatever else is true", () => {
    expect(
      firstRunStage({ ...base, aiConnected: false, profileAnswered: false, pendingCount: 3, running: true, firstSavedAt: "2026-09-29T00:00:00.000Z" })
    ).toBe("done")
  })

  it("is done once the guide is dismissed", () => {
    expect(firstRunStage({ ...base, profileAnswered: false, dismissedAt: "2026-09-29T00:00:00.000Z" })).toBe("done")
  })

  it("asks for the AI first when it is not connected, even with drafts waiting", () => {
    expect(firstRunStage({ ...base, aiConnected: false })).toBe("connect-ai")
    expect(firstRunStage({ ...base, aiConnected: false, pendingCount: 2 })).toBe("connect-ai")
  })

  it("is review while a run is in flight or a draft is waiting", () => {
    expect(firstRunStage({ ...base, running: true })).toBe("review")
    expect(firstRunStage({ ...base, pendingCount: 1 })).toBe("review")
  })

  it("checks review before describe, so a draft in flight never sends someone back to the questions", () => {
    expect(firstRunStage({ ...base, profileAnswered: false, running: true })).toBe("review")
    expect(firstRunStage({ ...base, profileAnswered: false, pendingCount: 1 })).toBe("review")
  })

  it("asks for the business to be described before offering a first draft", () => {
    expect(firstRunStage({ ...base, profileAnswered: false })).toBe("describe")
  })

  it("offers the first draft once the business is described and nothing is waiting", () => {
    expect(firstRunStage(base)).toBe("first-draft")
  })
})

describe("homeHeadline", () => {
  it("counts what needs attention, singular and plural, at any stage", () => {
    expect(homeHeadline("done", 1)).toBe("One thing needs your attention.")
    expect(homeHeadline("review", 3)).toBe("3 things need your attention.")
  })

  it("says something true and plain for each stage with nothing waiting", () => {
    expect(homeHeadline("done", 0)).toBe("Everything is clear.")
    expect(homeHeadline("describe", 0)).toBe("Let's set up your business.")
    expect(homeHeadline("first-draft", 0)).toBe("Ready when you are.")
    expect(homeHeadline("review", 0)).toBe("Alacrán is preparing your draft.")
    expect(homeHeadline("connect-ai", 0)).toBe("One step left before Alacrán can work.")
  })

  it("never claims everything is clear before anything has happened", () => {
    const stages: FirstRunStage[] = ["connect-ai", "describe", "review", "first-draft"]
    for (const stage of stages) expect(homeHeadline(stage, 0)).not.toMatch(/clear|caught up/i)
  })
})

describe("attentionRowsShow", () => {
  it("is true only where Home shows its plain rows, never while the first-run hero leads", () => {
    expect(attentionRowsShow("done")).toBe(true)
    expect(attentionRowsShow("connect-ai")).toBe(true)
    for (const stage of ["describe", "review", "first-draft"] as const) expect(attentionRowsShow(stage)).toBe(false)
  })
})

describe("homeFocus", () => {
  it("shows a waiting approval in the steady state and when the AI has disconnected, so it is never swallowed", () => {
    expect(homeFocus("done", 1)).toBe("review")
    expect(homeFocus("connect-ai", 2)).toBe("review")
  })

  it("shows the caught-up card only when the guide is done and nothing is waiting", () => {
    expect(homeFocus("done", 0)).toBe("caught-up")
    expect(homeFocus("connect-ai", 0)).toBe("none")
  })

  it("shows neither while the hero is leading", () => {
    for (const stage of ["describe", "review", "first-draft"] as const) {
      expect(homeFocus(stage, 0)).toBe("none")
      expect(homeFocus(stage, 1)).toBe("none")
    }
  })
})

describe("profileAnsweredFrom", () => {
  it("is true when the wizard's answers are saved and describe the business", () => {
    expect(profileAnsweredFrom({ ok: true, answers: answers("We cater events in Accra.") })).toBe(true)
  })

  it("is false for a blank or whitespace-only description", () => {
    expect(profileAnsweredFrom({ ok: true, answers: answers("") })).toBe(false)
    expect(profileAnsweredFrom({ ok: true, answers: answers("   \n ") })).toBe(false)
  })

  it("is false for a pack's example file with no saved answers, and for an unreadable file", () => {
    expect(profileAnsweredFrom({ ok: false, message: "no saved company.yaml yet", nothingSaved: true })).toBe(false)
    expect(profileAnsweredFrom({ ok: false, message: "could not read" })).toBe(false)
  })
})

describe("savedRecently", () => {
  const now = new Date("2026-09-29T10:00:00.000Z")

  it("is true inside the window and false outside it", () => {
    expect(savedRecently("2026-09-29T09:45:00.000Z", now)).toBe(true)
    expect(savedRecently("2026-09-29T09:20:00.000Z", now)).toBe(false)
  })

  it("is false when nothing was saved, or the stored value is not a date", () => {
    expect(savedRecently(undefined, now)).toBe(false)
    expect(savedRecently("not a date", now)).toBe(false)
  })

  it("is false for a timestamp in the future (a clock that moved), never a permanent banner", () => {
    expect(savedRecently("2026-09-29T12:00:00.000Z", now)).toBe(false)
  })
})

describe("runEndedEmpty", () => {
  const ended = { attempted: true, stage: "first-draft" as FirstRunStage, running: false, busy: false }

  it("is true only when a run was started or seen, it has finished, and nothing is waiting", () => {
    expect(runEndedEmpty(ended)).toBe(true)
  })

  it("is false before any run, while one is going, while a new one is starting, or in any other stage", () => {
    expect(runEndedEmpty({ ...ended, attempted: false })).toBe(false)
    expect(runEndedEmpty({ ...ended, running: true })).toBe(false)
    expect(runEndedEmpty({ ...ended, busy: true })).toBe(false)
    for (const stage of ["connect-ai", "describe", "review", "done"] as const) {
      expect(runEndedEmpty({ ...ended, stage })).toBe(false)
    }
  })
})
