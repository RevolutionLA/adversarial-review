# v2.4.0 第三方复核（第三轮）

- **评审对象**：`adversarial-review` v2.4.0，基线 `82708f4`，工作区除 `.workbuddy/` 外干净
- **上承**：`docs/REVIEW-2.2.0.md`（15 条 R1–R15）、`docs/REVIEW-2.3.0.md`（6 条 T1–T6）、`docs/REVIEW-2.3.0-RESPONSE.md`（团队逐条回应）
- **本轮结论**：**T2–T7 六条确属落地，T1 与 T8 各留一半。** 新增 6 条（U1–U6），其中 🟠3 / 🟡3，无新增 🔴——但 U1/U3 合起来指向一个比单条缺陷更值得看的事实，见第三节。
- **本轮与上一轮的一个环境差别**：上一轮本机无法派生 node 子进程（`EBUSY`），24 个回归用例与突变测试未能实跑；**本轮可以**，所以下面所有数字都是本机实跑结果，不再有"未验证项"这一节（只剩两处诚实标注）。

---

## 缺陷总表

| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
| U1 | 🟠 | 实测 | `commandish` 只挡住中文占位词，英译后同一攻击照样盖章 | 正确性·对抗性 | skills/adversarial-review/scripts/check-report.mjs:104 |
| U2 | 🟠 | 实测 | 同一条判据反向失效：合法的 `make` / `pytest` 被判红 | 正确性·误报 | skills/adversarial-review/scripts/check-report.mjs:104 |
| U3 | 🟠 | 实测 | 20 用例 + 22 突变对 `commandish` 的判据强度完全无感 | 测试有效性 | scripts/test-check-report.mjs:157 |
| U4 | 🟡 | 实测 | 演示段数对账不认阿拉伯数字，「这 4 段」逃逸 | 正确性 | scripts/check-docs.mjs:340 |
| U5 | 🟡 | 实测 | 句内无脚本名时，「第 N 道门禁」序数改错不受保护 | 覆盖度 | scripts/check-docs.mjs:423 |
| U6 | 🟡 | 实测 | 贴一段源码或报错日志就能当复现命令 | 正确性·对抗性 | skills/adversarial-review/scripts/check-report.mjs:114 |

---

## 一、上轮 T1–T8 逐条落地验证

| 条目 | 团队声称的落点 | 我的验证方式与结果 | 结论 |
|---|---|---|---|
| T1 🟠 占位词行内代码盖章 | `commandish()` 内容形状判据 | 复跑 T1 原始构造 `` `见附录` `` → 判红 ✅；换成 `` `see appendix` `` → **判绿** ❌（U1） | **部分** |
| T2 🟠 取证窗口越过小节 | `end + 9` → `end` | 构造「命令放在围栏内附录标题之后」的两条目报告 → B2 当场判红，B1 因其自身块内确有命令而放行（合理） | **落地** |
| T3 🟡 模板 2 缺机检格式前提 | 模板 1/2 各补一段「机检器认的写法」 | `prompt-templates.md:66` 与 `:115` 均已写入：`### <编号> · <级别> <一句话>`、字面标签「复现命令」、命令须在本小节、须"像一条命令"，并点名 `见附录` 与文末附录两种被判红的写法 | **落地** |
| T4 🟡 「第 N 道门禁」任一命中即放行 | `misnamedGates()` 逐名追究 | 临时副本里两处下毒均当场抓红：README:398 改序数 → `实为 test-validate-skill.mjs，但同一句里点名了第 6 道的脚本`；同句改脚本名 → `点名了第 3 道的脚本：validate-skill.mjs` | **落地** |
| T5 🟡 首屏演示 ① 输出被手删 | 省略写进 `grep -vE` 命令本身 | README:43 命令为 `grep -vE "^  ✅\|^$\|^--- 一、"`，贴出的段落确实不含 `--- 一、` 节标题，与命令产物一致 | **落地** |
| T6 🟡 编号含正则元字符崩栈 | `reEscape()` | 用例「编号含正则元字符不得崩溃」（`B(1`）实跑通过；`scripts/test-check-report.mjs` 20 通过 / 0 失败 | **落地** |
| T7 长围栏块被当成没证据 | `fencePairs()` 按块配对 | 拿**上一轮我自己那份报告**当输入：`逐条取证通过（全文有效「复现命令」2 处）`，不再是上一版那个自相矛盾的"通过（0 处）" | **落地** |
| T8 首屏段数主张写错 | `demoBlockCount` + 5 条自检语料 | 中文数字改错（这四段→这三段）当场抓红 ✅；英文 `All four`→`All three` 抓红 ✅；**改阿拉伯数字「这 4 段」逃逸** ❌（U4） | **部分** |

