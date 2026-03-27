#!/usr/bin/env python3
from __future__ import annotations

import argparse
import posixpath
import re
import subprocess
import sys
from pathlib import Path

import paramiko


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / '.git').exists() and (candidate / 'docs' / 'AI_AGENT_SECRETS.local.md').exists():
            return candidate
    raise RuntimeError('Could not locate repository root.')


REPO_ROOT = find_repo_root(Path(__file__).resolve())
SECRETS_PATH = REPO_ROOT / 'docs' / 'AI_AGENT_SECRETS.local.md'


def parse_secrets() -> dict[str, str]:
    text = SECRETS_PATH.read_text(encoding='utf-8')
    patterns = {
        'host': r'Host：`([^`]+)`',
        'user': r'User：`([^`]+)`',
        'password': r'Password：`([^`]+)`',
        'remote_repo': r'同项目路径：`([^`]+)`',
    }
    result: dict[str, str] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if not match:
            raise RuntimeError(f'Missing {key} in {SECRETS_PATH}')
        result[key] = match.group(1)
    return result


def git_changed_files() -> list[str]:
    proc = subprocess.run(
        ['git', 'status', '--porcelain'],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    files: list[str] = []
    for raw_line in proc.stdout.splitlines():
        line = raw_line.rstrip()
        if not line:
            continue
        path_part = line[3:]
        if ' -> ' in path_part:
            path_part = path_part.split(' -> ', 1)[1]
        normalized = path_part.replace('\\', '/')
        if normalized.endswith('/'):
            continue
        if normalized.startswith('backend/openclaw/'):
            continue
        if normalized not in files:
            files.append(normalized)
    return files


def should_sync(path: str) -> bool:
    allowed_prefixes = ('frontend/', 'backend/', 'deploy/', 'supabase/', '.claude/')
    allowed_exact = {'CLAUDE.md', 'AGENTS.md', 'README.md', 'TODOS.md'}
    return path.startswith(allowed_prefixes) or path in allowed_exact


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    current = ''
    for part in remote_dir.strip('/').split('/'):
        current += '/' + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_files(files: list[str], remote_repo: str, host: str, user: str, password: str) -> list[str]:
    uploaded: list[str] = []
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=15)
    sftp = client.open_sftp()
    try:
        for rel in files:
            local_path = REPO_ROOT / rel
            if not local_path.exists() or not local_path.is_file():
                continue
            remote_path = posixpath.join(remote_repo, rel.replace('\\', '/'))
            ensure_remote_dir(sftp, posixpath.dirname(remote_path))
            sftp.put(str(local_path), remote_path)
            uploaded.append(rel)
        return uploaded
    finally:
        sftp.close()
        client.close()


def run_remote(command: str, host: str, user: str, password: str, timeout: int = 60) -> tuple[int, str, str]:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=15)
    try:
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        rc = stdout.channel.recv_exit_status()
        return rc, out, err
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--changed-only', action='store_true')
    parser.add_argument('--file', action='append', default=[])
    parser.add_argument('--health-check', action='store_true')
    args = parser.parse_args()

    secrets = parse_secrets()

    files = [f.replace('\\', '/') for f in args.file]
    if args.changed_only:
        files.extend(git_changed_files())

    deduped: list[str] = []
    for item in files:
        if should_sync(item) and item not in deduped:
            deduped.append(item)

    if not deduped:
        print('No eligible files to sync.')
        return 0

    uploaded = upload_files(
        deduped,
        secrets['remote_repo'],
        secrets['host'],
        secrets['user'],
        secrets['password'],
    )

    print('Uploaded files:')
    for rel in uploaded:
        print(f' - {rel}')

    _, out, err = run_remote(
        f"cd {secrets['remote_repo']} && git status --short",
        secrets['host'],
        secrets['user'],
        secrets['password'],
    )
    print('\nRemote git status:')
    print(out.strip() if out.strip() else '(clean or no output)')
    if err.strip():
        print(err.strip(), file=sys.stderr)

    if args.health_check:
        _, out, err = run_remote(
            'curl -s --connect-timeout 5 http://127.0.0.1/api/health || true',
            secrets['host'],
            secrets['user'],
            secrets['password'],
        )
        print('\nRemote health:')
        print(out.strip() if out.strip() else '(no output)')
        if err.strip():
            print(err.strip(), file=sys.stderr)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
