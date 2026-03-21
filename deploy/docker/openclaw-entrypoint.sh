#!/bin/sh
set -eu

SEED_ROOT=/opt/openclaw-home-seed
TARGET_ROOT=/home/node

copy_if_missing() {
    source_path="$1"
    target_path="$2"

    if [ -e "$source_path" ] && [ ! -e "$target_path" ]; then
        mkdir -p "$(dirname "$target_path")"
        cp -a "$source_path" "$target_path"
    fi
}

mkdir -p \
    "$TARGET_ROOT/.openclaw" \
    "$TARGET_ROOT/.openclaw/media" \
    "$TARGET_ROOT/.openclaw/workspace" \
    "$TARGET_ROOT/.openclaw/skills" \
    "$TARGET_ROOT/.cache"

copy_if_missing "$SEED_ROOT/.openclaw/skills/playwright-skill" "$TARGET_ROOT/.openclaw/skills/playwright-skill"
copy_if_missing "$SEED_ROOT/.openclaw/skills/browser-guardrails-skill" "$TARGET_ROOT/.openclaw/skills/browser-guardrails-skill"
copy_if_missing "$SEED_ROOT/.cache/ms-playwright" "$TARGET_ROOT/.cache/ms-playwright"

exec docker-entrypoint.sh "$@"
