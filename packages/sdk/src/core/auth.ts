import type { Clock } from './clock.js';

/** Raw token as returned by the auth endpoint. */
export interface TokenResponse {
  accessToken: string;
  expiresAtMs: number;
}

/** A token plus an epoch, so we can tell who is holding a stale one. */
export interface Token extends TokenResponse {
  epoch: number;
}

export interface AuthManagerOptions {
  requestToken: (signal?: AbortSignal) => Promise<TokenResponse>;
  clock: Clock;
  /** Treat the token as expired this many ms before it really is. Defaults to 60000. */
  skewMs?: number;
}

/**
 * Manages the JWT lifecycle: caching, refreshing ahead of expiry,
 * collapsing concurrent refreshes into one, and epoch-based invalidation.
 */
export class AuthManager {
  private readonly options: Required<AuthManagerOptions>;
  private token: Token | undefined;
  private inflight: Promise<Token> | undefined;
  private epoch = 0;

  constructor(options: AuthManagerOptions) {
    this.options = { skewMs: 60_000, ...options };
  }

  /** Returns a valid token, fetching a fresh one when needed. */
  async getToken(signal?: AbortSignal): Promise<Token> {
    const current = this.token;
    if (current !== undefined && current.expiresAtMs - this.options.skewMs > this.options.clock.now()) {
      return current;
    }
    if (this.inflight !== undefined) return this.inflight;

    this.inflight = this.options
      .requestToken(signal)
      .then((response) => {
        this.epoch += 1;
        const token: Token = { ...response, epoch: this.epoch };
        this.token = token;
        return token;
      })
      .finally(() => {
        this.inflight = undefined;
      });

    return this.inflight;
  }

  /**
   * Invalidates the token, but only when the epoch passed in matches the current one.
   * That is what stops many requests hitting 401 together from triggering a chain of refreshes.
   */
  invalidate(epoch: number): void {
    if (this.token?.epoch === epoch) this.token = undefined;
  }
}
