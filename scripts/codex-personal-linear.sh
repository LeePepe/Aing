#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
env_file="$repo_root/.codex.env"

if [[ ! -f "$env_file" ]]; then
  echo "[aing] missing $env_file" >&2
  exit 1
fi

set -a
source "$env_file"
set +a

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo "[aing] LINEAR_API_KEY is empty in $env_file" >&2
  exit 1
fi

exec codex -C "$repo_root" \
  -c 'mcp_servers.linear.url="https://mcp.linear.app/mcp"' \
  -c 'mcp_servers.linear.bearer_token_env_var="LINEAR_API_KEY"' \
  "$@"
