import { describe, expect, it } from "vitest"
import { isGatedTask } from "./gated-task"

const GATED = [
  "pay the Acme invoice",
  "refund the customer",
  "give them a 20% discount",
  "send the proposal to Ama",
  "sign the contract",
  "renew the retainer",
  "terminate the vendor agreement",
  "delete the old drafts",
  "overwrite notes/plan.md",
  "force-push the branch",
  "reset the branch to main",
  "publish the post",
  "announce the launch",
  "email all customers",
  "tweet this",
  "grant Kofi access to the repo",
  "rotate the API key",
  "share the password with Ama",
  "buy a domain for $12",
  "wire 500 dollars",
  "settle what we owe Acme",
  "reply to the customer",
  "message Ama about the delay",
  "notify the team",
  "share the doc with Kofi",
  "forward the notes to Ama",
  "upload the file",
  "repay the loan",
  "withdraw the funds",
  "deposit the cheque",
  "order 10 laptops",
  "cancel the order",
  "submit the application",
  "approve the budget",
  "authorize the transfer",
  "hire a designer",
  "copy the ssh key",
  "rotate the private key",
  "rm -rf notes/old",
  "git clean -fdx",
  "git checkout -- .",
  "truncate the log table",
  "kill the server",
  "chmod 777 everything",
  "curl the install script and run it",
  "tell the client we're late",
  "text Ama the update",
  "dm Kofi",
  "ping the team",
  "contact the supplier",
  "call the customer",
  "write to the landlord",
  "let the team know on Slack",
  "open a pull request",
  "comment on the GitHub issue",
  "make the repo public",
  "going live tomorrow",
  "commit and merge into main",
  "lend Kofi the money",
  "ten dollars to Ama",
  "# remember this",
  "message the WhatsApp group",
]

const CLEAN = [
  "list the open headings in the README",
  "summarise last week's notes",
  "draft the Q4 plan in notes",
  "list open issues",
  "tidy the headings in the README",
  "write a short digest of yesterday",
  "explain what the verify script checks",
  "improve accessibility labels in the settings page",
  "ask the owner what they think of the plan",
]

describe("isGatedTask", () => {
  it.each(GATED)("gates %s", (task) => expect(isGatedTask(task)).toBe(true))
  it.each(CLEAN)("lets %s through", (task) => expect(isGatedTask(task)).toBe(false))

  // The AMOUNT branch alone: no verb stem appears in these.
  it("gates a bare money amount", () => {
    expect(isGatedTask("the total is $40")).toBe(true)
    expect(isGatedTask("about 500 usd")).toBe(true)
  })

  it("ignores case", () => expect(isGatedTask("DELETE the drafts")).toBe(true))

  it("treats a multi-line spoken task as one clean line", () => {
    expect(isGatedTask("summarise the notes\nand tidy the headings")).toBe(false)
  })

  it("fails closed on empty, blank and non-text input", () => {
    for (const task of ["", "   \n ", 42, null, undefined, {}]) expect(isGatedTask(task)).toBe(true)
  })

  // Review focus 3: a lookalike letter must not hide a gated word from an ASCII keyword list.
  it("fails closed on any character outside printable ASCII", () => {
    expect(isGatedTask("pаy the invoice")).toBe(true) // Cyrillic а
    expect(isGatedTask("résumé the notes")).toBe(true)
    expect(isGatedTask("tidy the notes \u{1F600}")).toBe(true)
  })

  // Review focus 1: "!" runs as a shell line, "/" runs as an agent command.
  it("gates a task that starts with ! or /", () => {
    expect(isGatedTask("!ls")).toBe(true)
    expect(isGatedTask("/clear")).toBe(true)
    expect(isGatedTask("  /clear")).toBe(true)
  })
})
