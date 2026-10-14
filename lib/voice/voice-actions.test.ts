import { beforeEach, describe, expect, it, vi } from "vitest"

const saveImpl = vi.fn(async (_id: string, _enabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> => {
  throw new Error("EROFS")
})
vi.mock("./settings-impl", () => ({
  saveAutoDispatchImpl: (id: string, enabled: boolean) => saveImpl(id, enabled),
}))
vi.mock("./elevenlabs-api-impl", () => ({}))
vi.mock("./deepgram-grant-impl", () => ({}))
const revalidatePath = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { saveAutoDispatch } from "./voice-actions"

describe("saveAutoDispatch", () => {
  beforeEach(() => {
    saveImpl.mockReset()
    revalidatePath.mockReset()
  })

  it("returns a message instead of throwing when the write fails", async () => {
    saveImpl.mockRejectedValue(new Error("EROFS"))
    expect(await saveAutoDispatch("acme", true)).toEqual({ ok: false, message: "Couldn't save that. Try again." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("only a real true switches a company on", async () => {
    saveImpl.mockResolvedValue({ ok: true })
    await saveAutoDispatch("acme", "yes" as unknown as boolean)
    expect(saveImpl).toHaveBeenLastCalledWith("acme", false)
    await saveAutoDispatch("acme", true)
    expect(saveImpl).toHaveBeenLastCalledWith("acme", true)
  })

  it("refreshes the layout after a save, and a refresh failure does not undo it", async () => {
    saveImpl.mockResolvedValue({ ok: true })
    revalidatePath.mockImplementation(() => {
      throw new Error("no store")
    })
    expect(await saveAutoDispatch("acme", true)).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })
})
