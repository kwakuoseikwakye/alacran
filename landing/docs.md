# How Alacrán brings company knowledge and AI work together.

Alacrán combines a local company record system with operational screens and tools for running and reviewing agent work. The desktop workspace gives those parts a shared place to operate.

## The company folder

Each company has a folder containing readable business information and operational records.

LocationPurpose`definitions/`Company facts, structure, and operating definitions`notes/`Working notes, summaries, research, and session material`docs/decisions/`Decisions and the reasoning behind them`records/`Structured records used by departments and workflows`AGENTS.md`Instructions and working rules for agents in the company folder

Markdown supports readable documents. YAML supports structured records. Version history helps inspect changes and recover earlier recorded states. Local version history is not a substitute for a separate backup.

## Company memory and knowledge lifecycle

The company profile provides a shared reference for business facts. Notes and records add operational context. Decision logs preserve why a choice was made.

The knowledge graph helps explore relationships between entities, files, facts, and decisions. Lifecycle states distinguish draft, proposed, active, and deprecated knowledge. A graph view helps navigate information; it does not certify that the information is complete or correct.

## Departments and structured records

Department screens bring together metrics, records, connection status, and relevant agent actions. Record schemas help validate the structure of saved data. Custom departments can define additional records and workflows for specialized operations.

Validation can detect malformed data. It cannot establish that a customer statement, financial entry, or AI conclusion is true.

Alacrán

Example company · Sample data

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

Alacrán

Example company · Sample data

## Data and connections

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

[Set up a company](https://www.alacran.app/getting-started) [Explore connections](https://www.alacran.app/integrations)

## Put your business knowledge to work.

Create your company workspace, connect your AI, and prepare your first result for review.

Download Alacrán

[**Mac**

Apple Silicon

.dmg](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran-arm64.dmg) [**Mac**

Intel

.dmg](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran-x64.dmg) [**Linux**

Debian / Ubuntu

.deb](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran.deb) [Read the setup guide](https://www.alacran.app/getting-started)

[Read the setup guide](https://www.alacran.app/getting-started)

Source: https://www.alacran.app/docs
