#!/usr/bin/env bash
# Manual logical backup for a Supabase PostgreSQL database.
#
# This script never runs automatically. It intentionally refuses a backup
# destination inside this repository and never prints its connection string.

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

usage() {
  cat <<'EOF'
Usage:
  SPENDDESK_BACKUP_DATABASE_URL='postgresql://...' \
  SPENDDESK_BACKUP_DIR='/absolute/path/outside/repository' \
  ./scripts/backup-supabase-postgres.sh [label]

  SPENDDESK_BACKUP_DIR='/absolute/path/outside/repository' \
  ./scripts/backup-supabase-postgres.sh --interactive [label]

Required environment variables:
  SPENDDESK_BACKUP_DATABASE_URL  PostgreSQL connection string. Never echo it.
  SPENDDESK_BACKUP_DIR           Existing or new absolute directory outside this repository.

Optional:
  label                          Safe filename label (letters, digits, _ and - only).

Interactive mode is recommended for a Supabase Session Pooler connection. It
accepts a URI template containing a password placeholder, prompts separately
for the password without echoing it, validates the host/port/database, and
uses a temporary mode-600 PGPASSFILE. The complete password-bearing URI is
never printed or passed to pg_dump as a command-line argument.

Creates a PostgreSQL custom-format dump, a SHA-256 checksum, and a dump
manifest. pg_dump captures the database objects that the supplied role can
read, including schema, data, functions, triggers and RLS policy definitions.
It does not back up Supabase dashboard configuration, Edge Function secrets,
Storage objects, OAuth provider configuration, or database roles.
EOF
}

fail() {
  printf 'BACKUP FAILED: %s\n' "$1" >&2
  exit 1
}

url_encode() {
  local value="$1" encoded='' char hex index
  LC_ALL=C
  for ((index = 0; index < ${#value}; index++)); do
    char="${value:index:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *) printf -v hex '%%%02X' "'${char}"; encoded+="$hex" ;;
    esac
  done
  printf '%s' "$encoded"
}

pgpass_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//:/\\:}"
  printf '%s' "$value"
}

is_password_placeholder() {
  case "$1" in
    '[YOUR-PASSWORD]'|'[PASSWORD]'|'<password>'|'<PASSWORD>'|'{password}'|'{PASSWORD}'|'YOUR-PASSWORD'|'PASSWORD') return 0 ;;
    *) return 1 ;;
  esac
}

