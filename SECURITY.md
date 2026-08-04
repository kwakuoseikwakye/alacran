# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:
[**Report a vulnerability**](https://github.com/kwakuoseikwakye/alacran/security/advisories/new).
That opens a private advisory only you and the maintainer can see.

If GitHub advisories aren't available to you, email
`kwakuoseikwakye@gmail.com` with `[alacran security]` in the subject.

You should get an acknowledgement within **7 days**. This is a one-person
project with no security team and no bounty program — what you will get is an
honest reply, a fix or a documented decision not to fix, and credit in the
release notes unless you'd rather not have it.

Please include:

- What an attacker can do, concretely.
- The steps to reproduce it, or a proof of concept.
- The version (`Alacrán → the version in the update banner`, or the commit
  SHA if you built from source) and your OS.

## Supported versions

Only the latest release gets fixes. There are no maintained branches.

## Threat model

Alacrán is a **local** application. It binds to `127.0.0.1`, has no
authentication, and assumes the person using the machine is the owner of the
data on it. It is not designed to be exposed to a network, and running it
behind a reverse proxy or on a shared host is unsupported and unsafe.

Within that model, the things that count as vulnerabilities are:

- **Escaping the company-root boundary.** Any path that lets a read or write
  land outside a registered company's directory. Both
  `lib/path-guard.ts` (containment, via resolved real paths) and
  `lib/resolve-known-skill.ts` (membership) must be defeated for this to be
  benign; defeating either one alone is a finding.
- **Argument injection.** Every Server Action parameter is a public,
  attacker-controllable HTTP input. Anything that reaches an argv token,
  a shell, or a git ref without shape validation is a finding — a real one of
  these shipped and was fixed in v6.
- **Escaping a spawned agent's scope.** Spawned agent sessions are confined
  with `--allowedTools Read,Grep,Glob,Edit(<one directory>)` plus, where
  needed, narrowly pattern-matched `Bash(...)`. A way to make a session write
  outside its declared output directory, or run a command outside its
  allowlist, is a finding.
- **Committing to the wrong place.** Writes go through single-file-scoped
  commits into a specific company's own repository. Anything that causes a
  commit in a different repository, or sweeps unrelated files into one, is a
  finding.
- **Anything that transmits user data off the machine** beyond the three
  documented cases (prompts to the configured AI CLI, an anonymous version
  check, an explicit Back up to your own private repo).

Explicitly **not** vulnerabilities:

- Another local process on the same machine reading the app's data directory
  or talking to `127.0.0.1`. Local processes running as you are already inside
  the trust boundary.
- The agent CLI doing something you asked it to do, within its granted scope.
  Alacrán shows you the diff before anything is committed; approving a bad
  diff is a user decision, not a bypass.
- macOS Gatekeeper warnings from unnotarized builds. Known, documented, and
  tracked in the README.
- Findings from automated scanners with no demonstrated impact.

## What Alacrán never does

It never stores an API key, never proxies a request to a model provider, and
never holds an OAuth credential. Every external service is reached through a
CLI **you** installed and authenticated yourself. If you find code doing
otherwise, that itself is the bug — report it.