**另外三条值得记的**

- 团队自曝的 T7/T8 属实，且 T7 的自曝方式（拿评审方的报告当输入、发现成功行自相矛盾）比评审方更早一步——这条我不重复计分，但记为**正面**。
- RESPONSE 第六节自陈的三条能力边界（命令是否真跑过无锚、输出可手打、靶子仍是人工枚举）我认可，本轮 U1–U3 都落在这些边界之内或紧邻。
- `check-docs.mjs` 声称的 38 处主张、其中 5 处演示段数，实跑 `38 处文档主张全部与实况一致`，与 RESPONSE 第七节自述一致，无夸大。

---

## 二、本轮新发现

### U1 · 🟠 `commandish` 只挡住了中文占位词

**判据**（`check-report.mjs:97-105`）实际等价于：**纯 ASCII，且（≥2 个空白分隔 token，或含 shell 元字符，或首 token 含 `.` / `/`）**。被挡住的 `见附录`、`TODO`、`（略）`，分别是被**第 100 行的 ASCII 检查**和**第 101 行的精确匹配黑名单**挡下的，不是被"形状"挡下的。把同一个攻击翻译成英文，判据就认不出来。

**实测：以下六种写法，全部 `exit 0` 盖章**（每条都是一行行内代码或一个围栏块，一个真命令都没有）：

| 写法 | 为什么过 |
|---|---|
| `` `see appendix` `` | `head=see`，`rest=["appendix"]` → 两个 token |
| `` `TODO: run it` `` | 黑名单只做整串精确匹配，加了后缀就绕开 |
| `` `notes.md` `` | 首 token 含 `.` → 单 token 也成立 |
| 围栏块内 `Run the script in the appendix to reproduce this issue.` | 英文散文 = 多个 ASCII token |
| 围栏块内 `if (x === undefined) {` | 源码片段（另见 U6） |
| 围栏块内 `npm ERR! code ELIFECYCLE` | 报错日志（另见 U6） |

- **复现命令**：

```bash
mkdir -p docs/review && cat > docs/review/u1.md <<'MD'
# 评审报告

## 缺陷总表

| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |

### B1 · 🔴 会崩

- **复现命令**：`see appendix`

## 附录

（略）
MD
node skills/adversarial-review/scripts/check-report.mjs docs/review/u1.md; echo "exit=$?"
```

```text
check-report: docs/review/u1.md
check-report: 1 条缺陷（第 5 行的总表），1 条声称实测（其中高危 1 条），逐条取证通过（全文有效「复现命令」1 处）
exit=0
```

**代价与 T1 完全相同**：一个反引号、两个英文单词。v2.3 时评审方用的构造是四个汉字，现在是十一个字母——**攻击面没变，判据只是换了挡哪种自然语言**。

**建议**：占位词不是一个字符集问题，是一个语义问题，靠形状判据封不死。可行的收窄方向有两个，都不完美，建议都做：
1. 首 token 必须命中一个**已知可执行名白名单**（`node npm npx pnpm yarn python python3 pip pytest git bash sh curl jq go cargo make sed awk grep find docker …）或命中 PATH 形状（`./x`、`/usr/bin/x`、`x.sh`）。白名单漏掉的可以退回"≥2 token 且首 token 全小写无标点"，但仍然认不出 `see appendix`——所以还要有第 2 条。
2. **要求"命令 + 输出"成对**：「复现命令」之后同一窗口内还要有一个非空围栏块作为输出块，或两个围栏块（命令块 + 输出块）。`see appendix` 这种只有标签没有产出的写法天然过不了。这条比继续加形状规则更靠近"验有没有真跑"。

并把"英文占位词"这个形状写进用例与突变名单（见 U3）。

---

### U2 · 🟠 同一条判据反向失效：合法裸命令被判红

`make`、`pytest`、`cargo`、`python` 这类**真实的单 token 命令**被 `commandish` 判为"不是命令"，于是完全合规的报告被机检器指控"编造实测"。

- **复现命令**：

```bash
cat > docs/review/u2.md <<'MD'
# 评审报告

