import { expect, test } from 'vitest';
import { emptyPoints, MAX_LEVEL, MAX_POINTS_PER_STAT, type StatBlock } from './stats';
import {
  grantXp,
  itemTier,
  monsterXp,
  pvpXp,
  pvpXpAllowed,
  spendPoint,
  splitXp,
  xpToNext,
  type Progress,
} from './progression';

function progress(
  partial: {
    level?: number;
    xp?: number;
    unspent?: number;
    points?: Partial<StatBlock>;
  } = {},
): Progress {
  return {
    level: partial.level ?? 1,
    xp: partial.xp ?? 0,
    unspent: partial.unspent ?? 0,
    points: { ...emptyPoints(), ...partial.points },
  };
}

test('xp to next matches the published transitions', () => {
  const table: Array<[number, number]> = [
    [1, 100],
    [2, 282],
    [3, 519],
    [4, 800],
    [5, 1118],
    [10, 3162],
    [20, 8944],
    // floor(100 * 49 ** 1.5) is 34300. The context table's 35355 is floor(100 * 50 ** 1.5).
    [49, 34300],
  ];
  for (const [level, xp] of table) {
    expect(xpToNext(level)).toBe(xp);
  }
});

test('level 15 costs 5809, one floor of 100 * 15 ** 1.5', () => {
  expect(xpToNext(15)).toBe(5809);
  expect(xpToNext(15)).toBe(Math.floor(100 * 15 ** 1.5));
});

test('the curve is one floor of 100 * level ** 1.5 through level 49, then zero', () => {
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    expect(xpToNext(level)).toBe(Math.floor(100 * level ** 1.5));
  }
  expect(xpToNext(MAX_LEVEL)).toBe(0);
});

test('xpToNext rejects a level outside 1..50', () => {
  expect(() => xpToNext(0)).toThrow(RangeError);
  expect(() => xpToNext(51)).toThrow(RangeError);
});

test('monster xp is level * 10 plus the kind bonus', () => {
  expect(monsterXp(2, 'normal')).toBe(20);
  expect(monsterXp(2, 'elite')).toBe(25);
  expect(monsterXp(2, 'elite_boss')).toBe(70);
  expect(monsterXp(45, 'unique_boss')).toBe(550);
});

test('split xp floors the share and discards the remainder', () => {
  expect(splitXp(100, 3)).toBe(33);
  expect(splitXp(10, 3)).toBe(3);
  expect(splitXp(100, 1)).toBe(100);
});

test('split xp rejects zero participants', () => {
  expect(() => splitXp(100, 0)).toThrow(RangeError);
});

test('pvp xp follows the level gap', () => {
  expect(pvpXp(20, 20)).toBe(20);
  expect(pvpXp(20, 16)).toBe(10);
  expect(pvpXp(20, 13)).toBe(5);
  expect(pvpXp(20, 9)).toBe(0);
  expect(pvpXp(20, 23)).toBe(26);
});

test('pvp brackets include 1, 5, 6, and 10 levels below', () => {
  expect(pvpXp(20, 19)).toBe(10);
  expect(pvpXp(20, 15)).toBe(10);
  expect(pvpXp(20, 14)).toBe(5);
  expect(pvpXp(20, 10)).toBe(5);
  expect(pvpXp(12, 1)).toBe(0);
});

test('250 xp from level 1 reaches level 2 with 150 left and one unspent point', () => {
  const next = grantXp(progress(), 250);
  expect(next.level).toBe(2);
  expect(next.xp).toBe(150);
  expect(next.unspent).toBe(1);
});

test('one grant that covers two levels adds two unspent points', () => {
  const next = grantXp(progress(), xpToNext(1) + xpToNext(2));
  expect(next.level).toBe(3);
  expect(next.xp).toBe(0);
  expect(next.unspent).toBe(2);
});

test('level 50 ignores new xp and keeps xp at 0', () => {
  const capped = progress({ level: 50, xp: 0, unspent: 4, points: { body: 3 } });
  const next = grantXp(capped, 10_000);
  expect(next).toEqual(capped);
  expect(capped.xp).toBe(0);
  expect(capped.unspent).toBe(4);
  expect(capped.points.body).toBe(3);
});

test('reaching level 50 discards leftover xp', () => {
  const next = grantXp(progress({ level: 49 }), xpToNext(49) + 500);
  expect(next.level).toBe(50);
  expect(next.xp).toBe(0);
  expect(next.unspent).toBe(1);
});

test('a grant from level 1 to the cap awards one point per level gained', () => {
  const next = grantXp(progress(), 1_000_000);
  expect(next.level).toBe(50);
  expect(next.xp).toBe(0);
  expect(next.unspent).toBe(49);
});

test('grantXp does not mutate the input and rejects a negative amount', () => {
  const current = progress({ level: 1, xp: 40, unspent: 2, points: { reaction: 1 } });
  const snapshot = structuredClone(current);
  const next = grantXp(current, 10);
  expect(current).toEqual(snapshot);
  expect(next.xp).toBe(50);
  expect(next).not.toBe(current);
  expect(() => grantXp(current, -1)).toThrow(RangeError);
});

test('the eleventh point in one stat is stat_cap and does not spend unspent', () => {
  const current = progress({ unspent: 2, points: { body: MAX_POINTS_PER_STAT } });
  const snapshot = structuredClone(current);
  const result = spendPoint(current, 'body');
  expect(result).toEqual({ ok: false, code: 'stat_cap' });
  expect(current).toEqual(snapshot);
  expect(current.unspent).toBe(2);
});

test('spendPoint moves one unspent point into the stat', () => {
  const current = progress({ unspent: 1, points: { technique: 9 } });
  const result = spendPoint(current, 'technique');
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.unspent).toBe(0);
    expect(result.value.points.technique).toBe(10);
    expect(result.value.points.body).toBe(0);
  }
  expect(current.unspent).toBe(1);
  expect(current.points.technique).toBe(9);
});

test('spendPoint with no unspent points returns none', () => {
  const current = progress({ unspent: 0, points: { body: MAX_POINTS_PER_STAT } });
  expect(spendPoint(current, 'accuracy')).toEqual({ ok: false, code: 'none' });
  expect(spendPoint(current, 'body')).toEqual({ ok: false, code: 'none' });
});

test('item tiers unlock at 10, 20, 30, and 40', () => {
  expect(itemTier(1)).toBe(1);
  expect(itemTier(9)).toBe(1);
  expect(itemTier(10)).toBe(2);
  expect(itemTier(20)).toBe(3);
  expect(itemTier(30)).toBe(4);
  expect(itemTier(40)).toBe(5);
  expect(itemTier(50)).toBe(5);
});

test('pvp xp cooldown allows a repeat at 600_000 ms', () => {
  expect(pvpXpAllowed(undefined, 1_000_000)).toBe(true);
  const lastKillMs = 1_000_000;
  expect(pvpXpAllowed(lastKillMs, lastKillMs + 599_999)).toBe(false);
  expect(pvpXpAllowed(lastKillMs, lastKillMs + 600_000)).toBe(true);
});
