#!/usr/bin/env node
/**
 * 执行 Supabase SQL 迁移脚本
 * 使用 pg 库直接连接 PostgreSQL 数据库
 * 与 backopenclaw 单镜像部署独立
 * 用法: node execute_sql.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const { Client } = require('pg');

function extractDbConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('缺少 SUPABASE_URL 环境变量');
  }

  // 从 URL 提取项目引用: https://[project-ref].supabase.co
  const projectRef = supabaseUrl.split('//')[1].split('.')[0];

  return {
    host: `${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY,
    ssl: { rejectUnauthorized: false }
  };
}

function getSqlFiles() {
  const sqlDir = path.join(__dirname, 'sql');
  if (!fs.existsSync(sqlDir)) {
    console.warn(`⚠️  SQL 目录不存在: ${sqlDir}`);
    return [];
  }

  return fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => path.join(sqlDir, f));
}

async function executeSqlFile(client, filepath) {
  try {
    const sql = fs.readFileSync(filepath, 'utf-8').trim();

    if (!sql) {
      console.log(`⚠️  跳过空文件: ${path.basename(filepath)}`);
      return true;
    }

    await client.query(sql);
    console.log(`✅ 执行成功: ${path.basename(filepath)}`);
    return true;
  } catch (error) {
    console.error(`❌ 执行失败: ${path.basename(filepath)}`);
    console.error(`   错误: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    console.log('🔄 加载配置...');
    const config = extractDbConfig();
    console.log(`✅ 已加载配置: ${process.env.SUPABASE_URL}`);

    console.log('\n📋 获取 SQL 文件列表...');
    const sqlFiles = getSqlFiles();

    if (sqlFiles.length === 0) {
      console.warn('⚠️  没有找到 SQL 文件');
      return;
    }

    console.log(`找到 ${sqlFiles.length} 个 SQL 文件:`);
    sqlFiles.forEach(f => console.log(`  - ${path.basename(f)}`));

    console.log('\n🔌 连接 Supabase 数据库...');
    const client = new Client(config);
    await client.connect();
    console.log('✅ 已连接数据库');

    console.log('\n⚙️  开始执行 SQL 迁移...\n');

    let successCount = 0;
    let failedCount = 0;

    for (const sqlFile of sqlFiles) {
      const success = await executeSqlFile(client, sqlFile);
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    await client.end();

    console.log('\n' + '='.repeat(50));
    console.log('迁移完成:');
    console.log(`  ✅ 成功: ${successCount}`);
    console.log(`  ❌ 失败: ${failedCount}`);
    console.log('='.repeat(50));

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

main();
