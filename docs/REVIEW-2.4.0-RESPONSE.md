# 对 v2.4.0 第三轮复核（U1–U6）的逐条回应

- **回应对象**：`docs/REVIEW-2.4.0.md`（第三方复核第三轮：6 条 U1–U6，另确认 T2–T7 落地、T1/T8 各留一半）
- **本版**：v2.5.0（2026-09-27）
- **结论**：**U1–U6 六条全部复现成立，全部采纳**（U1/U2/U6 由同一个改动一并收敛）；合并清单里 P0 三条、P1 两条、P2 两条**全部执行**，P1 的「命令 + 输出成对」一条**驳回**，理由写在第五节。另有**两条**是我们自己复查时发现的同类缺陷（下述 T9：正文里独立成反引号的 tag 连 stale 了两版；T10：新判据的第一版把 README 自己演示用的那条命令判红，即 U2 那一侧在我们身上复发了一次），评审方未抓到。
- **本轮的元教训我们照单接受了**：前两轮修的都是上一轮判据的**结构**，没有一轮给当轮判据的**强度**配证明。这条已写进 `CONTRIBUTING.md` 并被 README 双向链接（评审 P2-#7）。
- **每条给三样东西**：落点（文件:行）→ 判据怎么改的 → **能让这条修复失败的检查**（红/绿用例 + 削弱型突变靶子 + 可失败自检语料）。

---

## 一、逐条对应表

| 条目 | 处置 | 代码落点 | 能失败的检查 |
|---|---|---|---|
| U1 🟠 英文占位词照样盖章 | 采纳 | `check-report.mjs:142` `commandish()` 改词法判据（`:108` 可执行名白名单 + 带路径脚本形状） | 用例 21「英文占位词不得算命令」、23「文件名形状不得算命令」、26「命令名混中文指引」/ 突变 P13（认不出的首 token 一律放行即逃逸） |
| U2 🟠 合法裸命令被判红 | 采纳 | 同上：`EXEC.has(head)` 直接放行，`make`/`pytest` 不要求带参数 | 用例 22「裸命令 make / pytest 不得误判为无证据」（**绿**断言）/ 突变 P12（白名单置废即逃逸） |
| U3 🟠 判据强度无人看守 | 采纳 | `test-mutations.mjs:175-198` 新增 P11–P14，形状是"把判据放宽一档" | 削弱 `commandish` 为"非空即真" → 行为套件当场 **21 通过 / 8 失败（共 29）**；只放宽末行 → **25 通过 / 4 失败**（见第二节实验 3，v2.4 对照格也实跑了）；靶子清单 22 → 26 条 |
| U4 🟡 段数对账不认阿拉伯数字 | 采纳 | `check-docs.mjs:354` `DEMO_CN_TOTAL/TAIL` 与 `DEMO_EN_TOTAL` 的数字组加 `\d{1,2}` | `selfTest()` 新增 3 条语料（含"这 4 段须抽出 [4]"、"下面 3 段"重叠命中只算一处主张）；实测「这四段」改成「这 9 段」当场判红 |
| U5 🟡 无锚点序数不受保护 | 采纳（按建议改文档加锚点，另加自曝） | `check-docs.mjs:337` `gateAnchor()`、`:439` 记录无锚点、`:685` 结尾自曝；`README.md:75` 与 `:377` 补脚本名锚点（双语同步） | 锚点后改序数当场判红（第二节实验 5）；`selfTest()` 新增 3 条 `gateAnchor` 语料（超窗口必须判"无锚"，不得静默当作通过） |
| U6 🟡 源码片段/报错日志当命令 | 采纳 | `check-report.mjs:139` `LOOKS_LIKE_OUTPUT` 先剔除"长得像程序输出"的行 + 首 token 必须小写标识符 | 用例 24（围栏内源码片段）、25（围栏内 `npm ERR!`）/ 突变 P14（日志判据置废即逃逸）；v2.4 对这两份构造都是 `exit=0` |
| T9（自查）正文里的独立 tag 主张无人对账 | 采纳 | `check-docs.mjs:508` 正文 `` `vX.Y.Z` `` 与 CHANGELOG 最新版本对账 + `:536` 提取兜底门槛 | 把 `README.md:254` 的 tag 改旧一档即红；本轮实况：URL 已是 v2.5.0，正文那句曾连 stale 两版（v2.3.0） |
| T10（自查）新判据第一版把自家演示命令判红 | 采纳 | `check-report.mjs:146` `asciiOutsideQuotes()`：ASCII 判定只看**引号之外**，`sed -i 's/正文 173 行/正文 180 行/' README.md` 恢复放行 | 用例 27（**绿**断言：引号内含中文的 sed 必须算命令）/ 若把该检查退回整串纯 ASCII，这条当场失败——这正是 U2 的复发形状，我们差点在自己身上再犯一次 |

