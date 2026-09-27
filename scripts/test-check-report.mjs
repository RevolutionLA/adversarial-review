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
  wantText: "没有一条像命令",
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

// —— 以下为 v2.4 新增：外部评审第二轮 T1/T2/T6/T7 的四条形为断言 ——

// 16 红：行内代码存在，但内容是占位词（评审 T1 的原始构造）
t("行内代码写成占位词不得算命令", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`见附录\`\n\n## 附录\n\n（略）\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 17 红：本小节没有命令，命令在紧随其后的附录里（评审 T2：end+9 的泄漏窗口）
t("命令放在别的章节不得算本条证据", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：见附录\n\n## 附录：通用复现脚本\n\n` +
    "```bash\nnode --check src/a.js\n```\n",
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 18 红：围栏块非空但只有散文 —— 与 T1 同一类，判据必须看内容形状
t("围栏块内只有说明文字不得算命令", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\n\n\`\`\`text\n这个问题在特定输入下会崩溃，详见日志。\n\`\`\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 19 绿：命令所在的围栏块超过 9 行也必须被认到（评审 T7：全文计数恒为 0 的错）
t("超过 9 行的围栏块仍是有效证据", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\n\n\`\`\`bash\n` +
    `node -e '\nconst a = 1;\nconst b = 2;\nconst c = a + b;\nconsole.log(c);\nif (a) {\n  throw new Error("boom");\n}\nconsole.log("unreachable");\n' \n` +
    `\`\`\`\n`,
  wantCode: 0,
  wantText: "全文有效「复现命令」1 处",
});

// 20 绿：编号含正则元字符时不得崩栈，且必须照常认出自己的小节（评审 T6）
t("编号含正则元字符不得崩溃", {
  content: `## 缺陷总表\n\n${TABLE6}| B(1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B(1 · 🔴 会崩\n- **复现命令**：\`node --check src/a.js\`\n`,
  wantCode: 0,
  wantText: "1 条缺陷",
});

// —— 以下为 v2.5 新增：外部评审第三轮 U1/U2/U6 的五条形为断言 ——
// v2.4 的判据是"形状"（纯 ASCII + 多 token），评审把同一个攻击翻译成英文就复活了，
// 而真命令 `make` 反被形状判红。下面 21/23/24/25 是"该红的"，22 是"不许误伤"。

// 21 红：T1 的攻击译成英文（两个 ASCII 单词、零命令）
t("英文占位词不得算命令（评审 U1）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`see appendix\`\n\n## 附录\n\n（略）\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 22 绿：真实的单 token 命令必须被认 —— 误报会让人关掉检查（评审 U2）
t("裸命令 make / pytest 不得误判为无证据（评审 U2）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`make\`\n`,
  wantCode: 0,
  wantText: "逐条取证通过",
});

// 23 红：单个带点的名词不是命令（`notes.md` 曾被"首 token 含点"放行）
t("文件名形状不得算命令（评审 U1）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`notes.md\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 24 红：贴一段缺陷源码当"复现命令"（评审 U6，围栏路径）
t("围栏块里的源码片段不得算命令（评审 U6）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\n\n\`\`\`js\nif (x === undefined) {\n  return c[iLoc] || "";\n}\n\`\`\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 25 红：贴一段报错日志当"复现命令"（评审 U6；日志看起来"像跑过了"，其实没给可重跑的东西）
t("围栏块里的报错日志不得算命令（评审 U6）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\n\n\`\`\`text\nnpm ERR! code ELIFECYCLE\nnpm ERR! command failed\n\`\`\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 26 红：真命令名 + 中文指引的混排（"make （见下一节）"）——非 ASCII 检查置废时它会漏网
t("命令名混着中文指引不得算证据", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`make （见下一节）\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

// 27 绿：引号里的中文不是"说明文字"——README 演示 ② 用的就是这条 sed，
// 判据若连引号内容一起管，就会把自己的复现命令判红（评审 U2 的误报面）
t("参数含中文但被引号包住的 sed 必须算命令", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`sed -i 's/正文 173 行/正文 180 行/' README.md\`\n`,
  wantCode: 0,
  wantText: "逐条取证通过",
});

// 28 绿：白名单外的程序名，只要带一个 flag/路径形状的参数就放行——
// 这是给"作者用的是我们没听说过的工具"留的逃生口，也是报错文案里写明的修复方式
t("陌生程序名带 flag 参数必须放行（逃生口）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`xtask --release\`\n`,
  wantCode: 0,
  wantText: "逐条取证通过",
});

// 29 红：白名单外、且参数也不带形状的裸任务名会被**错杀**（`just test`、`uvx ruff …`）。
// 这条断言的是"当前已知代价"，不是"这是对的行为"：谁把 `just` 加进 EXEC 白名单，
// 这条就会变红，逼他同步改 README 的「能力边界」与回应文档第七节。
t("白名单外的裸任务名会被错杀（钉住已知代价，勿当正确行为）", {
  content: `## 缺陷总表\n\n${TABLE6}| B1 | 🔴 | 实测 | 会崩 | 正确性 | src/a.js:12 |\n\n` +
    `### B1 · 🔴 会崩\n- **复现命令**：\`just test\`\n`,
  wantCode: 1,
  wantText: "没有一条像命令",
});

rmSync(DIR, { recursive: true, force: true });

const total = pass + fails.length;
if (fails.length) {
  for (const f of fails) console.error(`  ✗ ${f}`);
  console.error(`test-check-report: ${pass} 通过 / ${fails.length} 失败（共 ${total}）`);
  process.exit(1);
}
console.log(`test-check-report: ${pass} 通过 / 0 失败（共 ${total}）`);
