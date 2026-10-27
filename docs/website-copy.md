# Alacrán — Complete Website Content

Version: 1.1 · Prepared 9 October 2026 · Refined 10 October 2026 (hero, benefits, tour, catalogue) · Language: English

## Editorial and implementation notes — not website copy

This document supplies replacement copy for all 13 public pages identified in the current website index, plus shared navigation, footer, metadata, and reusable interface copy. It uses the founder-provided feature inventory as the product brief and the current website as the route and onboarding reference. Features have not been independently tested in the desktop app.

Text under **Website copy** is intended for publication. Metadata, placement directions, release checks, and this introduction are implementation guidance. Preserve the distinction in code. Do not display internal notes to visitors.

### Positioning

Alacrán is a local-first desktop workspace for running business operations with AI. Its value combines company knowledge, operational departments, reusable workflows, agent execution, and human review. Lead with useful work and visibility; explain architecture on the documentation page.

Primary audience: founders and business owners managing daily operations. Secondary audiences: operators managing several ventures or client workspaces, and technical users coordinating agents. Do not imply real-time team collaboration, shared cloud accounts, or role-based multi-user access: these were not established by the supplied inventory.

### Publication rules

- Use “Alacrán” in visible text and “Alacran” in existing filenames and download URLs.
- Use the supplied inventory for feature breadth, but check availability in the downloadable release before publication. Hide unsupported feature blocks rather than present planned work as available.
- Distinguish proposed file changes, externally executed actions, and natural-language agent instructions. Do not claim universal enforcement of all five approval categories without verified coverage.
- “Local-first” refers to company record storage. Connected AI, voice, and other services can process information externally.
- “Free” refers to the Alacrán app under the current offering. Connected providers may charge separately. Do not imply a lifetime pricing guarantee.
- Use real screenshots with sample records visibly labelled “Example company.” Prompts below are illustrative workflows, not testimonials or guaranteed results.
- Use connector status labels: **Built-in workflow**, **Connect through CLI/MCP/API**, **Requires setup**, **Beta**, or **Planned**, according to verified release status. A catalogue entry is not evidence of a tested end-to-end workflow.
- Preserve existing routes. Homepage Features and FAQ remain anchored sections, not invented standalone pages.
- Legal pages at the end are retained from the live site for completeness. They are not newly drafted legal advice or an approved policy update.

### Page inventory

| Page | Route | Main purpose |
|---|---|---|
| Home | `/` | Explain value and motivate a download |
| Get started | `/getting-started` | Guide installation and first saved result |
| How to use | `/how-to-use` | Explain recurring daily operation |
| Documentation | `/docs` | Explain architecture, control boundaries, and advanced features |
| Starter packs | `/templates` | Help visitors choose their initial workspace |
| Integrations | `/integrations` | Explain connection options and requirements |
| Use cases | `/use-cases` | Demonstrate realistic business workflows |
| Customers | `/departments/customers` | Explain prospect research and pipeline work |
| Finances | `/departments/finances` | Explain financial records and operational visibility |
| Content & social | `/departments/content` | Explain content creation, review, and tracking |
| Messages | `/departments/messages` | Explain message catch-up and reply preparation |
| Privacy | `/privacy` | Preserve current published policy |
| Terms | `/terms` | Preserve current published terms |

## Shared website content

### Main navigation

- Product → `/#features`
- Use cases → `/use-cases`
- Starter packs → `/templates`
- Integrations → `/integrations`
- Guides → menu containing Get started, How to use, Documentation
- Primary button: **Download Alacrán**

Download menu labels:

- **Mac — Apple Silicon** → `https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran-arm64.dmg`
- **Mac — Intel** → `https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran-x64.dmg`
- **Linux — Debian / Ubuntu** → `https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran.deb`
- Supporting link: **Read the setup guide** → `/getting-started`

### Shared footer

**Your business knowledge. Your AI. Your workspace.**

Alacrán brings business records, AI workflows, and human review together on your desktop.

**Product:** Features · Starter packs · Integrations · Use cases

**Departments:** Customers · Finances · Content & social · Messages

**Resources:** Get started · How to use · Documentation · GitHub

**Company:** Privacy · Terms · Contact

Contact: `mailto:contact@alacran.app`

GitHub: `https://github.com/kwakuoseikwakye/alacran-releases`

Free app for macOS and Linux. Connected AI and third-party services may have separate charges.

The footer also carries the three downloads (Mac Apple Silicon, Mac Intel, Linux Debian / Ubuntu) and **Read the setup guide**, always visible, so a visitor who scrolls past the call to action still has a way to start.

### Shared call to action

**Put your business knowledge to work.**

Create your company workspace, connect your AI, and prepare your first result for review.

**Download Alacrán** · **Read the setup guide**

### Reusable labels

- Product screenshot disclosure: **Example company · Sample data**
- Demo prompt label: **Try asking**
- Proposed output label: **Draft for review**
- File approval clarification: **Approving saves these changes to your company records. It does not send or publish the draft.**
- Freshness label: **Last updated: {date and time}**
- Missing data: **More information needed**
- Connection action: **View setup requirements**
- Video alternative: **Read the walkthrough**

---

## 01. Home

Route: `/`

SEO title: **Alacrán | The agentic business environment**

Meta description: **Alacrán, the agentic business environment. Bring company knowledge, departments, and AI agents into one workspace, run workflows, and review the results.**

### Website copy

#### Hero

Eyebrow: **The agentic business environment**

# Your business, organized. Your AI, put to work.

Bring your company knowledge, departments, and AI agents into one workspace. Run business workflows, review the results, and keep control of your records.

**Download Alacrán** · **See Alacrán in action** → `#tour`

Free for macOS and Linux. No Alacrán account required. Connected AI services may charge separately.

#### Product tour — `#tour`

## See the work move forward.

Follow one customer inquiry from the morning briefing to a follow-up draft, human review, and a saved company record.

Tour tabs and captions:

- **Morning briefing:** Start with what needs your attention. See the customer inquiry waiting for a response.
- **Customer follow-up:** Prepare a reply using the customer history and your saved business information.
- **Review:** Check the draft, ask for changes, and choose what to keep.
- **Company memory:** Keep the approved result in your company records for the next task.

Disclosure: **Example company · Sample data**

#### Why — `#why`

## Why people use it.

Most AI chats start from nothing, so you keep explaining your business to them. Alacrán keeps what your AI needs to know in one place, and keeps you in charge of what it changes.

### Stop retyping your business into every AI chat.

Describe your company once. Alacrán keeps it as plain files on your computer and hands it to your AI before each task.

### Stop hunting for the fact that changed.

Your facts, decisions and notes live together in one company folder. You can see what your AI always knows, and what it is unsure about.

### Stop wondering what your AI changed.

Every change your AI proposes comes back as a before-and-after for you to approve, send back with feedback, or discard. Nothing is saved until you say yes.

Link: **See how it works** → `#how`

#### Benefits — `#features`

## Know what needs you. Give AI the work it can help with.

### See what needs your attention.

Bring recent changes, pending work, and department activity into one briefing. Check what is current and what needs a refresh.

### Give AI your business context.

