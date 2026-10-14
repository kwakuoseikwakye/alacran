"use server"

import { signInExecutorImpl, type SignInResult } from "./sign-in-executor-impl"

export async function signInExecutor(executorId: string, email: string): Promise<SignInResult> {
  return signInExecutorImpl(executorId, email)
}
