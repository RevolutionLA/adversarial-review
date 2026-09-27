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
> **30-second gut feel**: read a [real review sample](skills/adversarial-review/examples/sample-review.md) with full evidence chains (produced before the current rule, so our linter fails it — the reason is stated inside), or a [compliant sample](skills/adversarial-review/examples/sample-review-v2.2.md) written to today's rules.

### Proof, not adjectives: the gates can actually go red

These are terminal outputs from a real run just now, not mocks and not "we care about quality". The only test of whether a check is worth anything is whether it can fail.

**1) Re-inject the exact "fixed A, broke B" defect → the gate exits 1 and the commit dies**

```bash
# reproduce in a scratch copy (`cp -r` the repo first — don't do this in your worktree)
sed -i 's/if (blockStyle === "folded")/if (blockStyle === "literal")/' scripts/validate-skill.mjs
bash .githooks/pre-commit 2>&1 | grep -vE "^  ✅|^$|^--- 一、"; echo "exit=${PIPESTATUS[0]}"
```

```text
[pre-commit] 运行门禁检查...
validate-skill.mjs 回归测试
--- 二、块标量语义（内容断言，锁住折叠 vs 字面） ---
  ✗ 折叠块结果应以空格连接，不含换行符
      折叠块不应含 \n，实际: "line one here\nline two here"
  ✗ 字面块结果应保留换行符
      字面块应含 \n，实际: "line one here line two here"
  ✗ 折叠块里的空行是段落分隔，应折成一个换行（评审 R5）
      空行应折成恰好一个 \n（段落分隔），实际: "line one here\n\nline two here"
  ✗ 折叠块里的连续空行按 YAML 语义累积（段落分隔不被吞）
      两个空行应累积成两个 \n，实际: "line one here\n\n\nline two here"
  ✗ 字面块里的 # 开头行是内容，不得当注释丢弃（评审 R5）
      # 行被丢弃或错位，实际: "heading # not a comment tail"
  ✗ 字面块里的空行必须原样保留（评审 R5）
      字面块应保留空行，实际: "heading\ntail"
  ✗ 块标量之后紧跟另一个块标量，状态不应残留
      description 应是折叠块（不含 \n），实际 "folded one\nfolded two"
--- 三、长度上限校验（蓝军 B1 的核心危害） ---
--- 四、必须报错的情形（修复不能放松检出） ---
--- 五、不能误伤的正常写法 ---
结果: 17 通过, 7 失败
[pre-commit] ✗ 回归测试未通过 —— 禁止提交（这正是本项目两次事故的根因）
exit=1
```

*(Labels are Chinese because that's the tool's output — verbatim, untranslated. The elision now lives **in the command**: `grep -vE "^  ✅|^$|^--- 一、"` drops passing cases, blank lines and the section-1 heading, so what you see is byte-for-byte what that command prints. The previous version of this block had been trimmed by hand — several failing cases were simply missing from it (3 here, 2 in the Chinese README), which is exactly finding T5 in the second external review.)*

**2) Touch no code, bend one number in the docs → the fifth gate (`check-docs.mjs`) goes red**

```bash
# reproduce: change the README's own "正文 173 行" claim; SKILL.md untouched
sed -i 's/正文 173 行/正文 180 行/' README.md
node scripts/check-docs.mjs 2>&1 | grep -E "^check-docs:|^  ✗"; echo "exit=${PIPESTATUS[0]}"
```

```text
check-docs: SKILL.md 实测 总 182 行 / frontmatter 9 行 / 正文 173 行；设计要点表 13 条；维度 19 项；门禁 6 道；用例 校验器 24 / 机检器 29；突变 26 条；版本 2.5.0
  ✗ README.md:460 主张 SKILL.md 正文行数 = 180（原文"正文 180 行"） —— 实测 正文行数为 173
check-docs: 1 处文档主张与实况不符
exit=1
```

That second one is the real class of bug `check-docs.mjs` was built for: **a stale number in the docs while the other gates stayed green**. It blocked a commit of mine for exactly that. Since v2.3 it reconciles more than line counts: dimension count, number of gates, *which script* the docs claim is the Nth gate, both regression suites' case counts, the mutation count, `SKILL.md`'s version vs the latest CHANGELOG entry, and the tag the installer below is pinned to.

