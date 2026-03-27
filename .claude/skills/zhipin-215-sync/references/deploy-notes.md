# ZhiPin 215 Deploy Notes

- Host: `192.168.3.215`
- User: `sunyd`
- Remote repo: `/home/sunyd/projectspace/ZhiPin`
- Secrets source: `docs/AI_AGENT_SECRETS.local.md`

## Default sync

- Use:
  - `python .claude/skills/zhipin-215-sync/scripts/sync_to_215.py --changed-only --health-check`

## Runtime update

- Use these when the user explicitly wants the running server updated:
  - Build + recreate:
    - `cd /home/sunyd/projectspace/ZhiPin/deploy && bash deploy.sh build && bash deploy.sh recreate`
  - Full deployment:
    - `cd /home/sunyd/projectspace/ZhiPin/deploy && bash deploy.sh all`

## Health checks

- API:
  - `curl -s http://127.0.0.1/api/health`
- Container health:
  - `docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:8000/api/health`
  - `docker exec deploy-backopenclaw-1 curl -s http://127.0.0.1:18789/healthz`

## Important rule

- Uploading files to the remote repo does not update the live containers by itself.
- Only say "server updated" after the requested runtime update or deploy command has actually completed.
