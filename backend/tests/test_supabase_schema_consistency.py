from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_encrypted_session_state_migration_targets_platform_configs():
    migration = REPO_ROOT / "supabase" / "migrations" / "20260326000000_platform_accounts_encrypted_session_state.sql"
    content = migration.read_text(encoding="utf-8")

    assert "ALTER TABLE public.platform_configs" in content
    assert "COMMENT ON COLUMN public.platform_configs.encrypted_session_state" in content
    assert "ALTER TABLE platform_accounts" not in content


def test_follow_up_fix_migration_exists_for_existing_environments():
    migration = REPO_ROOT / "supabase" / "migrations" / "20260327010000_fix_platform_configs_encrypted_session_state.sql"
    content = migration.read_text(encoding="utf-8")

    assert "ALTER TABLE public.platform_configs" in content
    assert "ADD COLUMN IF NOT EXISTS encrypted_session_state text;" in content
