<!-- PR 模板对齐 CONTRIBUTING.md：判据强度元规则与"能失败的检查"信条。 -->

## 改动内容

<!-- 一句话说清这个 PR 改了什么、为什么 -->

## 检查清单

- [ ] 本地跑过 `bash .githooks/pre-commit`（`git config core.hooksPath .githooks`），全部门禁绿
- [ ] 没有用 `--no-verify` 绕过钩子

### 如果本 PR 新增/修改了"判断内容像不像 X"的判据函数

按 CONTRIBUTING.md 判据强度元规则，缺一视为未修复：

- [ ] ≥2 条反例（长得像但不是 X）+ ≥1 条正例（长得不像但确实是 X），已写进对应行为测试套件
- [ ] ≥1 条**削弱型**突变靶子（删检查 / `return true` / 放宽正则），已写进 `scripts/test-mutations.mjs`
- [ ] 有断言该靶子削弱后必然变红的用例

### 如果本 PR 改了文档

- [ ] 涉及数字主张（行数/条数/道数）的地方已同步，`node scripts/check-docs.mjs` 绿
- [ ] README 里的命令可原样重跑，演示/战绩是真实 stdout
- [ ] 版本发布类改动：`SKILL.md` version 与 `CHANGELOG.md` 最新条目一致，且 CHANGELOG 包含本版自查出来的缺陷

### 如果本 PR 改了报告总表格式

- [ ] 已同步 `skills/adversarial-review/references/prompt-templates.md`、`scripts/check-docs.mjs` 与 `check-report.mjs`
- [ ] `SKILL.md` 里留了能力边界一句话（这个检查器看不见什么）

## 关联 issue

<!-- Closes #N -->
