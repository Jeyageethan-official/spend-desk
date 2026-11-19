#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly SCRIPT="$ROOT_DIR/scripts/backup-supabase-postgres.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/spenddesk-backup-test.XXXXXX")"
trap 'rm -rf -- "$tmp_root"' EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_contains() { [[ "$1" == *"$2"* ]] || fail "Expected output to contain: $2"; }
assert_not_contains() { [[ "$1" != *"$2"* ]] || fail "Output leaked sensitive text."; }

mock_bin="$tmp_root/bin"
backup_dir="$tmp_root/backups"
mkdir -p "$mock_bin" "$backup_dir"

cat > "$mock_bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
for arg in "$@"; do
  case "$arg" in
    --file=*) target="${arg#--file=}" ;;
    --dbname=*) dbname="${arg#--dbname=}" ;;
  esac
done
[[ "${dbname:-}" == 'postgresql://postgres.project-ref@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' ]]
[[ "$dbname" != *'s%40fe'* ]]
[[ -n "${PGPASSFILE:-}" && -f "$PGPASSFILE" ]]
[[ "$(cat "$PGPASSFILE")" == 'aws-1-us-east-1.pooler.supabase.com:5432:postgres:postgres.project-ref:s@fe\:pa/ss?#% ' ]]
if [[ "${MOCK_PG_DUMP_FAIL:-}" == '1' ]]; then exit 17; fi
printf 'mock custom archive\n' > "$target"
EOF

cat > "$mock_bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == '--list' ]]
printf '1; 0 0 TABLE public user_workspaces postgres\n'
EOF
chmod +x "$mock_bin/pg_dump" "$mock_bin/pg_restore"

template='postgresql://postgres.project-ref:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
password='s@fe:pa/ss?#% '
output="$(printf '%s\n%s\n' "$template" "$password" | PATH="$mock_bin:$PATH" SPENDDESK_BACKUP_DIR="$backup_dir" "$SCRIPT" --interactive test 2>&1)" || fail 'Interactive special-character backup should succeed.'
assert_contains "$output" 'BACKUP SUCCEEDED'
assert_not_contains "$output" "$password"
test "$(find "$backup_dir" -name '*.dump' | wc -l | tr -d ' ')" = '1' || fail 'Expected one archive.'
test "$(find "$backup_dir" -name '*.dump.sha256' | wc -l | tr -d ' ')" = '1' || fail 'Expected one checksum.'

set +e
malformed_output="$(printf '%s\n' 'not-a-uri' | PATH="$mock_bin:$PATH" SPENDDESK_BACKUP_DIR="$backup_dir" "$SCRIPT" --interactive malformed 2>&1)"
malformed_status=$?
empty_output="$(printf '\n' | PATH="$mock_bin:$PATH" SPENDDESK_BACKUP_DIR="$backup_dir" "$SCRIPT" --interactive empty 2>&1)"
empty_status=$?
failure_output="$(printf '%s\n%s\n' "$template" "$password" | PATH="$mock_bin:$PATH" MOCK_PG_DUMP_FAIL=1 SPENDDESK_BACKUP_DIR="$backup_dir" "$SCRIPT" --interactive failure 2>&1)"
failure_status=$?
set -e
[[ "$malformed_status" -ne 0 ]] || fail 'Malformed URI should fail.'
[[ "$empty_status" -ne 0 ]] || fail 'Empty URI should fail.'
[[ "$failure_status" -ne 0 ]] || fail 'Failed pg_dump should fail.'
assert_contains "$malformed_output" 'URI template must begin'
assert_contains "$empty_output" 'cannot be empty'
assert_contains "$failure_output" 'pg_dump returned a non-zero status'
assert_not_contains "$failure_output" "$password"
test "$(find "$backup_dir" -name '*failure*' | wc -l | tr -d ' ')" = '0' || fail 'Failed backup published an artifact.'

printf 'backup-supabase-postgres tests passed\n'
