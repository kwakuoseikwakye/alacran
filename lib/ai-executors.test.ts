import { describe, it, expect } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  AI_EXECUTORS,
  DEFAULT_AI_EXECUTOR_ID,
  KIRO_AGENT_NAME,
  getAiExecutor,
  listAiExecutors,
} from "./ai-executors"
import { KIRO_AGENT_DIR_SEGMENTS, globToAnchoredRegex, hasScopeWriter, prepareExecutorScope } from "./executor-scope"

describe("ai-executors", () => {
  it("every executor has a unique id matching its key and a non-empty binary/label/install hint", () => {
    for (const [key, executor] of Object.entries(AI_EXECUTORS)) {
      expect(executor.id).toBe(key)
      expect(executor.binaryName.length).toBeGreaterThan(0)
      expect(executor.label.length).toBeGreaterThan(0)
      expect(executor.installHint.length).toBeGreaterThan(0)
      expect(executor.installLink.startsWith("https://")).toBe(true)
    }
  })

  it("default id resolves to a real, present executor", () => {
    expect(AI_EXECUTORS[DEFAULT_AI_EXECUTOR_ID]).toBeDefined()
  })

  it("getAiExecutor falls back to the default for an unknown id", () => {
    expect(getAiExecutor("something-made-up").id).toBe(DEFAULT_AI_EXECUTOR_ID)
    expect(getAiExecutor(undefined).id).toBe(DEFAULT_AI_EXECUTOR_ID)
  })

  it("getAiExecutor returns the matching executor for a known id", () => {
    expect(getAiExecutor("claude-code").id).toBe("claude-code")
  })

  // v99 removed Codex and Aider. An existing company assigned to
  // one of them must land on the default rather than break, which is what
  // makes that deletion safe to ship without a migration.
  it("a retired executor id falls back to the default instead of throwing", () => {
    for (const retired of ["openai-codex", "aider"]) {
      expect(getAiExecutor(retired).id).toBe(DEFAULT_AI_EXECUTOR_ID)
    }
  })

  it("listAiExecutors returns all registered executors", () => {
    expect(listAiExecutors().map((e) => e.id).sort()).toEqual(Object.keys(AI_EXECUTORS).sort())
  })

  // The real invariant, and it is narrower than "everything enforces".
  //
  // v99 asserted that every registered executor enforces a scope, which was
  // right while the registry held exactly the one CLI that does. It is the
  // wrong shape once a second executor exists: the property that actually
  // protects a company is the PAIRING — a command carrying attacker-authored
  // text only runs on an executor that can be confined to that command's own
  // output path. runCompanyCommandImpl already implements exactly that
  // refusal; this pins it so an executor cannot be added in a way that makes
  // the refusal unreachable.
  //
  // So an executor reporting false is allowed here. What is NOT allowed is one
  // reporting true without the scope really reaching the CLI, which the two
  // tests below prove per-executor against real output rather than by listing
  // ids.
  it("declares enforcesToolScope as a real boolean, and at least one executor enforces", () => {
    const executors = listAiExecutors()
    for (const executor of executors) {
      expect(typeof executor.enforcesToolScope, `${executor.id}`).toBe("boolean")
    }
    // Without one, no untrustedInput command could ever run and `refresh`
    // would be dead for every company.
    expect(executors.some((e) => e.enforcesToolScope)).toBe(true)
  })

  // The sandbox for Kiro is created by two ABSENCES, both of which were
  // measured to silently discard the path scope, and one of which
  // (--trust-all-tools) does it with no warning printed at all. A future edit
  // adding either to make a run "just work" would remove the sandbox and
  // change nothing else observable. That is what this catches.
  describe("kiro — the flags that would silently remove the sandbox", () => {
    const args = AI_EXECUTORS.kiro.buildArgs({
      prompt: "p",
      editScopePattern: "docs/decisions/**",
      bashPatterns: [],
    })

    it("never passes --trust-all-tools or -a", () => {
      expect(args).not.toContain("--trust-all-tools")
      expect(args).not.toContain("-a")
    })

    it("runs headless under the app's own scoped agent", () => {
      expect(args).toEqual(["chat", "--no-interactive", "--agent", KIRO_AGENT_NAME, "p"])
    })

    it("does not put the scoped agent on an interactive session the user drives", () => {
      expect(AI_EXECUTORS.kiro.buildInteractiveIntroArgs?.("hello")).toEqual(["chat", "hello"])
    })
  })

  describe("claude-code buildArgs — must stay byte-identical to the pre-existing spawn behavior", () => {
    const executor = AI_EXECUTORS["claude-code"]

    it("with no bashPatterns: adds --disallowedTools Bash", () => {
      const args = executor.buildArgs({ prompt: "do the thing", editScopePattern: "notes/company/**", bashPatterns: [] })
      expect(args).toEqual([
        "-p",
        "do the thing",
        "--allowedTools",
        "Read,Grep,Glob,Edit(notes/company/**)",
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "manual",
        "--output-format",
        "text",
      ])
    })

    it("with bashPatterns: omits --disallowedTools Bash and appends scoped Bash(...) entries", () => {
      const args = executor.buildArgs({
        prompt: "check inbox",
        editScopePattern: "notes/company/email-checks/**",
        bashPatterns: ["gog -a auto gmail search*", "gog -a auto gmail get*"],
      })
      expect(args).toEqual([
        "-p",
        "check inbox",
        "--allowedTools",
        "Read,Grep,Glob,Edit(notes/company/email-checks/**),Bash(gog -a auto gmail search*),Bash(gog -a auto gmail get*)",
        "--permission-mode",
        "manual",
        "--output-format",
        "text",
      ])
    })

    it("appends declared MCP tools to --allowedTools, after the file tools, and nothing else", () => {
      const args = executor.buildArgs({
        prompt: "p",
        editScopePattern: "notes/content/posts/**",
        bashPatterns: [],
        mcpTools: ["mcp__canva__a", "mcp__canva__b"],
      })
      expect(args[args.indexOf("--allowedTools") + 1]).toBe(
        "Read,Grep,Glob,Edit(notes/content/posts/**),mcp__canva__a,mcp__canva__b"
      )
      expect(args).toContain("--disallowedTools")
    })
  })

  describe("buildInteractiveIntroArgs — seeding an interactive session's first message", () => {
    it("claude-code passes the prompt as a bare positional (its interactive-mode first turn)", () => {
      expect(AI_EXECUTORS["claude-code"].buildInteractiveIntroArgs?.("hello")).toEqual(["hello"])
    })

    it("google-antigravity passes -i flag", () => {
      expect(AI_EXECUTORS["google-antigravity"].buildInteractiveIntroArgs?.("hello")).toEqual(["-i", "hello"])
    })
  })

  describe("google-antigravity buildArgs — headless prompt and auto-approval", () => {
    const executor = AI_EXECUTORS["google-antigravity"]

    it("passes -p prompt, accept-edits mode, and dangerously-skip-permissions", () => {
      const args = executor.buildArgs({
        prompt: "do the thing",
        editScopePattern: "notes/company/**",
        bashPatterns: [],
      })
      expect(args).toEqual([
        "-p",
        "do the thing",
        "--output-format",
        "text",
        "--mode",
        "accept-edits",
        "--dangerously-skip-permissions",
      ])
    })
  })

  describe("enforcesToolScope", () => {
    // The flag decides whether untrusted-input commands are allowed to run at
    // all, so it must never drift from what the executor REALLY does. Proved
    // against real output rather than restated as a list of ids.
    //
    // Generalized in the Kiro slice: the scope does not have to arrive in
    // argv. Claude Code puts it there (`Edit(pattern)`); Kiro's lives in an
    // agent config file that prepareScope writes. Either counts — what must
    // never happen is `enforcesToolScope: true` with the pattern reaching the
    // CLI through neither.
    it("is true exactly for the executors that really convey the scope, by argv or by file", async () => {
      const editScopePattern = "notes/company/triage/**"
      for (const executor of listAiExecutors()) {
        const input = { prompt: "p", editScopePattern, bashPatterns: [] }
        const inArgv = executor.buildArgs(input).some((a) => a.includes(editScopePattern))

        let inFile = false
        if (hasScopeWriter(executor.id)) {
          const root = await mkdtemp(path.join(tmpdir(), `scope-${executor.id}-`))
          try {
            await prepareExecutorScope(executor.id, input, root)
            const written = await readFile(
              path.join(root, ...KIRO_AGENT_DIR_SEGMENTS, `${KIRO_AGENT_NAME}.json`),
              "utf-8"
            )
            inFile = written.includes(editScopePattern)
            // The absence that IS the sandbox — see ai-executors.ts. A config
            // trusting fs_write reports a scope it does not have.
            expect(JSON.parse(written).allowedTools, `${executor.id}`).not.toContain("fs_write")
          } finally {
            await rm(root, { recursive: true, force: true })
          }
        }

        expect(
          inArgv || inFile,
          `${executor.id}: enforcesToolScope must match what it really conveys`
        ).toBe(executor.enforcesToolScope)
      }
    })

    // Kiro's allowedCommands were verified live, so bashPatterns are carried
    // rather than refused — but as REGEXES, which is the whole risk here.
    it("kiro carries bashPatterns into allowedCommands, and only then adds execute_bash", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "scope-kiro-bash-"))
      try {
        await prepareExecutorScope(
          "kiro",
          { prompt: "p", editScopePattern: "docs/decisions/**", bashPatterns: ["gog -a auto gmail get*"] },
          root
        )
        const cfg = JSON.parse(
          await readFile(path.join(root, ...KIRO_AGENT_DIR_SEGMENTS, `${KIRO_AGENT_NAME}.json`), "utf-8")
        )
        expect(cfg.toolsSettings.execute_bash.allowedCommands).toEqual(["^gog -a auto gmail get.*$"])
        expect(cfg.tools).toContain("execute_bash")
        // The absence that keeps it a sandbox, same as fs_write.
        expect(cfg.allowedTools).not.toContain("execute_bash")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })

    // Least privilege: a run with no patterns must not be handed a shell tool.
    it("kiro gets no execute_bash at all when the command declares no patterns", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "scope-kiro-nobash-"))
      try {
        await prepareExecutorScope("kiro", { prompt: "p", editScopePattern: "docs/**", bashPatterns: [] }, root)
        const cfg = JSON.parse(
          await readFile(path.join(root, ...KIRO_AGENT_DIR_SEGMENTS, `${KIRO_AGENT_NAME}.json`), "utf-8")
        )
        expect(cfg.tools).not.toContain("execute_bash")
        expect(cfg.toolsSettings.execute_bash).toBeUndefined()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  })

  // Claude Code's bashPatterns are globs; Kiro's allowedCommands are regexes.
  // Passing one through as the other is a security bug in two directions at
  // once, so the translation gets its own tests rather than being trusted.
  describe("globToAnchoredRegex", () => {
    it("turns a trailing glob into .* and anchors both ends", () => {
      expect(globToAnchoredRegex("git -C /x pull*")).toBe("^git -C /x pull.*$")
    })

    it("escapes regex metacharacters that are literal in a glob", () => {
      // Unescaped, the dot would match any character and the + would quantify.
      expect(globToAnchoredRegex("a.b+c*")).toBe("^a\\.b\\+c.*$")
    })

    it("anchoring is what stops a prefix pattern matching a command that merely contains it", () => {
      const re = new RegExp(globToAnchoredRegex("git pull*"))
      expect(re.test("git pull --rebase")).toBe(true)
      // The whole point: unanchored, this would be allowed.
      expect(re.test("rm -rf ~ # git pull")).toBe(false)
      // And `pull*` must not degrade to "pul" + optional "l".
      expect(re.test("git pul")).toBe(false)
    })
  })

  /**
   * The scaling invariant, and the reason this is a test rather than a note:
   * the field is optional, so a new executor added without it type-checks
   * clean. Absence has to mean "prime it", because the failure it prevents is
   * silent — an agent with no company context still answers, just genericly.
   */
  describe("autoLoadsCompanyContext", () => {
    it("is only ever true or absent, never false", () => {
      for (const executor of listAiExecutors()) {
        expect([true, undefined]).toContain(executor.autoLoadsCompanyContext)
      }
    })

    it("claude-code declares it, because it really does load CLAUDE.md and .claude/commands", () => {
      expect(AI_EXECUTORS["claude-code"].autoLoadsCompanyContext).toBe(true)
    })

    it("kiro does not, so it gets the primer", () => {
      expect(AI_EXECUTORS.kiro.autoLoadsCompanyContext).toBeUndefined()
    })

    /** Kimi has no path scope, so the
     *  untrusted-input refusal must engage for it. */
    it("kimi reports no tool scope, so untrusted-input commands refuse on it", () => {
      expect(AI_EXECUTORS.kimi.enforcesToolScope).toBe(false)
      expect(hasScopeWriter("kimi")).toBe(false)
    })

    it("google-antigravity reports no tool scope, so untrusted-input commands refuse on it", () => {
      expect(AI_EXECUTORS["google-antigravity"].enforcesToolScope).toBe(false)
      expect(hasScopeWriter("google-antigravity")).toBe(false)
    })

    it("codex includes --skip-git-repo-check so it can run in uninitialized/scratch workspaces", () => {
      const args = AI_EXECUTORS.codex.buildArgs({
        prompt: "test",
        editScopePattern: ".alacran-never-written/**",
        bashPatterns: [],
      })
      expect(args).toContain("--skip-git-repo-check")
      expect(args).toEqual(["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "test"])
    })
  })
})

