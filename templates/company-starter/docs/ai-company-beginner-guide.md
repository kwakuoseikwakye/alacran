# The Beginner's Guide to an AI Company — a step-by-step walkthrough anyone can follow

> This document is written so that even someone who has never programmed can read it — a
> plain-language explanation of "what is an AI company?" and "how do I get started?"
> Difficult terms are kept to a minimum, and whenever one does show up, it's always explained
> in plain language.

---

## How to read this book

- Read it in order, from the top. Don't skip ahead partway through.
- The commands (the text inside the black boxes) are the magic words you'll actually type
  later. For now, it's fine to just read them.
- If you think "ah, I get it," move on. If something's unclear, re-read that section.

---

## 1. What is this? (a 30-second explanation)

An **AI company** is a small company-shaped setup where you have an AI (artificial
intelligence) work like an "employee."

- **You (the boss)** give the AI instructions: "do this."
- The AI follows the instructions: it drafts documents, does calculations, keeps records.
- Only the important decisions (spending money, signing a contract) always get a final OK
  from you.

This repository (= a bundle of folders) is the **template for that company setup**. Think of
it like a blank submission form for a manga magazine — only the frame is provided, and the
content (your company's information) is something we're about to fill in together, starting
now.

---

## 2. Only 3 characters to remember

There are only 3 characters to keep in mind.

| Character | Role | Think of it like |
|---|---|---|
| **You** | The boss. Gives instructions, gives the final OK | A teacher assigning classroom duties |
| **Claude Code** | The AI employee. Receives instructions and actually does the work | A diligent, hard-working new hire |
| **GitHub** | The record-keeper. Stores every to-do list and every document created | A classroom blackboard + a locker |

Drawn out as a picture:

```
   You (the boss)
      │ "Do this"
      ▼
   Claude Code (the AI employee)
      │ "Done!"
      ▼
   GitHub (the record-keeper's blackboard)
      │
   Every record stays here
```

- Claude Code is **an AI that runs inside your own computer**. It doesn't send data off to
  the cloud on its own.
- GitHub is **the blackboard where everything gets noted down**. You can see at a glance
  what's been done and what's still there.

---

## 3. Why call it a "company"?

You might think "if it's just one person using an AI, isn't calling it a 'company' a bit much?"
But haven't you run into problems like these?

- It's a hassle explaining the same thing to the AI every time
- You forget how far you got in yesterday's conversation with the AI
- The AI sometimes does too much on its own, and that causes trouble
- You're not even sure what to ask the AI to do in the first place

All of these happen because there's no "company structure" in place.

- A company has **in-house rules** (work regulations), so a new hire doesn't get lost.
- A company has a **handover notebook**, so the work keeps going even when the person in
  charge changes.
- A company has **a manager's approval**, so money doesn't get spent without oversight.

This template is **a box that prepares these "company-like structures" for an AI**.

---

## 4. The company's structure — 5 important parts

There are a lot of folders and files inside this repository. At first, all of them might
seem important, but there are really only **5 parts you need to remember**.

### Part ① CLAUDE.md — the company's constitution

- Location: `CLAUDE.md`, at the very top folder
- Contents: a rule book saying "here's how our company operates"
- Think of it like: your school's **code of conduct**
- Claude Code **always reads this** when it starts working

### Part ② .claude/rules/ — detailed in-house rules

- Location: the `.claude/rules/` folder
- Contents: detailed conventions like "make an Issue (a work ticket) first," "don't make a
  big change on your own"
- Think of it like: the **rules of a school club**
- The code of conduct (CLAUDE.md) says "for the details, read this"

### Part ③ definitions/ — your own company's data

- Location: the `definitions/` folder
- Contents: your company's information (who your customers are, what your products are, etc.)
- Think of it like: the company's **staff roster and product catalog**
- **Starts out empty.** This is the place you're about to fill in

### Part ④ .claude/commands/ — a collection of magic words

- Location: the `.claude/commands/` folder
- Contents: how to make "frequently-used magic words," like `/define-company`
- Think of it like: the "warm-up" button on a microwave
- There are 9 in total. Just press the button when you want to use it

### Part ⑤ HANDOFF.md — the handover notebook

- Location: `HANDOFF.md`, at the very top folder
- Contents: a note saying "here's how far I got today. Please start from here next"
- Think of it like: a **relay-race baton**
- Every time a session (a stretch of work) ends, it's like writing a letter to your future self

**As long as you remember these 5, you can look everything else up as you need it.**

---

## 5. The flow of work — 5 steps

At a company, every job moves through the same flow. This template is the same: whatever the
job is, it just cycles through the same **5 phases**.

```
① Define  ->  ② Plan  ->  ③ Execute  ->  ④ Verify  ->  ⑤ Record
                                                       │
                                    ┌──────────────────┘
                                    ▼
                              on to the next cycle
```

| Phase | What you do | Think of it like |
|---|---|---|
| ① Define | Write out "here's what kind of company we are" | Making a business card |
| ② Plan | Write "we're going to do this next" onto GitHub (making a work ticket = an Issue) | Writing a shopping list |
| ③ Execute | Actually do the work, together with Claude Code | Going shopping |
| ④ Verify | Have a machine check "did it actually get done right?" | Checking the amount against the receipt |
| ⑤ Record | Write down "here's how far I got today" | Writing it into a household ledger |

Small jobs (fixing a single typo, say) can skip ① and ②. But for a big job, or one you can't
undo afterward, always go through starting from ①, in order.

---

## 6. 6 important promises

Here are the "6 promises" to keep when using this template. You don't have to memorize all
of them — at first it's fine to just know their names.

| Promise | In one line |
|---|---|
| **Issue-First** | Work always starts by making a ticket on GitHub first |
| **HITL Gate** | Money, contracts, and irreversible operations always get a human's OK |
| **SSOT** | Important information is kept together in "just one place" |
| **Scope Contract** | Declare "how far you're going" before you start |
| **No fake green** | Never let it pretend to work when it isn't actually working |
| **Session handover** | Write a letter to your future self at the end of a work session |

**HITL Gate** (human approval) is especially important. The AI is fast, but before spending
money or deleting important data, **it's always set up to stop and ask you first**.

---

## 7. The memo box (notes/) — a place to toss in whatever crosses your mind

The company has a proper "document shelf" — **`definitions/`** (the staff roster and product
catalog) we saw in Part ③. But work ideas don't always come to mind in a neat, proper shape.
Right after a meeting, on the move, right out of the shower — you sometimes suddenly think
"oh, I should jot that down."

For exactly that, there's a **"memo-pad shelf"** separate from the document shelf. That's
`notes/`.

### The only place you're free to write in is the "memo box"

`notes/` has a few small rooms inside it, but remember: **the only one you (the boss) are
free to write into is `notes/inbox/`** (the inbox = the memo box).

- You can toss in whatever crosses your mind right after a meeting or on the move, **without
  worrying about format**, exactly as it is.
- You don't need to feel pressure to "write it neatly." A quick scribble is fine.
- You don't need to write directly into the other small rooms (the company's story, other
  companies' information, customer notes, procedure documents) — those are places the AI
  employee tidies up for you.

### You can also write from your phone or tablet

The memo box can be written to **not just from your computer, but from your phone or
tablet too**. Opening this folder with a free note-taking app called **Obsidian** lets you
drop in a memo even while you're out.

- You don't need Obsidian for this to work. **It's also fine to just paste it in from your
  phone's built-in notes app when you're back at your computer.** Don't overthink it.
- The detailed syncing steps are written in `notes/inbox/README.md`.

### The AI employee tidies up whatever you toss in

Once you put something in the memo box, the next time you start working with Claude Code,
the AI employee checks the memo box's contents using this magic word:

```
/ingest-context inbox
```

At this point, the AI employee checks whether the memo has **anything confidential mixed
in (real names, amounts, passwords, etc.)**, and then tidies it away into the correct small
room based on its content.

| The memo's content | Where it gets tidied to |
|---|---|
| Your own company's story, strategy memos | The "company story" shelf |
| Information about other companies, competitors, the market | The "other-company info" shelf |
| Notes from a meeting with a customer | The "customer notes" shelf |
| Work procedures | The "procedure document" shelf |

In other words, all you have to do is **"just toss it in the memo box for now"** — the
tidying up can be left to the AI employee.

### An important warning — things you must not write even in the memo box

The memo box gets saved onto git (the record-keeper's blackboard). So:

> **Never write real names, amounts, or passwords, even in the memo box.**

If you need to keep credentials (a password or an API key), put it in a separate "safe"
called `secrets/` instead (`secrets/` never lands on the blackboard). When in doubt, remember
"it goes in `secrets/`," and you'll be safe.

### Designed so it's fine even if you leave things sitting

You might worry "I might forget I put something in the memo box..." But it's fine. If a memo
**sits in the memo box for 7 days or more**, `/verify` (the check machine) will tell you
"memos are piling up." So feel free to toss things in whenever they come to mind, and tidy
them up together with the AI employee later.

---

## 8. Alright, let's get started — step by step

Now, the actual steps to get started. There are **9 steps** in total, and it takes roughly
**30 minutes to an hour**.

### Step 1. Gather your tools (a shopping list)

Check whether your computer has these tools installed.

| Tool | What it does | How to get it |
|---|---|---|
| Git | A tool that keeps a history of your files | Download from [git-scm.com](https://git-scm.com) |
| Python 3 | The language that runs the check scripts | Download from [python.org](https://python.org) |
| Claude Code | The AI employee itself | Sign up for a Claude monthly plan, and download from the official site |
| A GitHub account | The record-keeper's blackboard | Sign up for free at [github.com](https://github.com) |
| GitHub CLI (`gh`) | A tool to operate GitHub from your computer | Download from [cli.github.com](https://cli.github.com) |

**How to check** — open the "Terminal" (the black screen) on your computer, and type this:

```bash
git --version
python3 --version
claude --version
gh --version
```

If each one shows a version number (something like `git version 2.xx.x`), that tool is
installed. If it says "command not found," it isn't installed yet — install it first.

### Step 2. Create your own repository

On the GitHub screen, press this template's **"Use this template"** button.

- **Be sure to choose "Private"** (since this will handle your company's information, it's
  safer to keep it out of public view).
- The repository can be named whatever you like (e.g. `my-ai-company`).

Once it's created, copy it (clone it) onto your own computer:

```bash
git clone git@github.com:<your-account-name>/<repository-name>.git
cd <repository-name>
```

Now you have "your own company's folder" inside your computer.

### Step 3. Start up Claude Code

In the same black screen, type this:

```bash
claude
```

Claude Code starts up and greets you. At this point, Claude Code **automatically reads
`CLAUDE.md` (the company's constitution)**. That means, by the time it greets you, your
company's rules are already in Claude Code's head.

### Step 4. Try running the check machine, just once for now

Ask Claude Code this:

```
/verify
```

This is the magic word that has a machine check "is our company actually following the
rules?"

**At first, almost everything shows "INFO (skipped, since there's no data yet)." That's the
correct result.** As you fill in more content going forward, "PASS" gradually increases.

### Step 5. Define your own company (the most important step!)

Now, let's actually put your company's information in. Ask Claude Code this:

```
/define-company
```

Claude Code asks you 4 questions, one at a time:

1. **What problem does your company solve?**
   - e.g. "We make tools that make recipe management and inventory management easier for the
     neighborhood bakery."
2. **Who are your main customers?**
   - e.g. "The owner of a small neighborhood bakery."
3. **What flow do you create value through?**
   - e.g. "Enter a recipe -> check ingredient stock -> get an order alert."
4. **What's the biggest thing you're stuck on right now?**
   - e.g. "Ordering is done by gut feeling, so we end up with too much or too little of an
     ingredient."

No need to rush. Take your time with each question and answer carefully. Based on your
answers, Claude Code creates a "company business-card file" called
`definitions/ontology/company.yaml`.

### Step 6. Look over the finished business card

Open the `definitions/ontology/company.yaml` that Claude Code made, and look it over — "does
this seem right?" If anything's off, it's fine to rewrite it right there.

**At this point, the AI employee (Claude Code) now knows about your company.** From the next
session on, Claude Code reads this business card and acts accordingly.

### Step 7. Make your first work ticket (an Issue)

Now, let's try doing some small piece of work. For example, "write a self-introduction in
HANDOFF.md" is fine too.

Following the Issue-First principle, make a ticket on GitHub first. Ask Claude Code this:

```
Create a new Issue: "Add a self-introduction to HANDOFF.md"
```

Claude Code uses the `gh` command to file an Issue on GitHub for you. Now you have **a
reservation for the work**.

### Step 8. Do the work

Ask Claude Code:

```
Go ahead and work on the Issue you just created
```

Before starting, Claude Code always declares **"I'm going to change this, and I'm not going
to touch that"** (= the Scope Contract promise). You look it over, and if it's OK, just
answer "go ahead."

Once the work is done, Claude Code automatically commits (= saves) it.

### Step 9. Leave a record and finish up

When you're ending a session (a stretch of work), ask this:

```
/handoff
```

Claude Code updates **HANDOFF.md (the handover notebook)** for you. It leaves a note saying
"here's how far I got today. Please start from here next."

Next time you start a session, you (and Claude Code) can just start by reading this handover
note.

**Great work! That's your first cycle, all the way around!**

---

## 9. Things worth trying by day 3

To get comfortable in the first 1-3 days, we recommend trying things in this order:

| Day | What to do | Magic words used |
|---|---|---|
| Day 1 | Go through "Steps 1-9" above, all the way around once | `/define-company`, `/verify`, `/handoff` |
| Day 2 | Try breaking a bigger piece of work down into an Epic (a parent ticket) | `/create-epic` |
| Day 3 | Practice recording an important decision made within the company. Practice filing a memo directly onto a proper shelf, in a well-formed way, while the AI asks you questions | `/decision`, `/retro`, `/stock-note` |
| Once comfortable | Have the AI put together a summary (like a weekly report) of the memos and decisions that piled up this week | `/digest` |

This lets you experience all 5 phases once each. Once you've been through them, you'll pick
up the rhythm of "ah, so this is how it cycles."

---

## 10. Escape routes for when you get stuck

If you're working and think "hmm, this isn't going well," check these 3 things first.

### Q1. It feels like Claude Code isn't following the rules

- Ask it whether Claude Code has actually read `CLAUDE.md`:
  ```
  Did you read CLAUDE.md? Tell me the 5 phases and 6 principles.
  ```
- If it can answer, Claude Code knows the rules. If it can't, have it Read `CLAUDE.md`.

### Q2. `/verify` said "FAIL"

- **Always read what it says.** "It's a hassle, let's just delete the check" is not OK
  (= that breaks the no-fake-green promise).
- Paste the FAIL's content to Claude Code and ask "how do I fix this?" — it will tell you
  how.

### Q3. Claude Code is trying to handle money or a contract on its own

- **Stop it.** That's an operation that needs the HITL Gate (human approval).
- Say "I'll decide this — stop," and Claude Code will stop.

### Q4. You're not sure what to write where

- Look at `CLAUDE.md`'s **§4.5, "the context map."** It has a table mapping "where does this
  kind of information go?"

---

## 11. Mini glossary of terms

A summary of the difficult words that showed up in this document. Come back here whenever
you get stuck.

| Word | Meaning |
|---|---|
| **Repository** | A box holding a whole set of files and their history. There's one on GitHub, paired with one on your computer |
| **Clone** | Copying GitHub's box onto your own computer |
| **Commit** | Creating a save point for your work. You can later say "put it back to here" |
| **Issue** | A "work ticket" on GitHub. A reservation slip for a job |
| **PR (pull request)** | Asking "is it OK to bring in this change?" Used together with an Issue |
| **Label** | A tag stuck onto an Issue (e.g. `phase:planning`). Represents its state |
| **Hooks** | Small checks that Claude Code automatically runs at a specific moment |
| **CLI** | The way of typing commands from your computer's black screen (the terminal) |
| **YAML** | A way of arranging text to organize information. Readable by both humans and AI |
| **SSOT** | Single Source of Truth. The promise that "important information is only written in one place" |
| **HITL** | Human-In-The-Loop. The promise that "important decisions always go through a human" |
| **RQT** | Required Quality Test. The real identity of the automatic checks `scripts/verify.py` runs |
| **Frontmatter** | A name tag put at the top of a note, so a machine can read when it was written and what it's about |
| **Obsidian** | A free app for viewing and writing notes. This template works completely fine without it too |

---

## 12. What to read next

Once you've finished this guide, here's what to read next (in the recommended order):

1. **`docs/starter-manual.md`** — a start manual one level more detailed than this guide (15 min)
2. **`notes/README.md`** — the full picture of the memo box (`notes/`). Which small room holds
   what (a continuation of §7)
3. **`exercises/01-define-your-company.md`** — the first hands-on exercise
4. **`exercises/02-first-hitl-gate.md`** — an exercise to experience the HITL Gate
5. **`exercises/03-run-verify-loop.md`** — an exercise to experience the verify loop
6. **`docs/ai-company-explainer.md`** — an explainer of "why this structure," mapped against
   the concepts edition (L1-L9)
7. **`CLAUDE.md`** — the company's constitution. Once you're comfortable, you'll start
   customizing this

---

## 13. The one thing we want you to remember

This template **doesn't yet have the "right answer" filled in**. What it has is only
**"the container" and "the promise of how to write things."**

You're the one who creates the right answer.
And Claude Code (the AI employee) is what helps you organize it, together.

> **The tools are all here. All that's left is to put your company in.**

---

*ai-retreat-starter — The Beginner's Guide to an AI Company*
