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
    expect(manifest.scripts['db:migrate:prod']).toBe('node dist/migrate.mjs');
  });

  it('defaults production host binding to loopback and reuses it for fallback listening', () => {
    const server = read('server.ts');
    const hostResolver = read('server/listenHost.ts');

    expect(hostResolver).toContain("environment.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'");
    expect(server).toMatch(/const HOST = resolveListenHost\(process\.env\)/);
    expect(server.match(/app\.listen\([^\n]+, HOST,/g)).toHaveLength(2);
    expect(server).not.toMatch(/app\.listen\([^\n]+, '0\.0\.0\.0'/);
    expect(server).toMatch(/if \(process\.env\.NODE_ENV === 'production'\)[\s\S]*saasRuntime\.close\(\)[\s\S]*process\.exit\(1\)/);
    expect(server).not.toMatch(/生产端口[\s\S]{0,300}process\.exitCode = 1/);
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
    expect(nginx).toMatch(/limit_req_zone\s+\$binary_remote_addr\s+zone=auth_limit:/);
    expect(nginx).toMatch(/location\s+~\s+\^\/api\/v1\/auth\//);
    expect(nginx).toMatch(/limit_req\s+zone=auth_limit/);
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
    expect(backup).toMatch(/sha256sum/);
    expect(backup).toMatch(/find[^\n]*-mtime[^\n]*-delete/);
    expect(backup).toMatch(/COS_BUCKET/);
    expect(backup).toMatch(/coscmd upload/);
    expect(backup).not.toMatch(/PGPASSWORD|DB_PASS|password\s*=/i);
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
    ]) {
      expect(manual).toContain(text);
    }
    expect(manual).not.toContain('\uFFFD');
  });
});
