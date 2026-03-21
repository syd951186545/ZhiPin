#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"
FORCE_OPENCLAW_STATE=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

usage() {
    cat <<USAGE
用法: $0 [--env-file PATH] [--force-openclaw-state]
  --env-file PATH            指定配置源文件，默认 deploy/.env.production
  --force-openclaw-state     强制用 .env.production 覆盖 backend/openclaw 中的持久化 openclaw.json
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --env-file)
            shift
            [ $# -gt 0 ] || error "--env-file 需要一个路径参数"
            ENV_FILE="$1"
            ;;
        --force-openclaw-state)
            FORCE_OPENCLAW_STATE=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "未知参数: $1"
            ;;
    esac
    shift
done

[ -f "$ENV_FILE" ] || error "配置源不存在: $ENV_FILE"

write_env_value() {
    local file="$1"
    local key="$2"
    local value="$3"

    python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
line = f"{key}={value}"
lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
for idx, existing in enumerate(lines):
    if existing.startswith(f"{key}="):
        lines[idx] = line
        break
else:
    lines.append(line)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

read_env_value() {
    local key="$1"
    python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or '=' not in line:
        continue
    current_key, current_value = line.split('=', 1)
    if current_key.strip() == key:
        print(current_value)
        break
PY
}

require_nonempty() {
    local key="$1"
    local value="$2"
    [ -n "$value" ] || error "$key 未配置，请先填写 $ENV_FILE"
}

if [ -z "$(read_env_value OPENCLAW_AUTH_TOKEN)" ]; then
    info "OPENCLAW_AUTH_TOKEN 未设置，自动生成..."
    write_env_value "$ENV_FILE" "OPENCLAW_AUTH_TOKEN" "$(openssl rand -hex 24)"
fi

eval "$(python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
for line in path.read_text(encoding='utf-8').splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    if key:
        print(f"export {key}={shlex.quote(value)}")
PY
)"

: "${VITE_SUPABASE_URL:=${SUPABASE_URL:-}}"
: "${VITE_SUPABASE_ANON_KEY:=${SUPABASE_ANON_KEY:-}}"
: "${VITE_MINIMAX_API_KEY:=}"
: "${VITE_DEFAULT_LOGIN_EMAIL:=}"
: "${VITE_DEFAULT_LOGIN_PASSWORD:=}"
: "${HOST:=0.0.0.0}"
: "${PORT:=8000}"
: "${DEBUG:=false}"
: "${CORS_ORIGINS:=*}"
: "${OPENCLAW_BASE_URL:=http://openclaw:18789}"
: "${OPENCLAW_AGENT_ID:=HR_Juzi}"
: "${OPENCLAW_AGENT_NAME:=HR 橘子}"
: "${OPENCLAW_AGENT_EMOJI:=🍊}"
: "${OPENCLAW_AGENT_THEME:=你是一名专业的 HR 招聘助手，擅长在 BOSS 直聘平台上高效完成候选人筛选和沟通工作。}"
: "${OPENCLAW_MODEL_PROVIDER:=minimax-cn}"
: "${OPENCLAW_MODEL_API_BASE_URL:=https://api.minimaxi.com/anthropic}"
: "${OPENCLAW_MODEL_API_TYPE:=anthropic-messages}"
: "${OPENCLAW_MODEL_API_KEY:=}"
: "${OPENCLAW_MODEL_ID:=MiniMax-M2.5}"
: "${OPENCLAW_MODEL_NAME:=MiniMax M2.5}"
: "${OPENCLAW_MODEL_ALIAS:=Minimax}"
: "${OPENCLAW_MODEL_REASONING:=true}"
: "${OPENCLAW_MODEL_INPUT_TYPES:=text}"
: "${OPENCLAW_MODEL_COST_INPUT:=0.3}"
: "${OPENCLAW_MODEL_COST_OUTPUT:=1.2}"
: "${OPENCLAW_MODEL_COST_CACHE_READ:=0.03}"
: "${OPENCLAW_MODEL_COST_CACHE_WRITE:=0.12}"
: "${OPENCLAW_MODEL_CONTEXT_WINDOW:=200000}"
: "${OPENCLAW_MODEL_MAX_TOKENS:=8192}"
: "${OPENCLAW_MEDIA_MOUNT:=/openclaw-home/.openclaw/media}"

