import os from "node:os"
import path from "node:path"

/**
 * The Takeshi agent's LaunchAgent plist. Deliberately a hardcoded constant, not
 * a parameter: the public Server Action that unloads it is reachable by anything
 * the browser can reach, so a caller-supplied path would let it unload any
 * launchd job on the machine.
 */
export const TAKESHI_LAUNCHD_PLIST_PATH = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  "com.plh.takeshi-agent.plist"
)