上一轮 T1–T8：评审方判定 T2–T7 落地、T1/T8 各留一半——留的两半（英文占位词、阿拉伯数字）正是本版 U1 与 U4，未再重复计分。

---

## 二、现场复现（临时副本，命令与输出逐字粘贴）

### 实验 1 · U1：同一招换个语言（v2.4 放行 / v2.5 判红）

```bash
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
git show v2.4.0:skills/adversarial-review/scripts/check-report.mjs > /tmp/cr-2.4.mjs
for f in cn en; do
  node /tmp/cr-2.4.mjs docs/review/bypass-$f.md >/dev/null 2>&1; e1=$?
  node skills/adversarial-review/scripts/check-report.mjs docs/review/bypass-$f.md >/dev/null 2>&1; e2=$?
  echo "占位词（$f）: v2.4 exit=$e1 / v2.5 exit=$e2"
done
```

```text
占位词（cn）: v2.4 exit=1 / v2.5 exit=1
占位词（en）: v2.4 exit=0 / v2.5 exit=1
```

### 实验 2 · U2：`make` / `pytest` 不得再被冤枉

```bash
node skills/adversarial-review/scripts/check-report.mjs docs/review/u2.md   # B1 的证据是 `make`，B2 是 `pytest -q tests/test_x.py`
```

```text
check-report: docs/review/u2.md
check-report: 2 条缺陷（第 5 行的总表），2 条声称实测（其中高危 2 条），逐条取证通过（全文有效「复现命令」2 处）
exit=0
```

同一份文件在 v2.4 下：

```text
  ✗ B1：写了「复现命令」却没有一条像命令的内容 —— 后面的行内代码/围栏块里找不到"命令名 + 参数"或含管道·重定向的片段（`见附录`、`TODO`、纯说明文字都不算证据）
v2.4 exit=1
```

### 实验 3 · U3：把判据整个削弱，这次必须有人变红

评审方在 U3 里做了两种削弱，我们**分别**重跑，并把 v2.4 与 v2.5 各跑一遍——因为写回应文档时我们差点把这两种混成一条（初稿把"整函数替换"在 v2.4 下的结果写成 `20 通过 / 0 失败`，实跑是 `18 通过 / 2 失败`；`20 / 0` 是另一种削弱"只放宽最后一行"的结果。这两格不能合并，合并就是虚报）：

| 削弱方式 | v2.4（20 用例） | v2.5（29 用例） |
|---|---|---|
| A 整函数换成"非空即真" | 18 通过 / 2 失败 —— 只被两条**中文**用例抓到 | **21 通过 / 8 失败** |
| B 只把末行"认不出的名字须带参数"改成 `return true` | **20 通过 / 0 失败**（评审方那一格，复现成立） | 25 通过 / 4 失败 |

```bash
git worktree add -q --detach /tmp/rc24 v2.4.0 && cd /tmp/rc24   # 别在工作区里下毒
node -e 'const fs=require("fs"),p="skills/adversarial-review/scripts/check-report.mjs",s=fs.readFileSync(p,"utf8"),i=s.indexOf("function commandish(raw) {"),j=s.indexOf("\n}\n",i)+3;fs.writeFileSync(p,s.slice(0,i)+"function commandish(raw) {\n  return String(raw).trim().length > 0;\n}\n"+s.slice(j));'
node scripts/test-check-report.mjs 2>&1 | tail -1
```

