import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const forbidden = [
  'password123', 'mock-token', 'demo-token', 'nxzj_local_users',
  "localStorage.getItem('nxzj_user')", "localStorage.setItem('nxzj_user'", "localStorage.removeItem('nxzj_user')",
  '/api/auth/', '/api/commerce', '/api/payments/notify', '/api/user/',
];

describe('frontend security retirement scan', () => {
  it.each(forbidden)('does not contain retired production pattern %s', (pattern) => {
    const matches = sourceFiles(sourceRoot).filter((file) => readFileSync(file, 'utf8').includes(pattern));
    expect(matches).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
