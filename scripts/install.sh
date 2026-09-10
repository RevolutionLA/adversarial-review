#!/usr/bin/env bash
# adversarial-review skill installer (macOS / Linux / Git Bash / WSL)
set -euo pipefail

SKILL_NAME="adversarial-review"
REPO_URL="https://github.com/RevolutionLA/adversarial-review.git"
DEFAULT_DIR="${HOME}/.claude/skills"
TARGET_DIR="${1:-$DEFAULT_DIR}"
DEST="${TARGET_DIR}/${SKILL_NAME}"

info()  { printf '\033[36m[info]\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m[ ok ]\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m[warn]\033[0m %s\n' "$1"; }
fail()  { printf '\033[31m[fail]\033[0m %s\n' "$1" >&2; exit 1; }

info "installing ${SKILL_NAME} -> ${DEST}"
mkdir -p "${TARGET_DIR}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 "${REPO_URL}" "${TMP_DIR}/${SKILL_NAME}" >/dev/null 2>&1 \
    || fail "git clone failed. Check network access to ${REPO_URL}"
else
  command -v curl >/dev/null 2>&1 || fail "need git or curl to install"
  warn "git not found, falling back to tarball download"
  curl -fsSL "https://codeload.github.com/RevolutionLA/${SKILL_NAME}/tar.gz/refs/heads/main" \
    -o "${TMP_DIR}/skill.tar.gz" || fail "download failed"
  mkdir -p "${TMP_DIR}/extract"
  tar -xzf "${TMP_DIR}/skill.tar.gz" -C "${TMP_DIR}/extract"
  mv "${TMP_DIR}/extract/${SKILL_NAME}-main" "${TMP_DIR}/${SKILL_NAME}"
fi

[ -f "${TMP_DIR}/${SKILL_NAME}/SKILL.md" ] || fail "SKILL.md missing in downloaded repo"

if [ -d "${DEST}" ]; then
  warn "existing install found, replacing: ${DEST}"
  rm -rf "${DEST}"
fi

mkdir -p "${DEST}"
cp -R "${TMP_DIR}/${SKILL_NAME}/." "${DEST}/"

# sanity check: frontmatter name must match directory name (Agent Skills spec)
HEAD_NAME="$(sed -n 's/^name:[[:space:]]*//p' "${DEST}/SKILL.md" | head -n 1 | tr -d '\r')"
[ "${HEAD_NAME}" = "${SKILL_NAME}" ] || fail "frontmatter name '${HEAD_NAME}' != directory '${SKILL_NAME}'"

ok "installed: ${DEST}"
ok "frontmatter name verified: ${HEAD_NAME}"
printf '\nNext: restart your agent, then say "跑一次蓝军评审" or "adversarial review this module".\n'
