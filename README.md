# adversarial-review · 三方对抗式代码评审

**中文** · [English](README.en.md)

> 给 AI 编程 agent 的代码评审 skill：把"再仔细看一遍"换成**结构化的对抗关系**——敌意审查 → 独立审计 → 中立裁定。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-blue.svg)](skills/adversarial-review/SKILL.md)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20DeepSeek%20Harness%20%7C%20Cursor%20%7C%20Codex-green.svg)](#兼容性)

---

## 先说最有说服力的一件事

**这个 skill 抓到过它自己作者的错——两次。而且第二次，是它自己的流程把它抓出来的。**

| 我犯的错 | 谁抓到的 |
|---|---|
| 在整改文档里写"已修复"，但**那个文件根本没改** | 第三方复核（用 git blob 哈希证伪） |
| 修一个 bug 时**引入了新 bug**，而且**提交时自带测试是红的** | 中立裁定（在隔离副本里跑测试发现） |

第二个错的类型是「**为了修 A 而引入 B**」——**正是这个 skill 开篇第一条要抓的缺陷，而它发生在一个专门抓这类缺陷的工具上**。

抓出来之后，我加了 `.githooks/pre-commit` 门禁（回归测试 + 突变测试 + 规范校验 + 链接检查，任一失败即拒绝提交），并**用破坏性测试验证过它真能拦住**——把那个 bug 重新塞回去，门禁正确地拒绝了提交。

> **这个 skill 不保证你不犯错。它保证的是：错误会被暴露出来，而不是被掩盖。**
>
> 上面两个错，都是我写的，也都是这个流程自己抓出来的。

---

## 它解决什么问题

单人或单 AI 写代码，最大的风险不是"不会写"，而是：

1. **用未验证的乐观假设说服自己推迟修复** —— "这个兜底应该够了吧"
2. **测试提供假安全感** —— 测试全绿，但功能其实早坏了
3. **为了修 A 而引入 B** —— 新写的修复代码本身没被独立审视

这三个问题**靠"再仔细看一遍"解决不了**。因为它们不是注意力问题，是**立场问题**：写代码的人和审代码的人是同一个，就一定会为自己辩护。

这个 skill 的做法是**强制把立场拆开**：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   蓝军      │ ──▶ │   第三方    │ ──▶ │  中立裁定   │
│  敌意审查   │     │  独立审计   │     │  逐条裁定   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ 假设会出事  │     │ 不信双方文档│     │ 不信双方结论│
│ 然后去证明  │     │ 只读源代码  │     │ 自己重新读码│
│ 必须给证据链│     │ 专找新缺陷  │     │ 可采纳/驳回 │
└─────────────┘     └─────────────┘     └─────────────┘
     定义"修什么"      验证"修没修对"      裁定"谁说得对"
```

**关键不是"多找两个 AI 看看"，而是顺序与互不信任。**

---

## 三个角色

| 角色 | 立场 | 硬性约束 |
|---|---|---|
| **蓝军** | 敌意审查——假设代码会出事，去**证明** | 每条结论必须附证据链（`文件:行号` / 实测命令 / 上游源码）；禁止"建议加强鲁棒性"这类空话 |
| **第三方** | 独立审计——**不信任任何一方文档**，直接读代码 | 必须逐条复核"声称修了的是否真修了"、**专找修改引入的新缺陷**、并**稽核蓝军漏审了哪些维度** |
| **中立裁定** | 对双方结论**逐条采纳 / 驳回 / 改级** | 必须由**与蓝军不同的 agent** 担任；还要**审查两方共有的前提** |

**为什么裁定方不能是蓝军**：裁定对象是"第三方对蓝军意见的复核"。让蓝军自己裁定，它同时是**当事人**和**法官**——会系统性驳回针对自己的批评。**当事人不能当法官。**

---

## 安装

### 方式一：npx（推荐）

```bash
# 装到 Claude Code
npx skills add RevolutionLA/adversarial-review -a claude-code

# 一次装到多个 agent
npx skills add RevolutionLA/adversarial-review -a claude-code -a cursor -a opencode
```

### 方式二：手动复制

```bash
git clone https://github.com/RevolutionLA/adversarial-review.git

# 注意：skill 位于仓库的 skills/<name>/ 子目录下
mkdir -p ~/.claude/skills
cp -r adversarial-review/skills/adversarial-review ~/.claude/skills/
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
git clone https://github.com/RevolutionLA/adversarial-review.git
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force ".\adversarial-review\skills\adversarial-review" "$env:USERPROFILE\.claude\skills\"
```
</details>

### 方式三：一行安装脚本

```bash
curl -fsSL https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.sh | bash
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
irm https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.ps1 | iex
```
</details>

> 已有安装时，脚本会**备份到 `.bak.<时间戳>` 而不是直接删除**，你本地的自定义修改不会丢。

### 验证安装

```bash
bash skills/adversarial-review/scripts/verify-install.sh
# 或指定路径
bash skills/adversarial-review/scripts/verify-install.sh ~/.claude/skills/adversarial-review
```

> ⚠️ 校验器（`validate-skill.mjs`）位于**仓库**的 `scripts/`，不随 skill 安装。因此从安装副本运行时，脚本会明确告诉你"**规范校验未执行，不能视为完整验证**"并返回退出码 2——**它不会给你一个空的"通过"**。

---

## 用法

安装后**不需要记命令**，用自然语言触发即可：

| 你说 | 效果 |
|---|---|
| "跑一次蓝军评审" | 启动标准档三方流程 |
| "帮我挑刺，这版要发布了" | 启动重档，多路并行交叉验证 |
| "第三方复核一下" | 单独执行第 2 步 |
| "adversarial review this module" | 英文同样触发 |
| "cross-check my changes" | 同上 |

档位：

| 档位 | 配置 | 适用 |
|---|---|---|
| **轻档** | 1 个蓝军（聚焦选定维度）| 小改动、时间紧 |
| **标准档**（默认）| 蓝军 → 第三方 → 中立裁定，共 3 轮 | 一般功能版本 |
| **重档** | 标准档 + 多路并行交叉验证 | 发布前、重大重构、涉及上游兼容 |

---

## 覆盖哪些质量维度

三角色只解决"**怎么审**"，不解决"**审哪里**"。所以附带一张 **19 维度清单**（[`review-dimensions.md`](skills/adversarial-review/references/review-dimensions.md)），按改动类型选取本次必审范围：

| 类别 | 维度 |
|---|---|
| **需求与设计** | 需求一致性 · 架构与设计 |
| **代码正确性** | 正确性 · 错误处理 · 并发与竞态 |
| **质量属性** | 性能 · 安全 · 隐私与数据 · 可观测性 |
| **验证** | 测试有效性 |
| **演进与共存** | 兼容性 · 依赖与供应链 · 资源与生命周期 · 数据迁移与状态演进 |
| **工程与交付** | 配置与密钥 · 发布工程 · 文档一致性 · 可访问性与国际化 · 许可证合规 |

**按改动类型选，不要全审**——修 bug 就重点审「正确性 / 错误处理 / 测试（必须有回归用例）/ 兼容性」；19 项全塞进一次审查只会让报告又长又浅。

这张表**接进了流程**，不只写在文档里：

- 第 0 步要求**选定维度**
- 第 1 步要求蓝军**逐维度表态**（哪怕"未发现问题"，禁止整项跳过）
- 第 2 步要求第三方**稽核蓝军的覆盖度**——否则蓝军的盲区会变成整个流程的盲区
- 第 3 步要求裁定方**审查两方共有的前提**——这是同模型互搏最大的盲区

---

## 产出长什么样

跑完后在 `docs/review/` 得到四份可追溯的报告——**不是一句"看起来没问题"，而是带行号和复现命令的攻防记录**：

```
docs/review/
├─ BLUE-TEAM-REVIEW-<version>.md    # 蓝军：缺陷总表 + 逐条证据链 + 维度覆盖声明 + 未验证项
├─ RESPONSE-<version>.md            # 开发团队：逐条采纳/部分/推迟/驳回
├─ THIRD-PARTY-REVIEW-<version>.md  # 第三方：整改验证表 + 新缺陷(T项) + 覆盖度稽核
└─ ADJUDICATION-<version>.md        # 中立裁定：最终裁定 + 共同前提审查 + 合并执行清单
```

教学样例见 [`examples/sample-review.md`](skills/adversarial-review/examples/sample-review.md)。

> **注意**：评审记录默认**不入库**（见 `.gitignore` 中的 `/docs/review/`）。它们包含未修复问题的细节与内部实现信息，适合留在本地。若你的项目想把它作为质量流程展示，删掉那行并正常提交即可。

---

## 这个仓库自己是怎么被验证的

开发过程中跑了三轮自评审，抓出的真实问题：

| 轮次 | 抓到了什么 |
|---|---|
| **v1.1** | 第 3 步原本让蓝军自己裁定第三方意见——**当事人当法官**，与自己的核心规则冲突 |
| **v2.0 蓝军** | 校验器把 `description: >` 读成 1 个字符**却报"通过"**；SKILL.md **零处引用**配套文件；仓库结构不符合 skills.sh 要求**所以不会被索引**；CI 的链接检查**永远不可能失败** |
| **v2.0 第三方** | 整改文档里的"已修复"声明**是假的**（blob 哈希证伪）；CI 有个步骤**名实不符**；新增测试有 5 个突变逃逸 |
| **v2.0.2 中立裁定** | **修 bug 引入了新 bug**——`>` 与 `|` 解析语义被对调，而该提交**自带测试是红的却照常提交了**；安装验证脚本**向用户报假的"通过"** |

### 由此引入的质量设施

- **`.githooks/pre-commit` 门禁** —— 回归测试 + 突变测试 + 规范校验 + 链接检查，任一失败即拒绝提交。已用破坏性测试验证它真能拦住。（启用：`git config core.hooksPath .githooks`）
- **突变测试**（`scripts/test-mutations.mjs`）—— 自动往代码里注入 11 个缺陷，验证回归测试**能不能抓住**。当前 **10 抓住 / 0 逃逸 / 1 等价突变**。
  - **为什么需要它**：测试全绿 ≠ 测试有效。本项目的回归测试曾漏掉 5 个突变，其中"删掉长度上限校验"会让一个**1235 字符的非法 description 被判通过**。
- **Agent Skills 规范校验器**（`scripts/validate-skill.mjs`）—— 零依赖，可作为通用工具用于你自己的 skill。

---

## 能力边界（重要，请如实理解）

> ⚠️ **子代理与主代理通常是同一模型，这不是真正独立的第三方。**
> 这个 skill 的价值来自**角色约束 + 强制证据**，而非"另一个 AI 的观点"。

- ✅ **能有效抓出**：代码级错误、逻辑漏洞、测试造假、自相矛盾、遗漏分支、**声明与实现不符**
- ❌ **抓不出**：**双方共有的知识盲区**（例如对某个上游行为的一致误解）

**推论**：若某个结论依赖外部系统行为，必须**实测验证**，而不是两个 agent 互相点头。

汇报时不要说"经独立第三方验证无误"，要说"**经同模型不同角色的对抗审查**"。

> **换个模型是不是更好？** 有些方案用不同厂商的模型互审（Claude 审 Codex 的产出）。那能覆盖知识盲区，是另一条路线。本 skill 选择**同模型 + 立场分离 + 强制证据**，优势是**零额外配置、任何宿主可用**，且对"逻辑一致性、声明与实现不符、自我矛盾"这类缺陷同样有效——本项目抓到的几个真实缺陷都属于这一类。

---

## 常见错误用法

- ❌ **用 `subagent_fork` 起蓝军** → 继承你的思路，只会附和
- ❌ **让蓝军自己裁定第三方意见** → 当事人当法官
- ❌ **让同一个 agent 既审又改又复核** → 它会为自己的结论辩护
- ❌ **把三方报告当成"通过认证"** → 同模型互搏抓不出共同盲区；关键结论必须实测
- ❌ **第三方只验"修了没"** → 丢掉"找新缺陷"和"稽核覆盖度"两项价值
- ❌ **把 19 个维度一次全塞进去** → 报告又长又浅。按改动类型选
- ❌ **改了代码不补可运行的回归用例** → 同样的问题会再次出现
- ❌ **"配置了 CI"就当"CI 跑过了"** → 检查必须**真的能失败**，永远绿的检查等于没有检查
- ❌ **报告写得很漂亮但代码没动** → 别把流程做成表演

---

## 兼容性

| 宿主 | 状态 |
|---|---|
| Claude Code | ✅ 完整支持（原生 `subagent`） |
| DeepSeek Harness | ✅ 完整支持（`subagent` / `send_message`） |
| Cursor / Codex / 其他 | ⚠️ 需支持派发独立子代理 |
| 无子代理能力的宿主 | ⚠️ 降级为单 agent 串行扮演三角色——**独立性显著削弱**，报告必须如实声明 |

---

## 仓库结构

```
adversarial-review/
├── README.md / README.en.md
├── skills/
│   └── adversarial-review/          ← skill 本体（skills.sh 规范结构）
│       ├── SKILL.md                 ← 主文件（181 行，其中正文 168 行）
│       ├── references/
│       │   ├── review-dimensions.md ← 19 维度清单
│       │   ├── prompt-templates.md  ← 三角色提示词模板
│       │   ├── quickstart.md
│       │   └── skill-spec.md        ← SKILL.md 规范速查
│       ├── examples/sample-review.md
│       └── scripts/                 ← 安装与验证脚本
├── scripts/                         ← 仓库级工具（不随 skill 安装）
│   ├── validate-skill.mjs           ← Agent Skills 规范校验器
│   ├── test-validate-skill.mjs      ← 校验器回归测试（20 用例）
│   ├── test-mutations.mjs           ← 突变测试
│   └── check-links.mjs              ← markdown 链接检查
└── .githooks/pre-commit             ← 提交门禁
```

---

## 相关项目

- [ascend-assistant](https://github.com/RevolutionLA/ascend-assistant) —— 昇腾服务器助手 Agent Skill
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) —— DeepSeek Harness 换肤插件

---

## License

[MIT](LICENSE) © RevolutionLA
