export function resolveListenPort(
  environment: Record<string, string | undefined> = process.env,
): number {
  if (environment.PORT === undefined) return 3000;

  const port = Number(environment.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}