```text
test-check-report: 18 通过 / 2 失败（共 20）
```

```bash
cd /tmp/rc24 && git checkout -- skills/adversarial-review/scripts/check-report.mjs
sed -i 's/^  return rest\.length > 0.*$/  return true;/' skills/adversarial-review/scripts/check-report.mjs
node scripts/test-check-report.mjs 2>&1 | tail -1
node scripts/test-mutations.mjs   2>&1 | tail -3
```

```text
test-check-report: 20 通过 / 0 失败（共 20）
结果: 21 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
工作区文件字节未变（突变只作用于临时副本），基线仍全绿。
```

```bash
cp -r . /tmp/rc25 && cd /tmp/rc25   # 同样的两招打在 v2.5 上
node -e 'const fs=require("fs"),p="skills/adversarial-review/scripts/check-report.mjs",s=fs.readFileSync(p,"utf8"),i=s.indexOf("function commandish(raw) {"),j=s.indexOf("\n}\n",i)+3;fs.writeFileSync(p,s.slice(0,i)+"function commandish(raw) {\n  return String(raw).trim().length > 0;\n}\n"+s.slice(j));'
node scripts/test-check-report.mjs 2>&1 | tail -1
```

```text
test-check-report: 21 通过 / 8 失败（共 29）
```

```bash
cd /tmp/rc25 && cp /tmp/cr-base.mjs skills/adversarial-review/scripts/check-report.mjs   # 还原后只放宽末行
sed -i 's/^  return toks\.slice(i + 1)\.some((x) => ARGISH\.test(x));.*$/  return true;/' skills/adversarial-review/scripts/check-report.mjs
node scripts/test-check-report.mjs 2>&1 | grep '✗\|共 29'
```

```text
  ✗ 英文占位词不得算命令（评审 U1）：退出码期望 1 实得 0；输出未包含「没有一条像命令」，实际:
  ✗ 文件名形状不得算命令（评审 U1）：退出码期望 1 实得 0；输出未包含「没有一条像命令」，实际:
  ✗ 围栏块里的源码片段不得算命令（评审 U6）：退出码期望 1 实得 0；输出未包含「没有一条像命令」，实际:
  ✗ 白名单外的裸任务名会被错杀（钉住已知代价，勿当正确行为）：退出码期望 1 实得 0；输出未包含「没有一条像命令」，实际:
test-check-report: 25 通过 / 4 失败（共 29）
```

A 格那 **8 条**（v2.4 只有 2 条，且是因为 ASCII 检查被一起删掉才偶然连带）就是评审方说的"没有一条用例打的是判据强度"；B 格是评审方原文那一格，v2.4 确实 `20 / 0` 全绿，本版变成 `25 / 4`——第四格红的是用例 29（`just test` 的已知错杀），它反过来证明"末行放宽"这件事现在有人看着。削弱后的突变测试在 v2.4 照样报 `21 抓住 / 0 逃逸`（上面第三行），这条也复现成立。

另外 P11–P14 四条靶子在干净基线上跑：

```bash
node scripts/test-mutations.mjs 2>&1 | tail -3
```

```text
结果: 25 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
工作区文件字节未变（突变只作用于临时副本），基线仍全绿。
```

一个必须写下来的限制：**下毒之后突变套件跑不动**——`test-mutations.mjs` 拒绝在基线为红时运行（"请先修好测试再跑突变"）。所以"判据被削弱"这件事在本版是由**行为套件当场变红**兜住的，突变靶子 P11–P14 兜的是"干净基线上有人把这四行改弱并提交"。两者不是同一道保险，别读成一道。

### 实验 4 · U4：阿拉伯数字写法

```bash
sed -i '33s/这四段是刚跑出来/这 9 段是刚跑出来/' README.md
node scripts/check-docs.mjs 2>&1 | grep -E "^  ✗|处文档主张"
```

