#!/usr/bin/env node
// check-docs.mjs — 文档数字主张守护（v2.1.0 三方评审 T7，由中立裁定方实施）
//
// 为什么需要：B5（README"181 行"过期）之所以能发生，是因为没有任何检查
// 断言"文档里写的行数/条数 == 实际内容"。本版把三处数字改对了，但若不补
// 一条守护，下一次 SKILL.md 增删一行就会再次失真，而其余门禁依旧全绿。
//
// 本检查做的事（不一致即 exit 1）：
//  1. 从 README.md / README.en.md 结构树、CHANGELOG.md **最新条目**、
//     skill-spec.md 中提取对 SKILL.md 的"总行数 / 正文行数（frontmatter 之后）"
//     主张，与实测值逐一对账；
//  2. 断言 prompt-templates.md「设计要点」表条数 == quickstart 引用条数
//     （及 CHANGELOG"表扩为 N 条"主张）。
//
// 提取防错位（委托方点名要求自查的坑）：
//  - **围栏代码块内的行不参与对账**：``` 里逐字引用的工具输出（例如 README 演示
//    check-docs 自己变红的样子）不是作者对当前文件的主张，把它当主张会让
//    "展示门禁如何失败"的文档永远无法自洽。作者的主张写在正文里，正文照扫。
//  - CHANGELOG 只扫最新 `## [x.y.z]` 条目，历史条目中的旧数字（如 2.0.x
//    时代的"255 行"）不参与对账；
//  - 同一行必须提到 `SKILL.md` 才算主张所在行；历史叙述按「历史叙述判定」处理。
//
// v2.3.0 扩容（外部评审 R8/R11/R12，评审方 docs/REVIEW-2.2.0.md）：
//  3. 维度条数（review-dimensions.md 实际行数）、门禁道数与"第 N 道门禁 = 哪个脚本"
//     （从 .githooks/pre-commit 现场解析，插一道进去，文档就会变红）；
//  4. 两套回归测试的用例数、突变测试的注入条数（按被测脚本名就近对账）；
//  5. SKILL.md 的 version == CHANGELOG 最新条目版本号；README 的 `install.sh|ps1`
//     一行流必须钉在**当前版本的 tag** 上，不许指向 main（R12：main 会装到未评审代码）；
//  6. R8：`改为/减到/降至` 一类词**不再整行跳过**，改为"只认该词之后的数字为现状，
//     之前的数字是历史"。整行跳过曾让"作者改掉措辞、数字仍是旧的"这类句子免检。
//     本文件末尾带一段**抽取器自检**（合成语料喂给抽取函数，要求该抓的必须抓到），
//     自检不过同样 exit 1——否则这些规则只是这次改对了，下次改坏无人知。

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_MD = join(ROOT, "skills/adversarial-review/SKILL.md");
const TEMPLATES_MD = join(ROOT, "skills/adversarial-review/references/prompt-templates.md");
const QUICKSTART_MD = join(ROOT, "skills/adversarial-review/references/quickstart.md");
const SPEC_MD = join(ROOT, "skills/adversarial-review/references/skill-spec.md");
const README_MD = join(ROOT, "README.md");
const README_EN_MD = join(ROOT, "README.en.md");
const CHANGELOG_MD = join(ROOT, "CHANGELOG.md");
const DIMENSIONS_MD = join(ROOT, "skills/adversarial-review/references/review-dimensions.md");
const PRECOMMIT = join(ROOT, ".githooks/pre-commit");
const TEST_VALIDATOR = join(ROOT, "scripts/test-validate-skill.mjs");
const TEST_REPORTLINT = join(ROOT, "scripts/test-check-report.mjs");
const TEST_MUTATIONS = join(ROOT, "scripts/test-mutations.mjs");

const read = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const rel = (f) => f.slice(ROOT.length + 1).replace(/\\/g, "/");

const failures = [];
const checked = [];
const extracted = []; // 所有被识别出的主张（无论对错），供"提取错位防护"计数

// ---------- 实测值 ----------

/** wc -l 语义：换行符个数 */
function totalLines(text) {
  const n = (text.match(/\n/g) || []).length;
  return text.length > 0 && !text.endsWith("\n") ? n + 1 : n;
}

