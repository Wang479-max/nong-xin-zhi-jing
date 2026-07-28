import { describe, expect, it } from 'vitest';
import { resolveListenPort } from '../../server/listenPort';

describe('server listen port', () => {
  it('defaults to 3000 when PORT is not configured', () => {
    expect(resolveListenPort({})).toBe(3000);
  });

  it.each([
    ['1', 1],
    ['3000', 3000],
    ['65535', 65535],
  ])('accepts valid integer port %s', (configured, expected) => {
    expect(resolveListenPort({ PORT: configured })).toBe(expected);
  });

  it.each(['abc', 'NaN', '0', '65536', '3000.5'])(
    'rejects invalid PORT=%s',
    (configured) => {
      expect(() => resolveListenPort({ PORT: configured })).toThrow(
        'PORT must be an integer between 1 and 65535.',
      );
    },
  );
});