Keep business facts, working notes, and past decisions together so your connected AI can use them in the next task.

### Build a routine for recurring work.

Use built-in skills and recurring jobs for summaries, department updates, research, and reviews. See what is running and what is ready.

### Review changes before keeping them.

Inspect proposed file changes from managed workflows, request revisions, and approve the work you want to save.

#### Scenarios — `#scenarios`

## Four ordinary situations, and what Alacrán does with each.

Each one starts with a problem you will recognise, shows what you ask, shows what you get, and says how you stay in control. They use only what the app does today.

### 1. Monday morning, and you cannot tell what needs you.

Disclosure: **Example · illustrative scenario, not a customer result**

**The situation:** You open your laptop and cannot tell what moved while you were away, or what is waiting on you.

**You ask:** “What needs my attention this week, and what is waiting for my approval?”

**You get:** Home shows what needs you today, which agents are working, and what Alacrán knows about your company. Ask for a weekly summary and it is written from your own notes.

**You stay in control:** The summary arrives in Approvals as a draft to read. Nothing is saved until you approve it.

Link: **See the morning briefing** → `/how-to-use#start-with-the-morning-briefing`

### 2. A customer writes back and you do not want to start over.

Disclosure: **Example · illustrative scenario, not a customer result**

**The situation:** The owner of Northstar Café answers your quote with a question about delivery. You want a reply that matches what you actually offer, without pasting your whole business into a chat.

**You ask:** “Draft a follow-up to Northstar Café using our service description and their last question. Do not promise a date.”

**You get:** A draft written from your saved company profile and notes, with the change laid out for you to read.

**You stay in control:** You can approve it, choose Ask for changes, or choose Discard. Approving saves the draft to your company records and history. It does not send anything, so you send it yourself from your usual account.

Link: **See the Customers department** → `/departments/customers`

### 3. Your AI keeps using a fact that is no longer true.

Disclosure: **Example · illustrative scenario, not a customer result**

**The situation:** You changed what you charge in a meeting last week, but your AI is still working from the old price.

**You do:** Press “Save what we learned” at the end of a session with your AI, once you have settled something new.

**You get:** Proposed changes to your company facts, each marked with where it came from. Alacrán also shows which parts of your company profile look out of date, and the Brain map shows what your AI always knows and what it is unsure about.

**You stay in control:** You see which facts changed and where each one came from, and you approve them together with the note, or keep the note and drop the fact changes. Nothing is added to your company history until you approve.

Link: **Record the reason for a decision** → `/how-to-use#decisions`

### 4. You keep correcting the same thing.

Disclosure: **Example · illustrative scenario, not a customer result**

**The situation:** Every draft comes back a little too formal, and you keep asking for the same change.

**You do:** Press “Learn from my feedback” on Home. Alacrán offers it after you have asked for changes to the same kind of work three times.

**You get:** Short preference lines that quote your own words, kept in a plain file you can read.

**You stay in control:** You approve each line. Delete a line and it stops applying.

Link: **See how to ask for changes** → `/how-to-use#review-proposed-work`

#### Departments

## One workspace for the work around your business.

**Customers**

Research prospects, track opportunities, and prepare follow-ups with the customer context close at hand.

Link: **Explore customer workflows** → `/departments/customers`

**Finances**

Bring income, expenses, and cash information into a working view of your business. Review trends and investigate potential savings.

Link: **Explore finances** → `/departments/finances`

**Content & social**

Develop ideas, prepare drafts in your business voice, and track content through review and publication status.

Link: **Explore content workflows** → `/departments/content`

**Messages**

Catch up on connected conversations, identify inquiries needing attention, and prepare replies for review.

Link: **Explore messages** → `/departments/messages`

#### How it works

## Describe your business. Choose a task. Review the result.

**1. Create your workspace.**

Start with a company name and a few facts about what you do. Choose a starter pack that fits your work.

**2. Connect your AI and tools.**

Select a supported agent and connect the services relevant to your first workflow.

**3. Put a workflow to work.**

Ask for a briefing, a customer follow-up, a content draft, or an update to your company records.

**4. Review and keep what is useful.**

Check proposed changes, ask for revisions, and save approved results into your company’s history.

Link: **See the full setup guide** → `/getting-started`

#### Multiple companies

## Several businesses. A clear workspace for each.

Keep each venture or client workspace organized with its own records, context, and agent selection. Switch between companies without rebuilding your setup.

With Company Strings, select eligible knowledge to share between workspaces and review the scope before creating a connection. Use cross-company questions to bring permitted context into a broader view.

Link: **See multi-company examples** → `/use-cases#multiple-companies`

#### Ownership

## Company knowledge you can keep.

Your company records live as readable files on your computer. Open them in another editor, keep your own backups, and retain them if you stop using Alacrán.

Connected AI and voice services may process information externally when you use them. Choose your providers and connections with that in mind.

Link: **Understand storage and connections** → `/docs#data-and-connections`

#### Flexible agents

## Choose the AI that works for you.

Use a supported agent such as Claude Code, Google Antigravity, Kiro, Kimi, or Codex. Choose an agent for each company while keeping its underlying business records in place.

Link: **Explore supported connections** → `/integrations`

#### FAQ — `#faq`

**What is Alacrán?**

Alacrán is a local-first desktop workspace for managing business information and working with AI agents. It brings company knowledge, operational departments, repeatable workflows, and review tools into one app.

**Who is it for?**

Founders and business owners who want help organizing and progressing daily work. It also includes advanced tools for operators and developers managing agents, skills, and custom workflows.

**Is it free?**

The app is currently free to download and use. Your AI provider and connected services may charge separately.

**Do I need to be technical?**

The main workspace uses guided screens and business-focused tools. Some installation steps, provider connections, and advanced workflows may need technical setup. The setup guide explains the current requirements.

**Does everything stay on my computer?**

Company records are stored locally. Relevant information may be sent to connected AI, voice, and other services when you use them. Optional backups also transfer files to your chosen destination.

**Does Alacrán send messages or publish posts automatically?**

Not unless you set it up. Everything starts as a draft for your review. If you create an unattended job, it can send only a message you approved once, within the limits you set: how often, how many, and who never to contact. Change the message and sending stops until you approve it again. Approving a local draft does not itself mean it has been sent.

**Can I use more than one business?**

Yes. Each company has its own workspace and records. You can deliberately share eligible context through Company Strings.

**Which computers are supported?**

macOS and Debian or Ubuntu Linux. A Windows version is not currently offered.

**What happens if I stop using Alacrán?**

Your company files remain yours. Keep a backup and continue using the readable files in other tools.

#### Final call to action

## Give your next business task a better starting point.

Create a workspace that brings your company knowledge and AI work together.

**Download Alacrán** · **Read the setup guide**

### Implementation notes

Use an actual app recording or screenshots in the tour. Do not invent time savings, customer counts, ratings, or testimonials. The current release must support any screenshot workflow shown. Keep provider status badges current; Codex was labelled beta on the inspected homepage.

---

## 02. Get started

Route: `/getting-started`

SEO title: **Get started with Alacrán | Your first company workspace**

Meta description: **Install Alacrán, connect your AI, describe your business, and review your first draft. A practical guide to setting up your company workspace.**

