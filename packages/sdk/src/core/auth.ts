import type { Clock } from './clock.js';

/** Token thô do endpoint auth trả về. */
export interface TokenResponse {
  accessToken: string;
  expiresAtMs: number;
}

/** Token kèm epoch để phát hiện ai đang cầm token cũ. */
export interface Token extends TokenResponse {
  epoch: number;
}

export interface AuthManagerOptions {
  requestToken: (signal?: AbortSignal) => Promise<TokenResponse>;
  clock: Clock;
  /** Coi token là hết hạn sớm hơn thời điểm thật bấy nhiêu ms. Mặc định 60000. */
  skewMs?: number;
}

/**
 * Quản lý vòng đời JWT: cache, refresh chủ động trước khi hết hạn,
 * gộp nhiều lần refresh đồng thời thành một, và vô hiệu hoá theo epoch.
 */
export class AuthManager {
  private readonly options: Required<AuthManagerOptions>;
  private token: Token | undefined;
  private inflight: Promise<Token> | undefined;
  private epoch = 0;

  constructor(options: AuthManagerOptions) {
    this.options = { skewMs: 60_000, ...options };
  }

  /** Trả về token còn hiệu lực, tự đi lấy mới nếu cần. */
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
   * Vô hiệu hoá token, nhưng chỉ khi epoch truyền vào đúng bằng epoch hiện tại.
   * Nhờ vậy nhiều request cùng gặp 401 không tạo ra chuỗi refresh dây chuyền.
   */
  invalidate(epoch: number): void {
    if (this.token?.epoch === epoch) this.token = undefined;
  }
}
