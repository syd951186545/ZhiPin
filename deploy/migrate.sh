#!/bin/bash

# 加载 deploy/.env.production。
# 该脚本与 backopenclaw 单镜像部署独立，不依赖容器内 OpenClaw 端口暴露。
set -a
source "$(dirname "$0")/.env.production"
set +a

echo "🔄 加载配置..."
echo "✅ Supabase URL: $SUPABASE_URL"

# 检查环境变量
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ 缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY"
    exit 1
fi

# 从 URL 提取项目引用
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://(.*)\.supabase\.co|\1|')
DB_HOST="$PROJECT_REF.supabase.co"
DB_USER="postgres"
DB_PASSWORD="$SUPABASE_ANON_KEY"
DB_NAME="postgres"
DB_PORT="5432"

echo "📋 获取 SQL 文件列表..."
SQL_DIR="$(dirname "$0")/sql"

if [ ! -d "$SQL_DIR" ]; then
    echo "⚠️  SQL 目录不存在: $SQL_DIR"
    exit 1
fi

SQL_FILES=$(find "$SQL_DIR" -name "*.sql" -type f | sort)

if [ -z "$SQL_FILES" ]; then
    echo "⚠️  没有找到 SQL 文件"
    exit 0
fi

echo "找到以下 SQL 文件:"
echo "$SQL_FILES" | while read -r file; do
    echo "  - $(basename "$file")"
done

# 检查 psql 是否可用
if ! command -v psql &> /dev/null; then
    echo ""
    echo "⚠️  未检测到 psql 工具，请使用以下方法之一:"
    echo ""
    echo "1️⃣  使用 Supabase Dashboard SQL Editor:"
    echo "   a. 访问: https://supabase.com"
    echo "   b. 登录并进入项目"
    echo "   c. 选择 SQL Editor"
    echo "   d. 新建查询，复制粘贴 SQL 文件内容"
    echo ""
    echo "2️⃣  安装 PostgreSQL 客户端工具"
    echo "   - macOS: brew install libpq"
    echo "   - Ubuntu: sudo apt-get install postgresql-client"
    echo "   - Windows: 从 PostgreSQL 网站下载"
    echo ""
    echo "3️⃣  使用 Node.js 脚本:"
    echo "   npm install pg dotenv"
    echo "   node execute_sql.js"
    echo ""
    exit 1
fi

echo ""
echo "🔌 连接 Supabase 数据库..."
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   User: $DB_USER"

SUCCESS_COUNT=0
FAILED_COUNT=0

echo ""
echo "⚙️  开始执行 SQL 迁移..."
echo ""

echo "$SQL_FILES" | while read -r sql_file; do
    if [ -z "$sql_file" ]; then
        continue
    fi

    filename=$(basename "$sql_file")
    echo "执行: $filename"

    # 使用 psql 执行 SQL 文件
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$sql_file" \
        -v ON_ERROR_STOP=1 \
        --ssl-mode=require 2>&1 | while read -r line; do
            if [[ "$line" =~ "ERROR" ]]; then
                echo "❌ $filename: $line"
            fi
        done

    if [ $? -eq 0 ]; then
        echo "✅ 执行成功: $filename"
        ((SUCCESS_COUNT++))
    else
        echo "❌ 执行失败: $filename"
        ((FAILED_COUNT++))
    fi
    echo ""
done

echo "=================================================="
echo "迁移完成:"
echo "  ✅ 成功: $SUCCESS_COUNT"
echo "  ❌ 失败: $FAILED_COUNT"
echo "=================================================="

if [ $FAILED_COUNT -gt 0 ]; then
    exit 1
fi
