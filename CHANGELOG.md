# Changelog

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
