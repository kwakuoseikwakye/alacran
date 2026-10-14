"use server"

import { checkDependenciesImpl } from "./check-dependencies-impl"
import type { DependencyStatus } from "./check-dependencies-impl"

export async function checkDependencies(): Promise<DependencyStatus> {
  return checkDependenciesImpl()
}
