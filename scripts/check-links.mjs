#!/usr/bin/env node
/**
 * check-links.mjs — 校验仓库内 markdown 的本地相对链接是否可达
 *
 * 为什么不用 shell 版：原实现用 `exit $fail` 但 `fail` 从不置 1，
 * 导致检查**永远不可能失败**（装饰性 CI）；且它把 references/*.md 里的
 * 相对链接一律按仓库根解析，产生假警告。
 * 本实现按「每个 markdown 文件所在目录」解析其相对链接。
 *
 * 用法: node scripts/check-links.mjs
 * 退出码: 0 = 全部可达, 1 = 存在断链
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 递归收集 markdown 文件（跳过 .git / node_modules） */
function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules") continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) collectMarkdown(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

/** 排除外部协议、锚点、mailto、模板占位 */
function isLocalLink(href) {
  if (!href) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false; // http:, https:, mailto:, tel:
  if (href.startsWith("//")) return false;
  if (href.startsWith("#")) return false;
  if (href.includes("<") || href.includes(">")) return false; // 模板占位符 <name>
  return true;
}

const files = collectMarkdown(ROOT);
let checked = 0;
const broken = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  // markdown 链接 [text](href) 与图片 ![alt](src)，以及裸 HTML href="..."
  const re = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(?:href|src)="([^"]+)"/g;

  let m;
  while ((m = re.exec(text)) !== null) {
    const href = m[1] ?? m[2];
    if (!isLocalLink(href)) continue;

    const clean = href.split("#")[0].split("?")[0];
    if (!clean) continue;

    checked++;
    const target = clean.startsWith("/")
      ? join(ROOT, clean)                       // 仓库绝对路径
      : resolve(dirname(file), clean);          // 相对该 md 文件所在目录

    if (!existsSync(target)) {
      broken.push({
        from: relative(ROOT, file).replace(/\\/g, "/"),
        href: clean,
        resolved: relative(ROOT, target).replace(/\\/g, "/"),
      });
    }
  }
}

console.log(`检查了 ${files.length} 个 markdown 文件中的 ${checked} 个本地链接。`);

if (broken.length === 0) {
  console.log("✅ 所有本地链接可达。");
  process.exit(0);
}

console.error(`\n✗ 发现 ${broken.length} 个断链：`);
for (const b of broken) {
  console.error(`  ${b.from} -> ${b.href}  (解析为 ${b.resolved}，不存在)`);
}
process.exit(1);