**3) The report linter: our historical example goes red, the compliant example goes green**

```bash
# lints the Blue Team summary table: a finding claimed as *measured* must carry
# its own repro command and real output inside its own section
node skills/adversarial-review/scripts/check-report.mjs \
  skills/adversarial-review/examples/sample-review.md
node skills/adversarial-review/scripts/check-report.mjs \
  skills/adversarial-review/examples/sample-review-v2.2.md
```

```text
check-report: skills/adversarial-review/examples/sample-review.md
  ✗ B1：声称实测，但自己的展开段落里没有「复现命令」 —— 只在总表里写"实测"两个字不构成证据
  ✗ B2：声称实测，但自己的展开段落里没有「复现命令」 —— 只在总表里写"实测"两个字不构成证据
check-report: 2 处不符合「未经实测不得定高危」约束（高危须逐条取证）
exit=1
check-report: skills/adversarial-review/examples/sample-review-v2.2.md
check-report: 4 条缺陷（第 29 行的总表），3 条声称实测（其中高危 2 条），逐条取证通过（全文有效「复现命令」2 处）
exit=0
```

That first example predates the rule, so it **deserves** to fail — the linter doesn't grant grandfather status to the author's own docs. Its regression suite (`scripts/test-check-report.mjs`, 29 cases, 8 of which assert *passing*) stops it from cheating by failing everything.
**v2.3 changed how evidence is collected: per finding, in place.** Until then the linter just counted how many times the four characters 「复现命令」 appeared anywhere in the report — an external reviewer proved that **typing those four characters once lets through any number of fabricated high-severity findings**. Counting-based checks are gameable by construction.
**v2.4 went one step further: from "is something there" to "does it look like a command".** The second review round showed that v2.3 still rubber-stamped a report with *zero* commands: `- **复现命令**：\`见附录\`` passed, because the test was only "two backticks with ≥3 characters inside" (T1), and the evidence window was written `end + 9`, so one script dropped into the appendix right after a section served every high finding in the report (T2). Commands must now sit **inside the finding's own section** and actually look like a command.

**v2.5 discovered that "look like" was itself the hole.** The third review round translated the same attack into English — `` - **复现命令**：`see appendix` `` — and the linter stamped it again; pasting a source snippet or an `npm ERR!` log line worked too (U1/U6), while real one-word commands like `make` and `pytest` were flagged as fake (U2). **A shape-based test only blocks Chinese placeholders.** The check is now lexical: the first token must be a known executable name (`node`, `make`, `pytest`…) or a path-shaped script (`./install.sh`), followed by an argument or pipe, and program-output-looking lines (tracebacks, `at Foo.bar(`) are rejected up front.

**4) Two zero-command reports: the old linter blocked the Chinese placeholder only, the new one blocks both**

```bash
# step 1: two fixtures — label present, inline code is a placeholder; the second is the same thing in English
mkdir -p docs/review && cat > docs/review/bypass-cn.md <<'MD'
# 蓝军报告

## 缺陷总表

| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
| B1 | 🔴 | 实测 | 会导致崩溃 | 正确性 | src/a.js:12 |

### B1 · 🔴 会导致崩溃

- **复现命令**：`见附录`

## 附录

（略）
MD
sed 's/`见附录`/`see appendix`/' docs/review/bypass-cn.md > docs/review/bypass-en.md

# step 2: pull the v2.4 linter out of the tag and point both versions at the same two files
git show v2.4.0:skills/adversarial-review/scripts/check-report.mjs > /tmp/cr-2.4.mjs
for f in cn en; do
  node /tmp/cr-2.4.mjs docs/review/bypass-$f.md >/dev/null 2>&1; e1=$?
  node skills/adversarial-review/scripts/check-report.mjs docs/review/bypass-$f.md >/dev/null 2>&1; e2=$?
  echo "占位词（$f）: v2.4 exit=$e1 / v2.5 exit=$e2"
done
node /tmp/cr-2.4.mjs docs/review/bypass-en.md   # verbatim: the old linter passing the English placeholder
```

