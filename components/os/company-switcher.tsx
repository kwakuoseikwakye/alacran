"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { AlacranMark } from "@/components/alacran-mark"
import { resolveTopbarBreadcrumbs } from "@/components/os/topbar"

/**
 * The company you are in, and the way to another one — the top of the
 * sidebar. Switching keeps you on the same page of the next company, and the
 * choice is remembered in the cookie the root layout reads for pages that are
 * not company-scoped (the picker, Preferences, Connected tools).
 */
export function CompanySwitcher({
  companies,
  activeCompanyId,
  collapsed = false,
}: {
  companies: Array<{ id: string; name: string }>
  activeCompanyId: string | null
  collapsed?: boolean
}) {
  const pathname = usePathname() || "/"
  const router = useRouter()
  const [filter, setFilter] = useState("")
  const { companyLabel, targetPathForCompany } = resolveTopbarBreadcrumbs(pathname, activeCompanyId, companies)
  const shown = companies.filter((company) => company.name.toLowerCase().includes(filter.toLowerCase()))

  function choose(id: string) {
    document.cookie = `alacran-active-company=${id}; path=/; max-age=31536000; SameSite=Lax`
    router.push(targetPathForCompany(id))
  }

  function chooseAll() {
    document.cookie = "alacran-active-company=; path=/; max-age=0; SameSite=Lax"
    router.push("/")
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="company-switcher" aria-label={`${companyLabel} — switch company`}>
          <AlacranMark className="w-[18px]" priority />
          {collapsed ? null : (
            <>
              <span className="company-switcher-name">{companyLabel}</span>
              <ChevronsUpDown aria-hidden />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="glass-menu">
          {companies.length > 5 ? (
            <input
              type="text"
              className="glass-menu-search"
              placeholder="Find a company"
              aria-label="Find a company"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          ) : null}
          {shown.map((company) => (
            <DropdownMenu.Item key={company.id} onSelect={() => choose(company.id)} className="glass-menu-item">
              <span>{company.name}</span>
              {company.id === activeCompanyId ? <Check aria-hidden className="glass-menu-check" /> : null}
            </DropdownMenu.Item>
          ))}
          {shown.length === 0 ? <p className="glass-menu-empty">No company by that name</p> : null}
          <DropdownMenu.Separator className="glass-menu-separator" />
          <DropdownMenu.Item onSelect={chooseAll} className="glass-menu-item">
            <LayoutGrid aria-hidden />
            <span>All companies</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