```text
  ✗ README.md:33 主张 首屏演示段数 = 9 —— 实测为 4
check-docs: 1 处文档主张与实况不符
```

### 实验 5 · U5：给文档加锚点之后，改序数就能被抓

```bash
sed -i '75s/第五道门禁/第六道门禁/' README.md   # 该行现写作「第五道门禁（`check-docs.mjs`）变红」
node scripts/check-docs.mjs 2>&1 | grep -E "^  ✗|处文档主张"
```

```text
  ✗ README.md:75 第 6 道门禁 实为 test-check-report.mjs，但同一句里点名了第 5 道的脚本：check-docs.mjs
check-docs: 1 处文档主张与实况不符
```

无锚点的那类主张（评审方判定"静态层面确实无可对账"）现在不再静默通过，改成结尾自曝。这一条在我们锚定 `README.md:377` **之前**跑到的实况：

```text
check-docs: 43 处文档主张全部与实况一致
  ⓘ 1 处「第 N 道门禁」序数主张句内无脚本名，机检器核对不了（改错序数不会红）：README.md:377 第 6 道门禁（实为 test-check-report.mjs） —— 在句里补上脚本名即可变成可核对的主张
```

锚完之后 `ⓘ` 归零，但"无锚即自曝"这条判据由 `check-docs.mjs` 的 3 条 `gateAnchor` 自检语料守住（第三条：脚本落在就近 4 行之外 → 必须判"无锚"）。把 `gateAnchor` 改成永远返回句内文本，那条语料当场失败。

### 实验 6 · U6：源码片段与报错日志

```bash
for f in u6-src u6-log; do
  echo "--- $f (v2.4 / v2.5)"
  node /tmp/cr-2.4.mjs docs/review/$f.md >/dev/null 2>&1; echo "  v2.4 exit=$?"
  node skills/adversarial-review/scripts/check-report.mjs docs/review/$f.md
  echo "  v2.5 exit=$?"
done
```

```text
--- u6-src (v2.4 / v2.5)
  v2.4 exit=0
check-report: docs/review/u6-src.md
  ✗ B1：写了「复现命令」却没有一条像命令的内容 —— 行内代码/围栏块里要找的是「可执行程序名（node / make / pytest / ./x.sh …）+ 参数或管道」这样的真命令；`见附录`、`see appendix`、`notes.md`、源码片段、报错日志都不算证据
check-report: 1 处不符合「未经实测不得定高危」约束（高危须逐条取证）
  v2.5 exit=1
--- u6-log (v2.4 / v2.5)
  v2.4 exit=0
check-report: docs/review/u6-log.md
  ✗ B1：写了「复现命令」却没有一条像命令的内容 —— 行内代码/围栏块里要找的是「可执行程序名（node / make / pytest / ./x.sh …）+ 参数或管道」这样的真命令；`见附录`、`see appendix`、`notes.md`、源码片段、报错日志都不算证据
check-report: 1 处不符合「未经实测不得定高危」约束（高危须逐条取证）
  v2.5 exit=1
```

---

## 三、词法判据的误报面（U2 的另一侧，逐条实跑）

白名单方案的代价是"不认识的程序名怎么办"。我们的取舍是：**认识的直接放行；不认识的必须带一个参数/路径形状**，并在报错文案里把要求写明白，宁可错杀也不放过编造。本轮把 27 种写法（14 应放行 / 13 应判红）逐条喂进 `commandish`，方向**零偏差**。其中后果最重的两格（`make` 不许冤枉、`just test` 会错杀）已钉成走访客通道的行为用例 22 / 29，不再只靠这张手验表：

