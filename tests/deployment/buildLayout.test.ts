import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyBuildLayout } from '../../scripts/verifyBuildLayout';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createLayout(): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), 'nxzj-dist-'));
  temporaryDirectories.push(dist);
  await mkdir(join(dist, 'public'), { recursive: true });
  await mkdir(join(dist, 'migrations'), { recursive: true });
  await Promise.all([
    writeFile(join(dist, 'public', 'index.html'), '<main>app</main>'),
    writeFile(join(dist, 'server.cjs'), 'server'),
    writeFile(join(dist, 'server.cjs.map'), 'map'),
    writeFile(join(dist, 'migrate.mjs'), 'migrate'),
    writeFile(join(dist, 'migrate.mjs.map'), 'map'),
    writeFile(join(dist, 'smtp-smoke.mjs'), 'smtp smoke'),
    writeFile(join(dist, 'migrations', '001_init.sql'), 'select 1;'),
  ]);
  return dist;
}

describe('production build layout verifier', () => {
  it('accepts backend artifacts outside the public directory', async () => {
    await expect(verifyBuildLayout(await createLayout())).resolves.toBeUndefined();
  });

  it('rejects a private backend artifact copied into public', async () => {
    const dist = await createLayout();
    await writeFile(join(dist, 'public', 'server.cjs'), 'leak');

    await expect(verifyBuildLayout(dist)).rejects.toThrow('Private build artifact');
  });
});
