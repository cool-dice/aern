import { expect, test } from 'vitest';
import { GAME_DAY_MS, SIM_TICK_MS, addMs, dayPhase, elapsedMs } from './time';

test('day phase splits a game day in half', () => {
  expect(dayPhase(0)).toBe('day');
  expect(dayPhase(GAME_DAY_MS / 2)).toBe('night');
  expect(dayPhase(GAME_DAY_MS)).toBe('day');
});

test('elapsedMs counts online time and floors at zero', () => {
  expect(elapsedMs(0, 10_000, 4_000)).toBe(6_000);
  expect(elapsedMs(0, 3_000, 9_000)).toBe(0);
});

test('SIM_TICK_MS is 100', () => {
  expect(SIM_TICK_MS).toBe(100);
});

test('addMs adds a duration', () => {
  expect(addMs(1_000, 250)).toBe(1_250);
});
