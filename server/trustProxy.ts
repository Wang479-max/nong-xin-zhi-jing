export type TrustProxySetting = false | 'loopback' | 1;

export function resolveTrustProxy(
  environment: Record<string, string | undefined> = process.env,
): TrustProxySetting {
  const value = environment.TRUST_PROXY?.trim().toLowerCase();
  if (value === undefined || value === '') return false;
  if (value === 'loopback') return 'loopback';
  if (value === '1') return 1;
  throw new Error('TRUST_PROXY must be loopback or 1 when configured.');
}
