# Contributing to Alacrán

Thanks for being here. Alacrán is maintained by one person, so the most useful
thing you can do is make it easy to say yes to your change.

Everyone participating is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues go to
[SECURITY.md](SECURITY.md), **not** the public issue tracker.

## Ways to help

- **Report a bug.** Use the bug template. A reproduction beats a description.
- **Request a feature.** Say what you're trying to accomplish, not just what
  you want built — the problem is more useful than the proposed solution.
- **Send a pull request.** Small and focused merges fastest. If a change is
  large or architectural, open an issue first so we can agree on the shape
  before you spend the time.
- **Test on hardware I don't have.** Intel Macs, non-Debian Linux, and the
  OpenAI Codex / Aider agent paths are the least-verified surfaces.

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
npx tsc --noEmit     # must be clean
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
  `landing/styles.css`. A change to one must be mirrored in the other.
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

## Pull requests

1. Branch from `master`.
2. Keep the diff focused — one concern per PR.
3. Write a commit message that explains *why*, not just what. The existing
   history is the style guide.
4. Fill in the PR template, including how you verified the change. "Tests
   pass" is fine for pure logic; anything touching the filesystem, git, or a
   spawned agent should say what you actually ran it against.
5. CI must be green.

**Never live-test against a repository you care about.** Create a disposable
company under `/tmp`, verify, and delete it. Several of this project's known
bugs were found exactly this way, and one was found the hard way by *not*
doing it.

## Design docs

Each substantial feature has a design spec and an implementation plan in
[`docs/superpowers/`](docs/superpowers/), written before the code. You are not
required to follow that process for a contribution, but reading the spec for
the area you're changing will tell you which constraints are deliberate and
which are accidents.

## Questions

Open an issue. There's no chat, no forum, and no support contract — just the
tracker, and it gets read.
