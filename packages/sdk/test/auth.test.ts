import { describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../src/core/auth.js';
import { FakeClock } from './helpers.js';

const makeManager = (expiresInMs = 3_600_000) => {
  const clock = new FakeClock();
  let counter = 0;
  const requestToken = vi.fn(async () => {
    counter += 1;
    return { accessToken: `token-${counter}`, expiresAtMs: clock.now() + expiresInMs };
  });
  return { clock, requestToken, manager: new AuthManager({ requestToken, clock }) };
};

describe('AuthManager', () => {
  it('fetches a token on the first call', async () => {
    const { manager, requestToken } = makeManager();
    expect((await manager.getToken()).accessToken).toBe('token-1');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached token afterwards', async () => {
    const { manager, requestToken } = makeManager();
    await manager.getToken();
    await manager.getToken();
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes proactively with under 60 seconds left', async () => {
    const { manager, requestToken, clock } = makeManager(120_000);
    await manager.getToken();
    clock.advance(61_000);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('concurrent calls trigger a single token fetch', async () => {
    const { manager, requestToken } = makeManager();
    const tokens = await Promise.all([manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken()]);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(new Set(tokens.map((token) => token.accessToken)).size).toBe(1);
  });

  it('invalidating the current epoch forces a fresh token next time', async () => {
    const { manager, requestToken } = makeManager();
    const token = await manager.getToken();
    manager.invalidate(token.epoch);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('invalidating a stale epoch does not discard the newer token', async () => {
    const { manager, requestToken } = makeManager();
    const first = await manager.getToken();
    manager.invalidate(first.epoch);
    const second = await manager.getToken();
    manager.invalidate(first.epoch);
    const third = await manager.getToken();
    expect(third.accessToken).toBe(second.accessToken);
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('a failed token fetch does not leave a broken promise cached', async () => {
    const clock = new FakeClock();
    const requestToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('server busy'))
      .mockResolvedValueOnce({ accessToken: 'token-ok', expiresAtMs: clock.now() + 3_600_000 });
    const manager = new AuthManager({ requestToken, clock });
    await expect(manager.getToken()).rejects.toThrow('server busy');
    expect((await manager.getToken()).accessToken).toBe('token-ok');
  });
});