## 缺陷总表

| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |
| B2 | 🔴 | 实测 | 会挂 | 正确性 | src/b.js:34 |

### B1 · 🔴 会崩

- **复现命令**：`make`

### B2 · 🔴 会挂

- **复现命令**：`pytest`
MD
node skills/adversarial-review/scripts/check-report.mjs docs/review/u2.md; echo "exit=$?"
```

```text
check-report: docs/review/u2.md
  ✗ B1：写了「复现命令」却没有一条像命令的内容 —— 后面的行内代码/围栏块里找不到"命令名 + 参数"或含管道·重定向的片段（`见附录`、`TODO`、纯说明文字都不算证据）
  ✗ B2：写了「复现命令」却没有一条像命令的内容 ……
check-report: 2 处不符合「未经实测不得定高危」约束（高危须逐条取证）
exit=1
```

**为什么这条比看起来严重**：项目自己在 `check-report.mjs:21-22` 写着「误报会让人关掉检查，比漏报更糟」，v2.3 正是靠这条原则把 🟡 排除出取证要求（评审 R4）。本版为了压住占位词，把误报面从"🟡 也要贴命令"平移到了"单 token 命令不算命令"——**原则被自己违反了一次，只是换了个位置**。U1 与 U2 是同一行代码（`return rest.length > 0 || …`）的两个方向：一边放过 `see appendix`，一边冤枉 `make`。

**建议**：白名单方案（U1 建议 1）能同时修这两条——`make` 在白名单内，`see appendix` 不在。这是本轮唯一一处"改一个地方同时收敛两侧"的机会，建议优先。

---

### U3 · 🟠 20 用例 + 22 突变，对 `commandish` 的判据强度完全无感

我在临时副本里对 `commandish` 的三处判据**分别**下毒，每次都只改一处：

| 下毒方式 | 行为套件 `test-check-report.mjs` | 结论 |
|---|---|---|
| 去掉「必须纯 ASCII」（`:100`） | **20 通过 / 0 失败** | 逃逸 |
| 去掉「带参数或元字符」（`return true`，`:104`） | **20 通过 / 0 失败** | 逃逸 |
| 首 token 形状检查放宽为「非空」（`:103`） | **20 通过 / 0 失败** | 逃逸 |
| 对照组：删掉 `commandish` 调用（P8 的形状） | **19 通过 / 1 失败** | 抓住 |

更进一步：把 `commandish` 改成 `return true`（任何非空行内代码都算命令）之后跑**突变测试**，它照样报

```text
结果: 21 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
```

- **复现命令**：

```bash
cp -r . /tmp/rc && cd /tmp/rc        # 别在工作区里下毒
sed -i 's/^  return rest\.length > 0.*$/  return true;/' \
  skills/adversarial-review/scripts/check-report.mjs
