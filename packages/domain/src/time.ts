export const SIM_TICK_MS = 100;
export const REAL_SECOND_MS = 1000;
export const GAME_DAY_MS = 2 * 60 * 60 * 1000;

export type DayPhase = 'day' | 'night';

export function dayPhase(nowMs: number): DayPhase {
  const position = nowMs % GAME_DAY_MS;
  if (position < GAME_DAY_MS / 2) {
    return 'day';
  }
  return 'night';
}

export function addMs(startMs: number, durationMs: number): number {
  return startMs + durationMs;
}

export function elapsedMs(startMs: number, nowMs: number, frozenMs: number): number {
  return Math.max(0, nowMs - startMs - frozenMs);
}
