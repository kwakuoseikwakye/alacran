/**
 * The six Google Cloud Console pages a user must visit before `gog` can read
 * their mail. Lives in a plain module, NOT in the client component that
 * renders it: v51 found that a Server Component importing a plain value from
 * a "use client" file silently gets `undefined`, and lib/setup-google-impl.ts
 * (server-side) now builds the browser agent's checklist from this same array.
 *
 * One source, two readers: the list the user is shown and the list the agent
 * is told to work through can never drift apart.
 */
/* Each link opens the exact console page for that step, pre-filled where
 *  Google allows it, so "go to the Cloud console and find X" is never an
 *  instruction. Enabling an API has a direct per-API URL; creating the OAuth
 *  client does not, hence the click path spelled out in `then`. */
export const GOOGLE_CONSOLE_STEPS: { title: string; href: string; then: string }[] = [
  {
    title: "Create a project",
    href: "https://console.cloud.google.com/projectcreate",
    then: "Give it any name — “My AI” is fine — and click Create. Wait for it to finish before the next step.",
  },
  {
    title: "Turn on Gmail",
    href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    then: "Click the blue Enable button. That is the whole step.",
  },
  {
    title: "Turn on Calendar",
    href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    then: "Click Enable here too.",
  },
  {
    title: "Say who can use it",
    href: "https://console.cloud.google.com/auth/overview",
    then: "Pick External, put your own email in the boxes it asks for, and save. This is just Google asking who owns the app — it stays private to you.",
  },
  {
    title: "Create the key and download it",
    href: "https://console.cloud.google.com/auth/clients",
    then: "Click Create client, choose Desktop app as the type, click Create, then Download JSON. It lands in your Downloads folder.",
  },
  {
    title: "Publish it (don't skip)",
    href: "https://console.cloud.google.com/auth/audience",
    then: "Click Publish app, then Confirm. Skip this and Google cuts the connection after 7 days. It does not submit anything for review.",
  },
]