### Website copy

# From download to your first useful result.

Set up Alacrán, describe your business, and prepare your first draft for review. Start with one company and one task. You can add more tools and workflows later.

**Download Alacrán**

## Before you start

**A Mac, or a Debian or Ubuntu computer.** On a Mac, choose the download that matches your Mac’s chip. Step 1 shows how to check.

**Git.** Alacrán keeps every company as a Git history, so Git has to be installed. The checklist you see on first launch tells you if it is missing.

**An AI account for AI tasks.** Claude Code is the default, and it needs a paid Claude plan to sign in. If you already have Kiro, Kimi, Codex or Google Antigravity, you can choose that for each company instead. Alacrán is free; your AI provider’s subscription, usage limits and charges are separate. No AI yet? Choose **Explore without AI** and add your records first.

**A short description of your business.** A sentence or two is enough to begin. You can improve the details as you work.

## 1. Install and open Alacrán.

Pick the instructions for your computer. You do not need an Alacrán account to create your local workspace.

**On a Mac:** Follow these five things in order.

1. Find your chip. Click the Apple menu, then **About This Mac**. If it says “Chip: Apple M1” (or M2, M3, M4), you have Apple Silicon. If it says “Processor: Intel”, you have Intel.
2. Download the matching file with **Download Alacrán**: Mac Apple Silicon or Mac Intel.
3. Open the downloaded `.dmg` and drag Alacrán into Applications.
4. Open Terminal (press Cmd+Space, type Terminal, press Return). Paste the line below and press Return. Command: `xattr -cr "/Applications/Alacran.app"`
5. Open Alacrán from your Applications folder.

**Why this step exists:** Apple has not notarized Alacrán, because that needs a paid Apple Developer account. Until you run the line above once, macOS may say “Alacrán is damaged and can’t be opened”. It is not damaged. The command clears the flag your browser attached to this one download, so macOS lets the app open. Right-click and Open is not enough on its own. Use it only on the app you downloaded from this site or the official releases page. Updates inside the app do not need it again.

**On Debian or Ubuntu:** Open Terminal, go to the folder where you saved the download (usually Downloads), and run the line below. Use it only on the file you downloaded from this site or the official releases page. Then open Alacrán from your applications menu.

Command: `sudo apt install ./Alacran.deb`

**You will see:** Alacrán opens on a “Welcome to Alacrán” screen with a short checklist. It checks that you have Git and one AI tool, which the next steps cover.

## 2. Choose your starting goal.

You do not need to know your whole plan yet. Choose the work you want help with: running your business, building software, winning customers, or growing your audience. Read the trust information so you understand local storage, provider access, and review expectations.

Your starting goal helps shape the workspace. It does not lock you into one way of working.

**You will see:** A screen that asks “What should Alacrán help you accomplish?” with four choices, then a screen headed “You stay in control”.

## 3. Connect your AI.

Alacrán needs an AI to do the writing, and you sign in to it yourself with your own account. Follow the AI setup screen to install and sign in to the supported agent. Return to Alacrán and use **Re-check** to confirm the connection.

You can choose **Explore without AI** if you want to look around and add records first. Connect an agent when you are ready for AI-generated work.

**You will see:** A screen headed “Connect the AI that does the work”. Claude Code is listed as missing or not connected until you install it and sign in. Press **Re-check** when you come back.

## 4. Create your company.

Give the workspace a name and choose an appropriate starter pack. Alacrán creates a company folder for its facts, notes, decisions, and operational records.

If you already have a suitable project folder or backup, use the available import or restore option. Existing folders may follow a different onboarding path.

**You will see:** A list headed “What gets created”, and a form to name your company on the **New Company** tab.

## 5. Describe how your business works.

Your AI is only as useful as what it knows about you, so answer the guided questions:

- What does your business do, and who does it serve?
- Who is involved: customers, team members, partners, or suppliers?
- How does work move from a request to a finished result?
- What takes up the most time today?

Keep unknown details visibly incomplete rather than filling them with assumptions.

On **Check & save**, choose **Let Alacrán write it up** to prepare a draft for approval, or **Save my answers as they are** to keep your own wording.

**You will see:** Four short screens (What you do, Who’s involved, How work flows, What’s hardest), then **Check & save** with those two buttons.

## 6. Review your first draft.

Nothing is saved until you say so. Open **Approvals** and inspect the proposed company information. Choose **Review & approve**, **Ask for changes**, or **Discard**.

Your company profile influences later tasks, so check its facts carefully. Some previews currently show structured text such as `name: value` rather than a formatted summary.

**You will see:** Approvals reads your draft back in plain sentences and marks it “High risk”. That only means everything Alacrán does later builds on your company profile, so it deserves a careful read. It does not mean anything is wrong. After you approve, a line reads “Saved. Alacrán keeps it in your company’s files.”

## 7. Ask a useful first question.

Open the assistant and ask:

> Based on the information I have saved, what needs my attention and what information is still missing?

For a follow-up task, try:

> Draft a short introduction to my business using the company profile. Mark anything that needs my confirmation.

Review the result before using it outside the workspace.

**You will see:** An answer written from the company profile you just saved. Anything it could not find should be listed as missing, so you know what to add next.

## If something needs attention

**The agent is installed but not connected.** Complete its sign-in, check provider access, and run **Re-check** again.

**A job finishes without a result.** Check the run status and provider usage limits. Review the reported error before retrying.

**A connection is missing.** Open Connections or System Doctor to inspect requirements and suggested fixes.

**The app looks too technical.** Keep Advanced mode off while you learn the main workflows. Some current setup and review screens may still expose technical details.

**I closed the window, but work is continuing.** Closing the window can leave Alacrán running in the background. Use **Quit** when you want to stop the application.

## Choose your next step.

**Learn a daily routine** → `/how-to-use`

**Choose a starter pack** → `/templates`

**Connect a service** → `/integrations`

### Release checks

Confirm the minimum macOS version <<TODO>> and exact onboarding labels against the shipped build. The version is deliberately left out of the published copy because nothing in the repository states it. Link installation troubleshooting to official release instructions. Do not state that every blocked download is safe or encourage indiscriminate removal of operating-system security protections. Do not promise a setup time until measured.

---

## 03. How to use

Route: `/how-to-use`

SEO title: **How to use Alacrán | A daily AI business workflow**

Meta description: **Use Alacrán for briefings, department updates, AI tasks, approvals, and company knowledge. Build a repeatable routine around your business.**

### Website copy

# A clearer routine for running your business with AI.

Start with your priorities. Give your AI a specific task. Review the result, update your records, and keep the reasoning for next time.

New to the app? **Start with installation** → `/getting-started`

## Start with the morning briefing.

You open the app and do not know where to look first. Open your company workspace to see recent activity and work needing attention. Check when each department was last updated before treating its figures as current.

Try asking:

> Summarize recent activity, work waiting for review, and the three issues I should investigate first. Identify missing or outdated information.

## Choose a department and a concrete task.

A vague request gets a vague answer. In Customers, review the opportunities that need follow-up. In Finances, inspect the latest recorded income and expenses. In Content, move an idea into a draft. In Messages, work through inquiries that need a response.

