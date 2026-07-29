// Semver-ish comparison, deliberately small: our own tags are plain
// MAJOR.MINOR.PATCH, so a full semver dependency would be more surface area
// than the problem needs.
//
// Returns >0 if a is newer than b, <0 if older, 0 if equal.
// Anything unparseable sorts as 0.0.0 rather than throwing, because a
// malformed tag upstream must never be able to break the user's app.
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

// Accepts "1.2.3", "v1.2.3", and "v1.2.3-beta.1" (pre-release suffix ignored:
// we only ever compare our own release tags, and treating 1.2.3-beta as equal
// to 1.2.3 is the conservative outcome — it won't nag a beta tester).
export function parseVersion(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? "").trim())
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
