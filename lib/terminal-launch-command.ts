export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

/** Only what `launchTerminalScript` actually touches, so node's `ChildProcess`
 *  and the narrower hand-rolled process types elsewhere in this repo both
 *  satisfy it without either side widening to `any`. */
export type LaunchedTerminal = {
  unref: () => void
  stderr?: {
    on: (event: "data", listener: (chunk: Buffer | string) => void) => void
    removeAllListeners: (event: "data") => void
    resume: () => void
  } | null
  on: {
    (event: "exit", listener: (code: number | null) => void): void
    (event: "error", listener: (err: Error) => void): void
  }
}

export type TerminalSpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", "ignore", "pipe"]
}

export type SpawnFn = (command: string, args: string[], opts: TerminalSpawnOptions) => LaunchedTerminal

export type TerminalLaunchOutcome = { opened: true } | { opened: false; reason: string }

export type TerminalLaunchCommand = { command: string; args: (scriptPath: string) => string[] }

// Ubuntu (this app's only .deb target — scripts/package-linux.sh) always has
// x-terminal-emulator, Debian's update-alternatives entry for "whichever
// terminal is actually installed" — tried first. The rest are fallbacks for
// distros without that alternative.
const LINUX_TERMINALS = ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"]

/**
 * Decides which command opens a real terminal window running a script, for
 * the current OS. macOS always has `open -a Terminal`. Linux has no single
 * equivalent, so this probes a short list of common emulators and uses
 * whichever is actually installed; null means none were found.
 */
export async function resolveTerminalLaunchCommand(
  platform: NodeJS.Platform,
  execFn: ExecFileFn
): Promise<TerminalLaunchCommand | null> {
  if (platform === "darwin") {
    return { command: "open", args: (scriptPath) => ["-a", "Terminal", scriptPath] }
  }
  if (platform === "linux") {
    for (const terminal of LINUX_TERMINALS) {
      try {
        await execFn("which", [terminal])
        // Modern gnome-terminal dropped -e/-x in favor of `--`; the others
        // (x-terminal-emulator's wrapper included) follow xterm's `-e`.
        return {
          command: terminal,
          args: (scriptPath) => (terminal === "gnome-terminal" ? ["--", scriptPath] : ["-e", scriptPath]),
        }
      } catch {
        continue
      }
    }
  }
  return null
}

/**
 * Spawn the terminal and watch it long enough to know whether it opened.
 *
 * Every caller used to spawn, attach `child.on("error")` so an unhandled event
 * couldn't take the server down, and then report success unconditionally. That
 * handles exactly one failure — the emulator binary not being startable at all
 * — and none of the ones Linux actually produces: no reachable display, no
 * D-Bus session to talk to, an `-e` the resolved emulator rejects, a
 * snap-confined gnome-terminal that can't see the script path. Every one of
 * those spawns fine and then EXITS non-zero with a real explanation on stderr,
 * which `stdio: "ignore"` discarded — so the app said "Opened Terminal", no
 * window appeared, and nothing anywhere recorded why. macOS never showed it:
 * `open -a Terminal` hands off to LaunchServices and exits 0 whatever happens
 * next.
 *
 * What makes this cheap to check: a terminal that opened does not exit, since
 * it lives as long as its window — except gnome-terminal, which forks to its
 * D-Bus server and exits 0 straight away. So a NON-ZERO exit inside the settle
 * window is a launch failure, and anything else is a launch. No polling, no
 * probing the display, and the emulator's own words are what the user is told.
 */
export async function launchTerminalScript(
  launch: TerminalLaunchCommand,
  scriptPath: string,
  cwd: string,
  spawnFn: SpawnFn,
  // A knob rather than an inlined constant: an argument-parse or
  // cannot-open-display failure comes back in well under 100ms, while a
  // terminal that stays open costs the whole window before the caller hears
  // "opened". Long enough to catch the failures, short enough not to be felt.
  settleMs = 800
): Promise<TerminalLaunchOutcome> {
  const child = spawnFn(launch.command, launch.args(scriptPath), {
    cwd,
    detached: true,
    // stderr piped, not ignored: on this path it is the entire diagnosis.
    stdio: ["ignore", "ignore", "pipe"],
  })
  return new Promise<TerminalLaunchOutcome>((resolve) => {
    let stderr = ""
    let settled = false
    const finish = (outcome: TerminalLaunchOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Drain and discard anything said from here on. Destroying the pipe
      // instead would risk EPIPE-killing an emulator that stays attached to
      // it for the life of its window.
      child.stderr?.removeAllListeners("data")
      child.stderr?.resume()
      child.unref()
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ opened: true }), settleMs)
    child.stderr?.on("data", (chunk: Buffer | string) => {
      // Capped: something streaming output is something that opened.
      if (stderr.length < 2000) stderr += String(chunk)
    })
    child.on("error", (err: Error) =>
      finish({ opened: false, reason: `${launch.command} wouldn't start (${err.message})` })
    )
    child.on("exit", (code: number | null) => {
      if (code === 0) return finish({ opened: true })
      // Only the last few lines: emulators print warnings first (a deprecated
      // `-e`, GTK accessibility noise) ahead of the line that matters.
      const said = stderr.trim().split("\n").slice(-3).join(" ").trim()
      finish({
        opened: false,
        reason: `${launch.command} quit immediately${code !== null ? ` (exit ${code})` : ""}${said ? `: ${said}` : ", with nothing on stderr"}`,
      })
    })
  })
}