describe("every registered executor answers every per-executor question", () => {
  /**
   * The agent is the driver of this OS: a company can switch executors at any
   * time from the picker, and a feature that works for one must work for all of
   * them or say plainly that it does not.
   *
   * It drifted because the answers lived in hardcoded lists elsewhere.
   * `saveMcpServersImpl` looped over two path constants while documenting
   * itself as writing "every registered executor's config path" — true when
   * there were two, silently wrong once Kimi and Antigravity were added. A
   * company on either clicked "+ Enable MCP", got "Added to .mcp.json and
   * .kiro/settings/mcp.json", and its own agent read neither file.
   *
   * The one per-executor surface that never drifted is
   * `summarize-network-access.ts`, because its table is
   * `Record<AiExecutorId, string>` — a TOTAL record, so adding an executor
   * fails `tsc` until someone answers for it. `mcpConfigPath` is declared
   * required-and-nullable for the same reason: `null` is a verified "this CLI
   * has no project-scoped MCP config", never a field nobody filled in.
   */
  it("declares an MCP config path or an explicit null", () => {
    for (const executor of Object.values(AI_EXECUTORS)) {
      expect(executor, `${executor.id} must answer the MCP question`).toHaveProperty("mcpConfigPath")
      const value = executor.mcpConfigPath
      expect(value === null || typeof value === "string").toBe(true)
      if (typeof value === "string") expect(value.length).toBeGreaterThan(0)
    }
  })

  it("keeps the two verified MCP paths exactly as measured against the real binaries", () => {
    expect(AI_EXECUTORS["claude-code"].mcpConfigPath).toBe(".mcp.json")
    expect(AI_EXECUTORS.kiro.mcpConfigPath).toBe(".kiro/settings/mcp.json")
  })
})

