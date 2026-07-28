import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from '../../server/trustProxy';

describe('trusted reverse proxy mode', () => {
  it('defaults to disabled and supports host or one-hop container proxying', () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback');
    expect(resolveTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
  });

  it('rejects broad or ambiguous trust settings', () => {
    for (const value of ['true', '2', '0.0.0.0/0', 'yes']) {
      expect(() => resolveTrustProxy({ TRUST_PROXY: value })).toThrow('TRUST_PROXY must be');
    }
  });
});
