"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { getCompanyCommand } from "./registry"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { tailLines } from "../log-tail"

const MAX_TAIL_LINES = 200

export async function getCompanyCommandLogTail(commandId: string): Promise<{ tail: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { tail: "" }
  }

  try {
    const content = await readFile(path.join(COMPANY_COMMANDS_DATA_DIR, `${command.id}.log`), "utf-8")
    return { tail: tailLines(content.replace(/\n$/, ""), MAX_TAIL_LINES) }
  } catch {
    return { tail: "" }
  }
}
