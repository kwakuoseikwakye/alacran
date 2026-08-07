export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

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
