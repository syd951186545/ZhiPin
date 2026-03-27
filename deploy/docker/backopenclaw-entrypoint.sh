#!/bin/sh
set -eu

SEED_ROOT=/opt/openclaw-home-seed
TARGET_ROOT=/opt/openclaw-home
NODE_HOME=/home/node
OPENCLAW_CMD="docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured"
BACKEND_CMD="cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 8000"

copy_if_missing() {
    source_path="$1"
    target_path="$2"

    if [ -e "$source_path" ] && [ ! -e "$target_path" ]; then
        mkdir -p "$(dirname "$target_path")"
        cp -a "$source_path" "$target_path"
    fi
}

sync_seed_file() {
    source_path="$1"
    target_path="$2"

    if [ -e "$source_path" ]; then
        mkdir -p "$(dirname "$target_path")"
        cp -f "$source_path" "$target_path"
    fi
}

merge_json_file() {
    source_path="$1"
    target_path="$2"

    if [ ! -e "$source_path" ]; then
        return 0
    fi

    mkdir -p "$(dirname "$target_path")"
    python3 - "$source_path" "$target_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])

incoming = json.loads(source.read_text(encoding="utf-8"))

candidate_paths: list[Path] = []
builtin_backup = target.with_name(target.name + ".bak")
if builtin_backup.exists():
    candidate_paths.append(builtin_backup)
for backup in sorted(target.parent.glob(target.name + ".bak*")):
    if backup not in candidate_paths:
        candidate_paths.append(backup)
candidate_paths.append(target)

current = {}
for candidate in candidate_paths:
    if not candidate.exists():
        continue
    try:
        current = json.loads(candidate.read_text(encoding="utf-8"))
        break
    except Exception:
        continue


def merge(current_value, incoming_value):
    if isinstance(current_value, dict) and isinstance(incoming_value, dict):
        merged = dict(current_value)
        for key, value in incoming_value.items():
            merged[key] = merge(merged.get(key), value) if key in merged else value
        return merged
    return incoming_value


merged_payload = merge(current, incoming)
target.write_text(json.dumps(merged_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

strip_host_browser_control() {
    target_path="$1"

    if [ ! -e "$target_path" ]; then
        return 0
    fi

    python3 - "$target_path" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))

agents = payload.get("agents") or {}
defaults = agents.get("defaults") or {}
defaults_sandbox = defaults.get("sandbox") or {}
defaults_browser = defaults_sandbox.get("browser") or {}
defaults_browser.pop("allowHostControl", None)
if not defaults_browser:
    defaults_sandbox.pop("browser", None)
if not defaults_sandbox:
    defaults.pop("sandbox", None)

for item in (agents.get("list") or []):
    if not isinstance(item, dict):
        continue
    sandbox_cfg = item.get("sandbox") or {}
    browser_cfg = sandbox_cfg.get("browser") or {}
    browser_cfg.pop("allowHostControl", None)
    if not browser_cfg:
        sandbox_cfg.pop("browser", None)
    if not sandbox_cfg:
        item.pop("sandbox", None)

path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

clear_browser_singleton_locks() {
    browser_root="$TARGET_ROOT/.openclaw/browser"

    if [ ! -d "$browser_root" ]; then
        return 0
    fi

    find "$browser_root" -path '*/user-data' -type d | while IFS= read -r profile_dir; do
        rm -f \
            "$profile_dir/SingletonLock" \
            "$profile_dir/SingletonCookie" \
            "$profile_dir/SingletonSocket"
    done
}

wait_for_openclaw() {
    retries=60
    while [ "$retries" -gt 0 ]; do
        if python - <<'PY'
import urllib.request
urllib.request.urlopen("http://127.0.0.1:18789/healthz", timeout=2).read()
PY
        then
            return 0
        fi
        retries=$((retries - 1))
        sleep 2
    done
    return 1
}

cleanup() {
    if [ "${BACKEND_PID:-}" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ "${OPENCLAW_PID:-}" ]; then
        kill "$OPENCLAW_PID" 2>/dev/null || true
    fi
}

trap cleanup INT TERM EXIT

mkdir -p \
    "$TARGET_ROOT/.openclaw" \
    "$TARGET_ROOT/.openclaw/media" \
    "$TARGET_ROOT/.openclaw/workspace" \
    "$TARGET_ROOT/.openclaw/skills" \
    "$TARGET_ROOT/.cache"

# openclaw.json 同步时保留运行时附加字段（如 meta / commands / controlUi），避免整文件覆盖导致 Gateway 卡死。
merge_json_file "$SEED_ROOT/.openclaw/openclaw.json" "$TARGET_ROOT/.openclaw/openclaw.json"
# allowHostControl 不能直接存在于冷启动配置文件中，否则会让 Gateway 启动卡死；启动后再通过 config.apply 写入。
strip_host_browser_control "$TARGET_ROOT/.openclaw/openclaw.json"
# Chromium profile 的 Singleton* 锁文件会保留在持久卷里，容器重启后需要清理，否则 host browser 无法重新拉起。
clear_browser_singleton_locks
copy_if_missing "$SEED_ROOT/.openclaw/skills/playwright-skill" "$TARGET_ROOT/.openclaw/skills/playwright-skill"
copy_if_missing "$SEED_ROOT/.openclaw/skills/browser-guardrails-skill" "$TARGET_ROOT/.openclaw/skills/browser-guardrails-skill"
copy_if_missing "$SEED_ROOT/.cache/ms-playwright" "$TARGET_ROOT/.cache/ms-playwright"

chown -R node:node "$TARGET_ROOT"

rm -rf "$NODE_HOME/.openclaw" "$NODE_HOME/.cache"
ln -s "$TARGET_ROOT/.openclaw" "$NODE_HOME/.openclaw"
ln -s "$TARGET_ROOT/.cache" "$NODE_HOME/.cache"
chown -h node:node "$NODE_HOME/.openclaw" "$NODE_HOME/.cache"

gosu node sh -lc "$OPENCLAW_CMD" &
OPENCLAW_PID=$!

if ! wait_for_openclaw; then
    echo "OpenClaw 启动超时" >&2
    exit 1
fi

gosu node sh -lc "$BACKEND_CMD" &
BACKEND_PID=$!

exit_code=0
while :; do
    if ! kill -0 "$OPENCLAW_PID" 2>/dev/null; then
        wait "$OPENCLAW_PID" || exit_code=$?
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        wait "$BACKEND_PID" || exit_code=$?
        break
    fi
    sleep 2
done

cleanup
exit "$exit_code"