/** frontmatter 结束行号（1-based，第二个 --- 所在行） */
function frontmatterEnd(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") throw new Error("SKILL.md 首行不是 ---，frontmatter 解析失败");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  throw new Error("SKILL.md frontmatter 未闭合");
}

const skillText = read(SKILL_MD);
const actualTotal = totalLines(skillText);
const fmEnd = frontmatterEnd(skillText);
const actualBody = actualTotal - fmEnd;

// ---------- 主张提取：行数 ----------

// 只在**明确转述旧文本**时跳过整行。v2.2 之前这里还包含 `改为|减到|减薄|降至`
// 并且是"整行丢弃"，那是个漏洞：作者写"措辞调整后 SKILL.md 正文 120 行"，
// 整行免检、过期数字照样蒙混过关（外部评审 R8）。现在这类过渡词只把**其前**的
// 数字判为历史，其后的数字仍按现状主张对账。
const HISTORICAL = /不再|已过期|原为|曾写|此前|历史上/;
const RESTATE = /改为|减到|减至|降至|升到|升至|扩到|扩至|调整为/;

/**
 * 从一行文本中提取对 SKILL.md 的行数主张。
 * 返回 [{kind:'total'|'body', n, raw}]；行内必须出现 SKILL.md。
 */
function claimsInLine(line) {
  if (!/SKILL\.md/.test(line)) return [];
  if (HISTORICAL.test(line)) return [];
  if (RESTATE.test(line)) {
    // 过渡词**之前**的数字是旧值，之后才是现状主张。丢掉前半句时保留 SKILL.md 锚点，
    // 否则下面的宽松式（要求行内出现 SKILL.md）会连现状主张一起提不出来。
    line = "SKILL.md…" + line.slice(RESTATE.exec(line).index);
  }
  const out = [];
  // 中文："（175 行，其中正文 166 行）" / "正文 166 行"
  const zhTotal = line.match(/（(\d{2,4})\s*行/);
  if (zhTotal) out.push({ kind: "total", n: +zhTotal[1], raw: zhTotal[0] });
  const zhBody = line.match(/正文\s*(\d{2,4})\s*行/);
  if (zhBody) out.push({ kind: "body", n: +zhBody[1], raw: zhBody[0] });
  // 英文："main file (175 lines, 166 of body)"
  const enTotal = line.match(/\((\d{2,4})\s+lines/i);
  if (enTotal) out.push({ kind: "total", n: +enTotal[1], raw: enTotal[0] });
  const enBody = line.match(/(\d{2,4})\s+of\s+body/i);
  if (enBody) out.push({ kind: "body", n: +enBody[1], raw: enBody[0] });
  // CHANGELOG 未来可能出现 "SKILL.md … N 行" 且未被上面捕获 → 按总行数主张处理。
  // 注意排除**阈值句式**（如 skill-spec 的"正文应 < 500 行"是规范上限，不是事实主张）。
  if (out.length === 0) {
    const loose = line.match(/SKILL\.md[^\n]{0,40}?([<>≤≥]|\b上限\b)?\s*(\d{2,4})\s*行/);
    if (loose && !loose[1]) out.push({ kind: "total", n: +loose[2], raw: loose[0] });
  }
  return out;
}

function fencedMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^\s*(```|~~~)/.test(lines[i]);
    if (marker) open = !open;
    mask[i] = open;
  }
  return mask;
}

function scanLineClaims(file, text, { firstEntryOnly = false } = {}) {
  const lines = text.split("\n");
  const inFence = fencedMask(lines);
  let stop = lines.length;
  if (firstEntryOnly) {
    // 只扫最新 `## [` 条目（到下一个 `## [` 为止）
    const start = lines.findIndex((l) => /^## \[/.test(l));
    if (start === -1) return;
    const next = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
    stop = next === -1 ? lines.length : next;
    for (let i = start; i < stop; i++) if (!inFence[i]) collect(file, lines[i], i + 1);
    return;
  }
  for (let i = 0; i < stop; i++) if (!inFence[i]) collect(file, lines[i], i + 1);
}

function collect(file, line, lineNo) {
  for (const c of claimsInLine(line)) {
    const actual = c.kind === "total" ? actualTotal : actualBody;
    extracted.push(c.kind);
    const label = `${rel(file)}:${lineNo} 主张 SKILL.md ${c.kind === "total" ? "总" : "正文"}行数 = ${c.n}（原文"${c.raw.trim()}"）`;
    if (c.n !== actual) {
      failures.push(`${label} —— 实测 ${c.kind === "total" ? "总" : "正文"}行数为 ${actual}`);
    } else {
      checked.push(`${label} ✅`);
    }
  }
}

scanLineClaims(README_MD, read(README_MD));
scanLineClaims(README_EN_MD, read(README_EN_MD));
scanLineClaims(SPEC_MD, read(SPEC_MD));
scanLineClaims(CHANGELOG_MD, read(CHANGELOG_MD), { firstEntryOnly: true });

// 兜底：至少要提取到两条总行数与两条正文行数主张（README 中英各一组），
// 否则说明提取逻辑与文档措辞脱钩了——提取错位本身就是要抓的缺陷，不许静默通过。
const totalHits = extracted.filter((k) => k === "total").length;
const bodyHits = extracted.filter((k) => k === "body").length;
if (totalHits < 2 || bodyHits < 2) {
  failures.push(
    `提取错位防护触发：README.md/README.en.md 应各贡献一组行数主张，` +
      `实际提取到 总行数 ${totalHits} 条 / 正文行数 ${bodyHits} 条`
  );
}

// ---------- 主张提取：设计要点条数 ----------

function designPointCount() {
  const lines = read(TEMPLATES_MD).split("\n");
  const start = lines.findIndex((l) => /^##+\s*设计要点/.test(l));
  if (start === -1) {
    failures.push(`${rel(TEMPLATES_MD)} 找不到「设计要点」表 —— 提取错位`);
    return null;
  }
  let count = 0;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (i > start && /^#{2,3}\s/.test(l)) break; // 下一节
    if (/^\|/.test(l) && !/^\|[\s-]+\|/.test(l) && !/^\|\s*要点\s*\|/.test(l)) count++;
  }
  return count;
}

const actualDesignPoints = designPointCount();

const dpHits = { quickstart: 0, changelog: 0 };
function countClaims(file, text, re, describe, lineOffset = 0) {
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    const m = line.match(re);
    if (!m) return;
    dpHits[describe === "quickstart 引用" ? "quickstart" : "changelog"]++;
    const n = +m[1];
    if (actualDesignPoints === null) return;
    if (n !== actualDesignPoints) {
      failures.push(
        `${rel(file)}:${idx + 1 + lineOffset} 主张「设计要点」表为 ${n} 条 —— 实测为 ${actualDesignPoints} 条（${describe}）`
      );
    } else {
      checked.push(`${rel(file)}:${idx + 1 + lineOffset} 主张「设计要点」表为 ${n} 条 ✅（实测 ${actualDesignPoints}）`);
    }
  });
}

