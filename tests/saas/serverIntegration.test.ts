import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('legacy server SaaS integration', () => {
  it('initializes and mounts the versioned router before the legacy large-body parser', async () => {
    const source = await serverSource();
    const mount = source.indexOf("app.use('/api/v1', saasRuntime.router)");
    const legacyParser = source.indexOf("app.use(express.json({ limit: '100mb' }))");

    expect(source).toContain('await createSaasRuntimeFromEnv(process.env)');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(legacyParser);
    expect(source.indexOf("res.setHeader('X-Content-Type-Options'")).toBeLessThan(mount);
    const limiterMount = source.indexOf("app.use('/api', createApiRateLimiter");
    expect(limiterMount).toBeGreaterThan(-1);
    expect(limiterMount).toBeLessThan(mount);
    expect(source).toContain('await saasRuntime.close()');
  });

  it('stops HTTP and arms the deadline before awaiting owned runtime shutdown', async () => {
    const source = await serverSource();
    const shutdown = source.slice(source.indexOf('const gracefulShutdown'));

    expect(shutdown.indexOf('server.close(')).toBeLessThan(shutdown.indexOf('await saasRuntime.close()'));
    expect(shutdown.indexOf('setTimeout(')).toBeLessThan(shutdown.indexOf('await saasRuntime.close()'));
  });

  it('decommissions insecure legacy auth endpoints with stable migration responses', async () => {
    const source = await serverSource();

    expect(source).toMatch(/app\.post\('\/api\/auth\/login'[\s\S]*?status\(410\)[\s\S]*?\/api\/v1\/auth\/login/);
    expect(source).toMatch(/app\.post\('\/api\/auth\/register'[\s\S]*?status\(410\)[\s\S]*?\/api\/v1\/auth\/register/);
    expect(source).not.toContain('mock-token');
    expect(source).not.toContain('password123');
  });

  it('contains no embedded AI provider credential fallbacks', async () => {
    const source = await serverSource();

    expect(source).not.toMatch(/sk-[a-z0-9]{20,}/i);
    expect(source).not.toMatch(/[a-f0-9]{32}\.[A-Za-z0-9_-]{10,}/);
    expect(source).not.toMatch(/process\.env\.(?:QWEN_API_KEY|ZHIPU_AI_KEY)\s*\|\|\s*['"][^'"]+['"]/);
  });
});

async function serverSource(): Promise<string> {
  return readFile(new URL('../../server.ts', import.meta.url), 'utf8');
}
