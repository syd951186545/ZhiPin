# ZhiPin 生产部署 Runbook（Codex 版）

> 此文件**不自动加载**。需要执行部署或排查容器问题时，手动告知 Codex 读取本文件。
> 凭据信息见：`docs/AI_AGENT_SECRETS.local.md`

---

## 服务器信息

- Host：`192.168.3.215`，User：`sunyd`（密码见 secrets 文件）
- 项目路径：`/home/sunyd/projectspace/ZhiPin`
- 用 Python `paramiko` 库执行 SSH（服务器无 sshpass）

---

## 部署前必查

| 检查项 | 命令 | 修复方式 |
|--------|------|----------|
| docker-buildx 软链接 | `ls -la ~/.docker/cli-plugins/docker-buildx` | `ln -sfn /usr/libexec/docker/cli-plugins/docker-buildx ~/.docker/cli-plugins/docker-buildx` |
| docker-compose 软链接 | `ls -la ~/.docker/cli-plugins/docker-compose` | `ln -sfn /usr/libexec/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose` |
| config.json credsStore | `cat ~/.docker/config.json` | 删除 `"credsStore":"desktop"` 字段 |
| entrypoint.sh 存在 | `ls deploy/docker/backopenclaw-entrypoint.sh` | git pull 或 SFTP 上传 |

---

## 部署命令

```bash
cd /home/sunyd/projectspace/ZhiPin/deploy
bash deploy.sh all          # prepare + build + recreate
bash deploy.sh build        # 仅构建镜像
bash deploy.sh recreate     # 仅重建容器（使用已有镜像）
```

---

## docker-compose cap_add 必须包含

```
NET_RAW, SYS_ADMIN, CHOWN, DAC_OVERRIDE, SETUID, SETGID
```
缺少 CHOWN/SETUID/SETGID 会导致 backopenclaw 容器启动时 chown volume 失败、gosu 无法切换用户。

---

## 健康验证

```bash
docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:8000/api/health
# 期望: {"status":"ok","openclaw":{"status":"ok",...}}
docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:18789/healthz
# 期望: {"ok":true,"status":"live"}
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/
# 期望: 200
```

---

## 完整知识库

Claude Code 下运行 `/zhipin-deploy` 获取带示例代码的完整 runbook。
