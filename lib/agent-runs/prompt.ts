
/**
 * What an unattended agent is told before its task.
 *
 * The three facts it cannot discover for itself: nobody is watching (so it
 * must not stop to ask), it cannot run commands, and it must not commit —
 * the app commits its work for a person to keep or throw away. The folder's
 * own AGENTS.md carries everything else, including the gate rules.
 */
export function buildRunPrompt(task: string, companyName: string): string {
  return [
    `You are working unattended on your own copy of ${companyName}'s company folder.`,
    "Nobody is watching this session, so don't stop to ask questions: make reasonable choices, and list what you assumed at the end.",
    "You can read, search and edit files here. You can't run shell commands, and you must not try to commit — when you finish, Alacrán saves your changes for a person to review, keep or discard.",
    "Follow AGENTS.md in this folder.",
    "",
    "The task:",
    task,
  ].join("\n")
}

/** What a finished run is told when a person sends it back. */
export function buildFeedbackPrompt(feedback: string): string {
  return [
    "A person reviewed what you did and is asking for changes. Make them in this same folder, then say what you changed.",
    "The same rules as before apply: no shell commands, don't commit.",
    "",
    "Their feedback:",
    feedback,
  ].join("\n")
}
