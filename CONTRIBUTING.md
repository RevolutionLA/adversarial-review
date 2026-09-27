# 贡献者须知

这个项目的所有质量约束都以**能失败的检查**形式存在。散文里写"必须如何如何"，在这个仓库里不算规则——三条评审轮次都验证过这一点：约束一旦没有对应的检查，就会在下一次赶工时蒸发。

## 判据强度元规则

任何新增或改动的"判断内容像不像 X"的函数（例：`check-report.mjs` 的 `commandish`、`check-docs.mjs` 的抽取器与 `misnamedGates`），必须**同时**提交三样东西，缺一视为未修复：

1. **≥2 条反例 + 1 条正例**，写进对应的行为测试套件。反例是"长得像但不是 X"（例：`see appendix`、`notes.md`、一段源码），正例是"长得不像但确实是 X"（例：裸命令 `make`、`pytest`）。只补反例的修复会把误报面挪个位置，不会消掉它。
2. **≥1 条削弱该函数判据强度的突变靶子**，写进 `scripts/test-mutations.mjs`。形状必须是"把判据放宽一档"（删掉某条检查、`return true`、放宽正则），**不是**"退回上一版实现"——后者只证明旧洞还堵着，前者才证明新判据的强度有人看守。
3. **1 条断言判据强度的用例**：让这条靶子在削弱后必然变红。

这条规则来自第三轮外部评审的 U3：v2.4 的 25 条突变靶子里没有一条攻击 `commandish` 的强度，于是评审方把 `commandish` 改成 `return true` 之后，20 个用例与「21 抓住 / 0 逃逸」一个都不掉。**每修一个洞就新增一类判据，而靶子清单里从来没有"新判据本身够不够强"这一类形状**——前三轮的洞都是这么来的。

## 其他约定

- 回归测试：`node scripts/test-validate-skill.mjs`、`node scripts/test-check-report.mjs`；突变测试：`node scripts/test-mutations.mjs`（只对临时副本下毒，工作区文件字节必须不变）。
- 文档一致性：`node scripts/check-docs.mjs`。它把文档里的数字当主张对账，改任何计数都要同步改文档，否则提交被钩子挡住。
- 演示与战绩必须是真实 stdout，不允许手改或伪造。写进 README 的每条命令都要能原样重跑；省略只能写在命令里（`grep -vE`），不能写在剪贴板里。
- 报告总表格式改动必须同步 `skills/adversarial-review/references/prompt-templates.md`、`scripts/check-docs.mjs` 与 `check-report.mjs`，并在 `SKILL.md` 里留一句能力边界（**这个检查器看不见什么**）。
- 版本发布：更新 `SKILL.md` 的 `version` 与 `CHANGELOG.md`，且 CHANGELOG 必须包含本版**自查出来的缺陷**。
- `docs/review/` 是 gitignore 的本地产物目录（下毒副本、复现构造都写这里），不随包发布。
- 禁止 `--no-verify` 绕过 pre-commit 钩子；钩子失败先修根因。
