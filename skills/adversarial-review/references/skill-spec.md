# Agent Skills 规范速查（SKILL.md）

> 来源：Agent Skills 规范。写/改 skill 时对照本表。

## 目录结构

```
skill-name/
├── SKILL.md          # 必需：frontmatter + 指令正文
├── scripts/          # 可选：可执行代码
├── references/       # 可选：参考文档（按需加载）
└── assets/           # 可选：模板、资源
```

**`references/` 的意义**：agent 决定激活 skill 后会**载入整个 SKILL.md**。正文太长会挤占上下文，所以长内容应拆到 `references/` 里按需读取。

---

## frontmatter 字段

| 字段 | 必需 | 约束 |
|---|---|---|
| `name` | ✅ | ≤ 64 字符；仅小写字母、数字、连字符；不得以连字符开头/结尾；**不得有连续连字符**；**必须与父目录名一致** |
| `description` | ✅ | 1-1024 字符，非空；应同时说明「做什么」和「何时用」 |
| `license` | ❌ | 协议名或指向随附协议文件 |
| `compatibility` | ❌ | 1-500 字符；仅在有特定环境要求时使用 |
| `metadata` | ❌ | 字符串键值映射（如 author / version） |
| `allowed-tools` | ❌ | 空格分隔的预授权工具列表（实验性，宿主支持度不一） |

### 合法 / 非法 name 对照

```yaml
name: pdf-processing      # ✅
name: data-analysis       # ✅
name: code-review         # ✅

name: PDF-Processing      # ❌ 不允许大写
name: -pdf                # ❌ 不能以连字符开头
name: pdf--processing     # ❌ 不允许连续连字符
name: my_skill            # ❌ 不允许下划线
```

---

## description 写法

**好的写法**（包含具体关键词 + 触发条件）：

```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges
  multiple PDFs. Use when working with PDF documents or when the user mentions
  PDFs, forms, or document extraction.
```

**差的写法**：

```yaml
description: Helps with PDFs.
```

**要点**：
1. 把用户**可能说出的原话**写进去（中英文都要，如果你的用户群是双语）。
2. 明确写「**Use when...**」或「**当用户说...时使用**」——这是 agent 判断激活的依据。
3. 关键词决定检索命中率，别嫌啰嗦。

---

## 正文建议章节

规范对正文格式无限制，但推荐包含：

- 分步指令（Step-by-step instructions）
- 输入/输出示例
- 常见边界情况（Common edge cases）

**本仓库额外建议**（来自实战）：

- **能力边界**：主动声明这个 skill **做不到什么**。这不减分，反而防止误用。
- **常见错误用法**：把踩过的坑写下来，比写十条"最佳实践"有用。

---

## 校验

本仓库自带校验器，无需安装依赖：

```bash
node scripts/validate-skill.mjs /path/to/your-skill
```

会检查：frontmatter 是否存在、`name` 格式与目录名一致性、`description` 长度与触发词、`compatibility` 长度、未知字段、正文是否存在。

---

## 参考

- Agent Skills 规范：<https://github.com/agentskills/agentskills>
- Anthropic Skills 仓库：<https://github.com/anthropics/skills>
