#!/usr/bin/env bash
set -Eeuo pipefail

marker=/run/nongxinzhijing-certbot-stopped-nginx
if systemctl is-active --quiet nginx; then
  install -m 0600 /dev/null "$marker"
  systemctl stop nginx
fi
