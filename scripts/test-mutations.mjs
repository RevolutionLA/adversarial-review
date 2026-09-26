#!/usr/bin/env node
/**
 * test-mutations.mjs — 突变测试：验证回归测试真的能抓住缺陷
 *
 * 为什么需要这个：第三方复核指出，原先的 9 个用例有 5 个突变逃逸
 * （把缺陷注入 validate-skill.mjs，测试仍然全绿）。测试全绿不等于测试有效。
 *
 * v2.3 的两处改动（外部评审 R9 + 建议 2）：
 *   1. **不再就地改写源文件**。原先 `writeFileSync(SRC, mutated)` 依赖 finally
 *      还原，Ctrl+C / OOM / 并发提交都会留下被污染的工作区。现在把源文件与
 *      它的测试复制到临时目录，只对副本下毒；结束时再断言源文件字节未变。
 *   2. **突变面从 1 个文件扩到 2 个**：`validate-skill.mjs`（规范校验器）与
 *      `check-report.mjs`（报告机检器）。后者是"未实测不得定高危"唯一能自动
 *      执行的机制，它自己退化时必须还能红。
 *
 * 用法: node scripts/test-mutations.mjs
 * 退出码: 0 = 所有突变都被抓住, 1 = 存在逃逸或无效突变
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VALIDATOR_SRC = "scripts/validate-skill.mjs";
const VALIDATOR_TEST = "scripts/test-validate-skill.mjs";
const LINTER_SRC = "skills/adversarial-review/scripts/check-report.mjs";
const LINTER_TEST = "scripts/test-check-report.mjs";

/**
 * 每个突变：{ name, find, replace, knownEquivalent? }
 * find 必须精确匹配源码；若不匹配则报告「突变无效」（说明源码已变，需更新本脚本）。
 */
const SUITES = [
  {
    label: "规范校验器 validate-skill.mjs",
    files: [{ from: VALIDATOR_SRC, to: VALIDATOR_SRC }, { from: VALIDATOR_TEST, to: VALIDATOR_TEST }],
    test: VALIDATOR_TEST,
    mutations: [
      {
        name: "M1 块标量指示符不再识别（退回旧行为）",
        find: `    const blockMatch = /^([|>])([+-]?\\d*|[0-9]*[+-]?)$/.exec(value);`,
        replace: `    const blockMatch = null && /^([|>])([+-]?\\d*|[0-9]*[+-]?)$/.exec(value);`,
      },
      {
        name: "M2 折叠块空行按字面块处理（段落分隔语义丢失）",
        find: `        if (blockStyle === "folded") {`,
        replace: `        if (blockStyle === "literal") {`,
      },
      {
        name: "M3 折叠块只取第一行",
        find: `          fields[currentBlock] = !prev ? content : prev.endsWith("\\n") ? \`\${prev}\${content}\` : \`\${prev} \${content}\`;`,
        replace: `          if (!prev) fields[currentBlock] = content;`,
      },
      {
        name: "M4 字面块只取第一行",
        find: `          fields[currentBlock] = prev ? \`\${prev}\\n\${content}\` : content;`,
        replace: `          if (!prev) fields[currentBlock] = content;`,
      },
      {
        name: "M5 块后不重置 blockStyle（状态残留）",
        find: `    currentBlock = null;
    blockStyle = "plain";
    fields[key] = stripQuotes(value);`,
        replace: `    currentBlock = null;
    fields[key] = stripQuotes(value);`,
        // 等价突变：currentBlock 已被置 null，缩进行不会再被追加，
        // 因此保留旧的 blockStyle 值不产生可观察的行为差异（已实测确认）。
        // 记为 knownEquivalent 而不是"测试缺陷"——把等价突变算作逃逸会误导后续维护。
        knownEquivalent: true,
      },
      {
        name: "M6 删除「正文为空」校验",
        find: `  if (!body.trim()) {
    errors.push("frontmatter 之后没有正文内容");
  }`,
        replace: `  // [mutated] 正文为空校验已删除`,
      },
      {
        name: "M7 name/目录名一致性校验被移除",
        find: `    if (f.name !== dirName) {`,
        replace: `    if (false) {`,
      },
      {
        name: "M8 NAME_RE 放宽（大写也通过）",
        find: `const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;`,
        replace: `const NAME_RE = /^[A-Za-z0-9_-]+$/;`,
      },
      {
        name: "M9 description 必填校验被删除",
        find: `  if (!f.description) {
    errors.push("缺少必填字段 \`description\`");`,
        replace: `  if (false) {
    errors.push("缺少必填字段 \`description\`");`,
      },
      {
        name: "N2 删除 description >1024 上限校验",
        find: `    if (len > 1024) errors.push(\`\\\`description\\\` 超长: \${len} > 1024 字符\`);`,
        replace: `    // [mutated] description 长度上限校验已删除`,
      },
      {
        name: "N3 删除 compatibility >500 上限校验",
        find: `    if (len > 500) errors.push(\`\\\`compatibility\\\` 超长: \${len} > 500 字符\`);`,
        replace: `    // [mutated] compatibility 长度上限校验已删除`,
      },
      {
        name: "N4 块标量内的空行/# 行重新被当作注释丢弃（评审 R5 回归）",
        find: `    const inBlockScalar = currentBlock && currentBlock !== "metadata" && blockStyle !== "plain";`,
        replace: `    const inBlockScalar = false;`,
      },
    ],
  },
  {
    label: "报告机检器 check-report.mjs",
    files: [{ from: LINTER_SRC, to: LINTER_SRC }, { from: LINTER_TEST, to: LINTER_TEST }],
    test: LINTER_TEST,
    mutations: [
      {
        name: "P1 退回「数关键字」取证（v2.2 的绕过路径复活，评审 R1）",
        find: `  for (const id of highMeasured) {
    const why = entryEvidence(lines, fence, hi, ids, id);
    if (why) failures.push(why);
  }`,
        replace: `  // [mutated] 逐条取证已删除`,
      },
      {
        name: "P2 高危不再要求实测（「未实测不得定高危」失效）",
        find: `    if (isHigh && !(claims && !bs.includes("推理")))`,
        replace: `    if (false && !(claims && !bs.includes("推理")))`,
      },
      {
        name: "P3 连 🟡 也强制逐条取证（评审 R4 的误报回归）",
        find: `  for (const id of highMeasured) {`,
        replace: `  for (const id of measured) {`,
      },
      {
        name: "P4 空围栏代码块也算证据",
        find: `      if (lines.slice(k + 1, m).some((l) => l.trim() !== "")) return true;`,
        replace: `      return true;`,
      },
      {
        name: "P5 总表零数据行不再自曝（永远绿风险）",
        find: `  if (rows === 0) failures.push("缺陷总表无数据行 —— 提取错位，本检查无法判定");`,
        replace: `  if (false) failures.push("缺陷总表无数据行 —— 提取错位，本检查无法判定");`,
      },
      {
        name: "P6 多表报告不再优先取含定级依据的那张（评审 R15）",
        find: `    if (c.some((x) => x.includes("定级依据"))) {`,
        replace: `    if (false) {`,
      },
    ],
  },
];