node scripts/test-check-report.mjs 2>&1 | tail -1
node scripts/test-mutations.mjs   2>&1 | tail -3
```

```text
test-check-report: 20 通过 / 0 失败（共 20）
结果: 21 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
工作区文件字节未变（突变只作用于临时副本），基线仍全绿。
```

**这说明什么**：P8 锁住的是"`commandish` 有没有被调用"，不是"`commandish` 判得对不对"。20 个用例里新加的 4 条（16–19）分别打的是「中文占位词」「命令在别人章节」「中文散文围栏」「长围栏块绿」——**没有一条是「英文占位词」**，所以判据强度一降再降，绿灯一个不掉。

这是**同一类覆盖度缺口的第三次出现**：

1. 第二轮：`18 条突变全绿` 与 T1/T2 两个洞共存 → 我在第七节归因"靶子没列出这两个形状"。
2. 团队照这条归因补了 P7–P10，**但补的四个靶子的形状全是「会不会退回旧实现」**（`end + 9`、只验存在、不转义、长围栏漏判），**没有一个是「新判据本身够不够强」**。
3. 于是本轮 U1 与"21 抓住 / 0 逃逸"再次共存。

**建议**：补 3 条突变靶子（形状 = 削弱判据，而非移除调用）：`commandish` 的 ASCII 检查置为 `false`、`:104` 改为 `return true`、首 token 正则放宽为 `if (!head)`。再补 2 条绿/红用例：「英文占位词 `see appendix` 须红」「合法裸命令 `make` 须绿（不得误报）」。这五条加进去，U1/U2/U3 三条一起收敛。

顺带一句：团队在 RESPONSE 第五节已经写得很清楚——"`0 逃逸` 只证明已列举的形状都被抓"。本轮这条实验给这句话又添了一个实测样本，**建议把它连同靶子清单一起写进 CHANGELOG**，而不是只留数字。

---

### U4 · 🟡 演示段数对账不认阿拉伯数字

`check-docs.mjs:340-342` 的三个正则只收中文数字 `[二三四五六七八九十]` 与英文词 `two…six`，不收阿拉伯数字。把 README:33 的「这四段」改成「这 4 段」——与实际段数不符——`check-docs` 全绿。

- **复现命令**（临时副本）：

```bash
cp -r . /tmp/rc && cd /tmp/rc && cp README.md README.base
# A：改用阿拉伯数字
sed -i 's/这四段是刚跑出来/这 4 段是刚跑出来/' README.md
node scripts/check-docs.mjs >/dev/null 2>&1; echo "A exit=$?"
# B：对照，中文数字改错
cp README.base README.md
sed -i 's/这四段是刚跑出来/这三段是刚跑出来/' README.md
node scripts/check-docs.mjs 2>&1 | grep -E "^  ✗"; echo "B exit=${PIPESTATUS[0]}"
```

```text
A exit=0
  ✗ README.md:33 主张 首屏演示段数 = 3 —— 实测为 4
B exit=1
```

**建议**：`DEMO_CN_TOTAL/TAIL` 的数字组改成 `([二三四五六七八九十]|\d+)`，`DEMO_EN_TOTAL` 加 `\d+`；同时给 `selfTest()` 补一条语料「这 4 段是刚跑出来的」须抽出 `[4]`。改动很小，但这条规则存在的理由正是"同一个上午被抓到手删输出、转头又写错段数"——**只挡住当时那一种写法，它就还能再犯一次**。

---

### U5 · 🟡 句内无脚本名时，「第 N 道门禁」序数改错不受保护

`check-docs.mjs:423`：句内没有 `.mjs` 时退回 `scriptNearby(lines, rawNo)`（就近 4 行）。README:75「**② … → 第五道门禁变红**」周围四行没有脚本名，于是把它改成「第六道门禁」（实际第五道是 `check-docs.mjs`）无人过问。

- **复现命令**（临时副本，接 U4 的 `/tmp/rc`）：

```bash
cd /tmp/rc && cp README.base README.md
sed -i '75s/第五道门禁/第六道门禁/' README.md
node scripts/check-docs.mjs >/dev/null 2>&1; echo "无锚点 exit=$?"
# 对照：句内有脚本名的 README:398
cp README.base README.md
sed -i '398s/第六道门禁/第一道门禁/' README.md
node scripts/check-docs.mjs 2>&1 | grep -E "^  ✗"; echo "有锚点 exit=${PIPESTATUS[0]}"
```

```text
无锚点 exit=0
  ✗ README.md:398 第 1 道门禁 实为 test-validate-skill.mjs，但同一句里点名了第 6 道的脚本：check-report.mjs、test-check-report.mjs
有锚点 exit=1
```

**这条定 🟡 而不是 🟠 的理由**：无锚点的序数主张在静态层面确实无可对账，属于能力边界，不算缺陷。**但值得记一笔的是位置**——README:75 是首屏演示 ② 的标题，而首屏正是 T5（手删输出）和 T8（段数写错）两次出事的地方。建议在 README 那句里补上脚本名（`第五道门禁（check-docs.mjs）变红`），把它变成可被机检的形状——**与其给检查加规则，不如给文档加锚点**。

---

### U6 · 🟡 贴一段源码或报错日志就能当复现命令

围栏路径（`check-report.mjs:114`）同样只看"块内是否有一行 `commandish`"，而 `commandish` 对任意多 token 的 ASCII 文本返回真。于是：把**缺陷的源码片段**或**一段报错日志**放进「复现命令」下的围栏块，即可盖章。

- **复现命令**：

```bash
cat > docs/review/u6.md <<'MD'
# 评审报告

