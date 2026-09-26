# adversarial-review · Tri-role adversarial code review

[中文](README.md) · **English**

> An Agent Skill that replaces "let me look at this again" with **structured adversarial roles** — hostile audit → independent review → neutral adjudication.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-blue.svg)](skills/adversarial-review/SKILL.md)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20DeepSeek%20Harness%20%7C%20Cursor%20%7C%20Codex-green.svg)](#compatibility)

**Install**: `npx skills add RevolutionLA/adversarial-review` (see [Install](#install))

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

### Proof, not adjectives: the gates can actually go red

These are terminal outputs from a real run just now, not mocks and not "we care about quality". The only test of whether a check is worth anything is whether it can fail.

**1) Re-inject the exact "fixed A, broke B" defect → the commit is rejected**

```bash
# reproduce: put v2.0.1's semantic swap back, then try to commit
sed -i 's/blockStyle === "folded"/blockStyle === "literal"/' scripts/validate-skill.mjs
git add -A && git commit -m "demo: injected regression"; echo "exit=$?"
```

```text
[pre-commit] 运行门禁检查...
validate-skill.mjs 回归测试
--- 二、块标量语义（内容断言，锁住折叠 vs 字面） ---
  ✗ 折叠块结果应以空格连接，不含换行符
      折叠块不应含 \n，实际: "line one here\nline two here"
  ✗ 字面块结果应保留换行符
      字面块应含 \n，实际: "line one here line two here"
  ✗ 块标量之后紧跟另一个块标量，状态不应残留
      description 应是折叠块（不含 \n），实际 "folded one\nfolded two"
结果: 17 通过, 3 失败
[pre-commit] ✗ 回归测试未通过 —— 禁止提交（这正是本项目两次事故的根因）
exit=1
```

*(labels are Chinese because that's the tool's output — verbatim, untranslated.)*

**2) Touch no code, bend one number in the docs → the fifth gate goes red**

```bash
# reproduce: change the README's own "171 of body" claim; SKILL.md untouched
sed -i 's/正文 171 行/正文 180 行/' README.md
node scripts/check-docs.mjs; echo "exit=$?"
```

```text
check-docs: SKILL.md 实测 总 180 行 / frontmatter 9 行 / 正文 171 行；设计要点表 13 条
  ✅ README.md:374 主张 SKILL.md 总行数 = 180（原文"（180 行"） ✅
  ✅ README.en.md:380 主张 SKILL.md 总行数 = 180（原文"(180 lines"） ✅
  ✅ README.en.md:380 主张 SKILL.md 正文行数 = 171（原文"171 of body"） ✅
  ✅ skills/adversarial-review/references/skill-spec.md:31 主张 SKILL.md 正文行数 = 171（原文"正文 171 行"） ✅
  ✅ skills/adversarial-review/references/quickstart.md:72 主张「设计要点」表为 13 条 ✅（实测 13）
  ✅ CHANGELOG.md:19 主张「设计要点」表为 13 条 ✅（实测 13）
  ✗ README.md:374 主张 SKILL.md 正文行数 = 180（原文"正文 180 行"） —— 实测 正文行数为 171
check-docs: 1 处文档主张与实况不符
exit=1
```

That second one is the real class of bug `check-docs.mjs` was built for: **a stale number in the docs while the other gates stayed green**. It blocked a commit of mine for exactly that.

**3) The v2.2 report linter's first victim is our own shipped example**

```bash
# lints the Blue Team summary table: grading high without a live repro,
# a missing "grading basis" column, or an empty location cell → failure
node skills/adversarial-review/scripts/check-report.mjs \
  skills/adversarial-review/examples/sample-review.md
```

```text
check-report: skills/adversarial-review/examples/sample-review.md
  ✗ 2 条声称「实测」，但全文只出现 1 处「复现命令」—— 声称实测必须逐条给出可原样重跑的命令与实际输出（如 B1、B2）
check-report: 1 处不符合 v2.2 定级约束
exit=1
```

