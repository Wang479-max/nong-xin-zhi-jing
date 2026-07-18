import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function copyMigrationFiles(source: string, destination: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(migrations.map((entry) => copyFile(
    resolve(source, entry.name),
    resolve(destination, entry.name),
  )));
}

const isCliEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isCliEntrypoint) {
  const source = process.argv[2] || 'server/saas/db/migrations';
  const destination = process.argv[3] || 'dist/migrations';
  void copyMigrationFiles(source, destination).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Failed to copy database migrations.');
    process.exitCode = 1;
  });
}
