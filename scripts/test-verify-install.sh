#!/usr/bin/env bash
# test-verify-install.sh — verify-install.sh 的回归测试
#
# 它测的是本项目最容易失手的一类缺陷：**兜底清单少一项，检查照样报绿**。
# v2.5 轮换安装根时实测到：~/.codex/skills 不在 CANDIDATES 里，多根一致性
# 检查静默跳过这份陈旧副本，输出"✅ 全部安装根版本一致"——v2.1 T1 抓过的
# "只验第一个命中根"换了个位置复活。用例 2 就是为这个场景写的：
# 陈旧副本放在**清单里根本没写过的宿主目录**下，只允许被自动发现抓到。
#
# 用法: bash scripts/test-verify-install.sh
#       VERIFY_SCRIPT=/path/to/旧的 verify-install.sh bash scripts/test-verify-install.sh
#       —— 后者用来复现"改前为什么红"（本项目要求反向用例必须在改动前跑红）
# 退出码: 0 = 全部通过, 1 = 有失败

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO}/skills/adversarial-review"
SCRIPT="${VERIFY_SCRIPT:-${SRC}/scripts/verify-install.sh}"
[ -f "$SCRIPT" ] || { printf '✗ 找不到被测脚本: %s\n' "$SCRIPT" >&2; exit 1; }

DIR="$(mktemp -d "${TMPDIR:-/tmp}/vinstall-test.XXXXXX")"
trap 'rm -rf "$DIR"' EXIT

pass=0
fails=()
HOME_ROOT=""

# 在当前假 HOME 下铺一个安装根：$1=宿主目录名（含点）$2=版本号
plant() {
  local dir="${HOME_ROOT}/${1}/skills/adversarial-review"
  mkdir -p "$dir"
  cp -R "${SRC}/." "${dir}/"
  sed -i.bak "s/^  version: \"[0-9][^\"]*\"/  version: \"${2}\"/" "${dir}/SKILL.md"
  rm -f "${dir}/SKILL.md.bak"
  # 被测脚本打印的是 pwd -P 的结果（/tmp 在 Windows 上是符号链接），断言要同一套路径
  printf '%s\n' "$(cd "$dir" && pwd -P)"
}

new_home() {
  rm -rf "${DIR}/home"
  mkdir -p "${DIR}/home"
  HOME_ROOT="${DIR}/home"
}

# expect <用例名> <期望退出码> <期望包含的子串>…
expect() {
  local name="$1" want_code="$2"; shift 2
  local out code ok=1 needle
  out="$(HOME="${HOME_ROOT}" bash "$SCRIPT" 2>&1)"; code=$?
  [ "$code" -eq "$want_code" ] || ok=0
  for needle in "$@"; do
    printf '%s\n' "$out" | grep -qF -- "$needle" || ok=0
  done
  if [ "$ok" -eq 1 ]; then
    pass=$((pass + 1)); printf '  ✓ %s\n' "$name"
  else
    fails+=("$name（退出码 $code，期望 $want_code）")
    printf '  ✗ %s\n%s\n' "$name" "$(printf '%s\n' "$out" | sed 's/^/      /')"
  fi
}

echo "test-verify-install: verify-install.sh 回归测试"

# 1 红：清单内的两个根版本不一致 —— 必须报漂移，不能只验第一个命中根
new_home; plant ".claude" "9.9.9" >/dev/null; plant ".agents" "9.9.8" >/dev/null
expect "清单内安装根版本漂移必须判红" 1 "✗ 版本漂移" ".agents" "为 9.9.8"

# 2 红：陈旧根在**清单里没写过的宿主目录**下 —— 只有自动发现能抓到（T11 本体）。
#    把 CANDIDATES 退回纯静态清单，这条立刻变红。
new_home; plant ".claude" "9.9.9" >/dev/null; plant ".unlistedhost" "9.9.8" >/dev/null
expect "清单外宿主根的陈旧副本不得被静默跳过（T11）" 1 "✗ 版本漂移" ".unlistedhost"

# 3 红：根数要如实打印 —— 用例 2 若漏掉一个根，这里会显示 1 个而不是 2 个
expect "自动发现的安装根数量要如实打印" 1 "核对安装根: 2 个"

# 4 绿：三个根同步后放行（含清单外宿主，证明发现不是"多报"）。
#    断言的是**整组结论**：命中根是谁、核对几个、结尾那句"通过"必须带规范校验——
#    只断言"版本一致"那一行的用例，别人把命中顺序或规范校验拆掉它照样绿。
new_home; C="$(plant ".claude" "9.9.9")"; plant ".agents" "9.9.9" >/dev/null
plant ".unlistedhost" "9.9.9" >/dev/null
expect "全部根同步后一致性检查放行" 0 \
  "发现安装位置: $C" \
  "✅ 全部安装根版本一致（9.9.9）" "核对安装根: 3 个" \
  "验证通过（含规范校验）"

# 5 红：一个根都没有时，排查清单要把"自动发现"这条查找路径也列出来，
#    否则用户照静态清单排查完仍然找不到 skill，误判成安装失败
new_home
expect "未安装时的排查清单包含自动发现路径" 1 "未找到 adversarial-review" "自动发现" "请先安装，或手动指定路径"

# 6 红：显式指定路径时，验的是**那个副本**，不得顺手宣称"多根已核对"
new_home; D="$(plant ".claude" "9.9.9")"; plant ".agents" "9.9.8" >/dev/null
out="$(HOME="${HOME_ROOT}" bash "$SCRIPT" "$D" 2>&1)"; code=$?
if printf '%s\n' "$out" | grep -qF "全部安装根版本一致"; then
  fails+=("显式路径分支宣称了它没核对过的多根一致性（退出码 $code）")
  echo "  ✗ 显式指定路径时不宣称多根一致"
else
  pass=$((pass + 1)); echo "  ✓ 显式指定路径时不宣称多根一致"
fi

total=$((pass + ${#fails[@]}))
if [ "${#fails[@]}" -gt 0 ]; then
  for f in "${fails[@]}"; do printf '  ✗ %s\n' "$f" >&2; done
  printf 'test-verify-install: %s 通过 / %s 失败（共 %s）\n' "$pass" "${#fails[@]}" "$total" >&2
  exit 1
fi
printf 'test-verify-install: %s 通过 / 0 失败（共 %s）\n' "$pass" "$total"