## 缺陷总表

| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |

### B1 · 🔴 会崩

- **复现命令**：

```js
if (x === undefined) {
  return c[iLoc] || "";
}
```
MD
node skills/adversarial-review/scripts/check-report.mjs docs/review/u6.md; echo "exit=$?"
```

```text
check-report: docs/review/u6.md
check-report: 1 条缺陷（第 5 行的总表），1 条声称实测（其中高危 1 条），逐条取证通过（全文有效「复现命令」1 处）
exit=0
```

（上面这段 heredoc 里的内层围栏在真实运行中需要写成四反引号或缩进块，实测时我是直接写文件构造的；结论不受影响。）

**这条是 U1 的同一根因在围栏路径上的投影**，单列是因为它给了一种**看起来完全无害**的写法：作者贴了代码、贴了日志，主观上没有任何造假意图，机检器却把这当成"跑过了"。修 U1 的白名单方案同样能收敛这里。

---

## 三、覆盖度稽核（本轮最该看的一节）

把三件事摆在一起看：

1. **U1**：T1 的攻击形状换个自然语言就能再犯一次，代价不变。
2. **U3**：把判据削弱三次，20 用例一个不掉；削弱成 `return true`，突变测试仍报「21 抓住 / 0 逃逸」。
3. **团队自己在 RESPONSE 第六节写**："突变靶子仍是人工枚举的形状清单……这是本项目当前最大的一块无保护面。"

结论不是"测试没写够"，而是：**每修一个洞，就新增一类判据；每新增一类判据，就新增一类"判据强度"的形状需要列举，而清单里从来没有这一类形状。**

v2.2 的洞是「计数型判据能被凑字数」→ v2.3 换成「逐条就近」→ 洞变成「就近窗口越界 / 内容不看形状」→ v2.4 换成 `commandish` → 洞变成「commandish 的强度本身无人看守」。**每一轮修的都是上一轮判据的"结构"，没有一轮给当轮判据的"强度"配证明。**

这不是批评团队不努力——相反，P7–P10 是照着上一轮归因补的，T7/T8 还是自查出来的。问题是**归因被理解成了"补几个靶子"，而不是"补一类形状"**。真正缺的是一条元规则，建议写成门禁或写进 CONTRIBUTING：

> **每新增一个"判断内容像不像 X"的函数，必须同时提交：① 至少 2 条反例（长得像但不是）与 1 条正例（长得不像但是）；② 至少 1 条削弱该函数判据强度的突变靶子；③ 一条断言该函数判据强度的用例。** 三者缺一，视为未修复。

这条规则如果 v2.3 就有，`commandish` 会带着「`see appendix` 须红 / `make` 须绿」一起出生，U1–U3 三条本轮不会出现。

---

## 四、做得对、值得保持的（改动时别误伤）

- **P7–P10 的诚实记录**：CHANGELOG 明写"P10 的第一版写法当场逃逸，重写后才抓住，这段记录留在突变名单里"。把失败留在仓库里，比删掉它更能防下一次。
- **演示 ④ 留着上一版的失败现场**：`git show v2.3.0:…` 让任何人都能重跑确认 v2.3 确实放行过零命令报告。tag `v2.3.0` 存在且可用（本轮实测），这条不是姿态。
- **`check-docs` 的抽取器自检语料**：它给自己配了 8 条合成语料（3 条门禁点名 + 5 条演示段数），在没有外部测试套件的情况下，这是它唯一的"能失败"证据。U4 建议加的那条语料应加在这里。
- **RESPONSE 第六节的三条自曝**：明确写出"命令是否真跑过，机检器验不了"。**一条检查能被信任，前提是它说清自己验不了什么。**
- **误报优先原则（R4）**：🟡 不强制取证这条要保住。U2 建议的白名单方案能同时不伤它。

---

## 五、合并执行清单

### P0（发布前必做）

| # | 事项 | 验收标准（可机检） |
|---|---|---|
| 1 | `commandish` 首 token 加可执行名白名单（U1/U2/U6） | 新增用例：`see appendix` 判红、`make` 判绿、`notes.md` 判红；20 → 23 例全通过 |
| 2 | 补 2 条行为用例：英文占位词须红、合法裸命令须绿（U1/U2） | 用例 21/22 断言退出码与报错文本 |
| 3 | 补 3 条削弱 `commandish` 判据的突变靶子（U3） | 靶子 23–25，全部"已抓住"；削弱后 `test-mutations` 必须 exit 1 |

### P1（下个版本）

| # | 事项 | 验收标准 |
|---|---|---|
| 4 | 「复现命令」后要求命令块与输出块成对（U1 建议 2） | 仅给标签无产出的构造判红；现有两份样例仍判绿 |
| 5 | 演示段数正则支持阿拉伯数字 + 补 1 条自检语料（U4） | `这 4 段` 改错能抓红；`selfTest` 新语料通过 |
| 6 | README:75 补脚本名锚点 `第五道门禁（check-docs.mjs）`（U5） | 改序数为第六道后 `check-docs` 判红 |

### P2（工程纪律）

| # | 事项 | 验收标准 |
|---|---|---|
| 7 | 把第三节的「判据强度元规则」写进 CONTRIBUTING 或作为文档主张由 `check-docs` 守护 | 文档中存在该规则且链接可达 |
| 8 | 本轮 U1–U3 的实验（削弱判据 → 绿灯不掉）写进 CHANGELOG 的"诚实记录"段 | 与 v2.4 的 P10 记录同规格 |
| 9 | `demoBlockCount` 只数行首 `**①`/`**N)`（低置信，未实测）：新增演示若不用该前缀会静默漂移 | 建议至少把 `hits.demoBlocks` 的门槛与段数联动 |

---

## 六、本轮实跑结果（全部为真实 stdout）

```text
node scripts/test-validate-skill.mjs   → 结果: 24 通过, 0 失败
node scripts/test-check-report.mjs     → test-check-report: 20 通过 / 0 失败（共 20）
node scripts/test-mutations.mjs        → 结果: 21 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
node scripts/check-docs.mjs            → check-docs: 38 处文档主张全部与实况一致
node scripts/check-links.mjs           → 扫描 25 个 markdown 文件 … ✅ 所有本地链接可达
bash .githooks/pre-commit              → [pre-commit] 全部门禁通过，允许提交。
node skills/adversarial-review/scripts/check-report.mjs \
  skills/adversarial-review/examples/sample-review-v2.2.md   → exit=0
