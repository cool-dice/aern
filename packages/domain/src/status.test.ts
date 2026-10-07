import { expect, test } from 'vitest';
import { derive, emptyPoints, type StatBlock } from './stats';
import {
  STATUS_DIFFICULTY,
  STATUS_DURATION_SECONDS,
  STATUS_IDS,
  statusDifficulty,
  statusDurationMs,
  statusResist,
  tickStatuses,
  tryApplyStatus,
  type StatusId,
  type StatusInstance,
} from './status';
import { REAL_SECOND_MS } from './time';

function block(partial: Partial<StatBlock> = {}): StatBlock {
  return { ...emptyPoints(), ...partial };
}

function apply(
  id: StatusId,
  existing: StatusInstance[] = [],
  overrides: { resist?: number; nowMs?: number; sourceId?: string } = {},
): { applied: boolean; statuses: StatusInstance[] } {
  return tryApplyStatus({
    resist: overrides.resist ?? 0,
    id,
    nowMs: overrides.nowMs ?? 0,
    sourceId: overrides.sourceId ?? 'src',
    existing,
  });
}

test('status difficulty is fixed for every id', () => {
  expect(STATUS_IDS).toEqual(['bleed', 'stun', 'burn', 'slow', 'poison', 'mutation']);
  const expected: Record<StatusId, number> = {
    bleed: 8,
    stun: 12,
    burn: 10,
    slow: 6,
    poison: 10,
    mutation: 14,
  };
  for (const id of STATUS_IDS) {
    expect(STATUS_DIFFICULTY[id]).toBe(expected[id]);
    expect(statusDifficulty(id)).toBe(expected[id]);
  }
});

test('status duration is the table seconds times 1000 ms', () => {
  const expectedSeconds: Record<StatusId, number> = {
    bleed: 10,
    stun: 3,
    burn: 5,
    slow: 5,
    poison: 10,
    mutation: 60,
  };
  for (const id of STATUS_IDS) {
    expect(STATUS_DURATION_SECONDS[id]).toBe(expectedSeconds[id]);
    expect(statusDurationMs(id)).toBe(expectedSeconds[id] * REAL_SECOND_MS);
    expect(statusDurationMs(id)).toBe(expectedSeconds[id] * 1000);
  }
});

test('resistance equal to bleed difficulty applies, one higher does not grow the list', () => {
  const existing: StatusInstance[] = [];
  const applied = tryApplyStatus({
    resist: 8,
    id: 'bleed',
    nowMs: 0,
    sourceId: 'wound',
    existing,
  });
  expect(applied.applied).toBe(true);
  expect(applied.statuses).toHaveLength(1);
  expect(applied.statuses[0]).toEqual({ id: 'bleed', expiresAtMs: 10_000, sourceId: 'wound' });

  const rejected = tryApplyStatus({
    resist: 9,
    id: 'bleed',
    nowMs: 0,
    sourceId: 'wound',
    existing,
  });
  expect(rejected.applied).toBe(false);
  expect(rejected.statuses).toBe(existing);
  expect(rejected.statuses).toHaveLength(0);
});

test('resistance rejects a status only when it is strictly greater than difficulty', () => {
  for (const id of STATUS_IDS) {
    const difficulty = statusDifficulty(id);
    const applied = apply(id, [], { resist: difficulty });
    expect(applied.applied).toBe(true);
    expect(applied.statuses).toHaveLength(1);

    const existing: StatusInstance[] = [];
    const rejected = apply(id, existing, { resist: difficulty + 1 });
    expect(rejected.applied).toBe(false);
    expect(rejected.statuses).toBe(existing);
  }
});

test('status resistance is derive effectResist and is not recomputed here', () => {
  const applies = { stats: block({ will: 8, body: 1 }), level: 1, totalWeightKg: 0 };
  const resists = { stats: block({ will: 7, body: 4 }), level: 1, totalWeightKg: 0 };
  const known = { stats: block({ will: 10, body: 11 }), level: 1, totalWeightKg: 0 };

  expect(statusResist(applies)).toBe(derive(applies).effectResist);
  expect(statusResist(applies)).toBe(8);
  expect(statusResist(resists)).toBe(derive(resists).effectResist);
  expect(statusResist(resists)).toBe(9);
  expect(statusResist(known)).toBe(derive(known).effectResist);
  expect(statusResist(known)).toBe(15);

  const applied = apply('bleed', [], { resist: statusResist(applies) });
  expect(applied.applied).toBe(true);
  const rejected = apply('bleed', applied.statuses, { resist: statusResist(resists) });
  expect(rejected.applied).toBe(false);
  expect(rejected.statuses).toBe(applied.statuses);
});

