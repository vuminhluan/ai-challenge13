/** Time abstraction, so tests never have to wait for real time. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Clock backed by the system clock and real timers. */
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
