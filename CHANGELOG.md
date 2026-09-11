# Changelog

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.0] - 2026-09-10

第二轮**三方对抗式自评审**（重档，用本 skill 审本 skill）触发的整改。蓝军产出 15 条缺陷（B1–B15），其中 4 条 🔴。**这是本项目历史上最有价值的一轮评审——它证明了这套机制真的能抓出作者自己看不见的问题。**

### Added

- **`references/review-dimensions.md`** —— **19 个质量维度清单**，以及"按改动类型选维度"表。这是 v2.0 的核心：解决了"三角色只覆盖代码级正确性"的覆盖度缺口。
- **`references/prompt-templates.md`** —— 三个角色的完整提示词模板 + 「占位符约定」表（明确定义 `<仓库绝对路径>` 指 git 仓库根，而非工作目录）。
- **`scripts/test-validate-skill.mjs`** —— 校验器的 9 个回归用例，锁住块标量解析行为。
- **`scripts/check-links.mjs`** —— markdown 本地链接检查器（替代原先永远不可能失败的 shell 版）。
- **`docs/review/`** —— 本项目的三方评审记录（README、蓝军、第三方、裁定），作为可追溯的攻防档案。

### Changed

- **仓库结构迁移为 `skills/adversarial-review/SKILL.md`**（skills.sh 目录规范）。旧结构 `<repo>/SKILL.md` **不会被 skills.sh 索引**——这是发布时的一个重大疏漏。
- **SKILL.md 从 281 行精简到 181 行**，提示词模板外置。同时满足"渐进式披露"与"正文 < 500 行"两项规范。
- **第 1 步**新增要求：蓝军必须**逐维度表态**（哪怕"未发现问题"），禁止整项跳过。
- **第 2 步**新增第三个方向：第三方要**稽核蓝军的覆盖度**——否则蓝军的盲区会变成整个流程的盲区。
- **第 3 步**新增职责：裁定方要**审查两方共有的前提**——这是同模型互搏最大的盲区。
- **第 4 步**新增纪律：改完要回头验文档里引用的**行号和路径**（整改必然造成位移）。
- 安装脚本遇已有安装时**备份到 `.bak.<时间戳>`**，不再 `rm -rf`，并输出新旧版本号。
- CI 新增三项检查：校验器回归测试、SKILL.md 行数上限、shell 语法。

### Fixed

- **🔴 校验器块标量解析失效**：`description: >` 和 `description: |`（Anthropic 官方文档示范的写法）被误解析为 1 字符，**却仍报「✅ 通过」**。这意味着一个 5000 字符、超规范 5 倍的 description 会拿到"已通过校验"的证明，发布后 skill 静默不触发。修前坏/修后好已用回归测试锁定。
- **🔴 SKILL.md 零处引用 `references/` / `examples/` / `scripts/`**：渐进式披露的三个文件对 agent 完全不可发现。
- **🔴 CI 的链接检查永远不可能失败**：`fail=0` 从不置 1，`exit $fail` 恒返回 0；且把 `references/*.md` 的相对链接按仓库根解析，产生假警告。
- **🔴 `examples/sample-review.md` 引用的行号全部失效**——整改导致位移。现改为**显式声明失效**（而非假装有效），并把这个事故本身作为教学案例保留。
- **🟠 `verify-install.sh` 的路径参数永远不生效**：`$1` 的应用位置在"未找到则 exit 1"之后。
- **🟠 `references/skill-spec.md` 遗漏**渐进式披露约束（< 500 行、引用只能一层深）。
- README 中因结构迁移产生的断链。

### Notes

- **本轮自评审抓到的 4 条 🔴 中，有 3 条是"工程质量"缺陷而非"流程设计"缺陷**——角色与顺序的设计其实是对的，坏的是它外面的壳。这说明：**一个再好的方法论，如果其工程实现不可靠，就会以"已验证"的姿态传播错误。**
- 未采纳蓝军的"引入 yaml 依赖"建议，以保持零依赖；改为自己正确实现块标量解析 + 回归测试锁定。

## [1.1.0] - 2026-09-10

首次公开发布。经一轮**三方对抗式自评审**（用本 skill 审本 skill）后定稿。

### Added

- `scripts/install.sh` / `scripts/install.ps1` —— 一行安装脚本，自带 frontmatter 一致性自检
- `scripts/validate-skill.mjs` —— 零依赖的 Agent Skills 规范校验器（`name`/`description`/`compatibility`/目录一致性）
- `references/quickstart.md` —— 30 秒上手、档位选择、什么时候不该用它
- `references/skill-spec.md` —— SKILL.md 规范速查表
- `examples/sample-review.md` —— 完整产出样例（含真实蓝军报告片段）
- `compatibility` frontmatter 字段，声明子代理依赖
- **降级模式**说明：宿主无 `subagent` 时如何串行扮演三角色，以及必须如实声明独立性削弱

### Changed

- **🔴 第 3 步「蓝军裁定」改为「中立裁定」**，裁定方必须是**与蓝军不同的全新 agent**。
  - **旧行为**：允许复用蓝军 agent 对第三方意见做裁定，并称其"更符合设定"。
  - **为什么改**：裁定的对象是"第三方对蓝军意见的复核"。让蓝军裁定等于**当事人当法官**——它会系统性驳回针对自己的 T 项。这与本 skill 第 1、2 步「禁止复用 agent，避免它为结论辩护」的核心原则**直接冲突**（旧版 `SKILL.md:163` vs `SKILL.md:250`）。
  - **新做法**：「蓝军不信第三方」通过**提示词立场**表达（独立复验、不采信任何一方行号），而非复用 agent 身份。`send_message` 复用降级为受限选项，且必须声明独立性降级。
- 归档策略默认值改为**按项目可见性决策**（私有 → gitignore；公开 → 提交或彻底清理引用），避免开源用户踩死链坑
- `description` 补充英文触发词：`red team review` / `pre-release review` / `critique this` / `find bugs in my code`，以及中文 `三方评审` / `交叉验证`

### Fixed

- 修复「声明与实现不符」：旧版明令禁止复用 agent，却在裁定环节自我豁免

### Notes

- 三方互搏**抓不出双方共有的知识盲区**。依赖外部系统行为的结论必须实测。此边界已在 `SKILL.md` 与 `README.md` 中显式声明。
