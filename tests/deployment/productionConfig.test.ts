import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function composeService(source: string, serviceName: string): string {
  const match = source.match(new RegExp(`^  ${serviceName}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|^volumes:|\\Z)`, 'm'));
  if (!match) throw new Error(`Missing Compose service: ${serviceName}`);
  return match[1];
}

describe('production deployment contract', () => {
  it('builds and runs on Node.js 22 without a root runtime user', () => {
    const dockerfile = read('Dockerfile');
    const manifest = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    expect(dockerfile.match(/^FROM node:22[^\n]* AS builder$/m)).not.toBeNull();
    expect(dockerfile.match(/^FROM node:22[^\n]* AS runner$/m)).not.toBeNull();
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(manifest.scripts['build:migrate']).toContain('--format=esm');
    expect(manifest.scripts['build:migrate']).toContain('dist/migrate.mjs');
    expect(manifest.scripts['build:migrate']).toContain('dist/migrations');
    expect(manifest.scripts.build).toContain('build:migrate');
    expect(manifest.scripts.build).toContain('verify:build-layout');
    expect(manifest.scripts['verify:build-layout']).toContain('scripts/verifyBuildLayout.ts');
    expect(manifest.scripts['db:migrate:prod']).toBe('node dist/migrate.mjs');
  });

  it('publishes only frontend assets from dist/public', () => {
    const vite = read('vite.config.ts');
    const server = read('server.ts');

    expect(vite).toMatch(/outDir:\s*['"]dist\/public['"]/);
    expect(server).toMatch(/const staticPath = path\.join\(distPath, ['"]public['"]\)/);
    expect(server).toContain('express.static(staticPath)');
    expect(server).not.toContain('express.static(distPath)');
    expect(server).not.toMatch(/_dirname\.includes\(['"]dist['"]\)\s*\?\s*_dirname\s*:\s*distPath/);
  });

  it('defaults production host binding to loopback and reuses it for fallback listening', () => {
    const server = read('server.ts');
    const hostResolver = read('server/listenHost.ts');

    expect(hostResolver).toContain("environment.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'");
    expect(server).toMatch(/const HOST = resolveListenHost\(process\.env\)/);
    expect(server).toContain('handleListenFailure');
    expect(server).not.toMatch(/app\.listen\([^\n]+, '0\.0\.0\.0'/);
    expect(server).toMatch(/candidate\.on\(['"]error['"]/);
    expect(server).toContain('listenOnPort(0, false)');
  });

  it('keeps PostgreSQL and Redis private while publishing only the app loopback port', () => {
    const compose = read('docker-compose.yml');
    const app = composeService(compose, 'app');
    const postgres = composeService(compose, 'postgres');
    const redis = composeService(compose, 'redis');

    expect(app).toContain('127.0.0.1:3000:3000');
    expect(app).toMatch(/HOST:\s*0\.0\.0\.0/);
    expect(app).toMatch(/TRUST_PROXY:\s*["']?1["']?/);
    expect(app).toMatch(/USER_DATA_PATH:\s*\/app\/\.data/);
    expect(app).toMatch(/\/app\/\.data/);
    expect(app).toMatch(/env_file:\s*\n\s*- \.env/);
    expect(app).toMatch(/depends_on:[\s\S]*postgres:[\s\S]*condition: service_healthy/);
    expect(app).toMatch(/depends_on:[\s\S]*redis:[\s\S]*condition: service_healthy/);
    expect(postgres).not.toMatch(/^\s+ports:/m);
    expect(redis).not.toMatch(/^\s+ports:/m);
    expect(postgres).toMatch(/healthcheck:/);
    expect(redis).toMatch(/healthcheck:/);
    expect(postgres).toMatch(/POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD(?::[^}]*)?\}/);
    expect(redis).toMatch(/\$\{REDIS_PASSWORD(?::[^}]*)?\}/);
  });

  it('terminates TLS in Nginx with WebSocket proxying, asset caching and auth throttling', () => {
    const nginx = read('deploy/nginx/nongxinzhijing.conf');

    expect(nginx).toMatch(/server_name\s+www\.nongxinzhijing\.site\s+nongxinzhijing\.site;/);
    expect(nginx).toMatch(/return\s+301\s+https:\/\/www\.nongxinzhijing\.site\$request_uri;/);
    expect(nginx).toMatch(/listen\s+443\s+ssl\s+http2;/);
    expect(nginx).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/);
    expect(nginx).toMatch(/proxy_set_header\s+Upgrade\s+\$http_upgrade;/);
    expect(nginx).toMatch(/proxy_set_header\s+Connection\s+\$connection_upgrade;/);
    expect(nginx).toMatch(/location\s+~\*\s+[^\n]*(?:assets|js|css)/);
    expect(nginx).toMatch(/expires\s+30d;/);
    expect(nginx).toMatch(/limit_req_zone\s+\$binary_remote_addr\s+zone=auth_login:[^;]+rate=5r\/m;/);
    expect(nginx).toMatch(/limit_req_zone\s+\$binary_remote_addr\s+zone=auth_refresh:[^;]+rate=30r\/m;/);
    expect(nginx).toMatch(/limit_req_status\s+429;/);
    expect(nginx).toMatch(/location\s+~\s+\^\/api\/v1\/auth\/\(login\|register\)\$/);
    expect(nginx).toMatch(/limit_req\s+zone=auth_login\s+burst=3\s+nodelay;/);
    expect(nginx).toMatch(/location\s+=\s+\/api\/v1\/auth\/refresh/);
    expect(nginx).toMatch(/limit_req\s+zone=auth_refresh\s+burst=10\s+nodelay;/);
  });

  it('runs the host service on loopback with systemd sandboxing and restart policy', () => {
    const unit = read('deploy/systemd/nongxinzhijing.service');

    expect(unit).toMatch(/^Environment=HOST=127\.0\.0\.1$/m);
    expect(unit).toMatch(/^Environment=TRUST_PROXY=loopback$/m);
    expect(unit).toMatch(/^EnvironmentFile=\/opt\/nongxinzhijing\/shared\/\.env$/m);
    expect(unit).toMatch(/^ExecStart=\/usr\/bin\/node \/opt\/nongxinzhijing\/current\/dist\/server\.cjs$/m);
    expect(unit).toMatch(/^ExecStartPre=\/usr\/bin\/node \/opt\/nongxinzhijing\/current\/dist\/migrate\.mjs$/m);
    expect(unit).toMatch(/^User=nongxinzhijing$/m);
    expect(unit).toMatch(/^Group=nongxinzhijing$/m);
    expect(unit).toMatch(/^NoNewPrivileges=true$/m);
    expect(unit).toMatch(/^PrivateTmp=true$/m);
    expect(unit).toMatch(/^ProtectSystem=strict$/m);
    expect(unit).toMatch(/^ProtectHome=true$/m);
    expect(unit).toMatch(/^Environment=USER_DATA_PATH=\/var\/lib\/nxzj$/m);
    expect(unit).toMatch(/^StateDirectory=nxzj$/m);
    expect(unit).toMatch(/^ReadWritePaths=\/var\/lib\/nxzj$/m);
    expect(unit).toMatch(/^Restart=on-failure$/m);
  });

  it('creates password-free custom PostgreSQL backups with checksums and retention', () => {
    const backup = read('deploy/scripts/pg_backup.sh');

    expect(backup).toContain('PGPASSFILE');
    expect(backup).toMatch(/\.pgpass/);
    expect(backup).toMatch(/chmod 600/);
    expect(backup).toMatch(/pg_dump[^\n]*--format=custom/);
    expect(backup).toMatch(/dump_name=/);
    expect(backup).toMatch(/cd "\$backup_dir"/);
    expect(backup).toMatch(/sha256sum "\$dump_name" > "\$dump_name\.sha256"/);
    expect(backup).not.toMatch(/sha256sum[^\n]*BACKUP_ROOT/);
    expect(backup).toMatch(/find[^\n]*-mtime[^\n]*-delete/);
    expect(backup).toMatch(/COS_BUCKET/);
    expect(backup).toMatch(/coscmd upload/);
    expect(backup).not.toMatch(/PGPASSWORD|DB_PASS|password\s*=/i);
  });

  it('backs up private Compose PostgreSQL from inside its network boundary', () => {
    const backup = read('deploy/scripts/compose_pg_backup.sh');

    expect(backup).toContain('docker compose exec -T postgres');
    expect(backup).toMatch(/pg_dump[^\n]*--format=custom/);
    expect(backup).toMatch(/cd "\$backup_dir"/);
    expect(backup).toMatch(/sha256sum "\$dump_name" > "\$dump_name\.sha256"/);
    expect(backup).not.toMatch(/PGPASSWORD|DB_PASS|password\s*=/i);
    expect(backup).not.toMatch(/-p\s*5432:5432|127\.0\.0\.1:5432:5432/);
  });

  it('installs reliable standalone Certbot renewal hooks', () => {
    const preHook = read('deploy/certbot/hooks/pre/stop-nginx.sh');
    const postHook = read('deploy/certbot/hooks/post/start-nginx.sh');

    expect(preHook).toContain('systemctl is-active --quiet nginx');
    expect(preHook).toContain('systemctl stop nginx');
    expect(preHook).toContain('/run/nongxinzhijing-certbot-stopped-nginx');
    expect(postHook).toContain('/run/nongxinzhijing-certbot-stopped-nginx');
    expect(postHook).toContain('systemctl start nginx');
  });

  it('documents only safe, code-compatible environment variable names', () => {
    const env = read('.env.example');

    for (const name of [
      'DATABASE_URL', 'REDIS_URL', 'ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_TTL_SECONDS',
      'REFRESH_TOKEN_TTL_SECONDS', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'PAYMENT_MODE',
      'SAAS_COOKIE_SECURE', 'QWEN_API_KEY', 'ZHIPU_AI_KEY', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD',
    ]) {
      expect(env).toMatch(new RegExp(`^${name}=`, 'm'));
    }
    expect(env).not.toMatch(/JWT_SECRET|ADMIN_INITIAL_PASSWORD/);
    expect(env).not.toMatch(/(?:sk-[A-Za-z0-9_-]{12,}|password123|changeme)/i);
  });

  it('never injects server-side AI provider credentials into the browser bundle', () => {
    const vite = read('vite.config.ts');

    expect(vite).not.toContain("'process.env.ZHIPU_AI_KEY'");
    expect(vite).not.toContain("'process.env.QWEN_API_KEY'");
  });

  it('provides a UTF-8 Chinese runbook for Tencent Cloud deployment and recovery', () => {
    const manual = read('docs/04-部署手册.md');

    for (const text of [
      'Ubuntu 22.04', '2 核 2 GB', 'www.nongxinzhijing.site', '安全组', 'HTTPS',
      '数据库迁移', '备份', '恢复演练', '故障处理', '5432', '6379',
      '移除 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`', '密码修改、找回与 MFA',
      '`TRUST_PROXY=1`', '`TRUST_PROXY=loopback`',
      '宿主机 PostgreSQL', 'docker compose exec -T postgres',
      'Compose 备份不需要开放 5432',
      'Aa1!',
      'sudo sh -c', 'agri_saas_restore_compose', 'docker compose exec -T postgres pg_restore',
      '/etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh', 'certbot renew --dry-run',
      'release_id="$(date +%Y%m%d%H%M%S)"', 'rsync -a', 'ln -sfn',
      'readlink -f /opt/nongxinzhijing/current', 'rollback_release',
      'gnupg git rsync', 'node_22.x',
      'PROJECT_DIR=', 'dropdb --if-exists',
      'Docker 管理权限的用户本身等同 root',
    ]) {
      expect(manual).toContain(text);
    }
    expect(manual).not.toContain('\uFFFD');
  });
});
