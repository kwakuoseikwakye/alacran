import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { buildCompanyOntology } from "./build-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

/**
 * The app's own copy of the same file. Guaranteed present in a packaged build:
 * both packaging scripts hard-assert `templates/company-starter` into the
 * payload (the v83 check), and lib/adopt-folder.ts already reads this same
 * tree at runtime in production.
 */
const BUNDLED_ONTOLOGY_STARTER = path.join(
  process.cwd(),
  "templates",
  "company-starter",
  "docs",
  "templates",
  "ontology-starter.yaml"
)

export async function saveCompanyOntologyImpl(
  agentId: string,
  answers: CompanyOntologyAnswers,
  execFn?: ExecFileFn,
  bundledTemplatePath: string = BUNDLED_ONTOLOGY_STARTER
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const templatePath = path.join(agent.rootPath, "docs", "templates", "ontology-starter.yaml")
  let templateContent: string
  try {
    templateContent = await readFile(templatePath, "utf-8")
  } catch {
    return { ok: false, message: "This company is missing docs/templates/ontology-starter.yaml" }
  }

  // buildCompanyOntology PARSES that template, to copy its customer/org/product
  // domains through verbatim — so an unparseable one threw straight out of the
  // Server Action, which in a production build reaches the user as "An error
  // occurred in the Server Components render" with the real cause redacted.
  // Every sibling reader of a user-editable YAML file already returns a message
  // instead (parse-company-ontology.ts, triage-config.ts, google-accounts-config.ts);
  // this was the one that didn't.
  //
  // The fallback is not defensive padding, it is the repair path: the template
  // v67 shipped was ITSELF unparseable (`<<TODO: hint>>` — a `: ` inside an
  // unquoted scalar is a nested mapping to YAML), so every company scaffolded
  // between then and now holds a broken copy and could never finish setup.
  // Fixing the bundled file only helps companies made after this release; those
  // already on disk keep their own copy. This is app-shipped scaffolding, not
  // user content, so falling back to the app's own current copy is the correct
  // reading of what that file is for.
  //
  // ponytail: the company's own file is left as it found it — the save works,
  // but `/define-company` still reads a broken reference shape. Rewrite it in
  // place if that turns out to matter, which needs its own "is this the user's
  // edit or ours?" check (the v77/v81 ownership rule) and is a bigger feature
  // than this bug.
  let yamlContent: string
  try {
    yamlContent = buildCompanyOntology(agent.name, answers, templateContent)
  } catch (err) {
    try {
      yamlContent = buildCompanyOntology(agent.name, answers, await readFile(bundledTemplatePath, "utf-8"))
    } catch {
      // Report the COMPANY's failure, not the fallback's: that is the file the
      // user could actually go and look at.
      return {
        ok: false,
        message: `This company's docs/templates/ontology-starter.yaml isn't valid YAML, so there's no shape to build from: ${
          err instanceof Error ? err.message.split("\n")[0] : String(err)
        }`,
      }
    }
  }
  const relativePath = path.join("definitions", "ontology", "company.yaml")
  const targetPath = path.join(agent.rootPath, relativePath)

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, yamlContent, "utf-8")
  // A failed commit is not a failed save: the file is already correct on disk,
  // which is what every reader in this app uses. Same rule as
  // update-company-skills-impl.ts and add-company-pack.ts, and it is not
  // hypothetical — an adopted folder keeps its OWN .gitignore, a fresh `git
  // init` has no user.email until someone sets one, and either makes `git
  // add`/`git commit` exit non-zero. Unguarded, that rejection left the wizard
  // showing "Saving…" forever with nothing written to the screen, on a save
  // that had in fact succeeded.
  try {
    await commitFile(agent.rootPath, relativePath, "Define company context via AI-Native control panel", execFn)
  } catch {
    // Deliberately ignored, as above.
  }

  return { ok: true }
}
