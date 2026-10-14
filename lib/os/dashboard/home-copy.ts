/** Home's greeting. The page renders on the local server, so the server's
 *  clock is the user's own. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning."
  if (hour >= 12 && hour < 18) return "Good afternoon."
  return "Good evening."
}

/** Activity titles for most companies are git commit subjects. Drop the
 *  "chore:" / "feat(scope):" prefix a business owner has no word for. */
export function plainActivityTitle(title: string): string {
  const stripped = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, "")
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}
