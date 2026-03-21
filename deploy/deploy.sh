#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PULL_OPENCLAW=false
PULL_BASE=false
FORCE_OPENCLAW_STATE=false
IMAGE_TAG=""
PREPARE_ARGS=()
BUILD_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --pull-openclaw)
            PULL_OPENCLAW=true
            ;;
        --pull-base)
            PULL_BASE=true
            ;;
        --force-openclaw-state)
            FORCE_OPENCLAW_STATE=true
            ;;
        --image-tag)
            shift
            [ $# -gt 0 ] || { echo "--image-tag 需要一个参数" >&2; exit 1; }
            IMAGE_TAG="$1"
            ;;
        -h|--help)
            cat <<USAGE
用法: $0 [--pull-openclaw] [--pull-base] [--force-openclaw-state] [--image-tag TAG]
说明:
  依次执行 01_prepare_env.sh → 02_build_images.sh → 03_recreate_stack.sh
USAGE
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
    shift
done

$FORCE_OPENCLAW_STATE && PREPARE_ARGS+=(--force-openclaw-state)
$PULL_OPENCLAW && BUILD_ARGS+=(--pull-openclaw)
$PULL_BASE && BUILD_ARGS+=(--pull-base)
[ -n "$IMAGE_TAG" ] && BUILD_ARGS+=(--image-tag "$IMAGE_TAG")

./01_prepare_env.sh "${PREPARE_ARGS[@]}"
./02_build_images.sh "${BUILD_ARGS[@]}"
./03_recreate_stack.sh
