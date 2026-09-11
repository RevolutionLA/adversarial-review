#!/usr/bin/env node
/**
 * test-validate-skill.mjs — validate-skill.mjs 的回归测试
 *
 * 每个用例都是「修前坏、修后好」的真实缺陷：
 *   - 块标量（> 折叠 / | 字面）曾被误解析为 1 字符，且仍报「✅ 通过」——
 *     这是最危险的 false negative：合法 skill 被告知合规，而 description 根本没被校验。
 *
 * 用法: node scripts/test-validate-skill.mjs
 * 退出码: 0 = 全部通过, 1 = 有失败
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const VALIDATOR = new URL("./validate-skill.mjs", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1"
);

let pass = 0;
let fail = 0;
const root = mkdtempSync(join(tmpdir(), "vskill-test-"));

/** 建一个 skill 目录并写入 SKILL.md，返回目录路径 */
function makeSkill(dirName, content) {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

/** 运行校验器，返回 { code, out } */
function run(dir) {
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function check(name, dir, expect) {
  const { code, out } = run(dir);
  const ok =
    expect.pass === (code === 0) &&
    (expect.descLen === undefined || out.includes(`description 长度: ${expect.descLen} /`));
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
    console.log(`      期望 pass=${expect.pass} descLen=${expect.descLen ?? "-"}，实际 exit=${code}`);
    console.log(`      输出: ${out.trim().split("\n").slice(0, 4).join(" | ")}`);
  }
}

console.log("validate-skill.mjs 回归测试\n");

// ---- 块标量：曾被误报为 1 字符 ----
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

// ---- 必须继续报错的情形（修复不能放松检出） ----
check(
  "空 description 必须报错",
  makeSkill(
    "empty-desc",
    `---
name: empty-desc
description:
---
# Body
`
  ),
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
    `---
name: totally-different
description: A description that is long enough. Use when testing mismatches.
---
# Body
`
  ),
  { pass: false }
);

check(
  "非法 name（大写）必须报错",
  makeSkill(
    "Bad-Name",
    `---
name: Bad-Name
description: A description that is long enough. Use when testing bad names.
---
# Body
`
  ),
  { pass: false }
);

// ---- 不能误伤的正常写法 ----
check(
  "带引号且含冒号的 description 应通过",
  makeSkill(
    "quoted",
    `---
name: quoted
description: "A quoted description: with a colon inside. Use when testing quoted values."
---
# Body
`
  ),
  { pass: true, descLen: 74 }
);

rmSync(root, { recursive: true, force: true });

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
