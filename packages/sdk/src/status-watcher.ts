import type { Clock } from './core/clock.js';
import type { Claim, ClaimStatus, StatusListener, Unsubscribe, WatchOptions } from './types.js';

const TERMINAL: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>(['APPROVED', 'REJECTED']);

export interface WatcherDeps {
  fetchClaim: (signal: AbortSignal) => Promise<Claim>;
  clock: Clock;
}

/**
 * Poll trạng thái một hồ sơ cho tới khi có quyết định cuối.
 *
 * Vòng poll là một timer đang hoạt động, mà timer đang hoạt động giữ event loop
 * của Node sống. Vì vậy hàm này luôn trả về hàm dừng, tự dừng khi tới trạng thái
 * cuối, và dừng khi vượt `maxDurationMs`.
 */
export function watchClaimStatus(
  deps: WatcherDeps,
  listener: StatusListener,
  options: WatchOptions = {},
): Unsubscribe {
  const intervalMs = options.intervalMs ?? 2000;
  const maxDurationMs = options.maxDurationMs ?? 300_000;
  const controller = new AbortController();
  const startedAt = deps.clock.now();
  let previous: ClaimStatus | undefined = options.initialStatus;
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
  };

  void (async () => {
    while (!stopped) {
      try {
        const claim = await deps.fetchClaim(controller.signal);
        if (stopped) return;

        const isFirstObservation = previous === undefined;
        const changed = claim.status !== previous;
        previous = claim.status;

        if (changed && (!isFirstObservation || TERMINAL.has(claim.status))) {
          listener(claim.status, claim);
        }
        if (TERMINAL.has(claim.status)) {
          stop();
          return;
        }
      } catch (error) {
        if (stopped) return;
        options.onError?.(error);
      }

      if (deps.clock.now() - startedAt >= maxDurationMs) {
        stop();
        return;
      }
      try {
        await deps.clock.sleep(intervalMs, controller.signal);
      } catch {
        return;
      }
    }
  })();

  return stop;
}
