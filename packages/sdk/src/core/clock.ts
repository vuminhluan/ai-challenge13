/** Trừu tượng hoá thời gian để test không phải chờ thật. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Clock dùng đồng hồ và timer thật của hệ thống. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason ?? new Error('Aborted'));
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Aborted'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};