That example predates the v2.2 rule, so it **deserves** to fail — the linter doesn't grant grandfather status to the author's own docs. Its regression suite has 11 cases, 2 of which assert *passing*, so the linter can't cheat by failing everything.

*(The `README.md:374` line numbers above move whenever the docs change. Line-number rot is itself one of the recurring findings in our own checklist — dimension 17, documentation consistency — so we flag it rather than pretending it's a constant. This block was regenerated by re-running the repro after the current edit, not hand-patched.)*

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

### An analogy: prosecutor, forensic examiner, the bench

The Third Party and the Adjudicator both look like "neutral third parties". The line between them is: **of the two neutral roles, one still goes out and gathers evidence; the other only rules on the file in front of it.**

| Role | Courtroom counterpart | Stance | Re-investigates? | Output |
|---|---|---|---|---|
| Blue Team | Prosecutor | Yes (presumes guilt) | Yes, to prove charges | List of charges |
| **Third Party** | **Independent forensic examiner** | None | **Yes, revisits the scene** | Another report — which is itself audited |
| **Adjudicator** | **The bench** | None | **No, reads the file only** | The verdict = merged action list |

- **Why the examiner is needed**: the prosecutor's scene investigation has gaps, and the defendant's statement can't be taken at face value. Re-examining the scene lets the examiner both overturn the prosecutor's characterisation ("this crack isn't original damage, the repair itself shook it loose" = **a defect introduced by the fix**) and name dimensions nobody checked at all ("there is a third set of footprints" = **coverage the Blue Team skipped**). Note it is *not* a second defence lawyer — lawyers take sides; the examiner takes none, but still adds findings.
- **Why the bench is needed**: **an expert report is evidence, not a conclusion.** The bench does no fieldwork; it decides which file holds up, and asks whether "the prosecutor and the examiner both quoted the same doctored ledger" — i.e. **the premises both sides share**, the biggest blind spot of same-model adversarial review.
- **One-line test for role creep**: the examiner never writes the verdict; the bench never leaves the courtroom.

> The analogy flatters us: a real court has full adversarial defence (presumption of innocence, benefit of the doubt). This skill deliberately has **no defence counsel** — the author's rebuttal is folded into the adjudicator's rejections and into the Blue Team's obligation to attach evidence. So it's closer to an **inquisitorial** system (all three sides hunt the truth) than an **adversarial** one (two sides fight, judge stays passive).

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

## Why this looks like a judicial procedure

Not rhetoric. Code review and law enforcement face **the same problem**: getting a party with a stake in the outcome to admit it was wrong. So the division of roles converges — and there are exactly **three places it must not**, which say more than "we take quality seriously" ever could.

Where it converges:

| Judicial step | This project | Why it's unavoidable |
|---|---|---|
| Prosecutor bears the burden of proof | Every Blue Team finding needs an evidence chain | An accusation with no burden of proof is noise |
| Independent re-examination of the scene | Third Party trusts no documents, re-reads code, **re-runs the repro commands verbatim** | First responders miss things; the defendant's account can't be taken at face value |
| The bench rules | Adjudicator accepts / rejects / re-grades each finding | **An expert report is evidence, not a conclusion** |
| Appeal / retrial | Next round's Third Party hunts defects introduced by the fix | The first-instance verdict can itself be wrong |
| **The enforcement arm** | **`.githooks/pre-commit` gates** | Without them, ignoring the verdict costs nothing |

Where the analogy breaks — deliberately:

1. **There is no defence counsel.** Cross-examination and exclusionary rules exist because **human cases cannot be replayed**: yesterday's scene is gone, so truth has to be reconstructed by two sides pulling at each other. Code can be run again at any time, so the whole cross-examination stage is replaced by **just execute it**. The author's slot is `RESPONSE-<version>.md` (per-item accept / defer / reject) — that is **the defendant speaking for themselves**, not retained counsel. Making one model also play defence buys two things only: performable advocacy, and a **shared-premise amplifier** (same model, so defence agrees with prosecution in exactly the wrong place).
2. **No separation of powers is needed.** Investigation is split from prosecution to constrain **coercive force** — whoever searches must not decide who is charged. The Blue Team cannot change a line of code or block a release; it can only write findings. **No force, no warrants.**
3. **The evidence rules are stricter, not looser.** Law asks for "beyond reasonable doubt"; we have one machine-checkable equivalent: **no unverified finding may be graded high**. A reasoning-only conclusion caps at 🟡; 🔴/🟠 must ship a command that can be re-run and the actual output it produced. The reason isn't fastidiousness, it's **incentives**: unlinked grading lets a model "claim it ran it" to make a finding look important. So the Third Party re-runs each one and demotes anything that doesn't reproduce, and a linter backs the rule up (sixth gate, below).

> In one line: **every role in this loop exists because somebody in the room can lie.** The Blue Team guards against the author lying, the Third Party against the Blue Team lying, the Adjudicator against both lying together, and the gates against everyone pretending they looked.

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

- **`.githooks/pre-commit` gate (six checks)** — regression tests + mutation tests + spec validation + link check + doc-claim guard + report-linter tests; any failure blocks the commit. Verified to actually block by re-injecting the bug. (Enable: `git config core.hooksPath .githooks`)
- **Doc-claim guard** (`scripts/check-docs.mjs`, new in v2.1) — extracts numeric claims ("SKILL.md has N lines", "the design-points table has M rows") from CHANGELOG/README and diffs them against reality. **Its first run caught the author's own stale line counts** (175→177 unsynced). Verbatim tool output inside fenced code blocks is *not* a claim (otherwise this README couldn't demo its own gate going red); prose is still scanned, and a floor guard requires at least two line-count claim pairs to be extracted, so losing coverage errors out instead of passing silently.
- **Mutation testing** (`scripts/test-mutations.mjs`) — injects 11 defects into the code and checks whether the regression tests **can catch them**. Currently **10 caught / 0 escaped / 1 equivalent mutant**.
- **Report linter** (`skills/adversarial-review/scripts/check-report.mjs`, new in v2.2, **shipped with the skill**) — machine-checks the Blue Team summary table: a 🔴/🟠 may only be graded high on a *measured* basis, every "measured" claim must carry its own repro command, and no location cell may be empty. **Why it exists**: "you must verify" is prose — a model that wants its finding to look important will simply claim it ran the check. Binding grade to evidence and having the Third Party re-run it is what turns fabrication into a *detectable* defect. Its regression suite (11 cases = 2 green + 9 red, each asserting the error text, not just the exit code) is the sixth gate.
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

The main file `SKILL.md` is (180 lines, 171 of body) after frontmatter — those two numbers are not hand-typed: `check-docs.mjs` measures them against the file and a stale number blocks the commit.

```
adversarial-review/
├── README.md / README.en.md
├── skills/
│   └── adversarial-review/          ← the skill itself (skills.sh layout)
│       ├── SKILL.md                 ← main file
│       ├── references/
│       │   ├── review-dimensions.md ← 19-dimension checklist
│       │   ├── prompt-templates.md  ← role prompt templates
│       │   ├── quickstart.md
│       │   └── skill-spec.md        ← SKILL.md spec cheat sheet
│       ├── examples/sample-review.md
│       └── scripts/                 ← install, verify & report-lint scripts (shipped)
├── scripts/                         ← repo-level tooling (not installed with the skill)
│   ├── validate-skill.mjs           ← Agent Skills spec validator
│   ├── test-validate-skill.mjs      ← validator regression tests (20 cases)
│   ├── test-check-report.mjs        ← report linter regression tests (11 cases)
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
