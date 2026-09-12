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
  it('lần đầu thì đi lấy token', async () => {
    const { manager, requestToken } = makeManager();
    expect((await manager.getToken()).accessToken).toBe('token-1');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('lần sau dùng lại token đã cache', async () => {
    const { manager, requestToken } = makeManager();
    await manager.getToken();
    await manager.getToken();
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('refresh chủ động khi token còn dưới 60 giây', async () => {
    const { manager, requestToken, clock } = makeManager(120_000);
    await manager.getToken();
    clock.advance(61_000);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('nhiều lời gọi song song chỉ tạo một lần lấy token', async () => {
    const { manager, requestToken } = makeManager();
    const tokens = await Promise.all([manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken()]);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(new Set(tokens.map((token) => token.accessToken)).size).toBe(1);
  });

  it('invalidate đúng epoch thì lần sau lấy token mới', async () => {
    const { manager, requestToken } = makeManager();
    const token = await manager.getToken();
    manager.invalidate(token.epoch);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('invalidate với epoch cũ thì không xoá token mới', async () => {
    const { manager, requestToken } = makeManager();
    const first = await manager.getToken();
    manager.invalidate(first.epoch);
    const second = await manager.getToken();
    manager.invalidate(first.epoch);
    const third = await manager.getToken();
    expect(third.accessToken).toBe(second.accessToken);
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('lấy token thất bại thì không giữ lại promise hỏng', async () => {
    const clock = new FakeClock();
    const requestToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('server bận'))
      .mockResolvedValueOnce({ accessToken: 'token-ok', expiresAtMs: clock.now() + 3_600_000 });
    const manager = new AuthManager({ requestToken, clock });
    await expect(manager.getToken()).rejects.toThrow('server bận');
    expect((await manager.getToken()).accessToken).toBe('token-ok');
  });
});
