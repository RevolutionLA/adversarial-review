#!/usr/bin/env node
/**
 * test-validate-skill.mjs — validate-skill.mjs 的回归测试
 *
 * 每个用例都是「修前坏、修后好」的真实缺陷：
 *   - 块标量（> 折叠 / | 字面）曾被误解析为 1 字符，且仍报「✅ 通过」——
 *     这是最危险的 false negative：合法 skill 被告知合规，而 description 根本没被校验。
 *
 * 设计要点（v2.0.1 修正）：
 *   仅比对 `description 长度: N` 是不够的 —— 折叠块与字面块在同一内容下
 *   **字符数完全相同**（实测两行用空格连接 = 111，用换行连接 = 同样 111），
 *   因此语义互换的突变会逃逸。故本测试直接导入 parseFrontmatter，
 *   对**内容**做断言（折叠结果不含 \n，字面结果含 \n），并补齐长度上限用例。
 *
 * 用法: node scripts/test-validate-skill.mjs
 * 退出码: 0 = 全部通过, 1 = 有失败
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseFrontmatter, validateOne } from "./validate-skill.mjs";

const VALIDATOR = new URL("./validate-skill.mjs", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1"
);

let pass = 0;
let fail = 0;
const root = mkdtempSync(join(tmpdir(), "vskill-test-"));

function makeSkill(dirName, content) {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

function run(dir) {
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, dir], { encoding: "utf8" });
    return { code: 0, out, crashed: false };
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    // 崩溃检测：未捕获异常会带 stack trace 关键词，且不会打印结构化结果行。
    // 把"崩溃"当成"正确报错"是测试框架的真实缺陷（会掩盖注入的严重 bug），
    // 因此这里显式区分：exit 非 0 但输出里没有 ✗ 结果行 => 视为崩溃。
    const crashed = !/✗|结果:/.test(out) || /TypeError|ReferenceError|is not iterable|Cannot read/.test(out);
    return { code: e.status ?? 1, out, crashed };
  }
}

function check(name, dir, expect) {
  const { code, out, crashed } = run(dir);
  // 崩溃不应被当作"正确报错"
  const ok =
    !crashed &&
    expect.pass === (code === 0) &&
    (expect.descLen === undefined || out.includes(`description 长度: ${expect.descLen} /`));
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
    if (crashed) {
      console.log(`      校验器崩溃（未捕获异常），而非结构化报错：`);
      console.log(`      ${out.trim().split("\n").find((l) => /Error|error/.test(l)) ?? out.slice(0, 120)}`);
    } else {
      console.log(`      期望 pass=${expect.pass} descLen=${expect.descLen ?? "-"}，实际 exit=${code}`);
      console.log(`      输出: ${out.trim().split("\n").slice(0, 4).join(" | ")}`);
    }
  }
}

/** 直接对解析器做语义断言（这是 v2.0.1 补上的关键能力） */
function checkSemantics(name, fn) {
  try {
    const err = fn();
    if (err) {
      fail++;
      console.log(`  ✗ ${name}\n      ${err}`);
    } else {
      pass++;
      console.log(`  ✅ ${name}`);
    }
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      抛出异常: ${e.message}`);
  }
}

console.log("validate-skill.mjs 回归测试\n");
console.log("--- 一、块标量解析（字符数断言） ---");

check(
  "折叠块 description（>）应被正确解析",
  makeSkill(
    "folded",
    `---
name: folded
description: >
  Folded description long enough to be meaningful for the validator.
  Use when the user asks about folded scalars.
---
# Body
`
  ),
  { pass: true, descLen: 111 }
);

check(
  "字面块 description（|）应被正确解析",
  makeSkill(
    "literal",
    `---
name: literal
description: |
  Line one of the description.
  Line two with Use when trigger words.
---
# Body
`
  ),
  { pass: true, descLen: 66 }
);

check(
  "折叠块后跟其他字段应正确终结块",
  makeSkill(
    "folded-then-field",
    `---
name: folded-then-field
description: >
  Folded description here that is long enough to be meaningful.
  Use when the user asks about testing.
license: MIT
---
# Body
`
  ),
  { pass: true, descLen: 99 }
);

check(
  "块标量去尾变体（>-）应被识别",
  makeSkill(
    "folded-strip",
    `---
name: folded-strip
description: >-
  A folded description written with the strip chomping indicator.
  Use when validating chomping variants.
---
# Body
`
  ),
  { pass: true, descLen: 102 }
);

console.log("\n--- 二、块标量语义（内容断言，锁住折叠 vs 字面） ---");

checkSemantics("折叠块结果应以空格连接，不含换行符", () => {
  const { fields } = parseFrontmatter(
    `---\nname: a\ndescription: >\n  line one here\n  line two here\n---\n`
  );
  if (fields.description.includes("\n")) {
    return `折叠块不应含 \\n，实际: ${JSON.stringify(fields.description)}`;
  }
  if (fields.description !== "line one here line two here") {
    return `折叠块拼接结果错误: ${JSON.stringify(fields.description)}`;
  }
  return null;
});

checkSemantics("字面块结果应保留换行符", () => {
  const { fields } = parseFrontmatter(
    `---\nname: a\ndescription: |\n  line one here\n  line two here\n---\n`
  );
  if (!fields.description.includes("\n")) {
    return `字面块应含 \\n，实际: ${JSON.stringify(fields.description)}`;
  }
  if (fields.description !== "line one here\nline two here") {
    return `字面块拼接结果错误: ${JSON.stringify(fields.description)}`;
  }
  return null;
});

checkSemantics("折叠与字面在同内容下字符数相同但内容不同（防语义互换突变）", () => {
  const body = "  alpha beta\n  gamma delta\n";
  const folded = parseFrontmatter(`---\nname: a\ndescription: >\n${body}---\n`).fields.description;
  const literal = parseFrontmatter(`---\nname: a\ndescription: |\n${body}---\n`).fields.description;
  if (folded === literal) {
    return `折叠与字面结果不应相同，两者都是: ${JSON.stringify(folded)}`;
  }
  if (folded.length !== literal.length) {
    return `本例两者长度应相同（用于证明仅靠长度断言会逃逸），实际 ${folded.length} vs ${literal.length}`;
  }
  return null;
});

checkSemantics("块标量之后紧跟另一个块标量，状态不应残留", () => {
  const { fields } = parseFrontmatter(
    `---\nname: a\ndescription: >\n  folded one\n  folded two\ncompatibility: |\n  literal one\n  literal two\n---\n`
  );
  if (fields.description.includes("\n")) {
    return `description 应是折叠块（不含 \\n），实际 ${JSON.stringify(fields.description)}`;
  }
  if (fields.description !== "folded one folded two") {
    return `description 拼接错误: ${JSON.stringify(fields.description)}`;
  }
  if (!fields.compatibility.includes("\n")) {
    return `compatibility 应是字面块（含 \\n，两行），实际 ${JSON.stringify(fields.compatibility)}`;
  }
  if (fields.compatibility !== "literal one\nliteral two") {
    return `compatibility 拼接错误: ${JSON.stringify(fields.compatibility)}`;
  }
  return null;
});

checkSemantics("块标量结束后紧跟普通标量，不应被并入块内容", () => {
  // 覆盖"块 -> 普通键 -> 普通键"：若 blockStyle 未在普通键处重置，
  // 后续行的解析会错乱（这是 M5 突变专门攻击的路径）
  const { fields } = parseFrontmatter(
    `---\nname: a\ndescription: >\n  folded content here\nlicense: MIT\ncompatibility: plain value\n---\n`
  );
  if (fields.description !== "folded content here") {
    return `description 被污染: ${JSON.stringify(fields.description)}`;
  }
  if (fields.license !== "MIT") {
    return `license 解析错误: ${JSON.stringify(fields.license)}`;
  }
  if (fields.compatibility !== "plain value") {
    return `compatibility 解析错误: ${JSON.stringify(fields.compatibility)}`;
  }
  return null;
});

console.log("\n--- 三、长度上限校验（蓝军 B1 的核心危害） ---");

check(
  "description 超过 1024 字符必须报错",
  makeSkill(
    "too-long-desc",
    `---
name: too-long-desc
description: ${"x".repeat(1100)}
---
# Body
`
  ),
  { pass: false }
);

check(
  "compatibility 超过 500 字符必须报错",
  makeSkill(
    "too-long-compat",
    `---
name: too-long-compat
description: A description that is long enough. Use when testing length limits.
compatibility: ${"y".repeat(520)}
---
# Body
`
  ),
  { pass: false }
);

check(
  "compatibility 折叠块超 500 字符也必须报错（曾被巧合判对）",
  makeSkill(
    "compat-folded-long",
    `---
name: compat-folded-long
description: A description that is long enough. Use when testing folded compatibility.
compatibility: >
  ${"z".repeat(300)}
  ${"w".repeat(300)}
---
# Body
`
  ),
  { pass: false }
);

console.log("\n--- 四、必须报错的情形（修复不能放松检出） ---");

check(
  "空 description 必须报错",
  makeSkill("empty-desc", `---\nname: empty-desc\ndescription:\n---\n# Body\n`),
  { pass: false }
);

check(
  "完全省略 description 字段必须报错",
  makeSkill("no-desc-field", `---\nname: no-desc-field\nlicense: MIT\n---\n# Body\n`),
  { pass: false }
);

check(
  "缺少 frontmatter 必须报错",
  makeSkill("no-fm", "# Just a body, no frontmatter\n"),
  { pass: false }
);

check(
  "name 与目录名不一致必须报错",
  makeSkill(
    "mismatch-dir",
    `---\nname: totally-different\ndescription: A description that is long enough. Use when testing mismatches.\n---\n# Body\n`
  ),
  { pass: false }
);

check(
  "非法 name（大写）必须报错",
  makeSkill(
    "Bad-Name",
    `---\nname: Bad-Name\ndescription: A description that is long enough. Use when testing bad names.\n---\n# Body\n`
  ),
  { pass: false }
);

checkSemantics("正文为空必须报错", () => {
  const dir = makeSkill("empty-body", `---\nname: empty-body\ndescription: A description long enough. Use when testing empty body.\n---\n   \n`);
  const r = validateOne(dir);
  if (r.errors.length === 0) return "正文为空却未报错";
  return null;
});

console.log("\n--- 五、不能误伤的正常写法 ---");

check(
  "带引号且含冒号的 description 应通过",
  makeSkill(
    "quoted",
    `---\nname: quoted\ndescription: "A quoted description: with a colon inside. Use when testing quoted values."\n---\n# Body\n`
  ),
  { pass: true, descLen: 74 }
);

checkSemantics("含 # 的合法值不应被当作注释截断", () => {
  const { fields } = parseFrontmatter(
    `---\nname: a\ndescription: Use C# and shell # comments carefully when testing.\n---\n`
  );
  if (!fields.description.includes("C#")) {
    return `含 # 的值被截断: ${JSON.stringify(fields.description)}`;
  }
  if (!fields.description.includes("# comments")) {
    return `# comments 被误当注释截断: ${JSON.stringify(fields.description)}`;
  }
  return null;
});

rmSync(root, { recursive: true, force: true });

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
