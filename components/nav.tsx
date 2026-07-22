import Link from "next/link"

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <Link href="/" className="hover:underline">
        Agents
      </Link>
      <Link href="/activity" className="hover:underline">
        Activity
      </Link>
      <Link href="/skills" className="hover:underline">
        Skills
      </Link>
    </nav>
  )
}
