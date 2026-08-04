# What this changes

<!-- What problem does this solve? Link the issue if there is one. -->

## Why this approach

<!-- Anything a reviewer would otherwise have to guess at: alternatives you
     rejected, constraints you hit, trade-offs you took. -->

## How it was verified

<!-- "Tests pass" is enough for pure logic. Anything touching the filesystem,
     git, or a spawned agent should say what you actually ran it against.

     Live-test against a disposable /tmp company, never a repo you care about. -->

- [ ] `npm test` green
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] Manually exercised the change (say how, above)

## Checklist

- [ ] New behavior has a test that fails without the change
- [ ] No test needs the network, a real subprocess, or the real clock
- [ ] Server Action parameters are treated as attacker-controlled; any new
      write path goes through **both** `path-guard` and `resolve-known-skill`
- [ ] No edits to `components/ui/*` (fix the token or the consumer instead)
- [ ] Palette/type changes mirrored in **both** `app/globals.css` and
      `landing/styles.css`
- [ ] Generated assets changed via their script, not by hand
- [ ] Changelog updated if this is a user-visible change
