---
name: zhipin-deploy
version: 1.0.0
description: |
  ZhiPin 项目生产部署操作手册。包含服务器连接、构建镜像、切换服务、健康验证的完整流程，
  以及首次 backopenclaw 架构部署时排查出的所有已知坑。
  触发时机：执行部署、排查服务器 Docker 问题、构建镜像失败、容器启动异常。
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# ZhiPin 生产部署 Runbook

读取敏感凭据：`docs/AI_AGENT_SECRETS.local.md`（SSH 密码、token 均在此文件）。
始终用中文答复，非必要不在回复中回显密码或 token。

---

## 1. 服务器连接

服务器没有安装 `sshpass`，用 Python paramiko 执行 SSH/SFTP：

```python
import paramiko

host = '192.168.3.215'
user = 'sunyd'
# password 见 docs/AI_AGENT_SECRETS.local.md

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=15)

def run(cmd, timeout=60):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    rc = stdout.channel.recv_exit_status()
    return out, err, rc
```

**项目实际路径**：`/home/sunyd/projectspace/ZhiPin`
（`docs/AI_AGENT_SECRETS.local.md` 曾记录为 `/home/sunyd/ZhiPin`，已更正，但注意历史文档可能有误）

---

## 2. 部署前必查清单

### 2-A  docker-buildx / docker-compose 软链接
```bash
ls -la ~/.docker/cli-plugins/docker-buildx
ls -la ~/.docker/cli-plugins/docker-compose
```
若为指向 `/usr/lib/docker/cli-plugins/` 的**断开符号链接**（实际二进制在 `/usr/libexec/docker/cli-plugins/`），执行：
```bash
ln -sfn /usr/libexec/docker/cli-plugins/docker-buildx  ~/.docker/cli-plugins/docker-buildx
ln -sfn /usr/libexec/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose
```

### 2-B  docker config.json 中的 credsStore
```bash
cat ~/.docker/config.json
```
若含 `"credsStore": "desktop"`，BuildKit 拉取 Dockerfile syntax 镜像时会报：
```
error getting credentials - err: exec: "docker-credential-desktop": executable file not found
```
修复——将 config.json 改为：
```json
{
  "auths": {},
  "currentContext": "default"
}
```

### 2-C  backopenclaw-entrypoint.sh 是否存在
```bash
ls deploy/docker/backopenclaw-entrypoint.sh
```
该文件已在 commit `f73676c` 中提交到 git，`git pull` 后应存在。
若仍缺失，通过 SFTP 从本机上传：
```python
sftp = client.open_sftp()
sftp.put(r'D:\_WorkSpaceWebStorm\ZhiPin_CC\deploy\docker\backopenclaw-entrypoint.sh',
         '/home/sunyd/projectspace/ZhiPin/deploy/docker/backopenclaw-entrypoint.sh')
sftp.chmod(remote_path, 0o755)
sftp.close()
```

---

## 3. 部署流程

```bash
# 进入项目 deploy 目录
cd /home/sunyd/projectspace/ZhiPin/deploy

# 只生成配置（检查 .env.production 完整性）
bash deploy.sh prepare

# 构建镜像（约 3–5 分钟，视缓存）
bash deploy.sh build

# 使用最新共同 tag 重建服务（保留 backopenclaw_data 卷）
bash deploy.sh recreate

# 或一步完成全部
bash deploy.sh all
```

后台执行并监控日志：
```bash
nohup bash deploy.sh build > /tmp/deploy-build.log 2>&1 &
tail -f /tmp/deploy-build.log
```

---

## 4. docker-compose 关键配置说明

`deploy/docker-compose.yml` 的 `backopenclaw` 服务必须包含以下能力，否则：
- `CHOWN`：entrypoint 无法 `chown -R node:node /opt/openclaw-home`
- `DAC_OVERRIDE`：读写不同用户拥有的文件
- `SETUID` / `SETGID`：`gosu` 无法从 root 切换到 node 用户

```yaml
cap_drop:
  - ALL
cap_add:
  - NET_RAW
  - SYS_ADMIN
  - CHOWN
  - DAC_OVERRIDE
  - SETUID
  - SETGID
security_opt:
  - no-new-privileges:true
```

---

## 5. 健康验证

容器启动后逐项验证：

```bash
# 后端 API 健康
docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:8000/api/health
# 期望: {"status":"ok","openclaw":{"status":"ok",...}}

# OpenClaw 内部健康
docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:18789/healthz
# 期望: {"ok":true,"status":"live"}

# 前端 nginx
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/
# 期望: 200

# 容器进程列表（应有 openclaw-gateway 和 uvicorn）
docker exec deploy-backopenclaw-1 ps aux | grep -E '(uvicorn|openclaw|node)' | grep -v grep
```

---

## 6. 常见故障排查

| 现象 | 原因 | 修复 |
|------|------|------|
| `chown: Operation not permitted` + 容器 unhealthy | cap_drop ALL 未补 CHOWN 等 | 见第 4 节 |
| `frontend` 等待 backopenclaw healthy 超时 | backopenclaw 启动慢（首次拷贝 playwright 缓存）| 增大 `start_period` 或等待 |

---

## 7. 快速查看线上日志

```bash
# 容器实时日志
docker logs -f deploy-backopenclaw-1 --tail 100

# 查看健康检查历史
docker inspect deploy-backopenclaw-1 --format '{{json .State.Health}}' | python -m json.tool

# 进入容器调试
docker exec -it deploy-backopenclaw-1 /bin/sh
```