countClaims(QUICKSTART_MD, read(QUICKSTART_MD), /(\d{1,3})\s*条约束/, "quickstart 引用");
// CHANGELOG 只认**最新条目**里"表扩为 N 条"这种对现状的断言；历史条目描述的是当时的现状，
// 表一旦扩条，旧条目必然"不符"——把它们拉进对账会让检查变成噪音，逼作者改写历史。
// （v2.2.0 扩表到 13 条时，本检查真的把 2.1.0 的"扩为 12 条"判红了，据此修正作用域。）
function latestChangelogEntry(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^## \[/.test(l));
  if (start === -1) return { text: "", offset: 0 };
  const next = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
  const stop = next === -1 ? lines.length : next;
  return { text: lines.slice(start, stop).join("\n"), offset: start };
}
const clLatest = latestChangelogEntry(read(CHANGELOG_MD));
countClaims(CHANGELOG_MD, clLatest.text, /表扩为\s*(\d{1,3})\s*条/, "CHANGELOG 主张", clLatest.offset);
// 提取错位防护：quickstart 必须至少贡献一条条数主张，否则说明引用句式改了而检查没跟上。
if (dpHits.quickstart < 1) {
  failures.push(`提取错位防护触发：quickstart.md 未提取到任何"N 条约束"主张（引用句式可能已变更）`);
}