it("every executor answers supportsMcpToolAllowlist, and only Claude Code says yes", () => {
  const yes = Object.values(AI_EXECUTORS).filter((e) => e.supportsMcpToolAllowlist).map((e) => e.id)
  expect(yes).toEqual(["claude-code"])
})

describe("streamingRunArgs", () => {
  const input = { prompt: "do it", editScopePattern: "**", bashPatterns: [] }

  it("gives Claude Code the same scope as buildArgs, but streaming JSON events with --verbose", () => {
    const streaming = AI_EXECUTORS["claude-code"].streamingRunArgs!(input)
    const plain = AI_EXECUTORS["claude-code"].buildArgs(input)
    const cut = plain.indexOf("--output-format")
    expect(streaming.slice(0, cut)).toEqual(plain.slice(0, cut))
    expect(streaming.slice(cut)).toEqual(["--output-format", "stream-json", "--verbose"])
  })

  it("is null for every executor whose streaming mode hasn't been run end to end", () => {
    for (const id of ["kiro", "kimi", "codex", "google-antigravity"] as const) {
      expect(AI_EXECUTORS[id].streamingRunArgs).toBeNull()
    }
  })
})

describe("streamingResumeArgs", () => {
  const input = { prompt: "change it", editScopePattern: "**", bashPatterns: [] }

  it("continues Claude Code's conversation in the same scope, streaming", () => {
    const args = AI_EXECUTORS["claude-code"].streamingResumeArgs!(input)
    expect(args[0]).toBe("--continue")
    expect(args.slice(1)).toEqual(AI_EXECUTORS["claude-code"].streamingRunArgs!(input))
  })

  it("is null wherever resume + streaming hasn't been run end to end", () => {
    for (const id of ["kiro", "kimi", "codex", "google-antigravity"] as const) {
      expect(AI_EXECUTORS[id].streamingResumeArgs).toBeNull()
    }
  })
})

