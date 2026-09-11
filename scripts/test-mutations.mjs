#!/usr/bin/env node
/**
 * test-mutations.mjs — 突变测试：验证回归测试真的能抓住缺陷
 *
 * 为什么需要这个：第三方复核指出，原先的 9 个用例有 5 个突变逃逸
 * （把缺陷注入 validate-skill.mjs，测试仍然全绿）。测试全绿不等于测试有效。
 *
 * 本脚本自动做突变：
 *   1. 备份 validate-skill.mjs
 *   2. 注入一个缺陷
 *   3. 运行 test-validate-skill.mjs
 *   4. 期望测试**失败**；若测试仍全绿 -> 该突变为「逃逸」，记失败
 *   5. 还原文件
 *
 * 用法: node scripts/test-mutations.mjs
 * 退出码: 0 = 所有突变都被抓住, 1 = 存在逃逸突变
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("./validate-skill.mjs", import.meta.url));
const TEST = fileURLToPath(new URL("./test-validate-skill.mjs", import.meta.url));
const ORIGINAL = readFileSync(SRC, "utf8");

/**
 * 每个突变：{ name, find, replace }
 * find 必须精确匹配源码；若不匹配则报告「突变无效」（说明源码已变，需更新本脚本）。
 */
const MUTATIONS = [
  {
    name: "M1 块标量指示符不再识别（退回旧行为）",
    find: `    const blockMatch = /^([|>])([+-]?\\d*|[0-9]*[+-]?)$/.exec(value);`,
    replace: `    const blockMatch = null && /^([|>])([+-]?\\d*|[0-9]*[+-]?)$/.exec(value);`,
  },
  {
    name: "M2 折叠块与字面块语义互换（折叠改用 \\n）",
    find: `        if (blockStyle === "folded") {`,
    replace: `        if (blockStyle === "literal") {`,
  },
  {
    name: "M3 折叠块只取第一行",
    find: `          fields[currentBlock] = fields[currentBlock]
            ? \`\${fields[currentBlock]} \${content}\`
            : content;`,
    replace: `          if (!fields[currentBlock]) fields[currentBlock] = content;`,
  },
  {
    name: "M4 字面块只取第一行",
    find: `          fields[currentBlock] = fields[currentBlock]
            ? \`\${fields[currentBlock]}\\n\${content}\`
            : content;`,
    replace: `          if (!fields[currentBlock]) fields[currentBlock] = content;`,
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
];

/** 运行测试，返回是否通过（exit 0） */
function runTest() {
  try {
    execFileSync(process.execPath, [TEST], { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

console.log("突变测试：验证回归测试能否抓住缺陷\n");

// 先确认基线：未突变时必须全绿
if (!runTest()) {
  console.error("✗ 基线失败：未做任何突变时测试就没通过。请先修好测试再跑突变。");
  process.exit(1);
}
console.log("✅ 基线：未突变时测试全绿\n");

let caught = 0;
let escaped = 0;
let invalid = 0;
let equivalent = 0;

for (const m of MUTATIONS) {
  if (!ORIGINAL.includes(m.find)) {
    console.log(`  ⚠ ${m.name}`);
    console.log(`      突变无效：源码中找不到待替换片段（源码已变更，请更新本脚本）`);
    invalid++;
    continue;
  }

  const mutated = ORIGINAL.replace(m.find, m.replace);
  try {
    writeFileSync(SRC, mutated, "utf8");
    const stillGreen = runTest();
    if (stillGreen) {
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
  } finally {
    writeFileSync(SRC, ORIGINAL, "utf8");
  }
}

// 最终确认还原成功
const restored = readFileSync(SRC, "utf8") === ORIGINAL;
if (!restored) {
  console.error("\n✗ 严重：源文件未正确还原！请用 git checkout 恢复。");
  process.exit(1);
}
if (!runTest()) {
  console.error("\n✗ 严重：还原后基线不通过。请用 git checkout 恢复。");
  process.exit(1);
}

console.log(`\n结果: ${caught} 抓住 / ${escaped} 逃逸 / ${equivalent} 等价突变 / ${invalid} 无效突变`);
console.log(`源文件已还原，基线仍全绿。`);
process.exit(escaped > 0 || invalid > 0 ? 1 : 0);
