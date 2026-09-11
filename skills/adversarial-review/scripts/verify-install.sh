#!/usr/bin/env bash
# 验证 adversarial-review skill 是否安装成功
set -uo pipefail

SKILL_NAME="adversarial-review"
CANDIDATES=(
  "${HOME}/.claude/skills/${SKILL_NAME}"
  "${HOME}/.dsh/skills/${SKILL_NAME}"
  "${HOME}/.config/agents/skills/${SKILL_NAME}"
)

FOUND=""

# 显式指定的路径优先，且要在"自动查找失败"之前生效
if [ -n "${1:-}" ]; then
  if [ -f "${1}/SKILL.md" ]; then
    FOUND="$1"
  else
    echo "✗ 指定路径下没有 SKILL.md: $1"
    exit 1
  fi
fi

if [ -z "$FOUND" ]; then
  for c in "${CANDIDATES[@]}"; do
    if [ -f "${c}/SKILL.md" ]; then FOUND="$c"; break; fi
  done
fi

if [ -z "$FOUND" ]; then
  echo "✗ 未找到 ${SKILL_NAME}，已检查以下位置："
  for c in "${CANDIDATES[@]}"; do echo "    - $c"; done
  echo ""
  echo "请先安装，或手动指定路径: bash scripts/verify-install.sh /your/skills/dir"
  exit 1
fi

echo "发现安装位置: $FOUND"
echo ""

fail=0
SPEC_CHECKED=0

# 1. SKILL.md 存在且非空
if [ -s "${FOUND}/SKILL.md" ]; then
  echo "✅ SKILL.md 存在 ($(wc -l < "${FOUND}/SKILL.md") 行)"
else
  echo "✗ SKILL.md 缺失或为空"; fail=1
fi

# 2. frontmatter name 与目录名一致
head_name="$(sed -n 's/^name:[[:space:]]*//p' "${FOUND}/SKILL.md" | head -n 1 | tr -d '\r')"
dir_name="$(basename "$FOUND")"
if [ "$head_name" = "$dir_name" ]; then
  echo "✅ frontmatter name ($head_name) 与目录名一致"
else
  echo "✗ frontmatter name ($head_name) != 目录名 ($dir_name)"; fail=1
fi

# 3. description 存在
if grep -q '^description:' "${FOUND}/SKILL.md"; then
  echo "✅ description 存在"
else
  echo "✗ description 缺失"; fail=1
fi

# 4. 规范校验（若本机有校验器）
# 注意：v2.0 起校验器位于仓库级 scripts/，不随 skill 安装。
# 依次尝试：同目录安装副本 -> 环境变量 -> 仓库布局，都找不到就明确说明，不要静默跳过。
VALIDATOR=""
for cand in \
  "${FOUND}/scripts/validate-skill.mjs" \
  "${ADVERSARIAL_REVIEW_VALIDATOR:-}" \
  "$(dirname "$0")/../../../scripts/validate-skill.mjs"
do
  if [ -n "$cand" ] && [ -f "$cand" ]; then VALIDATOR="$cand"; break; fi
done

if command -v node >/dev/null 2>&1; then
  if [ -n "$VALIDATOR" ]; then
    echo ""
    echo "--- 规范校验 ($VALIDATOR) ---"
    node "$VALIDATOR" "$FOUND" || fail=1
    SPEC_CHECKED=1
  else
    echo ""
    echo "·  未找到 validate-skill.mjs（它位于仓库 scripts/，不随 skill 安装），跳过规范校验"
    echo "   如需完整校验，请从仓库运行： node scripts/validate-skill.mjs <skill目录>"
    SPEC_CHECKED=0
  fi
else
  echo ""
  echo "·  未检测到 node，跳过规范校验"
  SPEC_CHECKED=0
fi

echo ""
if [ "$fail" -ne 0 ]; then
  echo "⚠️  验证发现问题，请参考上面的提示。"
  exit "$fail"
fi

# 关键：跳过了规范校验就不能宣称"验证通过"——否则用户看到绿色结论，
# 而实际上 frontmatter 的长度/格式约束根本没被检查过。
# 这与本项目修复过的"永远绿的 CI 检查"是同一类静默通过缺陷。
if [ "$SPEC_CHECKED" -eq 1 ]; then
  echo "🎉 验证通过（含规范校验）。重启 agent 后即可使用。"
else
  echo "⚠️  基础检查通过，但**规范校验未执行** —— 不能视为完整验证。"
  echo "    已确认的只有：SKILL.md 存在、frontmatter name 与目录名一致、description 存在。"
  echo "    未被检查的包括：name/description 的长度与格式约束、正文非空。"
  exit 2
fi
