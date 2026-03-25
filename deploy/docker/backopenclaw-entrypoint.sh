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

copy_if_missing "$SEED_ROOT/.openclaw/openclaw.json" "$TARGET_ROOT/.openclaw/openclaw.json"
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
