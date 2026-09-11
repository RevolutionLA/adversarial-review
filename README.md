# adversarial-review · 三方对抗式代码评审

> 给 AI 编程 agent 的代码评审 skill：把"再仔细看一遍"换成**结构化的对抗关系**——敌意审查 → 独立审计 → 中立裁定。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-blue.svg)](SKILL.md)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20DeepSeek%20Harness%20%7C%20Cursor%20%7C%20Codex-green.svg)](#安装)

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
| **第三方** | 独立审计——**不信任任何一方文档**，直接读代码 | 必须逐条复核"声称修了的是否真修了"，并**专门寻找修改过程引入的新缺陷** |
| **中立裁定** | 对第三方意见**逐条采纳 / 驳回 / 改级** | 必须由**与蓝军不同的 agent** 担任；防止第三方定级虚高，也防止蓝军自我辩护 |

---

## 安装

### 方式一：手动复制（通用）

```bash
# 克隆到任意位置
git clone https://github.com/RevolutionLA/adversarial-review.git

# 复制到你的 agent 的 skills 目录（注意 skill 在 skills/<name>/ 子目录下）
mkdir -p ~/.claude/skills
cp -r adversarial-review/skills/adversarial-review ~/.claude/skills/
```

Windows (PowerShell)：

```powershell
git clone https://github.com/RevolutionLA/adversarial-review.git
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force ".\adversarial-review\skills\adversarial-review" "$env:USERPROFILE\.claude\skills\"
```

### 方式二：skills.sh / npx（推荐）

本仓库遵循 [skills.sh](https://skills.sh) 目录结构（`skills/<name>/SKILL.md`），可直接一键安装到多个 agent：

```bash
# 装到 Claude Code
npx skills add RevolutionLA/adversarial-review -a claude-code

# 一次装到多个 agent
npx skills add RevolutionLA/adversarial-review -a claude-code -a cursor -a opencode
```

### 方式三：一行安装脚本

```bash
curl -fsSL https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/RevolutionLA/adversarial-review/main/skills/adversarial-review/scripts/install.ps1 | iex
```

> 已有安装时，脚本会**备份到 `.bak.<时间戳>` 而不是直接删除**，你本地的自定义修改不会丢。

### 验证安装

```bash
bash skills/adversarial-review/scripts/verify-install.sh
# 或指定路径
bash skills/adversarial-review/scripts/verify-install.sh ~/.claude/skills/adversarial-review
```

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
| **轻档** | 1 个蓝军（聚焦正确性 / 兼容性 / 测试有效性）| 小改动、时间紧 |
| **标准档**（默认）| 蓝军 → 第三方 → 中立裁定，共 3 轮 | 一般功能版本 |
| **重档** | 标准档 + 多路并行交叉验证 | 发布前、重大重构、涉及上游兼容 |

---

## 产出长什么样

跑完后会在 `docs/review/` 得到四份可追溯的报告——**不是一份"看起来没问题"，而是带行号和复现命令的攻防记录**：

```
docs/review/
├─ BLUE-TEAM-REVIEW-1.2.0.md       # 蓝军：缺陷总表 + 逐条证据链 + 未验证项
├─ RESPONSE-1.2.0.md               # 开发团队：逐条采纳/部分/推迟/驳回
├─ THIRD-PARTY-REVIEW-1.2.0.md     # 第三方：整改验证表 + 新发现缺陷(T项)
└─ ADJUDICATION-1.2.0.md           # 中立裁定：对双方结论的最终裁定 + 合并执行清单
```

完整示例见 [`examples/sample-review.md`](skills/adversarial-review/examples/sample-review.md) —— 包含一份**真实的蓝军报告片段**，可以看到证据链长什么样。

---

## 能力边界（重要，请如实理解）

> ⚠️ **子代理与主代理通常是同一模型，这不是真正独立的第三方。**
> 这个 skill 的价值来自**角色约束 + 强制证据**，而非"另一个 AI 的观点"。

- ✅ **能有效抓出**：代码级错误、逻辑漏洞、测试造假、自相矛盾、遗漏分支、声明与实现不符
- ❌ **抓不出**：**双方共有的知识盲区**（例如对某个上游行为的一致误解）

**推论**：若某个结论依赖外部系统行为，必须要求**实测验证**，而不是两个 agent 互相点头。

汇报时不要说"经独立第三方验证无误"，要说"经同模型不同角色的对抗审查"。

---

## 设计要点（改造模板时别丢这些）

| 要点 | 为什么关键 |
|---|---|
| **角色 + 立场** 而非"帮我审一下" | 立场决定它能发现什么。"挑刺"和"检查"产出完全不同 |
| **必须给证据链**（文件:行号 / 实测） | 禁止空话，也让结论可复查；编造行号能被抓到 |
| **禁止采信文档** | 文档是最容易骗人的东西 |
| **专找"修改引入的新缺陷"** | 独立角色，标准流程里最容易漏的一环 |
| **裁定方必须与蓝军不同 agent** | 当事人不能当法官，否则裁定退化为自我辩护 |
| **逼它声明"未验证项"** | 把不确定性显式化，避免用自信语气掩盖无知 |
| **要求区分可达性** | 防止把理论可能定成高危，稀释对真问题的注意力 |
| **允许裁定方驳回** | 第三方也会错；没有裁定环节就变成"意见越多越好" |

---

## 常见错误用法

- ❌ **用 `subagent_fork` 起蓝军** → 继承你的思路，只会附和
- ❌ **让蓝军自己裁定第三方意见** → 当事人当法官，针对蓝军的批评会被系统性驳回
- ❌ **让同一个 agent 既审又改又复核** → 它会为自己的结论辩护
- ❌ **把三方报告当成"通过认证"** → 同模型互搏抓不出共同盲区；关键结论必须实测
- ❌ **第三方只验"修了没"，不找新问题** → 丢掉一半价值
- ❌ **改了代码不补测试** → 下轮评审同样的问题会再次出现
- ❌ **报告写得很漂亮但代码没动** → 立刻修订，别把流程做成表演

---

## 兼容性

| 宿主 | 状态 |
|---|---|
| Claude Code | ✅ 完整支持（原生 `subagent`） |
| DeepSeek Harness | ✅ 完整支持（`subagent` / `send_message`） |
| Cursor / Codex / 其他 | ⚠️ 需支持派发独立子代理；无子代理时降级为单 agent 串行扮演（独立性显著削弱，报告需如实声明） |

---

## 相关项目

- [ascend-assistant](https://github.com/RevolutionLA/ascend-assistant) —— 昇腾服务器助手 Agent Skill
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) —— DeepSeek Harness 换肤插件

---

## License

[MIT](LICENSE) © RevolutionLA
