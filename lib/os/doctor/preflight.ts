import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const defaultExecFile = promisify(execFile)

export type ExecFn = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

export interface PreflightCheckResult {
  id: string
  title: string
  status: "pass" | "warn" | "fail"
  message: string
  blocker?: boolean
  remediation?: string
}

export interface PreflightReport {
  ok: boolean
  canProceed: boolean
  checks: PreflightCheckResult[]
  blockers: PreflightCheckResult[]
  warnings: PreflightCheckResult[]
}

/**
 * Executes runtime pre-flight checks before dispatching agent workflows or commands.
 * Guards against corrupted execution states, stale git locks, missing directories,
 * and unavailable tools.
 */
export async function runPreflightChecks(
  companyRoot: string,
  commandId?: string,
  execFn: ExecFn = async (cmd, args) => {
    const res = await defaultExecFile(cmd, args)
    return { stdout: String(res.stdout), stderr: String(res.stderr) }
  }
): Promise<PreflightReport> {
  const checks: PreflightCheckResult[] = []

  // 1. Check Directory Accessibility
  try {
    await fs.access(companyRoot)
    checks.push({
      id: "company-root",
      title: "Company Workspace Directory",
      status: "pass",
      message: "Company root folder exists and is accessible",
    })
  } catch {
    checks.push({
      id: "company-root",
      title: "Company Workspace Directory",
      status: "fail",
      blocker: true,
      message: `Cannot access workspace directory: ${companyRoot}`,
      remediation: "Ensure the company directory exists and permissions allow read/write access.",
    })
  }

  // 2. Git Repository & Lock Check
  const gitIndexLock = path.join(companyRoot, ".git", "index.lock")
  if (existsSync(gitIndexLock)) {
    checks.push({
      id: "git-lock",
      title: "Git Index Lock",
      status: "fail",
      blocker: true,
      message: "Git index is locked by another process (.git/index.lock exists)",
      remediation: "Wait for the active Git operation to complete, or remove stale lock with: rm -f .git/index.lock",
    })
  } else {
    checks.push({
      id: "git-lock",
      title: "Git Index Lock",
      status: "pass",
      message: "Git working tree is unlocked and available",
    })
  }

  // 3. Command Lock Check (if commandId provided)
  if (commandId) {
    const lockPath = path.join(companyRoot, "state", `${commandId}.lock`)
    if (existsSync(lockPath)) {
      checks.push({
        id: "command-lock",
        title: `Command Lock (/${commandId})`,
        status: "warn",
        blocker: true,
        message: `Command /${commandId} is already running or holding state/${commandId}.lock`,
        remediation: `Wait for the active /${commandId} process to exit, or remove state/${commandId}.lock if stale.`,
      })
    } else {
      checks.push({
        id: "command-lock",
        title: `Command Lock (/${commandId})`,
        status: "pass",
        message: `Command /${commandId} is clear to execute`,
      })
    }
  }

  // 4. Git CLI Binary Check
  try {
    await execFn("git", ["--version"])
    checks.push({
      id: "git-cli",
      title: "Git Command Line Tool",
      status: "pass",
      message: "git is installed and executable",
    })
  } catch {
    checks.push({
      id: "git-cli",
      title: "Git Command Line Tool",
      status: "fail",
      blocker: true,
      message: "git CLI executable could not be found on PATH",
      remediation: "Install git via Xcode command line tools (xcode-select --install) or Homebrew (brew install git).",
    })
  }

  // 5. Company Ontology Definition Check
  const ontologyPath = path.join(companyRoot, "definitions", "ontology", "company.yaml")
  if (existsSync(ontologyPath)) {
    checks.push({
      id: "company-ontology",
      title: "Company Ontology",
      status: "pass",
      message: "definitions/ontology/company.yaml exists",
    })
  } else {
    checks.push({
      id: "company-ontology",
      title: "Company Ontology",
      status: "warn",
      blocker: false,
      message: "Company ontology has not been defined yet (missing definitions/ontology/company.yaml)",
      remediation: "Run /define-company to initialize your company ontology before running advanced workflows.",
    })
  }

  const blockers = checks.filter((c) => c.status === "fail" || (c.status === "warn" && c.blocker))
  const warnings = checks.filter((c) => c.status === "warn" && !c.blocker)
  const ok = blockers.length === 0 && warnings.length === 0
  const canProceed = blockers.length === 0

  return {
    ok,
    canProceed,
    checks,
    blockers,
    warnings,
  }
}
