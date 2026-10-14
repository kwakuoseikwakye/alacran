"use client"

import { useEffect, useState } from "react"
import {
  appliedTheme,
  DEFAULT_THEME_CHOICE,
  resolveThemeChoice,
  THEME_CHOICES,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from "@/lib/theme"

type AppearanceBridge = { alacran?: { appearance?: { set?: (choice: ThemeChoice) => void } } }

/** Stores the choice, re-stamps <html> and tells the Mac shell, whose glass
 *  follows macOS rather than this page. The pre-paint script in app/layout.tsx
 *  does the same on the next load. */
export function applyThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    /* private mode / storage disabled — the swap still holds for this session */
  }
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false
  document.documentElement.setAttribute("data-theme", appliedTheme(choice, prefersLight))
  try {
    ;(window as unknown as AppearanceBridge).alacran?.appearance?.set?.(choice)
  } catch {
    /* not inside the Mac shell */
  }
}

/** System, Light or Dark, as one segmented control (Preferences › Appearance). */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE)

  useEffect(() => {
    try {
      setChoice(resolveThemeChoice(localStorage.getItem(THEME_STORAGE_KEY)))
    } catch {
      /* storage unreadable: the default stands */
    }
  }, [])

  return (
    <div role="group" aria-label="Theme" className="theme-segments">
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === choice}
          onClick={() => {
            applyThemeChoice(option)
            setChoice(option)
          }}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
