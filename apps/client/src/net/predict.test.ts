import { cellsPerOd } from '@rift/domain/stats';
import { expect, test } from 'vitest';
import {
  PREDICTION_BUFFER_MS,
  applyLocal,
  extrapolate,
  interpolate,
  interpolateEntity,
  noteLocal,
  reconcile,
  type PendingStep,
} from './predict';

function step(overrides: Partial<PendingStep> = {}): PendingStep {
  return {
    seq: 1,
    dir: 'n',
    atMs: 0,
    running: false,
    ...overrides,
  };
}

test('server start cell plus one fresh north step shifts y by 1', () => {
  expect(PREDICTION_BUFFER_MS).toBe(500);
  expect(cellsPerOd(10)).toBe(1);
  const serverCell = { x: 0, y: 0 };
  const pending = [step()];
  const result = reconcile({
    serverCell,
    pending,
    nowMs: 100,
    reaction: 10,
    inCombat: true,
    od: 5,
  });
  expect(result.cell).toEqual({ x: 0, y: -1 });
  expect(result.pending).toEqual(pending);
  expect(serverCell).toEqual({ x: 0, y: 0 });
  expect(pending).toEqual([step()]);
});

test('a pending step older than 500 ms is not applied', () => {
  const kept = reconcile({
    serverCell: { x: 2, y: 3 },
    pending: [step({ atMs: 0 })],
    nowMs: 500,
    reaction: 10,
    inCombat: true,
    od: 4,
  });
  expect(kept.cell).toEqual({ x: 2, y: 2 });
  expect(kept.pending).toHaveLength(1);

  const dropped = reconcile({
    serverCell: { x: 2, y: 3 },
    pending: [step({ atMs: 0 })],
    nowMs: 501,
    reaction: 10,
    inCombat: true,
    od: 4,
  });
  expect(dropped.cell).toEqual({ x: 2, y: 3 });
  expect(dropped.pending).toEqual([]);
});

test('a domain move error drops that step and a run spends 3 OD', () => {
  const noOd = reconcile({
    serverCell: { x: 0, y: 0 },
    pending: [step(), step({ seq: 2, atMs: 10 })],
    nowMs: 20,
    reaction: 10,
    inCombat: true,
    od: 1,
  });
  expect(noOd.cell).toEqual({ x: 0, y: -1 });
  expect(noOd.pending.map((item) => item.seq)).toEqual([1]);

  const run = reconcile({
    serverCell: { x: 0, y: 0 },
    pending: [step({ running: true })],
    nowMs: 0,
    reaction: 10,
    inCombat: true,
    od: 3,
  });
  expect(run.cell).toEqual({ x: 0, y: -4 });
  expect(run.pending).toHaveLength(1);

  const short = reconcile({
    serverCell: { x: 0, y: 0 },
    pending: [step({ running: true })],
    nowMs: 0,
    reaction: 10,
    inCombat: true,
    od: 2,
  });
  expect(short.cell).toEqual({ x: 0, y: 0 });
  expect(short.pending).toEqual([]);
});

test('noteLocal ignores actions that are not step or run', () => {
  const pending = [step()];
  expect(noteLocal(pending, 'attack_melee', { seq: 2, atMs: 5 })).toBe(pending);
  expect(noteLocal(pending, 'use_item', { seq: 2, atMs: 5 })).toBe(pending);
  expect(noteLocal(pending, 'step', { seq: 2, atMs: 5 })).toBe(pending);

  expect(noteLocal(pending, 'step_ne', { seq: 2, atMs: 5 })).toEqual([
    step(),
    { seq: 2, dir: 'ne', atMs: 5, running: false },
  ]);
  expect(noteLocal([], 'run', { seq: 3, atMs: 6, dir: 's' })).toEqual([
    { seq: 3, dir: 's', atMs: 6, running: true },
  ]);
});

test('applyLocal leaves hp unchanged for an attack', () => {
  const state = { hp: 12, cell: { x: 1, y: 1 } };
  expect(applyLocal('attack_melee', state)).toEqual({ hp: 12, cell: { x: 1, y: 1 } });
  expect(applyLocal('attack_ranged', state).hp).toBe(12);
  expect(state.hp).toBe(12);
});

test('interpolate blends the midpoint and extrapolate stops after 200 ms', () => {
  expect(interpolate({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5)).toEqual({ x: 5, y: 0 });
  expect(interpolate({ x: 0, y: 0 }, { x: 10, y: 0 }, -1)).toEqual({ x: 0, y: 0 });
  expect(interpolate({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toEqual({ x: 10, y: 0 });

  const segment = { previous: { x: 0, y: 0 }, latest: { x: 10, y: 0 }, spanMs: 100 };
  expect(extrapolate({ ...segment, lateMs: 50 })).toEqual({ x: 15, y: 0 });
  expect(extrapolate({ ...segment, lateMs: 200 })).toEqual({ x: 30, y: 0 });
  expect(extrapolate({ ...segment, lateMs: 400 })).toEqual({ x: 30, y: 0 });
  expect(extrapolate({ ...segment, lateMs: 0 })).toEqual({ x: 10, y: 0 });

  const samples = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, fromMs: 0, toMs: 100 };
  expect(interpolateEntity({ ...samples, nowMs: 150 })).toEqual({ x: 5, y: 0 });
  expect(interpolateEntity({ ...samples, nowMs: 250 })).toEqual({ x: 15, y: 0 });
  expect(interpolateEntity({ ...samples, nowMs: 500 })).toEqual({ x: 30, y: 0 });
});
