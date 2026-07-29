# Pre-retreat guidance for participants — AI-driven management retreat

> Audience: anyone confirmed to attend the retreat. Distributed **1-2 weeks before the
> retreat**.
> Expected read time: about 10 minutes.

---

## Introduction

In this retreat, using your own company as the material, you'll grow, hands-on, in your own
repository, a minimal-footprint harness (a set of workflows, rules, and templates) for
"running the business alongside an AI agent." By the time the retreat ends, you should have
all of the following in place:

- A "company ontology" that puts your own company's domain, stakeholders, and bottlenecks
  into words
- Your first Epic Issue (on GitHub), decomposing a real operational challenge
- HITL (Human-in-the-Loop) gates — a design for where a human holds the reins and where the
  AI is trusted
- A repository where machine verification (`scripts/verify.py`) passes

Pre-retreat prep takes about 15 minutes. Follow this guide's steps and finish it before the
day of the retreat. The day itself proceeds assuming this prep is already done.

---

## What to bring / prerequisite tools

Install the following on your PC (Mac / Windows / Linux — any is fine) before the day of the
retreat.

| Tool | Purpose | Check command | Approximate version |
|---|---|---|---|
| `git` | Duplicating the repo, committing | `git --version` | 2.x+ |
| `python3` | Running the verification script (`scripts/verify.py`) | `python3 --version` | 3.9+ |
| `gh` (GitHub CLI) | Filing Issues, confirming authentication | `gh --version` | 2.x+ |
| `claude` (Claude Code CLI) | Your working environment for the retreat itself | `claude --version` | Pro or above, or a Claude Code-eligible plan |

In addition, you'll need a **GitHub account** (ideally with two-factor authentication [2FA]
already enabled). Either a work or personal account is fine, but we recommend one you'll keep
using after the retreat.

If you're on Windows, we recommend working inside WSL (Windows Subsystem for Linux). Install
`git` / `python3` / `gh` / `claude` all from within the WSL Linux environment.

### Also gather your company's "materials"

On top of the tool setup above, gather **your own company's materials** so the AI can put
your company into words on the day. What to gather is laid out in a checklist with examples
by industry (it's just gathering — no writing required).

- [Company-context gathering checklist](context-gathering-checklist.md)

The gathered material is ingested into the company's "memory" on day one, via
`/define-company` and `/ingest-context`.

---

## The 15-minute pre-retreat setup

Work through the following in order. Each step notes its estimated time.

### 1. Confirm your GitHub account (2 min)

```bash
# Confirm you can log in to github.com in a browser
# If 2FA isn't set up, we recommend enabling it under Settings > Password and authentication
```

2FA isn't mandatory, but since you'll be handling content close to your company's
confidential information (your own challenges, bottlenecks, etc.) in a private repository
during the retreat, we recommend tightening your account's security.

### 2. Install the Claude Code CLI (3 min)

Installation steps vary by OS. Follow the official installation instructions. After
installing, confirm the version shows:

```bash
claude --version
```

The Claude Code CLI requires a **Pro plan or above**, or a plan where Claude Code is
available. If you don't have one yet, consult the retreat organizers ahead of time.

### 3. Install the GitHub CLI + authenticate (3 min)

```bash
gh --version
gh auth login
```

`gh auth login` is interactive. Choosing, in order, `GitHub.com` -> `HTTPS` or `SSH` ->
browser authentication completes it. Confirm you're authenticated with:

```bash
gh auth status
# It's OK if it shows: ✓ Logged in to github.com account <your-account>
```

### 4. Confirm python3 + pip (1 min)

```bash
python3 --version   # 3.9 or above
pip3 --version
```

If `python3` isn't installed, install it via the official installer or your OS's package
manager (`brew install python3` / `apt install python3` etc.).

### 5. Duplicate the template into your own private repository (3 min)

On the distributed template repository's page, press the **"Use this template"** button, and
be sure to choose **Private**, creating a new repository under your own account.

> ⚠️ **Don't choose Public.** During the retreat you'll write somewhat sensitive information
> into the repository — your business domain, bottlenecks, and so on. Choosing Private
> prevents your own company's confidential details from being exposed externally.

Once the duplicate is created, clone it locally.

```bash
git clone git@github.com:<your-account>/<your-repo-name>.git
cd <your-repo-name>
```

### 6. Confirm the verification script passes (2 min)

```bash
python3 scripts/verify.py
```

If there are 0 `FAIL`s, you're ready. Many items will show `INFO` (skipped because nothing's
been written yet) — that's expected behavior. If a `FAIL` appears, check the following:

- A `ModuleNotFoundError`-type error -> run `pip3 install pyyaml`
- Any other error -> one of steps 1-5 may not be complete

Once you've gotten this far, pre-retreat prep is done. The day itself starts from running
`claude`.

---

## Things to think about before the retreat

To make the first exercise of the day (defining your own company ontology) go smoothly, we
strongly recommend organizing your thinking on the following 3 points ahead of time. You
don't need a perfect answer prepared — you'll put it into words and refine it during the
dialogue with Claude Code on the day.

### 1. Your company's business domain, in one line (under 30 words)

How would you put "who my company solves what problem for, and how" into one sentence? Try
to phrase it in words that make sense to someone hearing about it for the first time, rather
than industry jargon or in-house terms.

### 2. Key stakeholders

Among the people involved in the business — customers, employees, partners, shareholders,
etc. — think about **who should be placed at the center right now**. The goal isn't to list
everyone side by side, but to rank them.

### 3. The work that currently takes the most time

Picture one bottleneck in your day-to-day operations that you feel "if this weren't there,
the business would move forward faster." At the retreat, you'll file this bottleneck as your
first Epic Issue and actually work on it together with an AI agent. A concrete task (e.g.
"preparing a quote takes 2 hours every time") is easier to work with during the retreat than
an abstract issue (e.g. "our sales are weak").

### 4. Core value flow (input -> transformation -> output)

Think about how you'd express your company's central business activity as one sentence:
"what comes in (input) -> what happens to it (transformation) -> what goes out (output)."
For example, something like "an inquiry (input) -> a quote/proposal (transformation) -> a
signed order (output)." This becomes the foundation you'll use when defining your company
ontology (`definitions/ontology/`) on the day.

---

## Q&A before the day of the retreat

**Q1. What is Claude Code? How is it different from the chat AI I normally use?**
A. Claude Code is an AI agent that runs in a terminal (the command line). The big difference
from a normal chat screen is that it can read/write files, run commands, and integrate with
GitHub — acting autonomously through dialogue. At the retreat, you'll work through management
tasks together with Claude Code while accumulating your company's information in the
repository.

**Q2. I've never used Python — is that OK?**
A. No problem. There's almost no point during the retreat where you write Python code
yourself. Running the one command `python3 scripts/verify.py` mechanically checks whether
the repository's state is correct — you don't need to read its internals.

**Q3. I don't have a GitHub account — what do I do?**
A. You can create one for free within the pre-retreat prep window. Sign up at
[github.com](https://github.com). We also recommend setting up 2FA at the same time.

**Q4. I'm uneasy about writing my company's confidential information in.**
A. Always work in a private repository (Step 5). Also, the `secrets/` folder within the
repository is protected by `.gitignore`, and credentials/API keys are meant to go there. If
you're still unsure how much you can write in, consult the instructor on the day of the
retreat.

**Q5. I really can't finish the pre-retreat prep in 15 minutes.**
A. The installation steps in particular (Claude Code CLI / GitHub CLI) can take longer the
first time depending on your network environment. Start at least 2 days before the retreat,
and if you get stuck, contact the organizers early. Carrying it over to the day itself eats
into the time you'd otherwise have for the exercises.

---

## Confirming the terms of use

This template is provided **exclusively for a registered retreat participant's own use at
their own company**. Redistribution, commercial redistribution, and publishing derivative
works in a public repository are all prohibited. See `LICENSE.md` inside your duplicated
repository for details.

---

## Support

If you get stuck during pre-retreat prep, or have questions affecting whether you can
participate, contact the retreat organizers.

Contact: {{ provided individually by the organizers }}

---

*ai-retreat-starter — pre-retreat guidance for participants*