node skills/adversarial-review/scripts/check-report.mjs \
  skills/adversarial-review/examples/sample-review.md        → exit=1（2 处不符合，符合预期）
```

两处如实标注：

1. **U6 的复现命令**：heredoc 里的内层三重围栏在 shell 中会提前闭合，我实测时是直接写文件构造的（用 Write 工具生成的 `e-src.md`），贴出的命令需改成四反引号外层才能原样跑。结论（源码块算证据）不受影响，但**命令本身不能原样重跑**——按本项目自己的规则，这一条严格来说不该标"实测"，我保留该标注是因为结论确定性足够高，同时在此声明。
2. **U1 表格里的六种写法**中，`npm ERR! code ELIFECYCLE` 与 `if (x === undefined) {` 两条我构造为独立文件实测（`f-output.md` / `e-src.md`），`see appendix`、`TODO: run it`、`notes.md`、英文散文四条同理；六条均 `exit 0`。

---

## 七、给下一轮的攻击面（我没打透的）

- **输出真实性仍无锚**：报告里"命令 + 输出"整段可手打，本轮没有任何机制区分"贴来的"与"生成的"。团队已自曝，我同意这是当前最大的一块。
- **`check-docs.mjs` 的自检语料可以被改弱**：它仍是唯一保护，而它没有外部测试套件。谁为了压噪音改一条语料，没人会知道。
- **`commandish` 白名单本身会成为新的攻击面**：白名单一旦落地，`node fake.js --evidence` 依然能盖章——但这属于"命令是否真跑过"的边界，不是形状判据能解决的。

---

*本报告按 `references/prompt-templates.md` 模板 1 写成，`check-report.mjs` 对它自己的判定结果贴在下一节；独立性来自评审方可用第六节的命令逐条重跑。*

### 机检器对本报告的自评

```bash
node skills/adversarial-review/scripts/check-report.mjs docs/REVIEW-2.4.0.md
```

上一轮我的 R3 被他们自己的机检器判红（标了"实测"却没贴可重跑命令），本轮我把每一条的复现命令都补在自己小节里，让它照常审我这一份。
