#!/usr/bin/env bash
set -Eeuo pipefail

marker=/run/nongxinzhijing-certbot-stopped-nginx
if [[ -f "$marker" ]]; then
  systemctl start nginx
  rm -f "$marker"
fi
