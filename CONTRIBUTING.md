# Contributing to Alacrán

Thanks for being here. Alacrán is open source under the [MIT licence](LICENSE)
and is maintained by one person, so replies can take a while.

Everyone participating is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues go to
[SECURITY.md](SECURITY.md), never a public channel.

## Ways to help

- **Report a bug.** Open an
  [issue](https://github.com/kwakuoseikwakye/alacran/issues/new/choose). A
  reproduction beats a description: what you did, what happened, what you
  expected, and which platform.
- **Request a feature.** Say what you are trying to accomplish, not just what
  you want built — the problem is more useful than the proposed solution.
- **Test on hardware the maintainer does not have.** Intel Macs and
  non-Debian Linux are the least-verified surfaces.
- **Send a pull request.** Fork the repository and follow the sections below.

If you would rather not use GitHub, email `contact@alacran.app`.

## Getting set up

```bash
git clone https://github.com/kwakuoseikwakye/alacran.git
cd alacran
npm install
npm run dev          # http://localhost:3000
```

You'll want Node 20+, git, and at least one agent CLI (see
[Prerequisites](README.md#prerequisites)). A fresh checkout starts with no
companies registered; create a throwaway one under `/tmp` to work against.

Before you push:

```bash
npx tsc --noEmit     # must be clean (run `npm run build` once first on a fresh clone: it generates next-env.d.ts)
npm test             # must be green
npm run lint         # must be clean
npm run build        # must succeed
```

## Project conventions

These aren't style preferences — each exists because breaking it caused a real
bug. Read this section before your first PR.

### Structure

- **`lib/*-impl.ts` holds the logic and the injectable seam; the sibling
  `lib/*.ts` is a thin `"use server"` wrapper.** Public Server Actions take
  only real domain parameters. Injectable seams (`execFn`, `registryPath`,
  `nowSeconds`) live on the `-impl` function, never on the public action —
  otherwise they're attacker-controllable.
- **Every function that shells out, touches the filesystem, or reads the clock
  takes an injectable `ExecFn` / `SpawnFn` / `nowSeconds` with a real
  default.** This is how the suite runs in ~3 seconds with no network, no
  subprocesses, and no dependence on today's date.
- **`export const dynamic = "force-dynamic"` on every page.** This app reads
  live filesystem and git state; nothing is safely cacheable.

### Security

Treat every Server Action parameter as fully attacker-controlled, because it
is — a `"use server"` function is a public HTTP endpoint.

- **Both gates, always.** Containment (`lib/path-guard.ts`) *and* membership
  (`lib/resolve-known-skill.ts`). A path that passes one and not the other is
  rejected.
- **Compare resolved real paths, never raw strings.** A raw prefix check can
  be defeated by `docs/../../elsewhere`. A cheap string pre-check may exist as
  a fail-fast, but it must only be able to *reject*, never approve.
- **Validate anything that becomes an argv token.** An unvalidated `sha` in a
  `git show` argv once let a `--pretty=…`-shaped string silently change what
  git returned, with `ok: true`. Shape-validate first.
- **Never grant a spawned agent bare `Write` or `--permission-mode
  acceptEdits`.** Only `Edit(<pattern>)` rules are actually path-matched by
  Claude Code; `Write(path)` rules are accepted and silently never enforced.
  This was proven with a live test, not assumed.
- **Commits are single-file-scoped.** `git add -- <file> && git commit --
  <file>`. Never a bare `git commit` in a user's repository.

### UI

- **Never edit `components/ui/*`** to fix a styling problem. Those are
  shared primitives. Fix the design token in `app/globals.css` or the
  *consumer's* className instead.
- **The palette and type live in two places** — `app/globals.css` and
  `landing/v5.css`. A change to one must be mirrored in the other.
- **Logos are generated, not hand-edited.** `scripts/generate-logo.py` and
  `scripts/generate-brand-icons.mjs` produce the committed image and icon
  files. Change the script and re-run; never touch the outputs directly, and
  never hand-draw or approximate a vendor's logo.
- **Guard any `useEffect` that fires a real side effect on mount** with a
  `useRef`, or React's development Strict Mode will double-invoke it. This
  once triggered two real headless agent sessions from a single click.

## Tests

New behavior needs a test. The bar is that a reviewer can see the test fail
before your fix and pass after it.

- Unit tests live next to the code as `*.test.ts`.
- Use the injectable seam rather than mocking modules where possible.
- **Don't write a test that needs the network, a real subprocess, or the real
  clock.** If you think you need one, that's usually a sign the seam is
  missing.

## Changes

1. Fork the repository and branch from `main`.
2. Keep the diff focused — one concern per PR.
3. Write a commit message that explains *why*, not just what. The existing
   history is the style guide.
4. Say how you verified the change. "Tests pass" is fine for pure logic;
   anything touching the filesystem, git, or a spawned agent should say what
   you actually ran it against.
5. CI must be green.

**Never live-test against a repository you care about.** Create a disposable
company under `/tmp`, verify, and delete it. Several of this project's known
bugs were found exactly this way, and one was found the hard way by *not*
doing it.

## Design docs

Each substantial feature is designed before the code is written — a spec,
then a plan. Those working documents aren't published, but every shipped
feature gets a detailed, dated writeup in [`CHANGELOG.md`](CHANGELOG.md),
including the reasoning, the alternatives that were rejected, and any bugs
found during live testing. [`AGENTS.md`](AGENTS.md) carries the standing
conventions for contributors and AI coding agents.
You are not required to follow that process for a contribution, but reading
the changelog entry for the area you're changing will tell you which
constraints are deliberate and which are accidents.

## Questions

Open an issue. There's no chat, no forum, and no support contract — just the
tracker, and it gets read.