// ---------- v2.3.0 新增对账：维度数 / 门禁 / 用例数 / 版本 / 安装锚点 ----------

function scanBody(file, text, cb) {
  const lines = text.split("\n");
  const inFence = fencedMask(lines);
  for (let i = 0; i < lines.length; i++) if (!inFence[i]) cb(lines[i], i + 1);
}

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const toNum = (s) =>
  CN_NUM[s] ?? EN_NUM[typeof s === "string" ? s.toLowerCase() : s] ?? (Number.isNaN(+s) ? null : +s);

/**
 * 描述"某一版本当时的状况"的历史叙述行——即战绩表里以版本号开头的行。
 * 这里刻意只用"行首版本号"这一条判据，不用"行内出现过 v2.2"：
 * 后者会让"v2.2 新增的机检器，其回归测试有 N 个用例"这类**既提版本又陈述现状**
 * 的句子整行免检（正是 R8 要堵的那类漏洞）。
 */
const HISTORY_ROW = /^\s*\|\s*\*\*?v\d+\.\d+/;

function dimensionCount() {
  const rows = read(DIMENSIONS_MD).split("\n").filter((l) => /^\|\s*\d+\s*\|\s*\*\*/.test(l));
  if (rows.length === 0) {
    failures.push(`${rel(DIMENSIONS_MD)} 未解析到任何维度行 —— 提取错位`);
    return null;
  }
  return rows.length;
}

/** 「第 N 道门禁」点名判定的对照表：脚本名（含去掉 test- 前缀的写法）→ 它是第几道 */
function gateOwnerIndex() {
  const map = new Map();
  actualGates.forEach((g, i) => {
    map.set(g, i + 1);
    map.set(g.replace(/^test-/, ""), i + 1);
  });
  if (map.size < actualGates.length) {
    failures.push(`${rel(PRECOMMIT)} 门禁脚本名互相冲突 —— 点名判定失效`);
    return null;
  }
  return map;
}

/** pre-commit 里 node 门禁的顺序（"第 N 道门禁"主张的对照表） */
function gateList() {
  const src = read(PRECOMMIT);
  const gates = [...src.matchAll(/^if ! node\s+\S*?([\w-]+\.mjs)/gm)].map((m) => m[1]);
  if (gates.length < 2) {
    failures.push(`${rel(PRECOMMIT)} 只解析到 ${gates.length} 道 node 门禁 —— 提取错位`);
    return null;
  }
  return gates;
}

const actualDims = dimensionCount();
const actualGates = gateList();
const gateOwners = gateOwnerIndex();
const countRegistrations = (file, re) =>
  read(file).split("\n").filter((l) => re.test(l)).length;
