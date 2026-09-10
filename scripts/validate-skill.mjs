#!/usr/bin/env node
/**
 * validate-skill.mjs — Agent Skills (SKILL.md) 规范校验器
 *
 * 校验项依据 Agent Skills 规范：
 *   name         必填，1-64 字符，仅小写字母/数字/连字符，不得以连字符开头或结尾，
 *                不得含连续连字符，且必须与父目录名一致
 *   description  必填，1-1024 字符，非空
 *   license      选填
 *   compatibility 选填，1-500 字符
 *   metadata     选填，字符串键值映射
 *   allowed-tools 选填
 *
 * 用法:
 *   node scripts/validate-skill.mjs <skill目录或SKILL.md路径> [...更多]
 *   node scripts/validate-skill.mjs .              # 校验当前目录
 *
 * 退出码: 0 = 通过, 1 = 存在 error
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { basename, dirname, resolve, join } from "node:path";

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KNOWN_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/** 极简 YAML frontmatter 解析器：只处理本规范所需的一层键值 + metadata 缩进块。 */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { ok: false, reason: "文件未以 YAML frontmatter (---) 开头" };

  const raw = m[1];
  const fields = {};
  let currentBlock = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const indented = /^\s+\S/.test(line);
    if (indented) {
      if (currentBlock === "metadata") {
        const mm = /^\s+([^:]+):\s*(.*)$/.exec(line);
        if (mm) {
          fields.metadata ??= {};
          fields.metadata[mm[1].trim()] = stripQuotes(mm[2].trim());
        }
      }
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();

    if (value === "") {
      currentBlock = key;
      if (key === "metadata") fields.metadata = {};
      else fields[key] = "";
      continue;
    }
    currentBlock = null;
    fields[key] = stripQuotes(value);
  }

  return { ok: true, fields, bodyStart: m[0].length };
}

function stripQuotes(s) {
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function validateOne(inputPath) {
  const errors = [];
  const warnings = [];
  const notes = [];

  const abs = resolve(inputPath);
  let skillFile;
  let dirName;

  if (existsSync(abs) && statSync(abs).isDirectory()) {
    skillFile = join(abs, "SKILL.md");
    dirName = basename(abs);
  } else {
    skillFile = abs;
    dirName = basename(dirname(abs));
  }

  if (!existsSync(skillFile)) {
    errors.push(`找不到 SKILL.md: ${skillFile}`);
    return { skillFile, dirName, errors, warnings, notes };
  }

  const text = readFileSync(skillFile, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm.ok) {
    errors.push(fm.reason);
    return { skillFile, dirName, errors, warnings, notes };
  }

  const f = fm.fields;

  // ---- name ----
  if (!f.name) {
    errors.push("缺少必填字段 `name`");
  } else {
    if (f.name.length > 64) errors.push(`\`name\` 超长: ${f.name.length} > 64`);
    if (!NAME_RE.test(f.name)) {
      errors.push(
        `\`name\` 格式非法: "${f.name}" —— 仅允许小写字母/数字/连字符，不得以连字符开头或结尾、不得含连续连字符`
      );
    }
    if (f.name !== dirName) {
      errors.push(`\`name\` ("${f.name}") 与父目录名 ("${dirName}") 不一致（规范要求必须相同）`);
    }
  }

  // ---- description ----
  if (!f.description) {
    errors.push("缺少必填字段 `description`");
  } else {
    const len = [...f.description].length;
    if (len === 0) errors.push("`description` 为空");
    if (len > 1024) errors.push(`\`description\` 超长: ${len} > 1024 字符`);
    if (len > 0 && len < 40) {
      warnings.push(`\`description\` 偏短 (${len} 字符)，不足以让 agent 判断何时该用它`);
    }
    if (!/(use when|when the user|当用户|适用于|用于)/i.test(f.description)) {
      warnings.push("`description` 未明确说明「何时使用」，建议加入触发条件（如 Use when... / 当用户...）");
    }
    notes.push(`description 长度: ${len} / 1024 字符`);
  }

  // ---- compatibility ----
  if (f.compatibility !== undefined) {
    const len = [...String(f.compatibility)].length;
    if (len === 0) errors.push("`compatibility` 存在但为空（应为 1-500 字符或省略）");
    if (len > 500) errors.push(`\`compatibility\` 超长: ${len} > 500 字符`);
  }

  // ---- metadata ----
  if (f.metadata !== undefined) {
    if (typeof f.metadata !== "object") {
      warnings.push("`metadata` 应为字符串键值映射");
    }
  }

  // ---- 未知字段 ----
  for (const key of Object.keys(f)) {
    if (!KNOWN_FIELDS.has(key)) {
      warnings.push(`未知 frontmatter 字段 \`${key}\`（部分宿主会忽略，部分会报错）`);
    }
  }

  // ---- body ----
  const body = text.slice(fm.bodyStart);
  if (!body.trim()) {
    errors.push("frontmatter 之后没有正文内容");
  }
  const bodyLines = body.split(/\r?\n/).length;
  if (bodyLines > 500) {
    notes.push(`正文较长 (${bodyLines} 行)，考虑拆分到 references/ 以节省上下文`);
  }

  // ---- 目录约定 ----
  for (const d of ["references", "scripts", "assets"]) {
    if (existsSync(join(dirname(skillFile), d))) notes.push(`发现可选目录 ${d}/`);
  }

  return { skillFile, dirName, errors, warnings, notes };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("用法: node scripts/validate-skill.mjs <skill目录|SKILL.md> [...]");
  process.exit(2);
}

let failed = 0;
for (const t of targets) {
  const r = validateOne(t);
  console.log(`\n=== ${r.skillFile} ===`);
  for (const n of r.notes) console.log(`  · ${n}`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
  for (const e of r.errors) console.log(`  ✗ ${e}`);
  if (r.errors.length === 0) console.log("  ✅ 通过 Agent Skills 规范校验");
  else failed++;
}

console.log("");
if (failed > 0) {
  console.log(`结果: ${failed} 个未通过`);
  process.exit(1);
}
console.log("结果: 全部通过");
