"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { THEME_STORAGE_KEY } from "@/lib/theme"

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme)
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

/**
 * Light/dark switch for the Settings page. Renders "dark" selected on first
 * paint — matching both the CSS default and layout.tsx's blocking script —
 * then corrects from localStorage after mount if the user had picked light.
 * Same one-render-later tradeoff v39's guide flag already accepted.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark")

  useEffect(() => {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === "light") setTheme("light")
  }, [])

  function pick(next: "light" | "dark") {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="inline-flex gap-2">
      <Button type="button" variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => pick("dark")}>
        <Moon className="size-3.5" /> Dark
      </Button>
      <Button type="button" variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => pick("light")}>
        <Sun className="size-3.5" /> Light
      </Button>
    </div>
  )
}
