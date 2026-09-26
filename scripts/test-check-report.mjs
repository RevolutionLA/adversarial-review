#!/usr/bin/env node
// test-check-report.mjs — 报告机检器的回归测试（v2.2.0）
//
// 为什么单独有这份测试：`check-report.mjs` 是"未经实测不得定高危"这条
// 约束唯一的执行机制。它自己如果判定错位（把合规报告判红、或对编造的
// 「实测」视而不见），这条约束就又变回散文。所以每个用例既断言退出码，
// **也断言报错文本里的编号/关键字**——只断言退出码测不出"报错了但报错了别的东西"。

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LINTER = join(ROOT, "skills", "adversarial-review", "scripts", "check-report.mjs");
const DIR = mkdtempSync(join(tmpdir(), "check-report-"));

const TABLE6 = `| 编号 | 级别 | 定级依据 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|---|
`;
const TABLE_NO_BASIS = `| 编号 | 级别 | 一句话 | 维度 | 位置（文件:行号） |
|---|---|---|---|---|
`;
const REPRO = `
### B1 · 🔴 崩溃
- **复现命令**：\`node --check src/a.js\`
`;

function run(content, args = null) {
  const file = join(DIR, "report.md");
  if (content !== null) writeFileSync(file, content, "utf8");
  const argv = args === null ? [LINTER, file] : [LINTER, ...args];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

let pass = 0;
const fails = [];
function t(name, { content = null, args = null, wantCode, wantText }) {
  const { code, out } = run(content, args);
  const okCode = code === wantCode;
  const okText = !wantText || out.includes(wantText);
  if (okCode && okText) {
    pass += 1;
  } else {
    fails.push(
      `${name}：退出码期望 ${wantCode} 实得 ${code}` +
        (okText ? "" : `；输出未包含「${wantText}」，实际:\n${out}`)
    );
  }
}

// 1 绿：合规报告（每条高危都有自己的展开段落 + 可重跑命令）
t("合规报告应通过", {
  content: `# 蓝军报告\n\n## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n| B3 | 🟡 | 推理·待实测 | 未声明 | 兼容性 | src/b.js:3 |\n${REPRO}`,
  wantCode: 0,
  wantText: "逐条取证通过",
});

// 2 绿：🟡 声称实测但不展开——模板规定 🟡 只占总表一行，此时不该要求命令（评审 R4）
t("🟡 实测不展开不得被误判", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🟡 | 实测 | 风格 | 文档一致性 | src/a.js:12 |\n`,
  wantCode: 0,
});

// 3 红：🔴 却只有推理
t("未经实测不得定高危", {
  content: `## 缺陷总表\n\n${TABLE6}| B2 | 🔴 | 推理·待实测 | 可能溢出 | 正确性 | src/a.js:9 |\n`,
  wantCode: 1,
  wantText: "B2",
});

// 4 红：写"未实测"不得算作实测（正则被写坏时这条会红）
t("「未实测」不得被误认为实测", {
  content: `## 缺陷总表\n\n${TABLE6}| B7 | 🟠 | 未实测 | 推测会失败 | 正确性 | src/a.js:9 |\n- **复现命令**：true\n`,
  wantCode: 1,
  wantText: "B7",
});

// 5 红：缺「定级依据」列 → 约束无法机检
t("缺定级依据列必须报错", {
  content: `## 缺陷总表\n\n${TABLE_NO_BASIS}| B1 | 🔴 | 会崩 | 正确性 | src/a.js:12 |\n- **复现命令**：true\n`,
  wantCode: 1,
  wantText: "定级依据",
});

// 6 红：声称实测的条数 > 「复现命令」出现次数
t("声称实测却拿不出复现命令", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n| B2 | 🟠 | 实测 | 坏 | 正确性 | src/b.js:3 |\n${REPRO}`,
  wantCode: 1,
  wantText: "复现命令",
});

// 7 红：位置列为空
t("位置列为空必须报错", {
  content: `## 缺陷总表\n\n${TABLE6}| B4 | 🔴 | 实测 | 会崩 | 正确性 |  |\n${REPRO}`,
  wantCode: 1,
  wantText: "位置列为空",
});

// 8 红：根本没有总表（提取错位不许静默通过）
t("找不到缺陷总表必须报错", {
  content: "# 报告\n\n这次没发现问题。\n",
  wantCode: 1,
  wantText: "未找到缺陷总表",
});

// 9 红：有表头但零数据行
t("空总表不得视为通过", {
  content: `## 缺陷总表\n\n${TABLE6}\n后文。\n`,
  wantCode: 1,
  wantText: "无数据行",
});

// 10 红：级别列不再用 emoji → 检查本身失效，必须自曝
t("级别列格式漂移必须自曝", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | HIGH | 实测 | 会崩 | 正确性 | src/a.js:12 |\n- **复现命令**：true\n`,
  wantCode: 1,
  wantText: "未解析到任何级别标记",
});

// 11 用法错误 ≠ 检查失败
t("无参数应返回用法错误(2)", { content: null, args: [], wantCode: 2, wantText: "用法" });

// 12 红：v2.2 的真实绕过——正文摆一个 `## 复现命令` 空标题就够上计数（评审 R1）
t("只有「复现命令」四个字不构成证据", {
  content: `# 蓝军报告\n\n## 复现命令\n\n（待补）\n\n## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会导致崩溃 | 正确性 | src/a.js:12 |\n`,
  wantCode: 1,
  wantText: "展开段落",
});

// 13 红：标签写了、围栏块是空的 —— 空代码块不算命令
t("空围栏代码块不得算证据", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n### B1 · 🔴 会崩\n- **复现命令**：\n\n\`\`\`bash\n\`\`\`\n`,
  wantCode: 1,
  wantText: "空标题不算证据",
});

// 14 红：高危声称实测，但只在总表里写"实测"，没有小节
t("高危缺少展开段落必须报错", {
  content: `## 缺陷总表\n\n${TABLE6}| B5 | 🟠 | 实测 | 坏 | 正确性 | src/a.js:12 |\n- **复现命令**：` +
    "`sed -n '12p' src/a.js`\n",
  wantCode: 1,
  wantText: "B5",
});

// 15 绿：报告有多张表时，取含「定级依据」的那张（评审 R15）
t("多表报告应优先取定级依据表", {
  content: `## 验证表（上一轮）\n\n| 编号 | 级别 | 一句话 | 位置（文件:行号） |\n|---|---|---|---|\n` +
    `| B9 | 🔴 | 旧条目，本轮不再取证 | src/old.js:1 |\n\n## 缺陷总表\n\n${TABLE6}` +
    `| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n${REPRO}`,
  wantCode: 0,
  wantText: "1 条缺陷",
});

rmSync(DIR, { recursive: true, force: true });

const total = pass + fails.length;
if (fails.length) {
  for (const f of fails) console.error(`  ✗ ${f}`);
  console.error(`test-check-report: ${pass} 通过 / ${fails.length} 失败（共 ${total}）`);
  process.exit(1);
}
console.log(`test-check-report: ${pass} 通过 / 0 失败（共 ${total}）`);
