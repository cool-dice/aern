const RECONNECT_DELAYS_MS = [200, 400, 800, 1600, 3000] as const;

/** Delay for a 1-based attempt. Attempt 6 and later stay at 3000 ms. */
export function nextDelay(attempt: number): number {
  const index = Math.floor(attempt) - 1;
  if (!Number.isFinite(index) || index <= 0) {
    return RECONNECT_DELAYS_MS[0];
  }
  if (index >= RECONNECT_DELAYS_MS.length) {
    return RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1] ?? 3000;
  }
  return RECONNECT_DELAYS_MS[index] ?? 3000;
}

export interface ReconnectAttempts {
  readonly attempt: number;
  /** Counts a failure and returns the delay for that attempt. */
  fail(): number;
  /** A successful connect resets the attempt counter. */
  succeed(): void;
}

export function createReconnectAttempts(): ReconnectAttempts {
  let attempt = 0;
  return {
    get attempt() {
      return attempt;
    },
    fail() {
      attempt += 1;
      return nextDelay(attempt);
    },
    succeed() {
      attempt = 0;
    },
  };
}
