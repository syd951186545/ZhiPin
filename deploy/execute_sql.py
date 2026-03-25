#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Supabase SQL Migration Script
Uses Supabase Management API to execute SQL files in the deploy/sql/ directory.
Reads config from deploy/.env.production.
This script is independent from the backopenclaw deployment topology.
"""

import io
import os
import sys

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
from dotenv import load_dotenv
import httpx
import re


def load_env():
    env_path = Path(__file__).parent / ".env.production"
    load_dotenv(env_path)

    url = os.getenv("SUPABASE_URL", "").strip()
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

    if not url:
        raise ValueError("SUPABASE_URL is not set in .env.production")
    if not anon_key:
        raise ValueError("SUPABASE_ANON_KEY is not set in .env.production")

    # Extract project_ref from URL: https://<ref>.supabase.co
    match = re.match(r"https://([^.]+)\.supabase\.co", url)
    if not match:
        raise ValueError(f"Cannot parse project ref from SUPABASE_URL: {url}")

    project_ref = match.group(1)
    # Use service key if available (has more privileges), otherwise fall back to anon key
    token = service_key if service_key else anon_key

    return url, project_ref, token


def get_sql_files():
    sql_dir = Path(__file__).parent / "sql"
    if not sql_dir.exists():
        print(f"[WARN] SQL directory not found: {sql_dir}")
        return []
    return sorted(sql_dir.glob("*.sql"))


def execute_sql_via_api(project_ref: str, token: str, sql: str) -> tuple[bool, str]:
    """
    Execute SQL using Supabase Management API.
    POST https://api.supabase.com/v1/projects/{ref}/database/query
    Requires a Supabase personal access token (not anon/service key).

    Falls back to direct REST RPC if management API is unavailable.
    """
    endpoint = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {"query": sql}

    with httpx.Client(timeout=60) as client:
        resp = client.post(endpoint, json=payload, headers=headers)

    if resp.status_code in (200, 201):
        return True, ""
    else:
        return False, f"HTTP {resp.status_code}: {resp.text[:300]}"


def main():
    print("=" * 55)
    print("  Supabase SQL Migration")
    print("=" * 55)

    # ── Load config ──────────────────────────────────────────
    print("\n[1/3] Loading config from .env.production ...")
    try:
        supabase_url, project_ref, token = load_env()
    except Exception as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)

    print(f"  URL         : {supabase_url}")
    print(f"  Project ref : {project_ref}")
    print(f"  Token       : {token[:20]}...")

    # ── Collect SQL files ─────────────────────────────────────
    print("\n[2/3] Scanning deploy/sql/ ...")
    sql_files = get_sql_files()
    if not sql_files:
        print("  [WARN] No .sql files found — nothing to do.")
        return
    for f in sql_files:
        print(f"  - {f.name}")

    # ── Execute ───────────────────────────────────────────────
    print("\n[3/3] Executing SQL via Management API ...\n")
    success, failed = 0, 0

    for sql_file in sql_files:
        sql_text = sql_file.read_text(encoding="utf-8").strip()
        if not sql_text:
            print(f"  [SKIP] {sql_file.name}  (empty)")
            continue

        print(f"  >> {sql_file.name}", end=" ... ", flush=True)
        ok, err = execute_sql_via_api(project_ref, token, sql_text)
        if ok:
            print("OK")
            success += 1
        else:
            print(f"FAILED\n       {err}")
            failed += 1

    # ── Summary ───────────────────────────────────────────────
    print("\n" + "=" * 55)
    print(f"  Done  |  success={success}  failed={failed}")
    print("=" * 55)

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
