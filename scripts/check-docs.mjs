#!/usr/bin/env node
// check-docs.mjs — 文档数字主张守护（v2.1.0 三方评审 T7，由中立裁定方实施）
//
// 为什么需要：B5（README"181 行"过期）之所以能发生，是因为没有任何检查
// 断言"文档里写的行数/条数 == 实际内容"。本版把三处数字改对了，但若不补
// 一条守护，下一次 SKILL.md 增删一行就会再次失真，而其余门禁依旧全绿。
//
// 本检查做两件事（不一致即 exit 1）：
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
//  - 同一行必须提到 `SKILL.md` 才算主张所在行；含"不再/已过期/原为"等
//    历史叙述标记的行跳过；带引号转述旧文本的行（CHANGELOG:21「11 条
//    约束表」是对**改前** quickstart 的引用）跳过——条数主张只对
//    quickstart 现行文本与 CHANGELOG"表扩为 N 条"句式生效。

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

const HISTORICAL = /不再|已过期|原为|曾写|此前|历史上|随.*(更新|修正)|减薄|减到|改为/;

/**
 * 从一行文本中提取对 SKILL.md 的行数主张。
 * 返回 [{kind:'total'|'body', n, raw}]；行内必须出现 SKILL.md。
 */
function claimsInLine(line) {
  if (!/SKILL\.md/.test(line)) return [];
  if (HISTORICAL.test(line)) return [];
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

// ---------- 汇总 ----------

console.log(`check-docs: SKILL.md 实测 总 ${actualTotal} 行 / frontmatter ${fmEnd} 行 / 正文 ${actualBody} 行；设计要点表 ${actualDesignPoints} 条`);
for (const c of checked) console.log("  ✅ " + c);
if (failures.length) {
  for (const f of failures) console.error("  ✗ " + f);
  console.error(`check-docs: ${failures.length} 处文档主张与实况不符`);
  process.exit(1);
}
console.log(`check-docs: ${checked.length} 处文档主张全部与实况一致`);
