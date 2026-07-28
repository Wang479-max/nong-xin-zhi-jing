import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const forbidden = [
  'password123', 'mock-token', 'demo-token', 'nxzj_local_users',
  "localStorage.getItem('nxzj_user')", "localStorage.setItem('nxzj_user'", "localStorage.removeItem('nxzj_user')",
  "localStorage.getItem('currentUser')", 'localStorage.getItem("currentUser")',
  "localStorage.getItem('user')", 'localStorage.getItem("user")',
  "localStorage.getItem('authUser')", "localStorage.getItem('loggedInUser')",
  '/api/auth/', '/api/commerce', '/api/payments/notify', '/api/user/',
];

describe('frontend security retirement scan', () => {
  it.each(forbidden)('does not contain retired production pattern %s', (pattern) => {
    const matches = sourceFiles(sourceRoot).filter((file) => readFileSync(file, 'utf8').includes(pattern));
    expect(matches).toEqual([]);
  });

  it('routes AI chat through the authenticated SaaS request boundary', () => {
    const source = readFileSync(join(sourceRoot, 'components', 'AIRecognition.tsx'), 'utf8');
    expect(source).toContain("saasClient.fetchWithSession('/api/ai/chat'");
    expect(source).not.toContain("fetch('/api/ai/chat'");
  });

  it('keeps the digital twin preview available while passing typed read-only controls to it', () => {
    const app = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8');
    const twinTypes = readFileSync(join(sourceRoot, 'components', 'digitaltwin', 'shared', 'types.ts'), 'utf8');
    const twin = readFileSync(join(sourceRoot, 'components', 'digitaltwin', 'DigitalTwin.tsx'), 'utf8');

    expect(app).not.toContain('<PlanGate session={session} feature="digital_twin.advanced"');
    expect(app).toContain('readOnly={!canAccessAction(\'digitalTwin.control\'');
    expect(twinTypes).toContain('readOnly: boolean;');
    expect(twinTypes).toContain('onUpgrade: () => void;');
    expect(twin).toContain('基础预览');
  });

  it('uses the safe XLSX writer instead of SheetJS', () => {
    const monitoring = readFileSync(join(sourceRoot, 'components', 'FieldMonitoring.tsx'), 'utf8');

    expect(monitoring).toContain("from '../lib/xlsxExport'");
    expect(monitoring).not.toMatch(/from ['"]xlsx['"]/);
    expect(monitoring).toContain('await saveXlsxFile(');
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
