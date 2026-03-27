---
name: zhipin-215-sync
description: Sync changed files from this ZhiPin repository to the LAN server `192.168.3.215`, connect over SSH, inspect remote repo state, and run deployment or health-check workflows for this project. Trigger when the user asks about 215 sync, LAN SSH, server code updates, deploy, hot update, or when code changes are made in this repository. After code changes in this repo, automatically sync changed files to `192.168.3.215:/home/sunyd/projectspace/ZhiPin` before the final response unless the user explicitly says not to sync.
---

# ZhiPin 215 Sync

Use this skill for this repository's LAN server workflow.

## Default behavior

1. After modifying code under `frontend/`, `backend/`, `deploy/`, `supabase/`, `.claude/`, or top-level project instruction files, automatically sync changed files to `192.168.3.215` before the final response unless the user explicitly says not to.
2. Use `scripts/sync_to_215.py --changed-only --health-check` for the default sync path.
3. Report exactly which files were uploaded and whether health checks passed.

## SSH and sync

- Read secrets from `docs/AI_AGENT_SECRETS.local.md`.
- Remote host: `192.168.3.215`
- Remote user: `sunyd`
- Remote repo: `/home/sunyd/projectspace/ZhiPin`
- Use the bundled sync script for normal file sync work.

## Deployment rules

- Distinguish repo sync from runtime update:
  - Repo sync: upload changed files to the remote repository.
  - Runtime update: rebuild/recreate containers on the server.
- If the user asks to deploy, update the running service, rebuild containers, or refresh frontend/backend behavior on the live server, use the deploy workflow from [references/deploy-notes.md](references/deploy-notes.md).
- Do not claim a live service changed just because files were synced to the remote repo.

## Common commands

- Default sync:
  - `python .claude/skills/zhipin-215-sync/scripts/sync_to_215.py --changed-only --health-check`
- Sync specific files:
  - `python .claude/skills/zhipin-215-sync/scripts/sync_to_215.py --file backend/services/live_login_service.py --file frontend/src/types/database.ts --health-check`
- Remote deploy:
  - `cd /home/sunyd/projectspace/ZhiPin/deploy && bash deploy.sh build && bash deploy.sh recreate`
- Full remote deploy:
  - `cd /home/sunyd/projectspace/ZhiPin/deploy && bash deploy.sh all`

## Reference

- Read [references/deploy-notes.md](references/deploy-notes.md) for server details, deployment modes, and health checks.