A clear task gives the agent a useful target:

> Draft a follow-up for this prospect using our recorded conversation and approved service description. Do not invent a price or promise a delivery date.

## Review proposed work.

AI work you cannot check is work you cannot trust. Read the result and inspect any proposed file changes. Use the risk indicator to help prioritize review, then approve, request changes, or discard the proposal.

A revision can be specific:

> Keep the introduction. Shorten the proposal, remove the unconfirmed deadline, and ask one clear question at the end.

Saving a draft and sending it are separate steps. Check the workflow before taking an external action.

## Keep your company knowledge useful. {#template}

Your AI works from what it has been told, so out-of-date facts make out-of-date drafts. Maintain the company profile as your products, customers, team, and operating rules change. The quality of later work depends on the information available to it.

## Record why a decision was made. {#decisions}

Months later, nobody remembers why you chose it. Save the choice, the alternatives considered, and the reason behind it. Include what new information would justify revisiting it.

Try asking:

> Prepare a decision note from this discussion. Separate the decision, the supporting evidence, and the assumptions we still need to test.

## Maintain operational records. {#records}

Summaries are only as good as the records behind them. Review department updates against their source information. Keep customer stages, content status, and financial entries current so later summaries reflect the business as it is.

## Turn useful tasks into repeatable workflows.

If you do the same task every week, you should not have to set it up every week. Once a task produces a useful result, reuse an appropriate skill or configure a recurring job. Monitor the run status and review its output.

Local background work depends on the app, computer, and required connections being available. Closing the window can leave work running; quitting the app stops its local processes.

## Use the assistant your way. {#assistant}

Some people would rather type and some would rather talk. Type a request or use supported voice input. Choose your assistant’s language, tone, and voice settings. Voice processing depends on the selected provider and configuration.

For technical work, Advanced mode exposes terminals, agent workspaces, skills, and connection configuration.

## Switch companies deliberately.

If you run more than one business, one mixed-up workspace gets confusing fast. Keep each business in its own workspace. Before sharing context through Company Strings, inspect what will become available to the other workspace. Cross-company questions should use only the scope you intend.

## Check the system when something looks wrong.

When something looks off, you should not have to guess why. Use System Doctor to inspect company files, record validation, repository status, and connector readiness. Review suggested repairs before applying them.

**Find a workflow to try** → `/use-cases`

### Implementation notes

Use explicit HTML anchor IDs `template`, `decisions`, `records`, and `assistant`; the anchor notation above is a content annotation, not visible copy. Retain these existing deep-link destinations. Do not promise that all background jobs run concurrently; concurrency depends on the actual job scheduler.

---

## 04. Documentation

Route: `/docs`

SEO title: **Alacrán documentation | Memory, agents, and business workflows**

Meta description: **Understand Alacrán’s local files, company workspaces, agent execution, review controls, skills, integrations, and operational diagnostics.**

### Website copy

# How Alacrán brings company knowledge and AI work together.

Alacrán combines a local company record system with operational screens and tools for running and reviewing agent work. The desktop workspace gives those parts a shared place to operate.

## The company folder

Each company has a folder containing readable business information and operational records.

| Location | Purpose |
|---|---|
| `definitions/` | Company facts, structure, and operating definitions |
| `notes/` | Working notes, summaries, research, and session material |
| `docs/decisions/` | Decisions and the reasoning behind them |
| `records/` | Structured records used by departments and workflows |
| `AGENTS.md` | Instructions and working rules for agents in the company folder |

Markdown supports readable documents. YAML supports structured records. Version history helps inspect changes and recover earlier recorded states. Local version history is not a substitute for a separate backup.

## Company memory and knowledge lifecycle

The company profile provides a shared reference for business facts. Notes and records add operational context. Decision logs preserve why a choice was made.

The knowledge graph helps explore relationships between entities, files, facts, and decisions. Lifecycle states distinguish draft, proposed, active, and deprecated knowledge. A graph view helps navigate information; it does not certify that the information is complete or correct.

## Departments and structured records

Department screens bring together metrics, records, connection status, and relevant agent actions. Record schemas help validate the structure of saved data. Custom departments can define additional records and workflows for specialized operations.

Validation can detect malformed data. It cannot establish that a customer statement, financial entry, or AI conclusion is true.

## Agent execution

Choose a supported executor globally or for a company. Alacrán supplies company context and interfaces for tasks, run visibility, and review.

Advanced workspaces include embedded terminals and multiple terminal views. Managed agent commands can use isolated Git worktrees to separate proposed work from the main working tree. Session notes help preserve useful context from completed work.

Worktree isolation separates file changes; it is not, by itself, a security sandbox for network access, credentials, or external services.

## Review and control boundaries

Alacrán combines several kinds of control:

- Proposed file changes from managed workflows can be reviewed before they are kept.
- Risk labels help identify work that needs closer attention.
- Revision requests send feedback back into the workflow.
- Read-only connections limit what those particular integrations can do.
- Agent instructions require human involvement for consequential actions.

The five action categories are money, contracts and commitments, irreversible operations, publication, and credentials or access changes.

A written instruction is different from a permission enforced by software. Effective protection depends on the workflow, executor permissions, connector capabilities, and the controls applied to that execution path. Review these boundaries before connecting tools with write access.

Approving a file change does not approve every possible external action described in that file.

## Multiple companies and Company Strings

Each company maintains its own workspace and records. Company Strings offers deliberate sharing of selected eligible context between workspaces, with a scope review before linking.

The sharing interface excludes categories such as private notes, raw chats, financial ledgers, customer records, and credentials from that sharing path. Check the preview before confirming a link.

Severing a link removes the ongoing sharing relationship. It does not retract information already used in a result, copied elsewhere, or sent to an external provider.

## Skills and recurring workflows

Skills package reusable instructions for particular tasks. Built-in commands cover company definition, briefings, decisions, retrospectives, department synchronization, message triage, and engineering work.

The skills editor supports adapting and versioning these instructions. Workflow maps show the structure of operational processes, while execution records help track runs.

Scheduled work requires the local application and relevant dependencies to remain available. Use the visible run status to distinguish a completed job from a missed or failed run.

## Data and connections {#data-and-connections}

Company records are stored on your computer. AI execution can send prompts and relevant context to the selected provider. Voice features may send audio to a speech service. Connected tools exchange information with the services you enable. Optional GitHub backup transfers files to your configured repository.

Local storage does not imply fully offline operation or that every answer is produced locally. Some direct factual lookups may be resolved from saved records; generative work depends on the configured agent.

## Diagnostics and maintenance

System Doctor checks repository condition, expected folders, dependencies, connector readiness, and record structure. Suggested repair actions help address detected problems.

The application supports background persistence and launch-at-login settings. Closing a window can leave jobs running. Use Quit to stop the app.

The documented update mechanism verifies signed release artifacts before installation. This verification is distinct from Apple notarization of a Mac application.

## Working with the company folder from an agent

Read the company’s `AGENTS.md` before changing its files. Consult `definitions/ontology/company.yaml` for company facts, then relevant decisions, notes, and records. Leave unknown facts explicitly unresolved and follow the workflow’s review requirements.

## How does this compare with a notes app and an agent harness?

