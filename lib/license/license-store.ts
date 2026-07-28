import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

export type StoredLicense = {
  key: string
  lastValidatedAt: number
  lastResult: "valid" | "invalid"
}

const DEFAULT_PATH = path.join(process.cwd(), ".data", "license.json")

export function readLicense(filePath: string = DEFAULT_PATH): StoredLicense | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as StoredLicense
  } catch {
    return null
  }
}

export function writeLicense(license: StoredLicense, filePath: string = DEFAULT_PATH): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(license, null, 2), "utf-8")
}
