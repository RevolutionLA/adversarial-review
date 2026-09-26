#!/usr/bin/env node
// check-report.mjs — 蓝军/第三方「缺陷总表」机检器（v2.3.0）
//
// 为什么需要："必须实证"写进 SKILL.md 也只是一句**散文约束**——模型想让
// 自己的高危结论有分量时，会直接声称"我跑过了"而根本没跑。v2.2 把定级与
// 实测绑定（未经实测不得定高危），而绑定规则若没有机器兜底，只会退化成
// 又一句口号。本检查只干一件事：让"编造的实测"变成**可被发现**的事。
//
// v2.3 修掉的一个真实绕过（外部评审 R1）：早先版本用"全文出现『复现命令』
// 四个汉字的次数 ≥ 声称实测的条数"当证据计数。于是一份正文里只写了
// `## 复现命令` 空标题、一条命令都没有的报告能判绿——**计数型校验天然可被
// 凑字数**，改成按条目就近匹配：每个 🔴/🟠 实测条目必须有自己的展开段落，
// 段落里的「复现命令」后面必须真的跟着一段命令（行内代码或围栏块 + 内容）。
//
// 只管 🔴/🟠，不管 🟡（评审 R4）：模板规定 🟡 不展开，若要求 🟡 也贴命令，
// 完全合规的产出会被判红——而误报会让人直接关掉检查，比漏报更糟。
//
// 防"永远绿"（本项目核心信条）：找不到总表 / 总表零数据行 / 一个级别 emoji
// 都没解析到，一律判失败——提取错位导致的静默通过比报错危险得多。
//
// 用法：node check-report.mjs <报告.md> [更多报告.md]
// 退出码：0 = 全部合规；1 = 存在缺陷；2 = 用法错误（无参数）——用法错误不是检查失败
//
// 格式与 references/prompt-templates.md 模板 1/模板 2 的六列总表对齐：
//   | 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
// 定级依据取值只能是 `实测` 或 `推理·待实测`；展开条目标签为 `复现命令`。

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("用法：node check-report.mjs <报告.md> [更多报告.md]");
  process.exit(2);
}

const HIGH = ["🔴", "🟠"];
const LEVELS = ["🔴", "🟠", "🟡"];
const EMPTY_LOC = new Set(["", "-", "--", "...", "…", "N/A", "n/a", "TBD", "待补"]);

const splitRow = (line) =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
const isSep = (c) => c.length > 0 && c.every((x) => x === "" || /^:?-{2,}:?$/.test(x));

// 围栏代码块内的行不参与总表定位（模板本身就是被 ``` 包住的正文）；
// 但「复现命令」计数**要**连围栏内一起算——命令输出本来就是贴在围栏里的。
function fencedMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) open = !open;
    mask[i] = open;
  }
  return mask;
}

const HEADING = /^(\s{0,3})(#{1,6})\s+/;

// 条目小节的起点：`### B1 · 🔴 …`（允许前置级别 emoji）或 `**B1**` 开头的行。
// 只认"紧跟标题标记的 id"，否则 `### 修复 B1 引入的问题` 会被误当成 B1 的小节。
// id 后面不许再粘字母数字，否则 B1 会误命中 B10。
const anchorRe = (id) =>
  new RegExp(
    `^(?:\\s{0,3}#{1,6}\\s+(?:[\\u{1F300}-\\u{1FAFF}✅❌⚠️]\\s*)?|\\s*(?:[-*]\\s+)?\\*\\*)` +
      `${id}(?![0-9A-Za-z])`,
    "u"
  );

// 围栏代码块里必须真有内容行才算"贴了命令"（``` 空块不是证据）。
function hasCommandFence(lines, from, to) {
  for (let k = from; k < to; k++) {
    if (!/^\s*(```|~~~)/.test(lines[k])) continue;
    for (let m = k + 1; m < to; m++) {
      if (!/^\s*(```|~~~)/.test(lines[m])) continue;
      if (lines.slice(k + 1, m).some((l) => l.trim() !== "")) return true;
      break;
    }
  }
  return false;
}

const REPRO_LABEL = /^\s*(?:[-*]\s+)?(?:\*\*)?\s*复现命令/;
const INLINE_CMD = /`[^`\n]{3,}`/;

// 「复现命令」标签后面（同一行行内代码，或 8 行内的非空围栏块）真的有命令，
// 才算一处证据——这是"计数"与"取证"的区别：标题里写四个字不再算数。
function countEvidence(lines, fence) {
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (fence[i] || !REPRO_LABEL.test(lines[i])) continue;
    if (INLINE_CMD.test(lines[i]) || hasCommandFence(lines, i + 1, Math.min(lines.length, i + 9))) n += 1;
  }
  return n;
}

// 返回 null = 证据成立；返回字符串 = 判红理由。
function entryEvidence(lines, fence, tableIdx, ids, id) {
  let start = -1;
  let level = 0;
  for (let i = tableIdx + 1; i < lines.length; i++) {
    if (fence[i] || !anchorRe(id).test(lines[i])) continue;
    start = i;
    const h = HEADING.exec(lines[i]);
    level = h ? h[2].length : 7;
    break;
  }
  if (start === -1)
    return `${id}：定级依据写的是"实测"，但报告里没有它名下的展开段落 —— ` +
      `需要形如 \`### ${id} · …\` 的小节，内含「复现命令」与原样可重跑的命令`;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (fence[i]) continue;
    const h = HEADING.exec(lines[i]);
    if (h && h[2].length <= level) {
      end = i;
      break;
    }
    if (ids.some((other) => other !== id && anchorRe(other).test(lines[i]))) {
      end = i;
      break;
    }
  }

  for (let i = start; i < end; i++) {
    if (fence[i] || !REPRO_LABEL.test(lines[i])) continue;
    if (INLINE_CMD.test(lines[i])) return null;
    if (hasCommandFence(lines, i + 1, Math.min(end + 9, lines.length))) return null;
    return `${id}：写了「复现命令」却没有任何命令 —— 后面既无行内代码也无围栏代码块，` +
      `空标题不算证据（声称实测必须能原样重跑）`;
  }
  return `${id}：声称实测，但自己的展开段落里没有「复现命令」 —— 只在总表里写"实测"两个字不构成证据`;
}

function checkFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    return { fatal: [`无法读取文件：${e.code || e.message}`] };
  }
  const lines = text.split("\n");
  const fence = fencedMask(lines);

  let hi = -1;
  let head = null;
  // 报告里常有多张表（验证表、T 项总表、合并执行清单）。优先取**含「定级依据」列**
  // 的那张；取不到再退回第一张 编号+级别 表，并在输出里声明取用了哪一张（评审 R15）。
  let firstCandidate = null;
  let preferred = null;
  for (let i = 0; i < lines.length; i++) {
    if (fence[i] || !/^\s*\|/.test(lines[i])) continue;
    const c = splitRow(lines[i]);
    if (!(c.some((x) => x.includes("编号")) && c.some((x) => x.includes("级别")))) continue;
    const cand = { i, c };
    firstCandidate ??= cand;
    if (c.some((x) => x.includes("定级依据"))) {
      preferred = cand;
      break;
    }
  }
  const chosen = preferred ?? firstCandidate;
  if (!chosen)
    return { fatal: ['未找到缺陷总表（表头需同时含"编号"与"级别"）—— 模板未落实或表头被改名'] };
  hi = chosen.i;
  head = chosen.c;
  const tableLine = hi + 1;

  const col = (kw) => head.findIndex((x) => x.includes(kw));
  const iId = col("编号");
  const iLv = col("级别");
  const iBs = col("定级依据");
  const iLoc = col("位置");

  const failures = [];
  if (iBs === -1)
    failures.push("缺陷总表缺少「定级依据」列 —— 未经实测不得定高危这条约束无法机检");
  if (iLoc === -1) failures.push("缺陷总表缺少「位置」列 —— 每条缺陷必须落到 文件:行号");

  let rows = 0;
  let levelSeen = 0;
  const measured = [];
  const highMeasured = [];
  const ids = [];
  for (let i = hi + 1; i < lines.length; i++) {
    if (fence[i]) continue;
    if (!/^\s*\|/.test(lines[i])) {
      if (rows > 0) break;
      continue;
    }
    const c = splitRow(lines[i]);
    if (isSep(c)) continue;
    const id = iId >= 0 ? c[iId] || "" : "";
    if (!id || id.includes("编号")) continue;
    rows += 1;
    ids.push(id);

    const lv = iLv >= 0 ? c[iLv] || "" : "";
    if (LEVELS.some((e) => lv.includes(e))) levelSeen += 1;
    const isHigh = HIGH.some((e) => lv.includes(e));
    const bs = iBs >= 0 ? c[iBs] || "" : "";
    // 「推理·待实测」含"实测"两字却不是实测——本行是最容易写错的一处判定。
    const claims = /(?<![待未无])实测/.test(bs);
    if (claims) measured.push(id);
    if (claims && isHigh) highMeasured.push(id);
    if (isHigh && !(claims && !bs.includes("推理")))
      failures.push(
        `${id}：定级为 ${lv || "(空)"} 但定级依据为"${bs || "(空)"}" —— ` +
          "未经实测不得定高危（推理所得最高 🟡）"
      );

    if (iLoc >= 0 && EMPTY_LOC.has(c[iLoc] || ""))
      failures.push(`${id}：位置列为空 —— 每条缺陷必须落到 文件:行号`);
  }

  if (rows === 0) failures.push("缺陷总表无数据行 —— 提取错位，本检查无法判定");
  else if (levelSeen === 0)
    failures.push("未解析到任何级别标记（🔴/🟠/🟡）—— 级别列格式变了，检查已失效");

  // 逐条就近取证（评审 R1）：声称实测的高危条目，必须在自己名下有**真的**命令。
  const nRepro = countEvidence(lines, fence);
  for (const id of highMeasured) {
    const why = entryEvidence(lines, fence, hi, ids, id);
    if (why) failures.push(why);
  }

  return { failures, rows, measured: measured.length, highMeasured: highMeasured.length, nRepro, tableLine };
}

let bad = 0;
for (const path of args) {
  console.log(`check-report: ${path}`);
  const r = checkFile(path);
  const fails = r.fatal || r.failures;
  if (fails.length) {
    bad += fails.length;
    for (const f of fails) console.error("  ✗ " + f);
  } else {
    console.log(
      `check-report: ${r.rows} 条缺陷（第 ${r.tableLine} 行的总表），${r.measured} 条声称实测` +
        `（其中高危 ${r.highMeasured} 条），逐条取证通过（全文有效「复现命令」${r.nRepro} 处）`
    );
  }
}
if (bad) {
  console.error(`check-report: ${bad} 处不符合「未经实测不得定高危」约束（高危须逐条取证）`);
  process.exit(1);
}