Those tools can form a flexible foundation for an AI workspace. Alacrán brings operational departments, company setup, agent work, review screens, and diagnostics into an integrated business application. The practical value is the amount of configuration and maintenance it handles for a repeatable business workflow.

**Set up a company** → `/getting-started` · **Explore connections** → `/integrations`

### Release checks

Verify which commands use worktrees, which changes are staged for review, and which execution paths bypass managed reviews. Confirm Company Strings exclusions across both direct and derived context, including cross-company questions. Confirm update-signature implementation before publishing that claim. Add explicit `data-and-connections` anchor.

---

## 05. Starter packs

Route: `/templates`

SEO title: **Alacrán starter packs | Start with the work you do**

Meta description: **Choose a starting workspace for general business operations, engineering, marketing, sales, support, people operations, or leadership.**

### Website copy

# Start with the work you do.

Choose a starter pack that matches your first goal. Give your workspace a useful starting structure, then adapt its company knowledge, skills, and records as your business develops.

**Download Alacrán** · **Read the setup guide**

## General business

**Bring everyday operations into one place.**

Start with your company facts, priorities, decisions, and working records. A useful starting point when your responsibilities span several departments.

First task to try: “Summarize our current priorities and identify the information missing from our company profile.”

## Software engineering

**Build with the business context close at hand.**

Organize product decisions and engineering work around the company’s goals. Use relevant skills for planning, reviews, testing, and release preparation.

First task to try: “Prepare an implementation plan for this feature using our recorded requirements and architectural decisions.”

## Marketing

**Connect your message to your business.**

Start from your audience, offer, and brand voice. Develop campaign ideas and content drafts with a clearer basis for review.

First task to try: “Draft three content ideas for this audience using our approved positioning.”

## Sales

**Keep customer context with the next action.**

Organize prospect research, pipeline information, and outreach preparation around what your business actually offers.

First task to try: “Review these prospects and prepare an outreach angle for each. Flag information we still need to verify.”

## Customer support

**Prepare responses from the information you trust.**

Bring product knowledge, customer issues, and response guidance into a workspace for preparing support work.

First task to try: “Draft a response to this inquiry using our documented policy. Identify anything that needs a person’s decision.”

## HR & People

**Keep people processes easier to follow.**

Organize role descriptions, onboarding guidance, and internal process documentation. Choose carefully which information is provided to connected services.

First task to try: “Draft an onboarding checklist from our existing process documents and mark the missing steps.”

## Leadership

**Keep priorities and decisions connected.**

Bring strategic goals, milestones, decision notes, and retrospectives into a workspace for reviewing progress and preparing the next discussion.

First task to try: “Prepare a weekly review of our recorded goals, recent decisions, and unresolved questions.”

## A starting structure you can change.

A starter pack helps organize the workspace. It does not create a staffed department or make decisions on your behalf. Your business facts, connected tools, and review process shape the work it produces.

You can edit skills, add records, and configure custom departments as your needs grow.

**Create your first company workspace** → `/getting-started`

### Release checks

The previous site index described seven packs; the supplied inventory names six specialized packs. Confirm that General is a selectable pack. If General is only the default setup, label it “General business setup” rather than inventing a seventh selectable pack. Example tasks describe intended uses, not guaranteed pack contents. Match displayed pack names to the app.

---

## 06. Integrations

Route: `/integrations`

SEO title: **Alacrán integrations | Connect your AI and business tools**

Meta description: **Connect supported AI agents and business services to Alacrán. Understand workflow support, setup requirements, permissions, and provider costs.**

### Website copy

# Bring your tools into the context of your business.

Connect the AI that does the work and the services that hold relevant information. Start with the connections your first workflow needs, then expand deliberately.

**See the setup guide** → `/getting-started`

## Choose your AI executor.

Alacrán organizes your business; the AI you choose does the writing. Supported executor options include Claude Code, Google Antigravity, Kiro, Kimi, and Codex. Availability and setup requirements vary by release and provider.

Choose an executor for each company while keeping its underlying business records in the same workspace. Provider subscriptions and usage limits apply separately.

## Connect the information behind your work.

Useful answers need information that sits in other tools.

**Communication and inboxes**

Bring supported messaging and email information into catch-up and reply-preparation workflows. Beeper provides access to supported networks connected to your Beeper account; other tools may use separate connections.

**Productivity and knowledge**

Connect supported document, calendar, planning, and knowledge tools so relevant information can support company work.

**Customers and support**

Configure supported CRM and support services alongside your local customer records. Confirm the fields and actions available in the particular connection.

**Finance**

Use supported payment information, imports, and finance connections to support operational reporting. Available data and actions depend on the integration.

**Marketing and creative work**

Connect supported content, newsletter, analytics, and creative services. Check whether a connection prepares work, reads status, or supports external actions.

**Development and automation**

Configure supported source-control tools, development services, and automation platforms for technical workflows.

## Connection catalogue

Browse the tools listed in the connection catalogue. Inclusion does not imply a ready-made workflow; confirm setup requirements and available actions before relying on a connection.

| Category | Catalogue entries |
|---|---|
| Communication | Beeper, Slack, WhatsApp, Discord, Telegram, Zoom, ManyChat |
| Productivity | Google Workspace, Outlook, Notion, Airtable, ClickUp, Trello, Coda |
| CRM and support | Attio, HubSpot, Salesforce, GoHighLevel, Zendesk, Intercom |
| Development | GitHub, Vercel, Jira, GitLab |
| Scheduling | Calendly, Cal.com |
| Finance | Stripe, freee, QuickBooks, Xero, PayPal, Wise, Plaid |
| Marketing | beehiiv, Meta Ads, Mailchimp, Google Analytics, Buffer, Hootsuite, Zernio, WebinarJam, Trakyo |
| Storage | Dropbox, Box, OneDrive |
| Knowledge | G-Brain, Notes Vault / Obsidian |
| AI and automation | Claude Code, Google Antigravity, Kiro, Kimi, Codex, Anthropic API, OpenAI API, Zapier, Make, n8n |
| Creative and collaboration | Figma, Canva, Lovable, DocuSign, Miro, Arcads, Loom, Typeform |

Catalogue availability does not mean every tool has a built-in department workflow. Review each connection’s status before relying on it.

Disclosure: **Logos belong to their owners and appear only to name the tool. Their use does not imply endorsement or partnership. Not every tool shows a logo.**

## Know what a connection can do.

Connecting a tool is a decision about what it can see and change. Before connecting a service, check the required account, the information it can read, whether it can change external data, and any provider charges.

The standard inbox and chat catch-up workflows are read-only. Other configured tools can have different permissions. A prepared draft is not a sent message or a published post.

## Voice that fits your setup.

If you would rather speak than type, voice is optional. Voice options include browser speech capabilities, Deepgram, and ElevenLabs configurations. Availability depends on your device, provider access, and settings. Review microphone permissions and data handling when enabling voice features.

## For advanced users

Configure supported CLI, API, and MCP connections through the advanced tools. Inspect the setup and permissions for each service. System Doctor can help identify missing dependencies or connection problems.

## Questions about connections

**Do I need to connect everything?**