function runTest(tmp, rel) {
  try {
    execFileSync(process.execPath, [join(tmp, rel)], { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

console.log("突变测试：验证回归测试能否抓住缺陷（只对临时副本下毒，不动工作区）\n");

let caught = 0;
let escaped = 0;
let invalid = 0;
let equivalent = 0;
const sourceHashes = new Map();
for (const suite of SUITES)
  for (const f of suite.files) sourceHashes.set(f.from, readFileSync(join(ROOT, f.from), "utf8"));

const tmp = mkdtempSync(join(tmpdir(), "mutations-"));
try {
  for (const suite of SUITES) {
    const original = sourceHashes.get(suite.files[0].from);
    console.log(`--- ${suite.label} ---`);

    const stage = (text) => {
      for (const f of suite.files) {
        const dest = join(tmp, f.to);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, f.from === suite.files[0].from ? text : sourceHashes.get(f.from), "utf8");
      }
    };

    stage(original);
    if (!runTest(tmp, suite.test)) {
      console.error(`✗ 基线失败：${suite.label} 未做任何突变时测试就没通过。请先修好测试再跑突变。`);
      process.exit(1);
    }
    console.log("  ✅ 基线：未突变时测试全绿");

    for (const m of suite.mutations) {
      if (!original.includes(m.find)) {
        console.log(`  ⚠ ${m.name}`);
        console.log(`      突变无效：源码中找不到待替换片段（源码已变更，请更新本脚本）`);
        invalid++;
        continue;
      }
      stage(original.replace(m.find, m.replace));
      if (runTest(tmp, suite.test)) {
        if (m.knownEquivalent) {
          console.log(`  ➖ 等价突变（预期不被捕获）: ${m.name}`);
          equivalent++;
        } else {
          console.log(`  ✗ 逃逸: ${m.name}`);
          console.log(`      注入缺陷后测试仍然全绿 —— 该缺陷无测试保护`);
          escaped++;
        }
      } else {
        console.log(`  ✅ 已抓住: ${m.name}`);
        caught++;
      }
      stage(original);
    }
    console.log("");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 本脚本设计上不该碰工作区——若有人改回就地写入，这里必须变红。
for (const [rel, text] of sourceHashes) {
  if (readFileSync(join(ROOT, rel), "utf8") !== text) {
    console.error(`✗ 严重：突变过程改动了工作区文件 ${rel}，请用 git checkout 恢复。`);
    process.exit(1);
  }
}

console.log(`结果: ${caught} 抓住 / ${escaped} 逃逸 / ${equivalent} 等价突变 / ${invalid} 无效突变`);
console.log(`工作区文件字节未变（突变只作用于临时副本），基线仍全绿。`);
process.exit(escaped > 0 || invalid > 0 ? 1 : 0);