```bash
# 这张表可原样重跑：把判据函数从机检器里切出来，逐条喂进 27 种写法，断言方向
node --input-type=module -e '
import fs from "node:fs";
const src=fs.readFileSync("skills/adversarial-review/scripts/check-report.mjs","utf8");
const s=src.indexOf("const EXEC"),e=src.indexOf("const inlineCommands");
fs.writeFileSync("/tmp/cmd5.mjs", src.slice(s,e)+"\nexport default commandish;\n");
const c=(await import("/tmp/cmd5.mjs")).default;
const green=["make","pytest","cargo","python","sudo make test","bundle exec rspec","./install.sh","/usr/bin/make -j4","node scripts/check-report.mjs x.md","git show v2.3.0:a/b.mjs","bash .githooks/pre-commit 2>&1 | grep -v x","sed -n \x271,5p\x27 README.md","sed -i \x27s/正文 173 行/正文 180 行/\x27 README.md","node fake.js --evidence"];
const red=["see appendix","TODO: run it","notes.md","见附录","（略）","TODO","附录里的脚本","make （见下一节）","Run the script in the appendix to reproduce this issue.","if (x === undefined) {","npm ERR! code ELIFECYCLE","just test","uvx ruff check src/"];
const bad=[...green.filter(x=>!c(x)),...red.filter(x=>c(x))];
console.log(`共 ${green.length+red.length} 种写法（${green.length} 放行 / ${red.length} 判红），方向不符 ${bad.length} 条`, bad);'
```

```text
共 27 种写法（14 放行 / 13 判红），方向不符 0 条 []
```

```text
make / pytest / cargo / python                      → 放行（U2 的回归锚，已钉成用例 22）
sudo make test / bundle exec rspec                 → 放行（前缀命令穿透 + Ruby 生态裸名）
./install.sh / /usr/bin/make -j4                   → 放行（带路径形状）
node scripts/check-report.mjs x.md                 → 放行
git show v2.3.0:a/b.mjs                            → 放行
bash .githooks/pre-commit 2>&1 | grep -v x         → 放行（管道）
sed -n '1,5p' README.md                            → 放行
sed -i 's/正文 173 行/正文 180 行/' README.md       → 放行（引号内含中文，靠"引号外纯 ASCII"救回，见 T10）
node fake.js --evidence                            → 放行（**这是残留缺口**，见第七节）
see appendix / TODO: run it / notes.md             → 判红（U1 的三种）
见附录 / （略）/ TODO / 附录里的脚本                 → 判红
make （见下一节）                                    → 判红（命令名混中文指引）
Run the script in the appendix to reproduce …      → 判红（英文散文）
if (x === undefined) {                             → 判红（源码片段）
npm ERR! code ELIFECYCLE                           → 判红（是输出，不是命令）
just test / uvx ruff check src/                    → 判红（**白名单没覆盖到，按设计错杀**）
```

最后一条要如实写出：`just` 与 `uvx` 不在 `EXEC` 白名单里，且它们的第一个参数（`test`、`ruff`）不带 flag/路径形状，所以被判红。这是我们主动接受的代价——错杀的修复成本是作者补一个 `--`／路径参数，放过的修复成本是整份报告失去意义。缓解手段已写进报错文案（点名要求）与第七节残留清单。

---

## 四、做得对、值得保持的（我们照抄的部分）

- 评审方把每一条复现命令都补在自己小节里、让 `check-report.mjs` 反过来审自己的报告（`docs/REVIEW-2.4.0.md` 对它自己 `exit=0`，6 处有效取证）——**规则的提出者被规则约束**，这是我们那套东西能被称为闭环的唯一理由。
- 第六节主动标注了两处"命令不能原样重跑"（U6 的嵌套围栏）而不是含糊过去。我们按同一标准办事：本文所有输出都是本机实跑，未做删减。
- 第三节的归因（"每轮修结构、没轮修强度"）比缺陷清单值钱，本版直接落成 `CONTRIBUTING.md` 的元规则，而不是只在 CHANGELOG 里感叹一句。

---

## 五、驳回的一条：「复现命令」必须命令 + 输出成对（P1-#4）

**不采纳，理由三条：**