const actualCases = {
  "test-validate-skill.mjs": countRegistrations(TEST_VALIDATOR, /^check\(|^checkSemantics\(/),
  "test-check-report.mjs": countRegistrations(TEST_REPORTLINT, /^t\(/),
};
const actualMutations = countRegistrations(TEST_MUTATIONS, /^\s+name:\s*"/);

const versionOf = (text) => /(?:^|\n)\s*version:\s*"?(\d+\.\d+\.\d+)"?/.exec(text)?.[1] ?? null;
const skillVersion = versionOf(skillText);
const changelogVersion = /^\s*##\s*\[(\d+\.\d+\.\d+)\]/m.exec(read(CHANGELOG_MD))?.[1] ?? null;

const hits = { dims: 0, gateCount: 0, cases: 0, installUrl: 0, demoBlocks: 0 };
const caseSuiteHits = { "test-validate-skill.mjs": 0, "test-check-report.mjs": 0 };
const assert = (file, lineNo, label, actual, claimed, hitKey) => {
  if (hitKey) hits[hitKey]++;
  if (actual === null) return;
  if (claimed !== actual) {
    failures.push(`${rel(file)}:${lineNo} 主张 ${label} = ${claimed} —— 实测为 ${actual}`);
  } else {
    checked.push(`${rel(file)}:${lineNo} 主张 ${label} = ${claimed} ✅`);
  }
};

/** 在 lineNo 之后的 lookahead 行里找脚本名（允许落在演示代码块内——那正是锚点所在） */
function scriptNearby(lines, lineNo, lookahead = 4) {
  for (let i = lineNo - 1; i < Math.min(lines.length, lineNo - 1 + lookahead); i++) {
    const m = /([\w-]+\.mjs)/.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

const GATE_CN_COUNT = /(?<!第)([一二三四五六七八九十]{1,3}|\d{1,3})\s*道门禁/g;
const GATE_CN_COUNT_PAREN = /门禁（([一二三四五六七八九十]{1,3}|\d{1,3})\s*道）/g;
const GATE_CN_ORD = /第([一二三四五六七八九十]{1,3}|\d{1,3})道门禁/;
const GATE_EN_COUNT = /\(\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:checks|gates)\s*\)/gi;
const GATE_EN_ORD = /\b(?:the|as)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+gate\b/i;
const CASE_CLAIM = /(\d{1,3})\s*(?:个)?\s*用例/;
// 首屏"眼见为实"那几段演示的**段数主张**（本轮文档自审抓到：演示从三段增到四段后，
// 标题仍写"这三段"、省略说明仍写"截到 4 条"）。只认总量句式，"第一段/这一段/第 ④ 段"
// 这类序数或单指不参与对账，否则正常的逐段讲解会全变噪音。
const DEMO_CN_TOTAL = /(?:下面|这|以上|全部)\s*([二三四五六七八九十])\s*段/g;
const DEMO_CN_TAIL = /([二三四五六七八九十])\s*段(?:演示|实测|输出)/g;
const DEMO_EN_TOTAL = /\b(?:all|the)\s+(two|three|four|five|six)\s+(?:demo\s+)?(?:blocks?|outputs?)\b/gi;
const GREEN_RED = /(\d{1,3})\s*绿\s*[+＋]\s*(\d{1,3})\s*红(?:\s*[+＋]\s*(\d{1,3})\s*用法错误)?/;
// "第 17 维度"是**序数**（第 17 号维度），不是条数主张。回溯排除时要把
// 位数也吃进去，否则正则会退一步从"7 维度"匹配出个假主张。
const DIM_CLAIM = /(?<!第[\s\d]*)(\d{1,3})\s*个?\s*(?:core\s+)?维(?:度|项)/gi;
const DIM_EN_CLAIM = /(?<!第[\s\d]*)(\d{1,3})\s*(?:-|\s)?dimension(?:s)?\b/gi;

/**
 * 中文/ASCII 引号覆盖的字符区间。引号里是**转述别人的旧措辞**
 * （CHANGELOG 常写：把"其余四道门禁全绿"改为"其余门禁全绿"），
 * 不是作者对现状的主张——不排掉它，"改措辞"这条正常陈述永远无法自洽。
 */
function quoteSpans(line) {
  const spans = [];
  const pairs = [["“", "”"], ["「", "」"], ['"', '"'], ["'", "'"]];
  for (const [open, close] of pairs) {
    let from = 0;
    for (;;) {
      const i = line.indexOf(open, from);
      if (i === -1) break;
      const j = line.indexOf(close, i + 1);
      if (j === -1) break;
      spans.push([i, j]);
      from = j + 1;
    }
  }
  return spans;
}
const inQuote = (spans, idx) => spans.some(([a, b]) => idx >= a && idx <= b);

/** 一份文档里"编号演示块"的条数：中文用 `**① …`，英文用 `**1) …`，都是行首加粗 */
function demoBlockCount(text) {
  const circled = (text.match(/^\*\*[①②③④⑤⑥⑦⑧⑨]/gm) || []).length;
  const numbered = (text.match(/^\*\*\d+\)/gm) || []).length;
  return circled + numbered;
}

/** 一行里的"演示总段数"主张 → [{n, idx, raw}]，同一位置只计一次 */
function demoClaimsInLine(line) {
  const out = [];
  const seen = new Set();
  for (const re of [DEMO_CN_TOTAL, DEMO_CN_TAIL, DEMO_EN_TOTAL]) {
    re.lastIndex = 0;
    for (const m of line.matchAll(re)) {
      if (seen.has(m.index)) continue;
      seen.add(m.index);
      const n = toNum(m[1]);
      if (n !== null) out.push({ n, idx: m.index, raw: m[0] });
    }
  }
  return out;
}

function scanNumericClaims(file, text, { lineOffset = 0 } = {}) {
  const lines = text.split("\n");
  const demoActual = demoBlockCount(text);
  const body = [];
  scanBody(file, text, (line, no) => body.push([line, no]));
  for (const [line, rawNo] of body) {
    const no = rawNo + lineOffset;
    if (HISTORY_ROW.test(line)) continue;
    const quotes = quoteSpans(line);
    const fresh = (m) => !inQuote(quotes, m.index);

    for (const re of [GATE_CN_COUNT, GATE_CN_COUNT_PAREN, GATE_EN_COUNT]) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        if (!fresh(m)) continue;
        assert(file, no, "门禁道数", actualGates ? actualGates.length : null, toNum(m[1]), "gateCount");
      }
    }
    const ord = GATE_CN_ORD.exec(line) ?? GATE_EN_ORD.exec(line);
    if (ord && !inQuote(quotes, ord.index) && actualGates) {
      const idx = toNum(ord[1]);
      const label = `第 ${idx} 道门禁`;
      if (!(idx >= 1 && idx <= actualGates.length)) {
        failures.push(`${rel(file)}:${no} ${label} 越界 —— 当前共 ${actualGates.length} 道`);
      } else {
        const gate = actualGates[idx - 1];
        // 句内没有脚本名时退回"就近 4 行内点名的脚本"（演示块里常这样写）
        const wrong = misnamedGates(
          /\.mjs/.test(line) ? line : ` ${scriptNearby(lines, rawNo) || ""} `,
          idx
        );
        if (wrong.length) {
          failures.push(
            `${rel(file)}:${no} ${label} 实为 ${gate}，但同一句里点名了第 ${[...new Set(wrong.map((s) => gateOwners.get(s)))].join("、")} 道的脚本：${wrong.join("、")}`
          );
        } else {
          checked.push(`${rel(file)}:${no} ${label} = ${gate} ✅`);
        }
      }
    }

    for (const m of line.matchAll(DIM_CLAIM)) {
      if (!fresh(m)) continue;
      assert(file, no, "维度条数", actualDims, +m[1], "dims");
    }
    for (const m of line.matchAll(DIM_EN_CLAIM)) {
      if (!fresh(m)) continue;
      assert(file, no, "维度条数", actualDims, +m[1], "dims");
    }

    const suite = Object.keys(actualCases).find((s) => line.includes(s));
    if (suite) {
      const cm = CASE_CLAIM.exec(line);
      if (cm && fresh(cm)) {
        caseSuiteHits[suite]++;
        assert(file, no, `${suite} 用例数`, actualCases[suite], +cm[1], "cases");
      }
      const gr = GREEN_RED.exec(line);
      if (gr && fresh(gr)) {
        caseSuiteHits[suite]++;
        assert(file, no, `${suite} 绿+红（+用法错误）合计`,
          actualCases[suite], +gr[1] + +gr[2] + +(gr[3] || 0), "cases");
      }
    }
    if (line.includes("test-mutations.mjs")) {
      const mc = /(\d{1,3})\s*个(?:缺陷|突变)/.exec(line);
      if (mc && fresh(mc)) assert(file, no, "突变注入条数", actualMutations, +mc[1], null);
    }

    // 演示段数只在**本身带编号演示块**的文件里对账（CHANGELOG 的历史条目里
    // "首屏三段演示输出"描述的是当时状况，没有块可对照，也不该被拉进来）。
    if (demoActual >= 2) {
      for (const d of demoClaimsInLine(line)) {
        if (inQuote(quotes, d.idx)) continue;
        assert(file, no, "首屏演示段数", demoActual, d.n, "demoBlocks");
      }
    }
    // 「抓住 / 逃逸 / 等价」是对**某一次运行结果**的陈述，静态对不了账，
    // 只能靠提交前重跑突变测试并把真实输出贴进 CHANGELOG。这里刻意不猜。
  }

  // install 一行流：URL 在 ```bash 代码块里，但那是**给读者复制的指令**，
  // 不是逐字引用的工具输出，所以它必须参与对账（R12：钉在已评审的 tag 上）。
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/https?:\/\/\S+/g)) {
      if (!/^https?:\/\/raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/[^/\s]+\/.*install\.(sh|ps1)/.test(m[0])) continue;
      hits.installUrl++;
      const ref = m[0].split("/")[5];
      const want = changelogVersion ? `v${changelogVersion}` : null;
      assert(file, i + 1 + lineOffset, "install 一行流锚定的 ref", want, ref, null);
    }
  });
}

