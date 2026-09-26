#!/usr/bin/env node
// check-report.mjs — 蓝军「缺陷总表」机检器（v2.2.0）
//
// 为什么需要："必须实证"写进 SKILL.md 也只是一句**散文约束**——模型想让
// 自己的高危结论有分量时，会直接声称"我跑过了"而根本没跑。v2.2 把定级与
// 实测绑定（未经实测不得定高危），而绑定规则若没有机器兜底，只会退化成
// 又一句口号。本检查只干一件事：让"编造的实测"变成**可被发现**的事。
//
// 防"永远绿"（本项目核心信条）：找不到总表 / 总表零数据行 / 一个级别 emoji
// 都没解析到，一律判失败——提取错位导致的静默通过比报错危险得多。
//
// 用法：node check-report.mjs <报告.md> [更多报告.md]
// 退出码：0 = 全部合规；1 = 存在缺陷；2 = 用法错误（无参数）——用法错误不是检查失败
//
// 格式与 references/prompt-templates.md 模板 1 的六列总表对齐：
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
  for (let i = 0; i < lines.length; i++) {
    if (fence[i] || !/^\s*\|/.test(lines[i])) continue;
    const c = splitRow(lines[i]);
    if (c.some((x) => x.includes("编号")) && c.some((x) => x.includes("级别"))) {
      hi = i;
      head = c;
      break;
    }
  }
  if (hi === -1)
    return { fatal: ['未找到缺陷总表（表头需同时含"编号"与"级别"）—— 模板未落实或表头被改名'] };

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

    const lv = iLv >= 0 ? c[iLv] || "" : "";
    if (LEVELS.some((e) => lv.includes(e))) levelSeen += 1;
    const isHigh = HIGH.some((e) => lv.includes(e));
    const bs = iBs >= 0 ? c[iBs] || "" : "";
    // 「推理·待实测」含"实测"两字却不是实测——本行是最容易写错的一处判定。
    const claims = /(?<![待未无])实测/.test(bs);
    if (claims) measured.push(id);
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

  const nRepro = (text.match(/复现命令/g) || []).length;
  if (measured.length > nRepro)
    failures.push(
      `${measured.length} 条声称"实测"的条目，但报告中只出现 ${nRepro} 处「复现命令」—— ` +
        `声称实测必须逐条给出可原样重跑的命令与输出（缺：${measured.slice(0, 5).join("、")}）`
    );

  return { failures, rows, measured: measured.length, nRepro };
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
      `check-report: ${r.rows} 条缺陷，${r.measured} 条声称实测，定级依据与位置齐全（复现命令 ${r.nRepro} 处）`
    );
  }
}
if (bad) {
  console.error(`check-report: ${bad} 处不符合 v2.2.0「未经实测不得定高危」约束`);
  process.exit(1);
}