build_interactive_connection() {
  local template authority credentials endpoint username_raw password_marker host_port database_part query_part
  local host port username_encoded password_encoded password

  printf 'Paste Supabase Session Pooler URI template (with a password placeholder): ' >&2
  IFS= read -r template || fail 'No Session Pooler URI template was provided.'
  [[ -n "$template" ]] || fail 'Session Pooler URI template cannot be empty.'
  [[ "$template" == postgresql://* || "$template" == postgres://* ]] || fail 'URI template must begin with postgresql:// or postgres://.'

  authority="${template#*://}"
  [[ "$authority" == *@* ]] || fail 'URI template must contain credentials and a hostname.'
  credentials="${authority%%@*}"
  endpoint="${authority#*@}"
  [[ "$credentials" == *:* ]] || fail 'URI template must include username and a password placeholder.'
  username_raw="${credentials%%:*}"
  password_marker="${credentials#*:}"
  is_password_placeholder "$password_marker" || fail 'Use a password placeholder such as [YOUR-PASSWORD], not a real password, in the URI template.'
  [[ -n "$username_raw" ]] || fail 'URI template username cannot be empty.'
  [[ "$username_raw" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'URI template username contains unsupported characters.'

  endpoint="${endpoint%%\?*}"
  [[ "$endpoint" == */* ]] || fail 'URI template must include host, port, and database name.'
  host_port="${endpoint%%/*}"
  database_part="${endpoint#*/}"
  [[ "$host_port" == *:* ]] || fail 'URI template must include an explicit TCP port.'
  host="${host_port%:*}"
  port="${host_port##*:}"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'URI template host is invalid.'
  [[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || fail 'URI template port is invalid.'
  [[ "$database_part" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'URI template database name is invalid.'

  printf 'Supabase database password: ' >&2
  IFS= read -r -s password || fail 'No database password was provided.'
  printf '\n' >&2
  [[ -n "$password" ]] || fail 'Database password cannot be empty.'

  username_encoded="$(url_encode "$username_raw")"
  password_encoded="$(url_encode "$password")"

  # Construct both encoded forms to ensure special characters are handled
  # correctly. Only the password-free URI is passed to pg_dump; authentication
  # goes through a private temporary passfile so no password enters argv.
  SPENDDESK_FULL_CONNECTION_URI="postgresql://${username_encoded}:${password_encoded}@${host}:${port}/${database_part}?sslmode=require"
  SPENDDESK_PGDUMP_CONNECTION_URI="postgresql://${username_encoded}@${host}:${port}/${database_part}?sslmode=require"
  SPENDDESK_PGPASS_HOST="$host"
  SPENDDESK_PGPASS_PORT="$port"
  SPENDDESK_PGPASS_DATABASE="$database_part"
  SPENDDESK_PGPASS_USERNAME="$username_raw"
  SPENDDESK_PGPASS_PASSWORD="$password"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

interactive_mode=false
if [[ "${1:-}" == '--interactive' ]]; then
  interactive_mode=true
  shift
fi

[[ -n "${SPENDDESK_BACKUP_DIR:-}" ]] || fail 'SPENDDESK_BACKUP_DIR is required.'
[[ "$SPENDDESK_BACKUP_DIR" = /* ]] || fail 'SPENDDESK_BACKUP_DIR must be an absolute path outside the repository.'

label="${1:-production}"
[[ "$label" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Backup label may contain only letters, digits, _ and -.'

mkdir -p -- "$SPENDDESK_BACKUP_DIR"
BACKUP_DIR="$(cd -- "$SPENDDESK_BACKUP_DIR" && pwd -P)"

case "$BACKUP_DIR" in
  "$REPOSITORY_ROOT"|"$REPOSITORY_ROOT"/*)
    fail 'Backup directory must be outside the repository.'
    ;;
esac

command -v pg_dump >/dev/null 2>&1 || fail 'pg_dump is required. Install PostgreSQL client tools first.'
command -v pg_restore >/dev/null 2>&1 || fail 'pg_restore is required. Install PostgreSQL client tools first.'

if [[ "$interactive_mode" == true ]]; then
  build_interactive_connection
elif [[ -n "${SPENDDESK_BACKUP_DATABASE_URL:-}" ]]; then
  SPENDDESK_PGDUMP_CONNECTION_URI="$SPENDDESK_BACKUP_DATABASE_URL"
else
  fail 'Set SPENDDESK_BACKUP_DATABASE_URL or use --interactive.'
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly base_name="spenddesk-postgres-${label}-${timestamp}"
readonly dump_file="$BACKUP_DIR/${base_name}.dump"
readonly checksum_file="$BACKUP_DIR/${base_name}.dump.sha256"
readonly manifest_file="$BACKUP_DIR/${base_name}.manifest.txt"
tmp_dump="$(mktemp "$BACKUP_DIR/.${base_name}.XXXXXX")"
tmp_manifest="$(mktemp "$BACKUP_DIR/.${base_name}.manifest.XXXXXX")"
tmp_checksum="$(mktemp "$BACKUP_DIR/.${base_name}.checksum.XXXXXX")"
tmp_pgpass=''

cleanup() {
  rm -f -- "$tmp_dump" "$tmp_manifest" "$tmp_checksum" "$tmp_pgpass"
  unset SPENDDESK_FULL_CONNECTION_URI SPENDDESK_PGPASS_PASSWORD SPENDDESK_BACKUP_DATABASE_URL
}
trap cleanup EXIT

if [[ "$interactive_mode" == true ]]; then
  tmp_pgpass="$(mktemp "$BACKUP_DIR/.${base_name}.pgpass.XXXXXX")"
  chmod 600 "$tmp_pgpass"
  printf '%s:%s:%s:%s:%s\n' \
    "$(pgpass_escape "$SPENDDESK_PGPASS_HOST")" \
    "$(pgpass_escape "$SPENDDESK_PGPASS_PORT")" \
    "$(pgpass_escape "$SPENDDESK_PGPASS_DATABASE")" \
    "$(pgpass_escape "$SPENDDESK_PGPASS_USERNAME")" \
    "$(pgpass_escape "$SPENDDESK_PGPASS_PASSWORD")" > "$tmp_pgpass"
fi

# Do not add --clean: a backup must be restoration-neutral. The companion
# verifier restores only into a confirmed isolated empty database.
if ! PGPASSFILE="$tmp_pgpass" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$tmp_dump" \
  --dbname="$SPENDDESK_PGDUMP_CONNECTION_URI"; then
  fail 'pg_dump returned a non-zero status; no completed backup was published.'
fi

[[ -s "$tmp_dump" ]] || fail 'pg_dump completed but produced an empty file.'

# Listing a custom archive validates that pg_restore can parse its table of
# contents before the archive is atomically published.
if ! pg_restore --list "$tmp_dump" > "$tmp_manifest"; then
  fail 'The dump archive could not be read by pg_restore.'
fi
[[ -s "$tmp_manifest" ]] || fail 'The dump archive manifest is empty.'

if command -v shasum >/dev/null 2>&1; then
  checksum="$(shasum -a 256 "$tmp_dump" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  checksum="$(sha256sum "$tmp_dump" | awk '{print $1}')"
else
  fail 'A SHA-256 tool (shasum or sha256sum) is required.'
fi
printf '%s  %s\n' "$checksum" "$(basename "$dump_file")" > "$tmp_checksum"

mv -- "$tmp_dump" "$dump_file"
mv -- "$tmp_manifest" "$manifest_file"
mv -- "$tmp_checksum" "$checksum_file"

printf 'BACKUP SUCCEEDED\n'
printf 'Archive: %s\n' "$dump_file"
printf 'Checksum: %s\n' "$checksum_file"
printf 'Manifest: %s\n' "$manifest_file"
printf 'Next step: copy the archive and checksum to approved encrypted offsite storage, then run the isolated restore verification.\n'