No. Start with your company records and one useful task. Add services only when they improve that workflow.

**Does Alacrán include subscriptions to these tools?**

No. Your provider accounts, subscriptions, and usage charges remain separate.

**Is a listed tool ready to use immediately?**

Not necessarily. Some tools require installation, authorization, credentials, an MCP server, or additional configuration.

**Can I bring an existing Obsidian knowledge base?**

The catalogue includes a Notes Vault / Obsidian connection option. Check its supported scope and setup before connecting an existing vault.

**Understand connection boundaries** → `/docs#data-and-connections`

### Implementation notes

Every catalogue card needs a verified status, setup link, authentication requirement, read/write scope, and workflow description. Do not publish “46+ integrations” as a readiness claim. Keep voice providers distinct from AI executors. Do not suggest third-party logos imply endorsement. Do not create nonexistent setup routes; use expandable setup details until real guides exist.

---

## 07. Use cases

Route: `/use-cases`

SEO title: **Alacrán use cases | Practical AI workflows for your business**

Meta description: **Explore business workflows for briefings, follow-ups, content, financial reviews, multiple ventures, and software work with Alacrán.**

### Website copy

# Start with one task you already need to do.

Alacrán becomes useful when company knowledge supports real work. These examples show how to move from a business question to an output you can review.

Most people stall because they do not know what to ask first. Each example starts with a situation you will recognise, shows what you ask, and ends with something you review before anything is kept.

The examples below use illustrative scenarios, not customer results.

## Prepare for the week.

**The situation:** Updates are scattered across department records, notes, and connected conversations.

**Try asking:** “Prepare a weekly briefing from our saved records. Show recent changes, unresolved questions, and items needing my attention. Identify outdated sources.”

**Review:** A briefing you can check against the available records before deciding your priorities.

## Follow up with a prospect.

**The situation:** You need to continue a customer conversation without repeating research or losing its context.

**Try asking:** “Draft a follow-up for this prospect using our conversation notes and service description. Ask about the unresolved requirement and avoid unconfirmed commitments.”

**Review:** A message draft alongside relevant customer information. Send it through your usual account after checking it.

Link: **Explore Customers** → `/departments/customers`

## Turn business knowledge into content.

**The situation:** You have useful expertise but keep starting each post from scratch.

**Try asking:** “Prepare three post drafts about our service for this audience. Use our brand voice and flag any claim that needs evidence.”

**Review:** Drafts you can revise and move through your content pipeline. Record publication status after posting.

Link: **Explore Content & social** → `/departments/content`

## Review operating costs.

**The situation:** You want a clearer view of recurring expenses and areas worth investigating.

**Try asking:** “Review these recorded expenses. Identify possible duplication or unusual changes and explain what I should verify before taking action.”

**Review:** Findings and possible savings based on the supplied records. Confirm them against your financial sources before acting.

Link: **Explore Finances** → `/departments/finances`

## Find messages that need a response.

**The situation:** Customer inquiries are spread across connected inboxes and chats.

**Try asking:** “Identify inquiries that appear to need a reply. Prepare response drafts from our documented information and flag uncertain details.”

**Review:** A prioritized queue and proposed responses. Copy and send the approved wording through your usual service.

Link: **Explore Messages** → `/departments/messages`

## Keep several ventures organized. {#multiple-companies}

**The situation:** You manage several businesses and need separation without losing useful shared knowledge.

Create a workspace for each business. Use Company Strings to share only eligible, intentionally selected context, such as approved operating guidance. Keep customer and financial records within their appropriate workspaces.

**Try asking:** “Across the company workspaces included in this request, summarize the recorded priorities and decisions awaiting attention.”

**Review:** A cross-company summary whose scope and source information you check before sharing further.

## Build software with the business context available.

**The situation:** Technical work needs to reflect product decisions and company priorities.

**Try asking:** “Prepare a plan for this feature using our requirements and previous decisions. Identify assumptions, proposed changes, and how the result should be verified.”

**Review:** A plan and, where requested, managed agent work that can be inspected through the execution and review tools.

## Preserve the reason behind a decision.

**The situation:** A choice was made, but its reasoning will be hard to recover later.

**Try asking:** “Prepare a decision note that records the choice, alternatives, supporting evidence, and conditions for revisiting it.”

**Review:** A durable note that helps future work start with the original reasoning.

## Choose your first workflow.

Pick a task you repeat, provide the relevant information, and review the result. Improve that workflow before connecting more tools or automating a larger process.

**Get started** → `/getting-started` · **Browse starter packs** → `/templates`

---

## 08. Customers

Route: `/departments/customers`

SEO title: **Alacrán Customers | Prospect research and sales follow-ups**

Meta description: **Organize prospects, pipeline stages, and customer context. Use AI to prepare research and follow-up drafts you can review in Alacrán.**

### Website copy

Eyebrow: **Departments / Customers**

# Keep customer context with the next action.

Research prospects, track opportunities, and prepare follow-ups from what your business already knows. Keep the customer record and the proposed next step in the same workspace.

**Why you need this:** Without it, who said what lives in your inbox, your notes and your memory, and every follow-up starts with digging. Here the customer record and the proposed next step sit together, so your AI drafts from what is already saved instead of from a blank chat.

**Download Alacrán** · **See customer workflow examples** → `/use-cases`

## See where each opportunity stands.

It is easy to lose track of which prospects are waiting on you and which have gone quiet. Track prospects through Discovery, Evaluation, Proposal, and Won or Lost. Review recorded deal values, contact history, and the opportunities that need attention.

## Research with a relevant offer in mind.

Researching every prospect by hand takes time, and a message that does not match what you offer is easy to dismiss. Give your AI a prospect, a set of websites, or a description of the customers you want to reach. Use your company profile to prepare relevant research and an outreach angle for review.

## Prepare a follow-up with the history available.

Before you write to a customer you have to remember what was said last time. Use saved notes and approved business information to draft the next message. Check the details and commitments before contacting the customer.

## Keep the record useful for next time.

A record nobody updates stops being useful, so each conversation starts cold. Log contact activity and update the lead stage as the conversation develops. Add records manually or review proposed updates from managed workflows. Export leads when you need them elsewhere.

## A practical workflow

A set order of steps keeps follow-ups from depending on memory.

1. Add or select a prospect.
2. Review the available context and request research or a draft.
3. Correct assumptions and approve useful record changes.
4. Send the message from your usual account.
5. Record what happened and the next step.

Try asking:

> Review this prospect against our service description. Draft a short follow-up that addresses their last question and flag anything we have not confirmed.

## Questions

**Does this automatically send outreach?**

The standard workflow prepares outreach for review and manual sending. Saving a draft does not contact the prospect.

**Where do customer records live?**

In the company’s local files. Connected AI may process relevant context when you request AI work.

**Does it replace my existing CRM?**

It can provide a local working view of customer activity. If you already use a CRM, inspect the relevant connection and supported synchronization before deciding how to divide responsibilities.

**Will it prevent every duplicate or mistaken follow-up?**

Contact history helps you make informed decisions. Keep it current and review the recipient and conversation before sending.

**Explore Finances** → `/departments/finances` · **Explore Messages** → `/departments/messages`

---

