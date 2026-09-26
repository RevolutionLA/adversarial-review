# adversarial-review · Tri-role adversarial code review

[中文](README.md) · **English**

> An Agent Skill that replaces "let me look at this again" with **structured adversarial roles** — hostile audit → independent review → neutral adjudication.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-blue.svg)](skills/adversarial-review/SKILL.md)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20DeepSeek%20Harness%20%7C%20Cursor%20%7C%20Codex-green.svg)](#compatibility)

---

## The most convincing thing about this skill

**It caught its own author's mistakes — not once, but before every release. The harshest round also proved that the author's prided self-check gates had blind spots.**

| Mistake I made | Who caught it |
|---|---|
| Claimed "fixed" in a remediation doc — but **the file was never touched** | Third-party review (disproved it with a git blob hash) |
| Fixed one bug and **introduced another**, then **committed while my own tests were failing** | Neutral adjudicator (ran the tests in an isolated checkout) |
| Claimed "the new rules landed in all three prompt templates" — **only one actually had them**; the verify script printed "🎉 passed" against a stale install | Pre-release self-review of v2.1.0: third party + adjudicator (**25 findings, two full rounds**) |

The second one is exactly the failure mode this skill's own first paragraph targets — **fixing A introduces B** — inside a tool built to catch that class of defect. The third went deeper: during the v2.1.0 self-review the third party **ran the verify script and got an exit-0 "passed" on outdated state**, proving the very anti-pattern the docs warn about ("a check that can never fail is not a check") was alive in my own tooling. The response wasn't an apology — it was a new **gate that can go red** (`check-docs.mjs`), which in its first night on the job caught the author's own stale line-count claims.

> **This skill doesn't prevent you from making mistakes. It prevents mistakes from being hidden.**
>
> All three mistakes above were mine, all caught by this workflow, each with a re-checkable evidence trail (four reports under `docs/review/`, kept local).
>
> **30-second gut feel**: read a [real review sample](skills/adversarial-review/examples/sample-review.md) with full evidence chains.

---

## The problem

When a single person (or a single AI) writes code, the biggest risk isn't "can't write it". It's:

1. **Unverified optimism postpones the fix** — "surely this fallback covers it"
2. **Tests provide false security** — the suite is green, but the feature broke long ago
3. **Fixing A introduces B** — the newly written fix is never independently examined

These **cannot be solved by "looking more carefully"**, because they aren't attention problems — they're *position* problems. When the person writing and the person reviewing are the same, they will defend their own work.

So this skill **forcibly separates the positions**:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Blue Team  │ ──▶ │ Third Party │ ──▶ │ Adjudicator │
│   hostile   │     │ independent │     │   neutral   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ assume it   │     │ trusts no   │     │ trusts both │
│  breaks,    │     │  documents, │     │  sides for  │
│  then prove │     │ reads code  │     │   nothing   │
│ evidence    │     │ hunts NEW   │     │ accepts /   │
│  required   │     │  defects    │     │  rejects    │
└─────────────┘     └─────────────┘     └─────────────┘
   "what to fix"    "did the fix work,    "who is right"
                     and what broke"
```

**The point isn't "get two more AIs to look at it" — it's the ordering and the mutual distrust.**

---

## The three roles

| Role | Stance | Hard constraint |
|---|---|---|
| **Blue Team** | Hostile — assume it breaks, then **prove it** | Every finding needs an evidence chain (`file:line` / a repro command / upstream source). No "consider improving robustness" platitudes |
| **Third Party** | Independent — **trusts neither side's documents**, reads only code | Must verify claim-by-claim that "fixed" means actually fixed, **hunt defects introduced by the remediation**, and **audit which dimensions the Blue Team skipped** |
| **Adjudicator** | Accepts / rejects / re-grades each finding | Must be a **different agent from the Blue Team**; must also **examine the assumptions both sides share** |

**Why the adjudicator can't be the Blue Team**: adjudication targets *the Third Party's review of the Blue Team's findings*. If the Blue Team adjudicates, it is simultaneously **the accused and the judge** — it will systematically reject criticism of itself. **The accused cannot be the judge.**

---

## Install

### Option 1 — npx (recommended)

```bash
# Install to Claude Code
npx skills add RevolutionLA/adversarial-review -a claude-code

# Install to several agents at once
npx skills add RevolutionLA/adversarial-review -a claude-code -a cursor -a opencode
```

### Option 2 — manual copy

```bash
git clone https://github.com/RevolutionLA/adversarial-review.git

# Note: the skill lives under skills/<name>/ in the repo
mkdir -p ~/.claude/skills
cp -r adversarial-review/skills/adversarial-review ~/.claude/skills/
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
git clone https://github.com/RevolutionLA/adversarial-review.git
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force ".\adversarial-review\skills\adversarial-review" "$env:USERPROFILE\.claude\skills\"
```
</details>

### Option 3 — one-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.sh | bash
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
irm https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.ps1 | iex
```
</details>

> If a previous install exists, the script **moves it into a `skill-backups/` directory outside the skills dir** before overwriting — your local edits are preserved, and the backup can never linger as a ghost skill hijacking triggers.

### Verify the install

```bash
bash skills/adversarial-review/scripts/verify-install.sh
# or point it at a specific path
bash skills/adversarial-review/scripts/verify-install.sh ~/.claude/skills/adversarial-review
```

> ⚠️ The spec validator (`validate-skill.mjs`) lives in the **repo's** `scripts/` and is not installed with the skill. So when run from an installed copy, the script explicitly tells you "**spec validation did not run — this is not a complete verification**" and exits with code 2. **It will not hand you an empty "passed".**

---

## Usage

No commands to memorise — trigger it in natural language:

| You say | What happens |
|---|---|
| "run a blue team review" | Standard tier, full three-role flow |
| "poke holes in this, I'm shipping tonight" | Heavy tier, parallel cross-verification |
| "have a third party review the fix" | Runs step 2 alone |
| "adversarial review this module" | English triggers work natively |
| "帮我挑刺" / "跑一次蓝军评审" | Chinese triggers work too |

Tiers:

| Tier | Configuration | Relative cost | Use for |
|---|---|---|---|
| **Light** | 1 Blue Team subagent (selected dimensions only) | ~1x | Small changes, tight deadlines |
| **Standard** (default) | Blue Team → Third Party → Adjudicator, 3 rounds | ~3x | Normal feature work |
| **Heavy** | Standard + parallel cross-verification | ~5-8x | Pre-release, major refactors, upstream compatibility |

---

## Which quality dimensions are covered

The three roles answer "**how to review**", not "**where to look**". So the skill ships a **19-dimension checklist** ([`review-dimensions.md`](skills/adversarial-review/references/review-dimensions.md)) and picks the relevant ones per change type:

| Category | Dimensions |
|---|---|
| **Requirements & design** | Requirement fidelity · Architecture & design |
| **Correctness** | Correctness · Error handling · Concurrency & races |
| **Quality attributes** | Performance · Security · Privacy & data · Observability |
| **Verification** | Test effectiveness |
| **Evolution & coexistence** | Compatibility · Dependencies & supply chain · Resource lifecycle · Data migration & state evolution |
| **Engineering & delivery** | Config & secrets · Release engineering · Documentation consistency · Accessibility & i18n · License compliance |

**Pick by change type — don't review all 19.** For a bug fix, focus on correctness / error handling / tests (a regression case is mandatory) / compatibility. Cramming all 19 into one pass just makes the report long and shallow.

The checklist is **wired into the flow**, not just documented:

- Step 0 requires **selecting dimensions**
- Step 1 requires the Blue Team to **state a conclusion per dimension** (even "nothing found" — silently skipping a dimension is forbidden)
- Step 2 requires the Third Party to **audit the Blue Team's coverage** — otherwise the Blue Team's blind spots become the whole process's blind spots
- Step 3 requires the Adjudicator to **examine the premises both sides share** — the biggest blind spot in same-model adversarial review

---

## What the output looks like

Four traceable reports land in `docs/review/` — **not a vague "looks fine", but an attack log with line numbers and repro commands**:

```
docs/review/
├─ BLUE-TEAM-REVIEW-<version>.md    # Findings table + per-item evidence chain + dimension coverage statement + unverified items
├─ RESPONSE-<version>.md            # Developer responses: accept / partial / defer / reject
├─ THIRD-PARTY-REVIEW-<version>.md  # Remediation verification table + new findings (T-items) + coverage audit
└─ ADJUDICATION-<version>.md        # Final rulings + shared-premise review + merged action list
```

A worked example is in [`examples/sample-review.md`](skills/adversarial-review/examples/sample-review.md).

> **Note**: review records are **not committed by default** (see `/docs/review/` in `.gitignore`). They contain details of unfixed issues and internal implementation context, so keeping them local is the safer default. If you want to publish them as a quality-process showcase, remove that line and commit normally.

---

## How this repo was verified

Three rounds of self-review during development. What they actually caught:

| Round | Findings |
|---|---|
| **v1.1** | Step 3 let the Blue Team adjudicate findings against itself — **the accused acting as judge**, contradicting the skill's own core rule |
| **v2.0 Blue Team** | The validator read `description: >` as **1 character yet still reported "passed"**; SKILL.md contained **zero references** to its companion files; the repo layout meant **skills.sh would never index it**; the CI link check **could never fail** |
| **v2.0 Third Party** | A "fixed" claim in the remediation doc was **false** (disproved by blob hash); a CI step **didn't do what its name said**; 5 mutations escaped the new tests |
| **v2.0.2 Adjudicator** | **The fix introduced a new bug** — `>` and `|` parsing semantics were swapped, and that commit **shipped with its own tests red**; the install-verify script **reported a fake "passed" to users** |
| **v2.1.0, two full rounds** | Blue Team: 11 findings (false "landed in all templates" claim, stale installed copy, backups hijacking trigger routing…) → Third Party: 14 findings proving **round-1 remediation only partially landed**, `verify-install` printing "🎉 passed" against a stale copy, and **all four gates blind to this entire defect class** → Adjudicator: re-graded 2, rejected 1 suggestion, and implemented the fifth gate on the spot |

### Quality infrastructure that came out of it

- **`.githooks/pre-commit` gate (five checks)** — regression tests + mutation tests + spec validation + link check + doc-claim guard; any failure blocks the commit. Verified to actually block by re-injecting the bug. (Enable: `git config core.hooksPath .githooks`)
- **Doc-claim guard** (`scripts/check-docs.mjs`, new in v2.1) — extracts numeric claims ("SKILL.md has N lines", "the design-points table has M rows") from CHANGELOG/README and diffs them against reality. **Its first run caught the author's own stale line counts** (175→177 unsynced).
- **Mutation testing** (`scripts/test-mutations.mjs`) — injects 11 defects into the code and checks whether the regression tests **can catch them**. Currently **10 caught / 0 escaped / 1 equivalent mutant**.
  - **Why it's needed**: green tests ≠ effective tests. This project's regression suite once let 5 mutations escape — including one where deleting the length-limit check caused a **1235-character illegal description to be reported as passing**.
- **Agent Skills spec validator** (`scripts/validate-skill.mjs`) — zero-dependency, usable as a general-purpose tool for your own skills.

---

## Honest limitations (please read)

> ⚠️ **Subagents and the main agent are usually the same model — this is not a genuinely independent third party.**
> The value comes from **role constraints plus mandatory evidence**, not from "another AI's opinion".

- ✅ **Reliably catches**: code-level errors, logic holes, fabricated tests, self-contradictions, missed branches, **declared-vs-actual mismatches**
- ❌ **Cannot catch**: **shared blind spots** — e.g. a mutual misunderstanding of an upstream system's behaviour

**Implication**: if a conclusion depends on external system behaviour, it must be **empirically verified** — not settled by two agents nodding at each other.

Don't say "verified by an independent third party". Say "**adversarially reviewed by different roles of the same model**".

> **Wouldn't a different model be better?** Some tools have reviewers run on a *different vendor's* model (Claude reviews Codex's output, and vice versa). That covers knowledge blind spots — it's a valid alternative approach. This skill instead chooses **same model + separated positions + mandatory evidence**. Its advantages are **zero extra setup and availability on any host**, and it remains effective against logic inconsistencies, declared-vs-actual mismatches, and self-contradictions — which is exactly the class of defect this project actually caught.

---

## Anti-patterns

- ❌ **Forking the Blue Team** → a fork inherits your framing and only agrees with you
- ❌ **Letting the Blue Team adjudicate** → the accused acting as judge
- ❌ **One agent reviewing, fixing, and re-reviewing** → it will defend its own conclusions
- ❌ **Treating the three reports as "certification"** → same-model review can't catch shared blind spots; verify empirically
- ❌ **Third Party only checking "was it fixed"** → you lose "find new defects" and "audit coverage"
- ❌ **Cramming all 19 dimensions into one pass** → long and shallow. Pick by change type
- ❌ **Shipping a fix without a runnable regression case** → the same problem returns next round
- ❌ **Treating "CI is configured" as "CI has run"** → a check must be able to **actually fail**; an always-green check is no check at all
- ❌ **A beautiful report with no code changed** → don't turn the process into theatre

---

## Compatibility

| Host | Status |
|---|---|
| Claude Code | ✅ Full support (native `subagent`) |
| DeepSeek Harness | ✅ Full support (`subagent` / `send_message`) |
| Cursor / Codex / others | ⚠️ Requires independent subagent dispatch |
| Hosts without subagents | ⚠️ Degrades to one agent playing all three roles serially — **independence is significantly weakened** and the report must say so |

---

## Repo layout

```
adversarial-review/
├── README.md / README.en.md
├── skills/
│   └── adversarial-review/          ← the skill itself (skills.sh layout)
│       ├── SKILL.md                 ← main file (177 lines, 168 of body)
│       ├── references/
│       │   ├── review-dimensions.md ← 19-dimension checklist
│       │   ├── prompt-templates.md  ← role prompt templates
│       │   ├── quickstart.md
│       │   └── skill-spec.md        ← SKILL.md spec cheat sheet
│       ├── examples/sample-review.md
│       └── scripts/                 ← install & verify scripts
├── scripts/                         ← repo-level tooling (not installed with the skill)
│   ├── validate-skill.mjs           ← Agent Skills spec validator
│   ├── test-validate-skill.mjs      ← validator regression tests (20 cases)
│   ├── test-mutations.mjs           ← mutation testing
│   ├── check-docs.mjs               ← doc numeric-claim guard
│   └── check-links.mjs              ← markdown link checker
└── .githooks/pre-commit             ← commit gate
```

---

## Related projects

- [ascend-assistant](https://github.com/RevolutionLA/ascend-assistant) — Agent Skill for operating Ascend NPU servers
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) — Themable skin plugin for DeepSeek Harness

---

## License

[MIT](LICENSE) © RevolutionLA