```text
占位词（cn）: v2.4 exit=1 / v2.5 exit=1
占位词（en）: v2.4 exit=0 / v2.5 exit=1
check-report: docs/review/bypass-en.md
check-report: 1 条缺陷（第 5 行的总表），1 条声称实测（其中高危 1 条），逐条取证通过（全文有效「复现命令」1 处）
```

*(This demo records a hole **in our own previous release**: v2.4 claimed to test "does it look like a command", but `见附录` was rejected only by the non-ASCII rule, while `see appendix` passed for being plain ASCII with two words. **Translating an attack defeats a shape test** — that is why the judge is lexical now. The old version stays reproducible through its own tag, so anyone can confirm v2.4 really did rubber-stamp the English placeholder. Fixtures live under `docs/review/`, which is gitignored and not shipped.)*

*(The `README.md:460` line numbers above move whenever the docs change. Line-number rot is itself one of the recurring findings in our own checklist — documentation consistency, dimension 17 — so we flag it rather than pretending it's a constant. All four blocks were regenerated by re-running the repros after this edit, not hand-patched.)*

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

The URLs are pinned to a **reviewed release tag** (`v2.5.0`), not to `main` — a one-liner pointed at `main` pipes whatever unreviewed commit landed an hour ago straight into your skills directory.

**Read it, then run it** (two steps, ~30 seconds):

```bash
# Step 1: read the script first — where it writes, what it does to an existing install
curl -fsSL https://raw.githubusercontent.com/RevolutionLA/adversarial-review/v2.5.0/skills/adversarial-review/scripts/install.sh | less
```

```bash
# Step 2: run it once you agree with what you read
curl -fsSL https://raw.githubusercontent.com/RevolutionLA/adversarial-review/v2.5.0/skills/adversarial-review/scripts/install.sh | bash
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
# Step 1: read
irm https://raw.githubusercontent.com/RevolutionLA/adversarial-review/v2.5.0/skills/adversarial-review/scripts/install.ps1 | more
# Step 2: run
irm https://raw.githubusercontent.com/RevolutionLA/adversarial-review/v2.5.0/skills/adversarial-review/scripts/install.ps1 | iex
```
</details>

> That tag isn't typed by hand: `check-docs.mjs` diffs the tag in these two URLs against the latest CHANGELOG version, so updating one and forgetting the other blocks the commit.

> If a previous install exists, the script **moves it into a `skill-backups/` directory outside the skills dir** before overwriting — your local edits are preserved, and the backup can never linger as a ghost skill hijacking triggers. Only the 3 most recent backups are kept.

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

Two worked examples: [`examples/sample-review.md`](skills/adversarial-review/examples/sample-review.md) (real output, pre-rule) and [`examples/sample-review-v2.2.md`](skills/adversarial-review/examples/sample-review-v2.2.md) (current rules, passes the linter).

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
3. **The evidence rules are stricter, not looser.** Law asks for "beyond reasonable doubt"; we have one machine-checkable equivalent: **no unverified finding may be graded high**. A reasoning-only conclusion caps at 🟡; 🔴/🟠 must ship a command that can be re-run and the actual output it produced. The reason isn't fastidiousness, it's **incentives**: unlinked grading lets a model "claim it ran it" to make a finding look important. So the Third Party re-runs each one and demotes anything that doesn't reproduce, and a linter backs the rule up (the sixth gate `test-check-report.mjs`, below).

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
| **v2.4.0, external review round 2 (6 findings)** | The reviewer re-checked every one of our fixes (14 landed, 1 partial), then proved "per finding, in place" was only half done: `- **复现命令**：\`见附录\`` let a 🔴 through with `exit 0` (the test was only "does a backtick exist"), and the `end + 9` evidence window let one appendix script serve every high finding. **"A code block exists somewhere" is as gameable as a keyword count.** The other four: template 2 never stated the format the linter requires, the Nth-gate naming audit was immune inside long sentences, the first-screen demo had a hand-deleted section with no elision marker, and finding IDs with regex metacharacters crashed the linter. The stingiest part was their section 7: **18 green mutations coexisted with both bypasses** — the target list simply had no "evidence boundary" shape in it |
| **v2.4.0, external review round 3 (6 findings)** | The same trick came back after one translation: `` - **复现命令**：`see appendix` `` let a 🔴 through with `exit 0`, and so did a pasted source snippet or an `npm ERR!` log line (U1/U6) — while real one-word commands (`make`, `pytest`) were flagged red (U2). **A shape test had only been blocking Chinese placeholders; only lexicon converges.** The ugliest one was U3: the reviewer replaced `commandish` with `return true` and *nothing* went red — 20 cases passed, the mutation suite still reported "21 caught / 0 escaped", because none of those 22 targets had the shape "weaken the current judge". Third time the same coverage hole recurred, so v2.5 writes the meta-rule into `CONTRIBUTING.md` |

### Quality infrastructure that came out of it

- **`.githooks/pre-commit` gate (six checks)** — regression tests + mutation tests + spec validation + link check + doc-claim guard + report-linter tests; any failure blocks the commit. Verified to actually block by re-injecting the bug. (Enable: `git config core.hooksPath .githooks`)
- **Doc-claim guard** (`scripts/check-docs.mjs`, new in v2.1, extended in v2.3) — extracts numeric claims ("SKILL.md has N lines", "the design-points table has M rows", "the gate has N checks", "the suite has N cases", "the installer is pinned to tag X") from CHANGELOG/README and diffs them against reality. **Its first run caught the author's own stale line counts** (175→177 unsynced). Verbatim tool output inside fenced code blocks is *not* a claim (otherwise this README couldn't demo its own gate going red); prose is still scanned, and a floor guard requires at least two line-count claim pairs to be extracted, so losing coverage errors out instead of passing silently. Since v2.3 it also runs an **extractor self-test** on synthetic fixture lines — skip rules are code too, and they can be weakened to silence a check. It guards `scripts/test-validate-skill.mjs` (24 cases) and `scripts/test-check-report.mjs` (29 cases) as well; since v2.4 its self-test fixture set also covers the *Nth-gate naming* audit (a wrong script named inside a long sentence must be caught, a correct one must not) and the first-screen demo's block count, and v2.5 makes that count readable in Arabic numerals (`these 4 blocks` is audited like `all four blocks`) while **Nth-gate ordinals with no script name in the sentence are self-reported as unverifiable** instead of passing silently — `check-docs.mjs` has no external test suite, so that fixture block is its only proof that it can fail.
- **Mutation testing** (`scripts/test-mutations.mjs`) — injects 26 defects (12 into the validator, 14 into the report linter) and checks whether the regression tests **can catch them**. Latest real run: **25 caught / 0 escaped / 1 equivalent mutant / 0 invalid**; mutations are applied to temp copies only, never the working tree.
  - **Why it exists**: the round-3 reviewer set `commandish` to `return true` and *nothing* went red — 20 cases still passed and the suite still reported "21 caught / 0 escaped", because every target in that list had the shape "revert to the old implementation", none had the shape "weaken the current judge". v2.5 added four weakening targets (P11–P14) and wrote the meta-rule into `CONTRIBUTING.md`.
  - **Why it's needed**: green tests ≠ effective tests. This project's regression suite once let 5 mutations escape — including one where deleting the length-limit check caused a **1235-character illegal description to be reported as passing**. Since v2.3 the report linter is itself a mutation target: a linter that only ever passes compliant reports is as dangerous as no linter.