test('burn lasts 5 seconds from now 0 and is inactive at 5000', () => {
  const applied = apply('burn');
  expect(applied.statuses[0]?.expiresAtMs).toBe(5000);

  const before = tickStatuses(applied.statuses, 4999, 1);
  expect(before.active).toHaveLength(1);
  expect(before.hpLoss).toBe(2);

  const atExpiry = tickStatuses(applied.statuses, 5000, 1);
  expect(atExpiry.active).toEqual([]);
  expect(atExpiry.hpLoss).toBe(0);
  expect(atExpiry.stunned).toBe(false);
  expect(atExpiry.speedMultiplier).toBe(1);
});

test('reapplying bleed extends to the later expiry and does not shorten or stack', () => {
  const first = apply('bleed', [], { nowMs: 0, sourceId: 'a' });
  expect(first.statuses).toHaveLength(1);
  expect(first.statuses[0]?.expiresAtMs).toBe(10_000);

  const longer = apply('bleed', first.statuses, { nowMs: 2_000, sourceId: 'b' });
  expect(longer.applied).toBe(true);
  expect(longer.statuses).toHaveLength(1);
  expect(longer.statuses[0]).toEqual({ id: 'bleed', expiresAtMs: 12_000, sourceId: 'b' });

  const shorter = apply('bleed', longer.statuses, { nowMs: 0, sourceId: 'c' });
  expect(shorter.applied).toBe(true);
  expect(shorter.statuses).toBe(longer.statuses);
  expect(shorter.statuses).toHaveLength(1);
  expect(shorter.statuses[0]?.expiresAtMs).toBe(12_000);
  expect(shorter.statuses[0]?.sourceId).toBe('b');
});

test('bleed and burn together remove 3 HP per second and 1.5 per half second', () => {
  const bleed = apply('bleed');
  const both = apply('burn', bleed.statuses, { sourceId: 'flame' });
  expect(both.statuses).toHaveLength(2);

  expect(tickStatuses(both.statuses, 0, 1).hpLoss).toBe(3);
  expect(tickStatuses(both.statuses, 0, 0.5).hpLoss).toBe(1.5);
});

test('poison sets accuracy penalty to 1 and removes 1 HP per second', () => {
  const poisoned = apply('poison');
  const ticked = tickStatuses(poisoned.statuses, 0, 1);
  expect(ticked.accuracyPenalty).toBe(1);
  expect(ticked.hpLoss).toBe(1);
  expect(ticked.active).toHaveLength(1);

  expect(tickStatuses([], 0, 1).accuracyPenalty).toBe(0);
});

test('an active stun sets stunned and does not depend on the seconds fraction', () => {
  const stunned = apply('stun');
  const during = tickStatuses(stunned.statuses, 0, 0.1);
  expect(during.stunned).toBe(true);
  expect(during.hpLoss).toBe(0);
  expect(during.speedMultiplier).toBe(1);
  expect(during.accuracyPenalty).toBe(0);

  const expired = tickStatuses(stunned.statuses, 3_000, 1);
  expect(expired.stunned).toBe(false);
  expect(expired.active).toEqual([]);
});

test('slow halves speed while it is active and is 1 otherwise', () => {
  const slowed = apply('slow');
  const during = tickStatuses(slowed.statuses, 0, 0.1);
  expect(during.speedMultiplier).toBe(0.5);
  expect(during.hpLoss).toBe(0);
  expect(during.stunned).toBe(false);

  expect(tickStatuses([], 0, 1).speedMultiplier).toBe(1);
  expect(tickStatuses(slowed.statuses, 5_000, 1).speedMultiplier).toBe(1);
});

test('mutation stays active without changing combat numbers', () => {
  const mutated = apply('mutation');
  expect(mutated.statuses[0]?.expiresAtMs).toBe(60_000);
  const ticked = tickStatuses(mutated.statuses, 0, 1);
  expect(ticked.active).toEqual(mutated.statuses);
  expect(ticked.hpLoss).toBe(0);
  expect(ticked.accuracyPenalty).toBe(0);
  expect(ticked.speedMultiplier).toBe(1);
  expect(ticked.stunned).toBe(false);
});

test('tryApplyStatus does not mutate the existing list', () => {
  const existing: StatusInstance[] = [{ id: 'bleed', expiresAtMs: 4_000, sourceId: 'old' }];
  const snapshot = existing.map((status) => ({ ...status }));
  const added = apply('burn', existing, { sourceId: 'flame' });
  expect(existing).toEqual(snapshot);
  expect(added.statuses).not.toBe(existing);
  expect(added.statuses[0]).toBe(existing[0]);
  expect(added.statuses[1]).toEqual({ id: 'burn', expiresAtMs: 5_000, sourceId: 'flame' });
});
