import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

describe("assistant dock on a phone", () => {
  it("takes the full screen only while open, so a closed dock never covers the page or takes its taps", () => {
    const css = read("app/globals.css")
    const phone = css.slice(css.indexOf("@media (max-width: 640px) {\n  /* Same breakpoint the rail/subnav fold at."))
    const rule = phone.slice(0, phone.indexOf("\n}"))
    expect(rule).toContain('.os-dock[data-open="true"] { width: 100vw; }')
    expect(rule).not.toMatch(/\.os-dock\s*\{/)
    expect(read("components/os/assistant-dock.tsx")).toMatch(/className="os-dock" data-open=\{open\}/)
  })
})
