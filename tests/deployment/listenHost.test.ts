import { describe, expect, it } from 'vitest';
import { resolveListenHost } from '../../server/listenHost';

describe('production listen host', () => {
  it('defaults production to loopback and development to all interfaces', () => {
    expect(resolveListenHost({ NODE_ENV: 'production' })).toBe('127.0.0.1');
    expect(resolveListenHost({ NODE_ENV: 'development' })).toBe('0.0.0.0');
  });

  it('allows explicit loopback, container and IPv6 loopback bindings', () => {
    expect(resolveListenHost({ NODE_ENV: 'production', HOST: '127.0.0.1' })).toBe('127.0.0.1');
    expect(resolveListenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(resolveListenHost({ NODE_ENV: 'production', HOST: '::1' })).toBe('::1');
  });

  it('rejects arbitrary host names and public interface addresses', () => {
    expect(() => resolveListenHost({ HOST: 'example.com' })).toThrow('HOST must be');
    expect(() => resolveListenHost({ HOST: '101.33.34.25' })).toThrow('HOST must be');
  });
});
