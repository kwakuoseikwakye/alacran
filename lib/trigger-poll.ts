"use server"

import { triggerPollImpl } from "./trigger-poll-impl"

export async function triggerPoll(): Promise<{ started: boolean; message: string }> {
  return triggerPollImpl()
}
