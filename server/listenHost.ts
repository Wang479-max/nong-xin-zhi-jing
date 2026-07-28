const ALLOWED_LISTEN_HOSTS = new Set(['127.0.0.1', '0.0.0.0', '::1']);

export function resolveListenHost(
  environment: Record<string, string | undefined> = process.env,
): string {
  const fallback = environment.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  const host = environment.HOST?.trim() || fallback;
  if (!ALLOWED_LISTEN_HOSTS.has(host)) {
    throw new Error('HOST must be 127.0.0.1, 0.0.0.0, or ::1.');
  }
  return host;
}
