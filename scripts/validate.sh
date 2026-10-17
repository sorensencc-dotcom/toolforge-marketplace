#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE_JSON="${REPO_ROOT}/.claude-plugin/marketplace.json"

echo "==> Validating Toolforge Marketplace at: ${REPO_ROOT}"

# 1. Dependency Check
if ! command -v jq >/dev/null 2>&1; then
  echo "[ERROR] 'jq' is required for structural validation." >&2
  exit 1
fi

# 2. Check Marketplace Manifest Existence & Syntax
if [[ ! -f "${MARKETPLACE_JSON}" ]]; then
  echo "[ERROR] Missing ${MARKETPLACE_JSON}" >&2
  exit 1
fi

if ! jq empty "${MARKETPLACE_JSON}" 2>/dev/null; then
  echo "[ERROR] Invalid JSON syntax in ${MARKETPLACE_JSON}" >&2
  exit 1
fi

# 3. Validate Root Required Fields
MKT_NAME=$(jq -r '.name // empty' "${MARKETPLACE_JSON}")
OWNER_NAME=$(jq -r '.owner.name // empty' "${MARKETPLACE_JSON}")
PLUGINS_TYPE=$(jq -r '.plugins | type' "${MARKETPLACE_JSON}")

if [[ -z "${MKT_NAME}" ]]; then
  echo "[ERROR] Root 'name' is missing in marketplace.json" >&2
  exit 1
fi

if [[ ! "${MKT_NAME}" =~ ^[a-z0-9-]+$ ]]; then
  echo "[ERROR] Root 'name' (${MKT_NAME}) must be lowercase alphanumeric with hyphens only." >&2
  exit 1
fi

if [[ -z "${OWNER_NAME}" ]]; then
  echo "[ERROR] Root 'owner.name' is missing in marketplace.json" >&2
  exit 1
fi

if [[ "${PLUGINS_TYPE}" != "array" ]]; then
  echo "[ERROR] Root 'plugins' must be an array." >&2
  exit 1
fi

# 4. Check Duplicate Plugin Names
DUPLICATES=$(jq -r '.plugins[].name' "${MARKETPLACE_JSON}" | sort | uniq -d)
if [[ -n "${DUPLICATES}" ]]; then
  echo "[ERROR] Duplicate plugin names found in marketplace.json: ${DUPLICATES}" >&2
  exit 1
fi

# 5. Iterate and Validate Individual Plugin Entries
PLUGIN_COUNT=$(jq '.plugins | length' "${MARKETPLACE_JSON}")
echo "==> Checking ${PLUGIN_COUNT} plugin entries..."

for ((i = 0; i < PLUGIN_COUNT; i++)); do
  P_NAME=$(jq -r ".plugins[${i}].name // empty" "${MARKETPLACE_JSON}")
  P_SOURCE_TYPE=$(jq -r ".plugins[${i}].source | type" "${MARKETPLACE_JSON}")

  if [[ -z "${P_NAME}" ]]; then
    echo "[ERROR] plugins[${i}] is missing 'name'." >&2
    exit 1
  fi

  if [[ "${P_SOURCE_TYPE}" == "string" ]]; then
    P_SOURCE=$(jq -r ".plugins[${i}].source" "${MARKETPLACE_JSON}")

    # Block parent directory traversal per Claude Code spec
    if [[ "${P_SOURCE}" == *".."* ]]; then
      echo "[ERROR] plugins[${i}] (${P_NAME}): relative source '${P_SOURCE}' cannot contain '..'" >&2
      exit 1
    fi

    # If relative path, verify local directory and plugin.json parity
    if [[ "${P_SOURCE}" == ./* ]]; then
      TARGET_DIR="${REPO_ROOT}/${P_SOURCE#./}"
      TARGET_MANIFEST="${TARGET_DIR}/.claude-plugin/plugin.json"

      if [[ ! -d "${TARGET_DIR}" ]]; then
        echo "[ERROR] plugins[${i}] (${P_NAME}): directory '${TARGET_DIR}' does not exist." >&2
        exit 1
      fi

      if [[ ! -f "${TARGET_MANIFEST}" ]]; then
        echo "[ERROR] plugins[${i}] (${P_NAME}): missing '${TARGET_MANIFEST}'." >&2
        exit 1
      fi

      MANIFEST_NAME=$(jq -r '.name // empty' "${TARGET_MANIFEST}")
      if [[ "${P_NAME}" != "${MANIFEST_NAME}" ]]; then
        echo "[ERROR] Name mismatch for plugins[${i}]: marketplace.json has '${P_NAME}', but plugin.json has '${MANIFEST_NAME}'." >&2
        exit 1
      fi

      AUTHOR_NAME=$(jq -r '.author.name // empty' "${TARGET_MANIFEST}")
      if [[ -z "${AUTHOR_NAME}" ]]; then
        echo "[WARN] plugins[${i}] (${P_NAME}): 'author.name' missing in plugin.json (triggers Claude CLI warning)."
      fi
    fi
  elif [[ "${P_SOURCE_TYPE}" == "object" ]]; then
    SRC_KIND=$(jq -r ".plugins[${i}].source.source // empty" "${MARKETPLACE_JSON}")
    if [[ -z "${SRC_KIND}" ]]; then
      echo "[ERROR] plugins[${i}] (${P_NAME}): object source missing 'source' type field (e.g., github, url, git-subdir)." >&2
      exit 1
    fi
  else
    echo "[ERROR] plugins[${i}] (${P_NAME}): invalid 'source' field." >&2
    exit 1
  fi
done

# 6. Run Native Claude Code CLI Validator (if available)
if command -v claude >/dev/null 2>&1; then
  echo "==> Running native 'claude plugin validate'..."
  claude plugin validate "${REPO_ROOT}"
else
  echo "==> [INFO] 'claude' CLI not found in PATH; skipped native CLI validation pass."
fi

echo "==> Validation passed: ${MKT_NAME} (${PLUGIN_COUNT} plugins verified)."