describe("interactiveResumeArgs", () => {
  it("continues Claude Code's conversation interactively, and is null elsewhere", () => {
    expect(AI_EXECUTORS["claude-code"].interactiveResumeArgs).toEqual(["--continue"])
    for (const id of ["kiro", "kimi", "codex", "google-antigravity"] as const) {
      expect(AI_EXECUTORS[id].interactiveResumeArgs).toBeNull()
    }
  })
})

describe("kimi's headless arguments", () => {
  // Kimi's reference: "`--prompt` cannot be used with `--yolo`, `--auto`, or
  // `--plan`" (0.39.0 refuses each at startup). Sending one made every headless
  // Kimi run fail before it began, until v222.
  it("never pairs --prompt with a permission or plan flag, which Kimi rejects", () => {
    const args = AI_EXECUTORS.kimi.buildArgs({ prompt: "hello", editScopePattern: "x/**", bashPatterns: [] })
    expect(args.slice(0, 2)).toEqual(["-p", "hello"])
    for (const flag of ["--yolo", "-y", "--auto", "--plan", "--yes", "--auto-approve"]) expect(args).not.toContain(flag)
  })
})

describe("alsoEditScopePatterns", () => {
  const base = { prompt: "p", editScopePattern: "definitions/ontology/company.yaml", bashPatterns: [] }
  const extra = ["docs/decisions/**"]

  it("adds one Edit() per pattern for Claude Code, and nothing changes when absent or empty", () => {
    const claude = AI_EXECUTORS["claude-code"]
    const joined = claude.buildArgs({ ...base, alsoEditScopePatterns: extra }).join(" ")
    expect(joined).toContain("Edit(definitions/ontology/company.yaml),Edit(docs/decisions/**)")
    const plain = claude.buildArgs(base)
    expect(plain.join(" ")).toContain("Read,Grep,Glob,Edit(definitions/ontology/company.yaml)")
    expect(claude.buildArgs({ ...base, alsoEditScopePatterns: [] })).toEqual(plain)
    // Hardcoded baseline: the exact argv the code produced before the field existed.
    expect(claude.buildArgs({ prompt: "p", editScopePattern: "x", bashPatterns: [] })).toEqual([
      "-p", "p", "--allowedTools", "Read,Grep,Glob,Edit(x)", "--disallowedTools", "Bash",
      "--permission-mode", "manual", "--output-format", "text",
    ])
    expect(plain.join(" ")).not.toContain("docs/decisions")
  })

  it("every executor accepts the extra patterns, and one that enforces a scope conveys them", async () => {
    for (const executor of listAiExecutors()) {
      const input = { ...base, alsoEditScopePatterns: extra }
      const inArgv = executor.buildArgs(input).some((a) => a.includes(extra[0]))
      let inFile = false
      if (hasScopeWriter(executor.id)) {
        const root = await mkdtemp(path.join(tmpdir(), `also-${executor.id}-`))
        try {
          await prepareExecutorScope(executor.id, input, root)
          const written = await readFile(path.join(root, ...KIRO_AGENT_DIR_SEGMENTS, `${KIRO_AGENT_NAME}.json`), "utf-8")
          expect(JSON.parse(written).toolsSettings.fs_write.allowedPaths).toEqual([base.editScopePattern, ...extra])
          inFile = true
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }
      if (executor.enforcesToolScope) expect(inArgv || inFile, executor.id).toBe(true)
    }
  })

  it("streaming and resume variants carry the same widened scope", () => {
    for (const executor of listAiExecutors()) {
      const input = { ...base, alsoEditScopePatterns: extra }
      const variants = [executor.streamingRunArgs?.(input), executor.resume?.buildArgs(input, "sid")]
      for (const v of variants) {
        if (v && executor.enforcesToolScope && executor.buildArgs(input).some((a) => a.includes(extra[0]))) {
          expect(v.join(" "), executor.id).toContain(extra[0])
        }
      }
    }
  })
})

describe("costReport (v251)", () => {
  const input = { prompt: "do it", editScopePattern: "notes/**", bashPatterns: [] }

  it("is filled in for Claude Code only; every other executor's cost is not known", () => {
    expect(AI_EXECUTORS["claude-code"].costReport).not.toBeNull()
    for (const id of ["kiro", "kimi", "codex", "google-antigravity"] as const) {
      expect(AI_EXECUTORS[id].costReport).toBeNull()
    }
  })

  it("leaves the plain-text argv every other caller reads untouched", () => {
    const claude = AI_EXECUTORS["claude-code"]
    expect(claude.buildArgs(input).slice(-2)).toEqual(["--output-format", "text"])
    expect(claude.resume!.buildArgs(input, "s-1").slice(-2)).toEqual(["--output-format", "text"])
  })

  it("asks for a json result with exactly the same scope as buildArgs and resume", () => {
    const claude = AI_EXECUTORS["claude-code"]
    const plain = claude.buildArgs(input)
    const cut = plain.indexOf("--output-format")
    const fresh = claude.costReport!.args(input)
    expect(fresh.slice(0, cut)).toEqual(plain.slice(0, cut))
    expect(fresh.slice(cut)).toEqual(["--output-format", "json"])

    const resumed = claude.resume!.buildArgs(input, "s-1")
    const rcut = resumed.indexOf("--output-format")
    const costResumed = claude.costReport!.resumeArgs(input, "s-1")
    expect(costResumed.slice(0, rcut)).toEqual(resumed.slice(0, rcut))
    expect(costResumed.slice(rcut)).toEqual(["--output-format", "json"])
    expect(claude.costReport!.resumeArgs(input).slice(0, 1)).toEqual(["--continue"])
  })
})

