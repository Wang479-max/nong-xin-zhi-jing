#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nongxinzhijing/postgresql}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_BACKUP_HOST="${PG_BACKUP_HOST:-127.0.0.1}"
PG_BACKUP_PORT="${PG_BACKUP_PORT:-5432}"
PG_BACKUP_DATABASE="${PG_BACKUP_DATABASE:-agri_saas}"
PG_BACKUP_USER="${PG_BACKUP_USER:-nxzj_app}"
PGPASSFILE="${PGPASSFILE:-/etc/nongxinzhijing/pg_backup.pgpass}"
COS_BUCKET="${COS_BUCKET:-}"
COS_REMOTE_PREFIX="${COS_REMOTE_PREFIX:-postgresql}"

if [[ ! -f "$PGPASSFILE" ]]; then
  echo "缺少 PostgreSQL 凭据文件：$PGPASSFILE" >&2
  exit 1
fi
chmod 600 "$PGPASSFILE"
export PGPASSFILE

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$stamp"
dump_name="${PG_BACKUP_DATABASE}.dump"
mkdir -p "$backup_dir"
cd "$backup_dir"

pg_dump --format=custom --compress=9 --no-owner --no-privileges --host="$PG_BACKUP_HOST" --port="$PG_BACKUP_PORT" --username="$PG_BACKUP_USER" --file="$dump_name" "$PG_BACKUP_DATABASE"
sha256sum "$dump_name" > "$dump_name.sha256"
sha256sum --check "$dump_name.sha256"

if [[ -n "$COS_BUCKET" ]]; then
  if ! command -v coscmd >/dev/null 2>&1; then
    echo "已配置 COS_BUCKET，但未安装 coscmd。" >&2
    exit 1
  fi
  coscmd upload "$dump_name" "/${COS_REMOTE_PREFIX}/${stamp}/${dump_name}"
  coscmd upload "$dump_name.sha256" "/${COS_REMOTE_PREFIX}/${stamp}/${dump_name}.sha256"
fi

find "$BACKUP_ROOT" -mindepth 1 -depth -mtime "+$RETENTION_DAYS" -delete
echo "PostgreSQL 备份完成：$backup_dir（COS：${COS_BUCKET:-未启用}）"
