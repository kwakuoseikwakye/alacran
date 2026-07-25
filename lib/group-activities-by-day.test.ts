import { describe, it, expect } from "vitest"
import { groupActivitiesByDay } from "./group-activities-by-day"
import type { Activity } from "./adapters/types"

function ts(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m, d, h, min, 0).getTime() / 1000
}

function makeActivity(id: string, timestamp: number): Activity {
  return {
    id,
    agentId: "test-agent",
    type: "test",
    timestamp,
    title: id,
    status: "done",
    detailPath: "/tmp/test",
  }
}

describe("groupActivitiesByDay", () => {
  const now = ts(2026, 6, 15, 18, 0) // reference instant: July 15, 2026, 6pm local

  it("returns an empty array for no activities", () => {
    expect(groupActivitiesByDay([], now)).toEqual([])
  })

  it("labels the reference calendar day as Today", () => {
    const a = makeActivity("a1", ts(2026, 6, 15, 9, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("Today")
    expect(groups[0].activities).toEqual([a])
  })

  it("labels the calendar day before the reference day as Yesterday", () => {
    const a = makeActivity("a1", ts(2026, 6, 14, 23, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups[0].label).toBe("Yesterday")
  })

  it("labels older days with an absolute date", () => {
    const a = makeActivity("a1", ts(2026, 6, 10, 9, 0))
    const groups = groupActivitiesByDay([a], now)
    expect(groups[0].label).toBe("July 10, 2026")
  })

  it("orders groups newest-day-first and activities within a group newest-first", () => {
    const older = makeActivity("older", ts(2026, 6, 10, 9, 0))
    const newerSameDay = makeActivity("newer-same-day", ts(2026, 6, 15, 14, 0))
    const earlierSameDay = makeActivity("earlier-same-day", ts(2026, 6, 15, 8, 0))
    const groups = groupActivitiesByDay([older, newerSameDay, earlierSameDay], now)
    expect(groups.map((g) => g.label)).toEqual(["Today", "July 10, 2026"])
    expect(groups[0].activities.map((a) => a.id)).toEqual(["newer-same-day", "earlier-same-day"])
  })

  it("puts activities under 24h apart but straddling local midnight into different day groups", () => {
    const lateYesterday = makeActivity("late-yesterday", ts(2026, 6, 14, 23, 30))
    const earlyToday = makeActivity("early-today", ts(2026, 6, 15, 0, 30))
    const groups = groupActivitiesByDay([lateYesterday, earlyToday], now)
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"])
    expect(groups[0].activities.map((a) => a.id)).toEqual(["early-today"])
    expect(groups[1].activities.map((a) => a.id)).toEqual(["late-yesterday"])
  })

  it("gives each group a stable, unique key", () => {
    const a = makeActivity("a", ts(2026, 6, 15, 9, 0))
    const b = makeActivity("b", ts(2026, 6, 10, 9, 0))
    const groups = groupActivitiesByDay([a, b], now)
    expect(new Set(groups.map((g) => g.key)).size).toBe(2)
  })
})
