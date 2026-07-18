import { access, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_BUILD_NAMES = new Set([
  'server.cjs',
  'server.cjs.map',
  'migrate.mjs',
  'migrate.mjs.map',
]);

export async function verifyBuildLayout(distDirectory = 'dist'): Promise<void> {
  const dist = resolve(distDirectory);
  const required = [
    join(dist, 'public', 'index.html'),
    join(dist, 'server.cjs'),
    join(dist, 'migrate.mjs'),
    join(dist, 'migrations'),
  ];
  await Promise.all(required.map((path) => access(path)));

  for (const path of await filesBelow(join(dist, 'public'))) {
    const name = basename(path);
    if (PRIVATE_BUILD_NAMES.has(name) || name.endsWith('.sql')) {
      throw new Error(`Private build artifact found in public directory: ${name}`);
    }
  }
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const isCliEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCliEntrypoint) {
  void verifyBuildLayout(process.argv[2] || 'dist').catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Build layout verification failed.');
    process.exitCode = 1;
  });
}
