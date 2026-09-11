#!/usr/bin/env node
/**
 * check-links.mjs — 校验仓库内 markdown 的本地链接是否可达
 *
 * 为什么不用 shell 版：原实现用 `exit $fail` 但 `fail` 从不置 1，
 * 导致检查**永远不可能失败**（装饰性 CI）；且它把 references/*.md 里的
 * 相对链接一律按仓库根解析，产生假警告。
 *
 * v2.0.2 修复的静默通过缺陷（这个检查器自己犯过与它要修的 B5 同类的错）：
 *   - 引用式链接 `[text][ref]` + `[ref]: url` 完全不可见
 *   - 含空格的路径 `[text](my file.md)` 因正则 `[^)\s]+` 被跳过
 *   两者都导致 checked 偏少，却照样打印「✅ 所有本地链接可达」。
 *   现在：全量提取 + 输出解析统计，任何"看见了却无法解析"的形式都会被计入 skipped 并告警。
 *
 * 用法: node scripts/check-links.mjs
 * 退出码: 0 = 全部可达, 1 = 存在断链
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function isLocalLink(href) {
  if (!href) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false; // http:, https:, mailto:, tel:
  if (href.startsWith("//")) return false;
  if (href.startsWith("#")) return false;
  if (href.includes("<") || href.includes(">")) return false; // 模板占位符 <name>
  return true;
}

/**
 * 从 markdown 文本中提取所有链接目标。
 * 覆盖：
 *   1. 行内链接 [text](url) / 图片 ![alt](url)  —— url 可含空格（用 <...> 或裸空格）
 *   2. 引用式链接 [text][ref] / [text][] / [ref]  + 定义行 [ref]: url
 *   3. HTML 属性 href="..." / src="..."
 */
function extractLinks(text) {
  const found = [];

  // 1. 行内：[text](url "title")，url 允许含空格
  const inlineRe = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)]*?)\s*(?:"[^"]*"|'[^']*')?\s*\)/g;
  let m;
  while ((m = inlineRe.exec(text)) !== null) {
    let url = (m[1] ?? "").trim();
    if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
    if (url) found.push(url);
  }

  // 2. 引用式定义行：[ref]: url
  const defs = new Map();
  const defRe = /^[ \t]{0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)/gm;
  while ((m = defRe.exec(text)) !== null) {
    let url = m[2].trim();
    if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
    defs.set(m[1].trim().toLowerCase(), url);
  }

  // 2b. 引用式使用 [text][ref] / [text][] / [ref]
  const useRe = /!?\[([^\]]*)\]\[([^\]]*)\]/g;
  while ((m = useRe.exec(text)) !== null) {
    const ref = (m[2] || m[1]).trim().toLowerCase();
    const url = defs.get(ref);
    if (url) found.push(url);
    else found.push({ unresolvedRef: m[2] || m[1] }); // 记录了引用但找不到定义
  }
  // 快捷引用 [ref]（不含方括号嵌套，且不是定义行本身）
  const shortcutRe = /(^|[^!\\\]])\[([A-Za-z0-9 _.-]+)\](?!\(|\[|:)/g;
  while ((m = shortcutRe.exec(text)) !== null) {
    const ref = m[2].trim().toLowerCase();
    const url = defs.get(ref);
    if (url) found.push(url);
  }

  // 3. HTML 属性
  const htmlRe = /(?:href|src)\s*=\s*"([^"]+)"/g;
  while ((m = htmlRe.exec(text)) !== null) found.push(m[1]);

  return found;
}

const files = collectMarkdown(ROOT);
let checked = 0;
let skippedExternal = 0;
const unresolvedRefs = [];
const broken = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const from = relative(ROOT, file).replace(/\\/g, "/");

  for (const raw of extractLinks(text)) {
    if (raw && typeof raw === "object" && raw.unresolvedRef) {
      unresolvedRefs.push({ from, ref: raw.unresolvedRef });
      continue;
    }
    const href = String(raw);
    if (!isLocalLink(href)) {
      skippedExternal++;
      continue;
    }

    const cleanRaw = href.split("#")[0].split("?")[0];
    // 解码 %20 等百分号编码，便于文件系统比对
    let clean = cleanRaw;
    try {
      clean = decodeURIComponent(cleanRaw);
    } catch {
      /* 保留原样 */
    }
    if (!clean) continue;

    checked++;
    const target = clean.startsWith("/")
      ? join(ROOT, clean)
      : resolve(dirname(file), clean);

    if (!existsSync(target)) {
      broken.push({
        from,
        href: clean,
        resolved: relative(ROOT, target).replace(/\\/g, "/"),
      });
    }
  }
}

console.log(
  `扫描 ${files.length} 个 markdown 文件：检查 ${checked} 个本地链接，跳过 ${skippedExternal} 个外部/锚点链接。`
);

if (unresolvedRefs.length > 0) {
  console.error(`\n✗ 有 ${unresolvedRefs.length} 处引用式链接找不到定义（会被静默忽略，故视为错误）：`);
  for (const u of unresolvedRefs) console.error(`  ${u.from} -> [${u.ref}] 无对应的 [${u.ref}]: url 定义`);
}

if (broken.length > 0) {
  console.error(`\n✗ 发现 ${broken.length} 个断链：`);
  for (const b of broken) {
    console.error(`  ${b.from} -> ${b.href}  (解析为 ${b.resolved}，不存在)`);
  }
}

if (broken.length === 0 && unresolvedRefs.length === 0) {
  console.log("✅ 所有本地链接可达。");
  process.exit(0);
}

process.exit(1);
