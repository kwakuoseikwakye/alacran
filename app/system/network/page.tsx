import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function NetworkPage() {
  // Network view disabled in favor of Connectors catalog
  redirect("/system/connectors")
}