require_nonempty SUPABASE_URL "${SUPABASE_URL:-}"
require_nonempty SUPABASE_ANON_KEY "${SUPABASE_ANON_KEY:-}"
require_nonempty OPENCLAW_AUTH_TOKEN "${OPENCLAW_AUTH_TOKEN:-}"
require_nonempty OPENCLAW_MODEL_API_KEY "${OPENCLAW_MODEL_API_KEY:-}"
require_nonempty OPENCLAW_AGENT_ID "${OPENCLAW_AGENT_ID:-}"
require_nonempty OPENCLAW_AGENT_NAME "${OPENCLAW_AGENT_NAME:-}"
require_nonempty OPENCLAW_AGENT_THEME "${OPENCLAW_AGENT_THEME:-}"
require_nonempty FRONTEND_IMAGE_REPO "${FRONTEND_IMAGE_REPO:-}"
require_nonempty BACKEND_IMAGE_REPO "${BACKEND_IMAGE_REPO:-}"
require_nonempty OPENCLAW_RUNTIME_REPO "${OPENCLAW_RUNTIME_REPO:-}"

FRONTEND_ENV_FILE="$REPO_ROOT/frontend/.env.production"
BACKEND_ENV_FILE="$REPO_ROOT/backend/.env.production"
OPENCLAW_HOME_DIR="$REPO_ROOT/backend/openclaw"
OPENCLAW_CONFIG_DIR="$OPENCLAW_HOME_DIR/.openclaw"
OPENCLAW_CONFIG_FILE="$OPENCLAW_CONFIG_DIR/openclaw.json"
OPENCLAW_GENERATED_FILE="$OPENCLAW_HOME_DIR/openclaw.generated.json"
IMAGE_ENV_FILE="$SCRIPT_DIR/.images.env"

mkdir -p "$OPENCLAW_CONFIG_DIR" "$OPENCLAW_CONFIG_DIR/workspace" "$OPENCLAW_CONFIG_DIR/media"

python3 - "$FRONTEND_ENV_FILE" "$BACKEND_ENV_FILE" <<'PY'
from pathlib import Path
import os
import sys

def encode(value: str) -> str:
    escaped = value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
    return f'"{escaped}"'

frontend = {
    'VITE_SUPABASE_URL': os.environ['VITE_SUPABASE_URL'],
    'VITE_SUPABASE_ANON_KEY': os.environ['VITE_SUPABASE_ANON_KEY'],
    'VITE_MINIMAX_API_KEY': os.environ.get('VITE_MINIMAX_API_KEY', ''),
    'VITE_DEFAULT_LOGIN_EMAIL': os.environ.get('VITE_DEFAULT_LOGIN_EMAIL', ''),
    'VITE_DEFAULT_LOGIN_PASSWORD': os.environ.get('VITE_DEFAULT_LOGIN_PASSWORD', ''),
}
backend = {
    'SUPABASE_URL': os.environ['SUPABASE_URL'],
    'SUPABASE_ANON_KEY': os.environ['SUPABASE_ANON_KEY'],
    'SUPABASE_SERVICE_KEY': os.environ.get('SUPABASE_SERVICE_KEY', ''),
    'OPENCLAW_BASE_URL': os.environ['OPENCLAW_BASE_URL'],
    'OPENCLAW_AUTH_TOKEN': os.environ['OPENCLAW_AUTH_TOKEN'],
    'OPENCLAW_AGENT_ID': os.environ['OPENCLAW_AGENT_ID'],
    'HOST': os.environ['HOST'],
    'PORT': os.environ['PORT'],
    'DEBUG': os.environ['DEBUG'],
    'CORS_ORIGINS': os.environ['CORS_ORIGINS'],
    'OPENCLAW_MEDIA_MOUNT': os.environ['OPENCLAW_MEDIA_MOUNT'],
}
for path, data in ((Path(sys.argv[1]), frontend), (Path(sys.argv[2]), backend)):
    path.write_text(''.join(f'{k}={encode(v)}\n' for k, v in data.items()), encoding='utf-8')