- **Report linter** (`skills/adversarial-review/scripts/check-report.mjs`, new in v2.2, per-finding evidence in v2.3, shape-based evidence in v2.4, lexical evidence in v2.5, **shipped with the skill**) — machine-checks the Blue Team summary table: a 🔴/🟠 may only be graded high on a *measured* basis, each "measured" high finding must carry **inside its own section** a repro command that is an actual command (executable name + arguments, or a path-shaped script), and no location cell may be empty. **Why it exists**: "you must verify" is prose — a model that wants its finding to look important will simply claim it ran the check. Binding grade to evidence and having the Third Party re-run it is what turns fabrication into a *detectable* defect. Its regression suite (`scripts/test-check-report.mjs`, 29 cases = 8 green + 20 red + 1 usage error, each asserting the error text, not just the exit code) is the sixth gate.
- **Agent Skills spec validator** (`scripts/validate-skill.mjs`) — zero-dependency, usable as a general-purpose tool for your own skills.

---

## Honest limitations (please read)

> ⚠️ **Subagents and the main agent are usually the same model — this is not a genuinely independent third party.**
> The value comes from **role constraints plus mandatory evidence**, not from "another AI's opinion".

- ✅ **Reliably catches**: code-level errors, logic holes, fabricated tests, self-contradictions, missed branches, **declared-vs-actual mismatches**
- ❌ **Cannot catch**: **shared blind spots** — e.g. a mutual misunderstanding of an upstream system's behaviour

