export interface Clock {
  now(): number;
  advance(ms: number): void;
}

/** Fixed clock for tests and the sim. Does not read `Date.now`. */
export function manualClock(startMs: number): Clock {
  let currentMs = startMs;
  return {
    now(): number {
      return currentMs;
    },
    advance(ms: number): void {
      currentMs += ms;
    },
  };
}