## 09. Finances

Route: `/departments/finances`

SEO title: **Alacrán Finances | A clearer view of business income and costs**

Meta description: **Review recorded revenue, expenses, cash, and runway in Alacrán. Import financial information and investigate potential savings with AI assistance.**

### Website copy

Eyebrow: **Departments / Finances**

# See the numbers behind your next decision.

Bring income, expenses, and cash information into a working view of your business. Track changes, investigate costs, and prepare questions for a more informed financial review.

**Why you need this:** Without it, your income, expenses and cash sit in separate places, and every question to your AI means pasting numbers in again. Here the records you keep are the ones your AI reads, and by default what it proposes waits for your approval.

**Download Alacrán** · **Explore financial review examples** → `/use-cases`

## Bring the records together.

Your numbers are probably spread across statements, payment tools and spreadsheets. Add income and expenses, import supported statement files, or use available payment-data connections. Check imported information against its source before relying on the totals.

## Understand the recorded trend.

One month’s figure rarely tells you whether things are getting better or worse. Review revenue, spending, and cash figures over time. Where the necessary information is available, use burn and runway estimates to explore the current position.

Estimates depend on the completeness of your records and their assumptions. They are not a forecast of guaranteed future results.

## Investigate potential savings.

Costs creep up quietly, and nobody has time to read every line. Ask your AI to examine the information you provide for possible duplication, changing costs, or spending worth reviewing. Inspect each recommendation before changing a subscription or business commitment.

## Review financial changes carefully.

A wrong number that slips into your records is hard to spot later. Check proposed updates against the original records. Keep a history of approved changes so you can trace how the working view developed.

Try asking:

> Review this month’s recorded expenses against last month. Explain the largest changes and list the source records and questions I should check.

## Questions

**Does Alacrán pay bills or move money?**

The finance workflow described here organizes information and prepares analysis. It does not execute payments.

**Is this my accounting system?**

Use it as an operational view alongside your official books and professional advice. Confirm accounting requirements and source figures in your established process.

**Can I connect Stripe or another finance service?**

Use the available Stripe connection to synchronize supported payment data. Other finance connections have their own setup and supported scope; check the connection details before relying on a report.

**Why are figures missing or outdated?**

The view depends on recorded or synchronized information. Check update times, connection status, and missing inputs before interpreting a chart.

**Explore Customers** → `/departments/customers` · **View connections** → `/integrations`

### Release checks

Confirm Stripe synchronization availability, supported statement formats, and the exact calculation inputs for burn and runway. Keep data freshness visible. Do not claim bank-grade security, accounting compliance, or guaranteed savings without evidence.

---

## 10. Content & social

Route: `/departments/content`

SEO title: **Alacrán Content & Social | From business ideas to reviewed drafts**

Meta description: **Prepare content in your business voice, review drafts, track publication status, and inspect supported social metrics in Alacrán.**

### Website copy

Eyebrow: **Departments / Content & social**

# Turn what your business knows into content worth sharing.

Develop ideas, prepare drafts, and keep the review process connected to your company’s voice and priorities. Track what is ready and what has already been published.

**Why you need this:** Without it, every post starts from a blank prompt and you explain your audience and tone again each time. Here your company facts say what you offer and who it serves, your past posts set the voice, and you review each draft before approving it.

**Download Alacrán** · **See a content workflow** → `/use-cases`

## Start with your audience and your offer.

A generic post is easy to scroll past, and writing a good brief every time is slow. Use company facts, audience information, and tone guidance to give each draft a useful starting point. Ask for a specific message and purpose instead of another generic post.

## Move from idea to reviewed draft.

Ideas, drafts, and half-finished edits tend to end up scattered across documents and chats. Keep ideas, drafts, and review status in the content pipeline. Inspect the wording, check factual claims, and ask for revisions before approving a piece.

## Prepare the details in one place.

Copy, previews, and visuals often get prepared in different places. Use the post composer to work on copy and previews. Where supported, connect creative tools or image-generation capabilities to prepare accompanying visuals.

## Keep publication status visible.

It is easy to lose track of what is approved, what is scheduled, and what is actually live. Record what has been published and maintain a useful history. Supported newsletter and social connections can bring additional status and audience information into the workspace.

Approval, scheduling, and publication are different states. Confirm what your configured workflow actually does before treating a post as live.

## Learn from the available signals.

Posting more often is not the same as learning what works. Review supported follower metrics and audience trends alongside your content records. Use the information to form the next experiment; growth is not guaranteed by publishing more often.

Try asking:

> Draft three posts explaining this service to our target audience. Give each one a different useful angle, follow our saved tone guidance, and flag claims that need proof.

## Questions

**Does Alacrán publish posts for me?**

The standard workflow prepares and tracks content for review and manual publication. Additional tools may have their own publishing capabilities and permission requirements. Saving an approved draft does not make it live.

**Can it create images?**

With a supported image tool configured, you can prepare visuals alongside your content. Availability depends on your Alacrán release, connected provider, and account access.

**Which channels can I use?**

Use the pipeline to organize posts, articles, newsletters, and announcements. Platform-specific drafting, previews, metrics, and publishing support vary by connection.

**Can it follow my brand voice?**

Provide tone guidance and approved examples in your company knowledge. Review the output for consistency and refine the guidance as you learn what works.

**Explore Messages** → `/departments/messages` · **Browse Marketing starter pack** → `/templates`

### Release checks

The current live department page says image generation is not yet available, while the supplied feature inventory says it is built in. Confirm the shipped status and replace the image FAQ with a definite answer before publishing. If unavailable, use: “You can prepare a visual brief alongside your copy. Image creation requires an external tool.” Confirm platform-specific limits and social metrics.

---

## 11. Messages

Route: `/departments/messages`

SEO title: **Alacrán Messages | Catch up and prepare customer replies**

Meta description: **Bring supported inboxes and chats into a catch-up workflow. Find inquiries needing attention and review AI-prepared replies in Alacrán.**

### Website copy

Eyebrow: **Departments / Messages**

# Find the conversations that need you.

Catch up on connected messages, identify inquiries awaiting attention, and prepare replies using your company’s recorded information.

**Why you need this:** Without it, finding who is waiting on a reply means opening every inbox and chat in turn. Here the catch-up reads your connected messages and prepares drafts, and you send each reply yourself.

**Download Alacrán** · **Explore messaging connections** → `/integrations`

## Catch up across connected services.

Messages arrive in many places, and something important is easy to miss. Bring supported email and chat information into one working view. Read summaries alongside the original context when you need to check a detail.

## See who may need a reply.

Not every message needs you, and the ones that do should not get buried. Use the inquiry scanner and reply queue to identify conversations worth reviewing. Separate work waiting for your attention from drafts ready for the next step.

## Prepare a reply with the business facts available.

A fast reply is only useful if it is right about names, prices, and commitments. Give your AI access to the relevant company information when preparing a response. Check names, commitments, prices, and unresolved questions before using it.

## Keep a record of the conversation.

A reply you sent last month is easy to forget when the customer writes again. Save useful summaries and record completed replies so later work can draw on the history. Information from an incoming message should remain attributable to its sender rather than automatically becoming an approved company fact.