**Implication**: if a conclusion depends on external system behaviour, it must be **empirically verified** — not settled by two agents nodding at each other.

**The report linter has a ceiling too**, and pretending otherwise would turn it into a "certification":

- It checks **lexicon** (is the first token an executable name, is there an argument after it), not *did this command actually run*. `node fake.js --evidence` is lexically perfect and still gets stamped.
- It checks *a command sits in this section*, not *the output below it was produced rather than typed*. Whether the output is real is pushed entirely onto the Third Party's re-run — which is why that step must actually execute the commands, not read about them.
- The whitelist itself is **hand-enumerated**: an unfamiliar bare task name gets killed by mistake (`just test`, `uvx ruff check src/` are red today). Any unknown name passes as soon as it carries one flag or path-shaped argument (`xtask --release`), and the error text states that requirement verbatim. **False kills are a chosen cost** — pinned as a test case, so anyone widening the whitelist must update this paragraph in the same commit.

- Its mutation list (P1–P14) is a **hand-enumerated** set of shapes; "0 escaped" only proves the listed ones are caught. Round 3 demonstrated this by replacing the judge with `return true`, so v2.5 added four *weakening* targets and wrote the meta-rule ("every new judge ships a weakening target") into `CONTRIBUTING.md`.

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

The main file `SKILL.md` is (182 lines, 173 of body) after frontmatter — those two numbers are not hand-typed: `check-docs.mjs` measures them against the file and a stale number blocks the commit.

```
adversarial-review/
├── README.md / README.en.md
├── skills/
│   └── adversarial-review/          ← the skill itself (skills.sh layout)
│       ├── SKILL.md                 ← main file
│       ├── references/
│       │   ├── review-dimensions.md ← dimension checklist
│       │   ├── prompt-templates.md  ← role prompt templates
│       │   ├── quickstart.md
│       │   └── skill-spec.md        ← SKILL.md spec cheat sheet
│       ├── examples/                ← one compliant sample + one pre-rule historical sample
│       └── scripts/                 ← install, verify & report-lint scripts (shipped)
├── CONTRIBUTING.md                    ← the judge-strength meta-rule (what a new predicate must ship with)
├── scripts/                         ← repo-level tooling (not installed with the skill)
│   ├── validate-skill.mjs           ← Agent Skills spec validator
│   ├── test-validate-skill.mjs      ← validator regression tests
│   ├── test-check-report.mjs        ← report linter regression tests
│   ├── test-mutations.mjs           ← mutation testing (26 injected defects)
│   ├── check-docs.mjs               ← doc numeric-claim guard
│   └── check-links.mjs              ← markdown link checker
└── .githooks/pre-commit             ← commit gate
```

> Case counts are deliberately **absent from the tree**: numbers inside a fenced block are invisible to the doc-claim guard, so they would become unguarded orphan claims. They appear only twice, in prose that names the script file — which is what lets `check-docs.mjs` attribute them.

---

## Related projects

- [ascend-assistant](https://github.com/RevolutionLA/ascend-assistant) — Agent Skill for operating Ascend NPU servers
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) — Themable skin plugin for DeepSeek Harness

---

## License

[MIT](LICENSE) © RevolutionLA
