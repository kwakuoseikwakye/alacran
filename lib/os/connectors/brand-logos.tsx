import React from "react"
import { BRAND_ICONS } from "@/lib/brand-icons"

const BRAND_KEY_MAP: Record<string, string> = {
  "claude-code": "claude",
  "antigravity": "google-antigravity",
  "google": "google",
  "beeper": "beeper",
  "kiro": "kiro",
  "kimi": "kimi",
  "gmail": "gmail",
  "googlecalendar": "googlecalendar",
  "googledrive": "googledrive",
  "googlesheets": "googlesheets",
  "googledocs": "googledocs",
  "whatsapp": "whatsapp",
  "telegram": "telegram",
  "signal": "signal",
  "discord": "discord",
  "figma": "figma",
  "vercel": "vercel",
}

const LETTERMARK: Record<string, string> = {
  salesforce: "#00A1E0",
  ledger: "#4A6CF7",
  attio: "#4A6CF7",
  zernio: "#6E56CF",
  arcads: "#FF6A3D",
  fanbasis: "#22C55E",
  pava: "#A855F7",
  manychat: "#0084FF",
  beehiiv: "#FFC864",
  openai: "#10A37F",
  plaid: "#000000",
  onedrive: "#0078D4",
  outlook: "#0078D4",
  canva: "#00C4CC",
  gohighlevel: "#2A9D8F",
  postly: "#6E56CF",
  adsmith: "#FF6A3D",
  paykit: "#22C55E",
  trakyo: "#EAB308",
  webinarjam: "#2563EB",
  flexpay: "#A855F7",
  dmflow: "#0084FF",
  skool: "#E4573D",
  linear: "#5E6AD2",
  jira: "#0052CC",
  airtable: "#FCB400",
  anthropic: "#D97706",
  sentry: "#362D59",
  vercel: "#000000",
}

const HANDMADE: Record<string, { viewBox: string; node: React.ReactNode }> = {
  slack: {
    viewBox: "0 0 122.8 122.8",
    node: (
      <>
        <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A" />
        <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0" />
        <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D" />
        <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E" />
      </>
    ),
  },
  github: {
    viewBox: "0 0 24 24",
    node: (
      <path
        d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"
        fill="#fafafa"
      />
    ),
  },
  stripe: {
    viewBox: "0 0 24 24",
    node: (
      <path
        d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697.5 12.365.5 6.855.5 3.013 3.447 3.013 8.012c0 5.485 5.568 6.428 8.653 7.625 2.502.944 3.42 1.698 3.42 2.684 0 1.01-.87 1.542-2.343 1.542-2.52 0-5.32-1.157-7.23-2.224l-.895 5.617C6.46 24.305 9.475 25 12.723 25c5.787 0 9.756-2.766 9.756-7.514 0-5.46-5.466-6.623-8.503-7.836z"
        fill="#635BFF"
      />
    ),
  },
  notion: {
    viewBox: "0 0 24 24",
    node: (
      <path
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.466-.373-.84-.373-1.493-.326L2.827 2.621c-.42.047-.513.28-.373.42l2.005 1.167zm.933 3.687v12.27c0 .653.373.886 1.073.84l13.728-.793c.7-.047.886-.467.886-1.027V7.054c0-.56-.233-.84-.793-.793l-14.101.793c-.56.047-.793.327-.793.84zm11.76 1.867c.093.42 0 .84-.42.887l-.746.14c-.373.047-.513.187-.513.467v7.513c-.327.233-.7.373-1.166.373-.7 0-1.167-.28-1.727-.98l-4.153-6.44v6.253c0 .42.187.653.607.7l.606.093c.374.047.467.28.467.56 0 .28-.233.42-.653.42l-2.473.14c-.094-.42 0-.84.42-.887l.746-.14c.373-.047.513-.187.513-.467V11.23c0-.42-.187-.653-.607-.7l-.606-.093c-.374-.047-.467-.28-.467-.56 0-.28.233-.42.653-.42l2.613-.187 4.293 6.627v-5.694c0-.42-.187-.653-.607-.7l-.606-.093c-.374-.047-.467-.28-.467-.56 0-.28.233-.42.653-.42l2.333-.14c.374 0 .56.14.654.56z"
        fill="#fafafa"
      />
    ),
  },
  gbrain: {
    viewBox: "0 0 24 24",
    node: (
      <path
        d="M12 3c-1.8 0-3.3 1.1-4 2.7C7.4 5.3 6.7 5 6 5 4.3 5 3 6.3 3 8c0 .5.1 1 .4 1.4C2.5 10.1 2 11 2 12c0 1.2.7 2.2 1.7 2.7-.2.4-.3.9-.3 1.3 0 1.7 1.3 3 3 3 .4 0 .7-.1 1.1-.2.7 1.3 2 2.2 3.5 2.2h2c1.5 0 2.8-.9 3.5-2.2.4.1.7.2 1.1.2 1.7 0 3-1.3 3-3 0-.4-.1-.9-.3-1.3 1-.5 1.7-1.5 1.7-2.7 0-1-.5-1.9-1.4-2.6.3-.4.4-.9.4-1.4 0-1.7-1.3-3-3-3-.7 0-1.4.3-2 .7-.7-1.6-2.2-2.7-4-2.7h-1zm-.5 3h1c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2h-1c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2z"
        fill="#3df08c"
      />
    ),
  },
}

export function BrandLogo({
  slug,
  name,
  size = 40,
}: {
  slug: string
  name: string
  size?: number
}) {
  const radius = Math.round(size * 0.28)
  const glyph = Math.round(size * 0.56)

  const handmade = HANDMADE[slug]
  if (handmade) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <svg width={glyph} height={glyph} viewBox={handmade.viewBox} aria-hidden="true">
          {handmade.node}
        </svg>
      </span>
    )
  }

  const brandKey = (BRAND_KEY_MAP[slug] ?? slug) as keyof typeof BRAND_ICONS
  const brandIcon = (BRAND_ICONS[brandKey] as import("@/lib/brand-icons").BrandIconData | undefined)
  if (brandIcon) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: `color-mix(in srgb, ${brandIcon.hex} 16%, transparent)`,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden="true">
          <path d={brandIcon.path} fill={brandIcon.onDark} fillRule={brandIcon.fillRule} />
        </svg>
      </span>
    )
  }

  // lettermark
  const brand = LETTERMARK[slug] ?? "#3df08c"
  const initial = (name || slug).trim().charAt(0).toUpperCase() || "?"

  return (
    <span
      className="grid shrink-0 place-items-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `color-mix(in srgb, ${brand} 20%, transparent)`,
        color: brand,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