Try asking:

> Find customer inquiries that appear to need a response. Draft replies using our documented service information, and flag anything that requires my decision.

## How the standard reply workflow works

A set order for catching up keeps replies from depending on who remembers.

1. Connect a supported inbox or messaging source.
2. Review the catch-up summary and inquiries.
3. Inspect or revise a proposed reply.
4. Copy and send the approved wording through your usual account.
5. Keep the response status and company record up to date.

## Questions

**Will it reply without me?**

The standard catch-up connections are read-only, and the reply workflow prepares drafts for manual sending. Additional configured tools may have different permissions; inspect them separately.

**Do I need Beeper?**

Beeper is one option for supported chat networks. Email and other supported connections have their own setup requirements.

**Are all my accounts connected automatically?**

No. Choose and authorize the services you want to use. Availability depends on the connection and your provider account.

**What if an incoming message contains instructions for the AI?**

External messages should be treated as source material, not authorization to change records or take actions. Review unexpected requests and check the controls of the workflow processing them.

**Explore Customers** → `/departments/customers` · **Read about review controls** → `/docs`

### Release checks

Confirm which sources appear in the unified view in the shipped version, whether “sent” status is manual or detected, and what each read-only connector actually permits. Do not promise that prompt injection is impossible or that every unanswered inquiry will be found.

---

## 12. Privacy

Route: `/privacy`

SEO title: **Alacrán Privacy Policy | Local files and connected services**

Meta description: **Read how Alacrán handles local company files, AI providers, connected services, credentials, updates, and your choices.**

Status: Existing published policy retained below, not rewritten. Preserve its effective date until an authorized policy update is approved. Before expanding it, verify voice processing, microphone wake detection, diagnostics, website logs, update requests, backups, and Company Strings behavior against the released application. Do not silently broaden promises based on a feature list.

### Website copy — retained published policy

Privacy / Effective October 15, 2026

# Your data stays close.

Alacrán is designed around local files, direct connections, and no Alacrán account.

## What Alacrán stores

Your company context, notes, decisions, and operational records are stored as files in folders on your computer. Alacrán does not require an Alacrán account or upload those folders to an Alacrán-hosted company database.

## AI providers and connectors

When you ask an AI a question or connect an external service, relevant information is sent directly from your computer to the provider you selected. That provider may process information under its own privacy policy. Connect only services and information you are comfortable sharing with that provider.

## Credentials

Alacrán uses credentials managed by your operating system or the connected tool where possible. Do not place passwords, API keys, payment details, or other secrets inside your company’s ordinary notes or definitions.

## Analytics and updates

Alacrán does not require behavioral advertising or a hosted user profile. The application may check for available software updates. Requests made by connected AI tools and services are governed by those providers.

## This website

The Alacrán website shows a Buy Me a Coffee support button. Loading it makes your browser send a request, which includes your IP address, to buymeacoffee.com, and that provider handles it under its own privacy policy. The button appears on this website only. The Alacrán app does not load it.

## Your choices

You can disconnect a service, stop using an AI provider, move or delete your local company folder, or uninstall Alacrán. Keep backups before deleting files. Removing Alacrán does not automatically delete information held by a third-party provider.

## Questions and changes

This policy may change as Alacrán develops. Material updates will appear here with a new effective date. Privacy questions can be sent to [contact@alacran.app](mailto:contact@alacran.app).

---

## 13. Terms

Route: `/terms`

SEO title: **Alacrán Terms of Service**

Meta description: **Read the terms for using Alacrán, including AI output review, connected services, ownership of your files, and responsibilities.**

Status: Existing published terms retained below, not rewritten. The existing text calls the product an “open-source project.” Verify the applicable source availability and license before retaining that characterization in a new release. Do not infer licensing from readable company files or a public download repository. Any substantive policy update requires an accurate product and operator basis; this content file does not supply that legal review.

### Website copy — retained published terms

Legal / Effective September 19, 2026

# Terms of Service.

Plain-language terms for using Alacrán. Please read them before using the application.

## Using Alacrán

Alacrán is a local desktop application and open-source project. You may use it to organize business information and work with supported AI tools and connected services. You are responsible for the information you provide, the services you connect, and the decisions you make from its output.

## AI output needs review

AI-generated output can be incomplete or wrong. Alacrán is designed to show important proposed actions for human review, but you remain responsible for checking results before relying on, publishing, sending, or acting on them. Alacrán does not provide legal, medical, tax, or financial advice.

## Third-party services

AI providers, email, calendar, source-control, messaging, and other connected services have their own terms and privacy practices. Your use of those services is governed by your agreement with each provider.

## Your files and responsibilities

You keep ownership of the files and business information you use with Alacrán. You must have the right to use that information and must not use the application to break the law, compromise another person’s access, or harm another person or service.

## Availability and warranty

Alacrán is provided as available and without promises that it will always be uninterrupted, error-free, or suitable for every purpose. Keep appropriate backups of important files and review application updates before installing them.

## Changes and contact

These terms may change as the product develops. Material updates will be reflected on this page with a new effective date. Questions can be sent to [contact@alacran.app](mailto:contact@alacran.app).

---

## Final implementation checklist — not website copy

- Implement all 13 routes above, preserving existing public paths.
- Apply one clear page-level H1 on each rendered page. The headings in this combined document represent separate pages and components.
- Preserve homepage anchors `features`, `faq`, and `tour`. Redirect or retain older anchors where inbound links depend on them.
- Add the explicitly referenced guide and use-case anchor IDs.
- Make each download button open the platform chooser or the appropriate existing download URL.
- Use “See Alacrán in action” for the actual product tour; do not label static images as a video.
- Match screenshots, onboarding labels, platform requirements, and provider status to the downloadable version.
- Resolve the release checks for approval enforcement, image generation, publication actions, and connector readiness before publishing their associated claims.
- On the integrations page, populate actual setup and capability details for every displayed tool; omit unverified entries from the public catalogue.
- Retain the current privacy and terms text until the owner approves any substantive update. This document does not silently amend those policies.
- Keep legal pages, app disclosures, FAQ answers, and technical documentation consistent about external processing and review boundaries.
- Provide descriptive image alt text, readable text alternatives to demos, keyboard-operable tabs, and reduced-motion behavior where applicable. Do not claim accessibility certification from these content instructions.
- Update each page’s Markdown mirror and regenerate `/llms.txt` and `/llms-full.txt` from the approved public copy. The retrieved mirrors for templates, integrations, and use cases were empty except for source URLs; ensure they contain the actual page content.
- Keep internal notes, publication checks, and implementation directions out of public HTML and AI-readable public mirrors.

## Source basis

- Founder-provided core feature inventory: `Pasted text(2).txt`, supplied in this conversation.
- Live homepage and getting-started page inspected earlier in this conversation on 9 October 2026.
- Public route index: https://www.alacran.app/llms.txt
- Public combined page text: https://www.alacran.app/llms-full.txt
- Templates, integrations, and use-cases routes were listed in the public index, but their retrieved Markdown mirrors contained no substantive body content. Their replacement copy here is based on the supplied feature inventory.
- Existing privacy and terms copied from the public combined page text to preserve current policy wording.