scanNumericClaims(README_MD, read(README_MD));
scanNumericClaims(README_EN_MD, read(README_EN_MD));
scanNumericClaims(QUICKSTART_MD, read(QUICKSTART_MD));
scanNumericClaims(DIMENSIONS_MD, read(DIMENSIONS_MD));
scanNumericClaims(CHANGELOG_MD, clLatest.text, { lineOffset: clLatest.offset });

// 版本一致性：SKILL.md 的 version 必须等于 CHANGELOG 最新条目
if (!skillVersion) failures.push(`${rel(SKILL_MD)} frontmatter 未解析到 version —— 提取错位`);
if (!changelogVersion) failures.push(`${rel(CHANGELOG_MD)} 未解析到最新 ## [x.y.z] 条目 —— 提取错位`);
if (skillVersion && changelogVersion && skillVersion !== changelogVersion) {
  failures.push(
    `版本漂移：SKILL.md 声明 ${skillVersion}，CHANGELOG 最新条目为 ${changelogVersion}`
  );
} else if (skillVersion) {
  checked.push(`SKILL.md version == CHANGELOG 最新条目 = ${skillVersion} ✅`);
}

// 提取错位防护（新主张组）：句式一改、覆盖就悄悄归零，这里要求它必须仍有贡献
for (const [key, need, what] of [
  ["dims", 1, "维度条数"],
  ["gateCount", 1, "门禁道数"],
  ["installUrl", 2, "install 一行流 ref"],
  ["demoBlocks", 1, "首屏演示段数"],
]) {
  if (hits[key] < need) {
    failures.push(`提取错位防护触发：应提取到至少 ${need} 条「${what}」主张，实际 ${hits[key]} 条（文档句式可能已变更）`);
  }
}
for (const suite of Object.keys(actualCases)) {
  if (caseSuiteHits[suite] < 1) {
    failures.push(`提取错位防护触发：文档中找不到任何关于 ${suite} 的用例数主张（引用句式可能已变更）`);
  }
}

