#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR="${PROJECT_DIR:-/opt/nongxinzhijing/current}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nongxinzhijing/postgresql}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COS_BUCKET="${COS_BUCKET:-}"
COS_REMOTE_PREFIX="${COS_REMOTE_PREFIX:-postgresql}"

cd "$PROJECT_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$stamp"
dump_name="agri_saas.dump"
mkdir -p "$backup_dir"

docker compose exec -T postgres sh -ceu 'exec pg_dump --format=custom --compress=9 --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' > "$backup_dir/$dump_name"
cd "$backup_dir"
test -s "$dump_name"
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
echo "Compose PostgreSQL 备份完成：$backup_dir（COS：${COS_BUCKET:-未启用}）"
