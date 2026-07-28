import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyMigrationFiles } from '../../scripts/copyMigrations';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('migration asset build helper', () => {
  it('copies SQL migrations without relying on recursive directory copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nxzj-migrations-'));
    temporaryDirectories.push(root);
    const source = join(root, 'source');
    const destination = join(root, 'dist', 'migrations');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(source, { recursive: true });
    await mkdir(destination, { recursive: true });
    await writeFile(join(source, '001_init.sql'), 'select 1;\n', 'utf8');
    await writeFile(join(source, 'README.md'), 'not a migration', 'utf8');
    await writeFile(join(destination, '999_stale.sql'), 'stale', 'utf8');

    await copyMigrationFiles(source, destination);

    await expect(readFile(join(destination, '001_init.sql'), 'utf8')).resolves.toBe('select 1;\n');
    await expect(readFile(join(destination, 'README.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(destination, '999_stale.sql'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