// ---------- 抽取器自检（R8）----------
//
// 上面所有"跳过/切句"规则，本身也是代码，也会被改坏。这里用合成语料喂给抽取函数，
// 要求**该抓的必须抓到、该放的必须放过**——否则"这次改对了"没有任何保护，
// 下次有人为了压噪音再加一个整行跳过，没人知道。
/**
 * 「第 N 道门禁」句内点名稽核（评审 T4）：返回这句里被安错位置的**已知门禁**脚本名。
 * 逐名追究，而不是"只要有一个对就放行"——README 讲第六道门禁那句天然同时出现
 * check-report.mjs 与 test-check-report.mjs，旧判据（全部点名都错才报）对这种
 * 长句里的错误点名完全免疫。未知的 .mjs 名字放过（可能是仓库外的工具），避免误报。
 */
function misnamedGates(line, idx) {
  const gate = actualGates[idx - 1];
  const scripts = [gate, gate.replace(/^test-/, "")];
  const named = line.match(/[\w-]+\.mjs/g) || [];
  return named.filter((s) => !scripts.includes(s) && gateOwners?.has(s));
}

function selfTest() {
  const cases = [
    { line: "SKILL.md（182 行，其中正文 173 行）", want: ["total:182", "body:173"], why: "现状陈述照扫" },
    { line: "SKILL.md 由 255 行减到 173 行", want: ["total:173"], why: "过渡词之前的旧值不是主张" },
    { line: "措辞改为强调 SKILL.md 正文 120 行", want: ["body:120"], why: "含「改为」不得整行免检（R8）" },
    { line: "SKILL.md 曾写 180 行，不再作为主张", want: [], why: "明确转述旧文本仍跳过" },
    { line: "README.md 正文 120 行", want: [], why: "未点名 SKILL.md 不认作主张" },
    { line: "（255 行）SKILL.md 历史上是 255 行", want: [], why: "历史标记优先于括号句式" },
  ];
  for (const c of cases) {
    const got = claimsInLine(c.line).map((x) => `${x.kind}:${x.n}`).sort();
    const want = [...c.want].sort();
    if (got.join() !== want.join()) {
      failures.push(
        `抽取器自检失败（${c.why}）：语料「${c.line}」应抽出 [${want.join(", ") || "无"}]，实际 [${got.join(", ") || "无"}]`
      );
    }
  }
  if (toNum("六") !== 6 || toNum("五") !== 5 || toNum("sixth") !== 6) {
    failures.push("抽取器自检失败：中文/英文数字映射被改坏");
  }

  // 「第 N 道门禁」点名稽核自检（评审 T4）：错点必须逐名抓到，对点不得误报。
  // check-docs 没有外部测试套件，这段自检就是它唯一的"能失败"证据。
  const gateCases = [
    {
      idx: actualGates.length,
      line: "构成第六道门禁（`scripts/test-check-report.mjs`，机检器 `check-report.mjs` 是被测对象）",
      want: 0,
      why: "同一道门禁的两种写法都该放过",
    },
    {
      idx: 1,
      line: "第一道门禁是 test-check-report.mjs 与 check-docs.mjs",
      want: 2,
      why: "把别道的脚本安到第 1 道头上须逐名追究",
    },
    {
      idx: actualGates.length,
      line: "第六道门禁 = test-validate-skill.mjs 的回归测试（与 check-report.mjs 无关）",
      want: 1,
      why: "长句里混入别道脚本，不得因同句还有合法名字而免检",
    },
  ];
  for (const g of gateCases) {
    const got = misnamedGates(g.line, g.idx).length;
    if (got !== g.want)
      failures.push(
        `门禁点名自检失败（${g.why}）：语料「${g.line}」应抓到 ${g.want} 个错点，实际 ${got}`
      );
  }

  // 演示段数抽取自检：总量句式必须抓到，序数/单指必须放过——
  // 后者一旦被当成主张，逐段讲解的文档会永远红，下一个人就会把整条规则删掉。
  const demoCases = [
    { line: "### 眼见为实：这四段是刚跑出来的真实输出", want: [4], why: "「这 N 段」是总量主张" },
    { line: "All four blocks were regenerated", want: [4], why: "英文总量句式" },
    { line: "第一段就是 check-docs 上线当晚抓到的问题", want: [], why: "序数不是总量" },
    { line: "下面第 ④ 段是这两条绕过的现场复现", want: [], why: "单指某段不是总量" },
    { line: "上一版的这一段是手删的", want: [], why: "「这一段」不参与对账" },
  ];
  for (const d of demoCases) {
    const got = demoClaimsInLine(d.line).map((x) => x.n);
    if (got.join() !== d.want.join())
      failures.push(
        `演示段数自检失败（${d.why}）：语料「${d.line}」应抽出 [${d.want.join(", ") || "无"}]，实际 [${got.join(", ") || "无"}]`
      );
  }
  if (demoBlockCount("**① a\n\n**② b\n\n正文\n**③ 说明") !== 3) {
    failures.push("演示段数自检失败：编号演示块计数被改坏（①②③ 应为 3）");
  }
  if (demoBlockCount("**1) a\n\n**2) b") !== 2) {
    failures.push("演示段数自检失败：英文编号演示块计数被改坏（**1)/**2) 应为 2）");
  }
}
selfTest();

// ---------- 汇总 ----------

console.log(
  `check-docs: SKILL.md 实测 总 ${actualTotal} 行 / frontmatter ${fmEnd} 行 / 正文 ${actualBody} 行；` +
    `设计要点表 ${actualDesignPoints} 条；维度 ${actualDims} 项；门禁 ${actualGates?.length} 道；` +
    `用例 校验器 ${actualCases["test-validate-skill.mjs"]} / 机检器 ${actualCases["test-check-report.mjs"]}；` +
    `突变 ${actualMutations} 条；版本 ${skillVersion}`
);
for (const c of checked) console.log("  ✅ " + c);
if (failures.length) {
  for (const f of failures) console.error("  ✗ " + f);
  console.error(`check-docs: ${failures.length} 处文档主张与实况不符`);
  process.exit(1);
}
console.log(`check-docs: ${checked.length} 处文档主张全部与实况一致`);
