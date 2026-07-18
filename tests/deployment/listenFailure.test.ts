import { describe, expect, it, vi } from 'vitest';
import { handleListenFailure } from '../../server/listenFailure';

const addressInUse = Object.assign(new Error('busy'), { code: 'EADDRINUSE' });

describe('listen failure handling', () => {
  it('allows one random-port retry only for development address conflicts', async () => {
    const closeRuntime = vi.fn(async () => undefined);
    const exit = vi.fn();

    await expect(handleListenFailure(addressInUse, {
      production: false,
      allowDevelopmentFallback: true,
      closeRuntime,
      exit,
      logError: vi.fn(),
    })).resolves.toBe('retry-random-port');
    expect(closeRuntime).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([
    ['production address conflict', addressInUse, true],
    ['development non-address error', Object.assign(new Error('denied'), { code: 'EACCES' }), false],
  ])('closes the runtime and exits for %s', async (_name, error, production) => {
    const closeRuntime = vi.fn(async () => undefined);
    const exit = vi.fn();

    await expect(handleListenFailure(error, {
      production,
      allowDevelopmentFallback: true,
      closeRuntime,
      exit,
      logError: vi.fn(),
    })).resolves.toBe('terminated');
    expect(closeRuntime).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('still exits when runtime shutdown fails', async () => {
    const exit = vi.fn();
    const logError = vi.fn();

    await expect(handleListenFailure(new Error('listen failed'), {
      production: false,
      allowDevelopmentFallback: false,
      closeRuntime: vi.fn(async () => { throw new Error('close failed'); }),
      exit,
      logError,
    })).resolves.toBe('terminated');
    expect(logError).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