PY

python3 - "$OPENCLAW_GENERATED_FILE" <<'PY'
from pathlib import Path
import json
import os
import sys

provider = os.environ['OPENCLAW_MODEL_PROVIDER']
model_id = os.environ['OPENCLAW_MODEL_ID']
qualified_model = f"{provider}/{model_id}"
reasoning = os.environ['OPENCLAW_MODEL_REASONING'].strip().lower() in {'1', 'true', 'yes', 'on'}
input_types = [item.strip() for item in os.environ['OPENCLAW_MODEL_INPUT_TYPES'].split(',') if item.strip()]
config = {
    'gateway': {
        'bind': 'lan',
        'http': {'endpoints': {'responses': {'enabled': True}}},
        'auth': {'mode': 'token', 'token': os.environ['OPENCLAW_AUTH_TOKEN']},
    },
    'models': {
        'mode': 'merge',
        'providers': {
            provider: {
                'baseUrl': os.environ['OPENCLAW_MODEL_API_BASE_URL'],
                'api': os.environ['OPENCLAW_MODEL_API_TYPE'],
                'authHeader': True,
                'apiKey': os.environ['OPENCLAW_MODEL_API_KEY'],
                'models': [{
                    'id': model_id,
                    'name': os.environ['OPENCLAW_MODEL_NAME'],
                    'reasoning': reasoning,
                    'input': input_types or ['text'],
                    'cost': {
                        'input': float(os.environ['OPENCLAW_MODEL_COST_INPUT']),
                        'output': float(os.environ['OPENCLAW_MODEL_COST_OUTPUT']),
                        'cacheRead': float(os.environ['OPENCLAW_MODEL_COST_CACHE_READ']),
                        'cacheWrite': float(os.environ['OPENCLAW_MODEL_COST_CACHE_WRITE']),
                    },
                    'contextWindow': int(os.environ['OPENCLAW_MODEL_CONTEXT_WINDOW']),
                    'maxTokens': int(os.environ['OPENCLAW_MODEL_MAX_TOKENS']),
                }],
            }
        },
    },
    'agents': {
        'defaults': {
            'model': {'primary': qualified_model},
            'models': {qualified_model: {'alias': os.environ['OPENCLAW_MODEL_ALIAS']}},
        },
        'list': [{
            'id': os.environ['OPENCLAW_AGENT_ID'],
            'default': True,
            'name': os.environ['OPENCLAW_AGENT_NAME'],
            'model': qualified_model,
            'identity': {
                'emoji': os.environ['OPENCLAW_AGENT_EMOJI'],
                'theme': os.environ['OPENCLAW_AGENT_THEME'],
            },
            'workspace': '/home/node/.openclaw/workspace',
        }],
    },
}
Path(sys.argv[1]).write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

if $FORCE_OPENCLAW_STATE || [ ! -f "$OPENCLAW_CONFIG_FILE" ]; then
    cp "$OPENCLAW_GENERATED_FILE" "$OPENCLAW_CONFIG_FILE"
    if $FORCE_OPENCLAW_STATE; then
        warn "已按要求覆盖持久化 OpenClaw 配置: $OPENCLAW_CONFIG_FILE"
    else
        info "首次生成持久化 OpenClaw 配置: $OPENCLAW_CONFIG_FILE"
    fi
else
    info "检测到已有持久化 OpenClaw 配置，保留运行时修改: $OPENCLAW_CONFIG_FILE"
fi

cat > "$IMAGE_ENV_FILE" <<EOF_IMAGE
FRONTEND_IMAGE=
BACKEND_IMAGE=
OPENCLAW_RUNTIME_IMAGE=
IMAGE_TAG=
EOF_IMAGE

info "已生成前端配置: $FRONTEND_ENV_FILE"
info "已生成后端配置: $BACKEND_ENV_FILE"
info "已生成 OpenClaw 配置副本: $OPENCLAW_GENERATED_FILE"
info "OpenClaw 持久化目录: $OPENCLAW_HOME_DIR"
info "已重置镜像标签文件: $IMAGE_ENV_FILE"