1. 词法判据落地后，"只有标签没有产出"的构造已经过不去——`see appendix`、`notes.md`、散文、源码、日志全判红（实验 1/6）。这条建议想挡的形状已被挡住。
2. 我们的样例报告与三份真实评审里，大量条目把输出**写在行内或散段里**（例如 `结果: 25 抓住 / 0 逃逸` 这种一行结论），"必须另起一个非空输出围栏块"会把它们判红。这正是项目自己的 R4 原则（**误报会让人关掉检查，比漏报更糟**）要防的事，而 U2 刚刚演示过一次为压漏报牺牲误报的代价。
3. 输出块本身**可以整段手打**（评审方第七节第一条也承认"输出真实性仍无锚"）。加一条形状要求不会增加一分真实性，只会增加一分噪音。

**替代动作**：把"输出真伪无锚"这件事从散落 prose 提到机检器的能力边界声明里（`SKILL.md:106` 已改写为"机检器只能验贴的是不是一条**真命令**"），并在 README 的「能力边界」新增三条明确写出它验不了什么（中英双语）。**一条检查能被信任，前提是它说清自己验不了什么**——这句是评审方上一轮的原话，我们照它改文档。

---

## 六、本版实跑结果（真实 stdout）

```text
node scripts/test-validate-skill.mjs   → 结果: 24 通过, 0 失败
node scripts/test-check-report.mjs     → test-check-report: 29 通过 / 0 失败（共 29）
node scripts/test-mutations.mjs        → 结果: 25 抓住 / 0 逃逸 / 1 等价突变 / 0 无效突变
node scripts/check-docs.mjs            → check-docs: 44 处文档主张全部与实况一致
node scripts/check-links.mjs           → 扫描 30 个 markdown 文件 … ✅ 所有本地链接可达
node skills/adversarial-review/scripts/check-report.mjs skills/adversarial-review/examples/sample-review-v2.2.md → exit=0
node skills/adversarial-review/scripts/check-report.mjs skills/adversarial-review/examples/sample-review.md       → exit=1（2 处不符合，符合预期）
```

六份真实报告全部回归：两份 shipped 样例与 `REVIEW-2.2.0/2.3.0/2.4.0.md` 退出码与 v2.4 一致，**没有新增误报**。

一处诚实标注：本文第三节那 27 种写法里，`sudo make test`、`bundle exec rspec`、`sed -i 's/…/…/'` 等条目是**逐条喂进 `commandish` 的判定结果**（构造文件的等价写法），不是各自跑过一次真实命令；判据本身是否放行与命令是否真存在是两件事，后者仍然只能靠第三方重跑（见第五节第 3 条）。

---

## 七、给下一轮的攻击面（我们知道还开着哪些）

- `node fake.js --evidence` 形状完全合法 → 盖章。**命令真跑过没有，机检器无锚**，只能靠第三方重跑。
- 可执行程序名白名单是**人工枚举**：`just`、`uvx` 这类小众任务运行器会被误杀（第三节末尾那格已钉成用例 29，扩白名单时必须同步改「能力边界」）。缓解手段是报错文案直说要求，作者补一个 flag/路径参数即可通过。
- **放行方向（防误报）的覆盖比判红方向薄**：29 用例里只有 4 条绿锚（用例 22 裸命令 / 27 引号内中文 / 28 陌生名带 flag / 以及合规报告本身），而 `PATHY`（带路径的脚本）与 `WRAPPER`（`sudo`/`time` 穿透）两个分支**没有各自的独立用例**，只被第三节的 27 格手验表覆盖。下一轮若有人把这两行改弱，行为套件不会立刻叫——这是本版已知的不对称，写在这里是为了让它别被当成"两侧都有保险"。
- `check-docs.mjs` 仍然只有 `selfTest()` 这一层保护，没有外部测试套件；它自己的跳过规则被人改弱，只有那几段合成语料会叫。
- 突变靶子仍是枚举清单。P11–P14 钉住的是"这一版判据的强度"，下一版新判据还得再补一类形状——`CONTRIBUTING.md` 的元规则是流程约束，不是机检约束：**没有检查能验证"你为下一个判据配了靶子"**，除非它和靶子同批提交（靠人 review）。

---

*本文按 `references/prompt-templates.md` 的回应文档规格写成：不是评审报告（无六列总表），因此不参与 `check-report.mjs` 取证；判定标准以第二节六项实验的原样输出为准。*
