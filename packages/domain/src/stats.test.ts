import { expect, test } from 'vitest';
import {
  CAP_CLEAN,
  CAP_NORMAL,
  CAP_TEMPORARY,
  CREATION_STAT_POINTS,
  MAX_LEVEL,
  MAX_POINTS_PER_STAT,
  STAT_BASE,
  STAT_IDS,
  applyCap,
  cellsPerOd,
  damageMultiplier,
  derive,
  emptyPoints,
  type StatBlock,
} from './stats';

function block(partial: Partial<StatBlock> = {}): StatBlock {
  return { ...emptyPoints(), ...partial };
}

test('stat constants match the creation caps', () => {
  expect(STAT_IDS).toEqual(['body', 'reaction', 'accuracy', 'will', 'perception', 'technique']);
  expect(STAT_BASE).toBe(5);
  expect(CREATION_STAT_POINTS).toBe(20);
  expect(MAX_POINTS_PER_STAT).toBe(10);
  expect(CAP_NORMAL).toBe(20);
  expect(CAP_CLEAN).toBe(25);
  expect(CAP_TEMPORARY).toBe(30);
  expect(MAX_LEVEL).toBe(50);
});

test('emptyPoints is a fresh zero allocation', () => {
  const first = emptyPoints();
  const second = emptyPoints();
  expect(first).toEqual({
    body: 0,
    reaction: 0,
    accuracy: 0,
    will: 0,
    perception: 0,
    technique: 0,
  });
  expect(first).not.toBe(second);
});

test('HP is body * 10 + level * 5', () => {
  expect(derive({ stats: block({ body: 10 }), level: 1, totalWeightKg: 0 }).hp).toBe(105);
  expect(derive({ stats: block({ body: 18 }), level: 50, totalWeightKg: 0 }).hp).toBe(430);
});

test('level outside 1..50 throws RangeError', () => {
  expect(() => derive({ stats: block(), level: 0, totalWeightKg: 0 })).toThrow(RangeError);
  expect(() => derive({ stats: block(), level: 51, totalWeightKg: 0 })).toThrow(RangeError);
  expect(() => derive({ stats: block(), level: -1, totalWeightKg: 0 })).toThrow(RangeError);
});

test('will sets the OD limit and twice that for NN', () => {
  const will10 = derive({ stats: block({ will: 10 }), level: 1, totalWeightKg: 0 });
  expect(will10.odLimit).toBe(10);
  expect(will10.nnLimit).toBe(20);

  const will16 = derive({ stats: block({ will: 16 }), level: 1, totalWeightKg: 0 });
  expect(will16.odLimit).toBe(16);
  expect(will16.nnLimit).toBe(32);
});

test('OD regen is 1 + reaction / 5 and is not rounded', () => {
  expect(
    derive({ stats: block({ reaction: 0 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(1);
  expect(
    derive({ stats: block({ reaction: 10 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(3);
  expect(
    derive({ stats: block({ reaction: 13 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(3.6);
  expect(
    derive({ stats: block({ reaction: 14 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(3.8);
  expect(
    derive({ stats: block({ reaction: 15 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(4);
  expect(
    derive({ stats: block({ reaction: 25 }), level: 1, totalWeightKg: 0 }).odRegenPerSecond,
  ).toBe(6);
});

test('step and run distances follow reaction thresholds', () => {
  expect(cellsPerOd(0)).toBe(1);
  expect(cellsPerOd(14)).toBe(1);
  expect(cellsPerOd(15)).toBe(2);
  expect(cellsPerOd(24)).toBe(2);
  expect(cellsPerOd(25)).toBe(3);

  const slow = derive({ stats: block({ reaction: 14 }), level: 1, totalWeightKg: 0 });
  expect(slow.cellsPerStep).toBe(1);
  expect(slow.cellsPerRun).toBe(4);
  expect(slow.runOdCost).toBe(3);

  const mid = derive({ stats: block({ reaction: 15 }), level: 1, totalWeightKg: 0 });
  expect(mid.cellsPerStep).toBe(2);
  expect(mid.cellsPerRun).toBe(6);
  expect(cellsPerOd(15)).toBe(2);

  const fast = derive({ stats: block({ reaction: 25 }), level: 1, totalWeightKg: 0 });
  expect(fast.cellsPerStep).toBe(3);
  expect(fast.cellsPerRun).toBe(8);
  expect(cellsPerOd(25)).toBe(3);
  expect(fast.runOdCost).toBe(3);
});

test('overload penalty is floor of excess kilograms over 10', () => {
  const carry30 = block({ body: 4 });
  expect(derive({ stats: carry30, level: 1, totalWeightKg: 40 }).carryKg).toBe(30);
  expect(derive({ stats: carry30, level: 1, totalWeightKg: 40 }).overloadPenalty).toBe(1);
  expect(derive({ stats: carry30, level: 1, totalWeightKg: 39 }).overloadPenalty).toBe(0);
  expect(derive({ stats: carry30, level: 1, totalWeightKg: 20 }).overloadPenalty).toBe(0);
});

test('negative weight is treated as zero', () => {
  const derived = derive({ stats: block({ body: -10 }), level: 1, totalWeightKg: -5 });
  expect(derived.carryKg).toBe(-40);
  expect(derived.overloadPenalty).toBe(4);
});

test('carry weight is body * 5 + 10', () => {
  expect(derive({ stats: block({ body: 5 }), level: 1, totalWeightKg: 0 }).carryKg).toBe(35);
  expect(derive({ stats: block({ body: 10 }), level: 1, totalWeightKg: 0 }).carryKg).toBe(60);
});

test('evasion is reaction + perception - overload penalty', () => {
  const derived = derive({
    stats: block({ body: 4, reaction: 10, perception: 8 }),
    level: 1,
    totalWeightKg: 40,
  });
  expect(derived.overloadPenalty).toBe(1);
  expect(derived.evasion).toBe(17);
});

test('accuracy score adds floor(perception / 2) to the accuracy stat', () => {
  const derived = derive({
    stats: block({ accuracy: 10, perception: 7 }),
    level: 1,
    totalWeightKg: 0,
  });
  expect(derived.accuracyScore).toBe(13);
});

test('effect resist is will + floor(body / 2)', () => {
  const derived = derive({
    stats: block({ will: 10, body: 11 }),
    level: 1,
    totalWeightKg: 0,
  });
  expect(derived.effectResist).toBe(15);
});

test('vision radius is 5 + floor(perception / 2)', () => {
  const derived = derive({ stats: block({ perception: 7 }), level: 1, totalWeightKg: 0 });
  expect(derived.visionRadius).toBe(8);
});

test('initiative, hack, craft, and repair read reaction, perception, and technique', () => {
  const derived = derive({
    stats: block({ reaction: 12, perception: 4, technique: 9 }),
    level: 1,
    totalWeightKg: 0,
  });
  expect(derived.initiative).toBe(12);
  expect(derived.hack).toBe(13);
  expect(derived.craft).toBe(9);
  expect(derived.repair).toBe(9);
});

test('applyCap limits the base, then adds a temporary bonus, then caps at 30', () => {
  expect(applyCap(22, false, 0)).toBe(20);
  expect(applyCap(22, true, 0)).toBe(22);
  expect(applyCap(25, true, 10)).toBe(30);
  expect(applyCap(18, false, 0)).toBe(18);
  expect(applyCap(10, false, -8)).toBe(2);
  expect(applyCap(10, false, -20)).toBe(-10);
});

test('damageMultiplier is 1 + accuracyStat / 20', () => {
  expect(damageMultiplier(10)).toBe(1.5);
  expect(damageMultiplier(0)).toBe(1);
});
