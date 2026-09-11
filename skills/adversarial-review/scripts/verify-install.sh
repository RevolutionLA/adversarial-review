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
for c in "${CANDIDATES[@]}"; do
  if [ -f "${c}/SKILL.md" ]; then FOUND="$c"; break; fi
done

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

# 4. 规范校验（若 node 可用）
if command -v node >/dev/null 2>&1 && [ -f "${FOUND}/scripts/validate-skill.mjs" ]; then
  echo ""
  echo "--- 规范校验 ---"
  node "${FOUND}/scripts/validate-skill.mjs" "$FOUND" || fail=1
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "🎉 安装验证通过。重启 agent 后即可使用。"
else
  echo "⚠️  验证发现问题，请参考上面的提示。"
fi
exit "$fail"
