import { expect, test } from 'vitest';
import {
  GOLD_COEFFICIENT,
  UNIQUE_COMPONENT_CHANCE,
  gearItemLevel,
  goldAmount,
  openChest,
  rollLoot,
  type LootEntry,
} from './loot';
import { mulberry32, type Rng } from './rng';

function sequenceRng(ints: number[], units: number[] = []): Rng {
  let intIndex = 0;
  let unitIndex = 0;
  return {
    nextInt(maxExclusive: number): number {
      const value = ints[intIndex];
      intIndex += 1;
      if (value === undefined || value < 0 || value >= maxExclusive) {
        throw new Error(`scripted nextInt(${maxExclusive}) got ${String(value)}`);
      }
      return value;
    },
    nextUnit(): number {
      const value = units[unitIndex];
      unitIndex += 1;
      if (value === undefined) {
        throw new Error('scripted nextUnit exhausted');
      }
      return value;
    },
  };
}

test('gold coefficients match monster types', () => {
  expect(GOLD_COEFFICIENT).toEqual({
    pack: 0.5,
    pair: 1,
    solo: 1,
    air: 1,
    turret: 1.5,
    anomaly: 1,
    elite: 3,
    boss: 10,
  });
  expect(UNIQUE_COMPONENT_CHANCE).toEqual({ elite: 0.2, unique: 0.3 });
});

test('rat level 2 pack gold is 1 or 3 from the 1..3 roll', () => {
  expect(goldAmount(2, GOLD_COEFFICIENT.pack, sequenceRng([0]))).toBe(1);
  expect(goldAmount(2, 0.5, sequenceRng([2]))).toBe(3);
});

test('boss level 45 gold is 450 or 1350 from the 1..3 roll', () => {
  expect(goldAmount(45, GOLD_COEFFICIENT.boss, sequenceRng([0]))).toBe(450);
  expect(goldAmount(45, 10, sequenceRng([2]))).toBe(1350);
});

test('gold amount is at least 1', () => {
  expect(goldAmount(0, 0.5, sequenceRng([0]))).toBe(1);
});

test('chance 0 drops nothing and chance 1 stays inside min..max', () => {
  const none = rollLoot({
    entries: [{ itemId: 'metal', chance: 0, min: 1, max: 3, kind: 'resource' }],
    rng: mulberry32(1),
    eliteQuantityMultiplier: 1,
  });
  expect(none).toEqual([]);

  const seen = new Set<number>();
  for (let seed = 1; seed <= 40; seed += 1) {
    const stacks = rollLoot({
      entries: [{ itemId: 'metal', chance: 1, min: 1, max: 3, kind: 'resource' }],
      rng: mulberry32(seed),
      eliteQuantityMultiplier: 1,
    });
    expect(stacks).toHaveLength(1);
    const qty = stacks[0]?.qty ?? -1;
    expect(qty).toBeGreaterThanOrEqual(1);
    expect(qty).toBeLessThanOrEqual(3);
    seen.add(qty);
  }
  expect(seen.size).toBeGreaterThan(1);
});

test('a roll equal to the chance does not drop', () => {
  const miss = rollLoot({
    entries: [{ itemId: 'metal', chance: 0.3, min: 1, max: 1, kind: 'resource' }],
    rng: sequenceRng([], [0.3]),
    eliteQuantityMultiplier: 1,
  });
  expect(miss).toEqual([]);

  const hit = rollLoot({
    entries: [{ itemId: 'metal', chance: 0.3, min: 2, max: 2, kind: 'resource' }],
    rng: sequenceRng([0], [0.299]),
    eliteQuantityMultiplier: 1,
  });
  expect(hit).toEqual([{ itemId: 'metal', qty: 2 }]);
});

test('elite multiplier 3 triples metal and does not scale gold', () => {
  const metal: LootEntry = { itemId: 'metal', chance: 1, min: 1, max: 3, kind: 'resource' };
  const normal = rollLoot({
    entries: [metal],
    rng: sequenceRng([1], [0]),
    eliteQuantityMultiplier: 1,
  });
  const elite = rollLoot({
    entries: [metal],
    rng: sequenceRng([1], [0]),
    eliteQuantityMultiplier: 3,
  });
  expect(normal[0]?.qty).toBe(2);
  expect(elite[0]?.qty).toBe(6);

  const gold = rollLoot({
    entries: [{ itemId: 'gold', chance: 1, min: 5, max: 5, kind: 'gold' }],
    rng: sequenceRng([0], [0]),
    eliteQuantityMultiplier: 3,
  });
  expect(gold).toEqual([{ itemId: 'gold', qty: 5 }]);
});

test('unique gear is skipped and unique echoes, paths, and components drop', () => {
  const stacks = rollLoot({
    entries: [
      { itemId: 'ancient_hammer', chance: 1, min: 1, max: 1, kind: 'gear', grade: 'unique' },
      { itemId: 'gear_unique', chance: 1, min: 1, max: 1, kind: 'gear' },
      { itemId: 'relic_unique', chance: 1, min: 1, max: 1, kind: 'gear', grade: 'unique' },
      { itemId: 'echo_unique', chance: 1, min: 1, max: 1, kind: 'echo', grade: 'unique' },
      { itemId: 'path_unique', chance: 1, min: 1, max: 1, kind: 'path', grade: 'unique' },
      { itemId: 'unique_component', chance: 1, min: 1, max: 1, kind: 'component', grade: 'unique' },
      { itemId: 'guardian_core', chance: 1, min: 1, max: 2, kind: 'component' },
    ],
    rng: sequenceRng([0, 0, 0, 0, 0, 1], [0, 0, 0, 0]),
    eliteQuantityMultiplier: 1,
    monsterLevel: 20,
  });
  expect(stacks.map((stack) => stack.itemId)).toEqual([
    'echo_unique',
    'path_unique',
    'unique_component',
    'guardian_core',
  ]);
  expect(stacks[0]?.itemLevel).toBe(gearItemLevel(20, sequenceRng([0])));
  expect(stacks[1]?.itemLevel).toBe(gearItemLevel(20, sequenceRng([0])));
  expect(stacks[2]?.itemLevel).toBeUndefined();
  expect(stacks[3]?.qty).toBe(2);
});

test('regional extra entries roll after the base list', () => {
  const stacks = rollLoot({
    entries: [{ itemId: 'metal', chance: 1, min: 1, max: 1, kind: 'resource' }],
    extra: [{ itemId: 'spores', chance: 1, min: 2, max: 2, kind: 'resource' }],
    rng: sequenceRng([0, 0], [0, 0]),
    eliteQuantityMultiplier: 1,
  });
  expect(stacks).toEqual([
    { itemId: 'metal', qty: 1 },
    { itemId: 'spores', qty: 2 },
  ]);
});

test('item level at monster 2 is at least 1 and at monster 50 is at most 50', () => {
  expect(gearItemLevel(2, sequenceRng([0]))).toBe(1);
  expect(gearItemLevel(50, sequenceRng([6]))).toBe(50);
  for (let offset = 0; offset <= 6; offset += 1) {
    expect(gearItemLevel(2, sequenceRng([offset]))).toBeGreaterThanOrEqual(1);
    expect(gearItemLevel(50, sequenceRng([offset]))).toBeLessThanOrEqual(50);
  }
  for (let seed = 1; seed <= 30; seed += 1) {
    expect(gearItemLevel(2, mulberry32(seed))).toBeGreaterThanOrEqual(1);
    expect(gearItemLevel(50, mulberry32(seed))).toBeLessThanOrEqual(50);
  }
});

test('same seed yields the same loot list', () => {
  const entries: LootEntry[] = [
    { itemId: 'gold', chance: 1, min: 4, max: 6, kind: 'gold' },
    { itemId: 'metal', chance: 0.3, min: 1, max: 3, kind: 'resource' },
    { itemId: 'leather', chance: 0.2, min: 1, max: 2, kind: 'resource' },
    { itemId: 'gear_rare', chance: 0.5, min: 1, max: 1, kind: 'gear', grade: 'rare' },
    { itemId: 'gear_unique', chance: 1, min: 1, max: 1, kind: 'gear', grade: 'unique' },
    { itemId: 'echo_unique', chance: 0.4, min: 1, max: 1, kind: 'echo', grade: 'unique' },
    { itemId: 'path_grade_1', chance: 0.1, min: 1, max: 1, kind: 'path' },
  ];
  const roll = (seed: number) =>
    rollLoot({
      entries,
      rng: mulberry32(seed),
      eliteQuantityMultiplier: 3,
      monsterLevel: 12,
    });
  expect(roll(42)).toEqual(roll(42));
  expect(roll(42)).not.toEqual(roll(43));
});

test('rare chest without a key fails and with one key returns gold plus 2-3 gear', () => {
  const lockedRng = sequenceRng([0]);
  const locked = openChest({ tier: 'rare', keys: 0, regionLevel: 4, rng: lockedRng });
  expect(locked).toEqual({ ok: false, code: 'keys' });

  const opened = openChest({
    tier: 'rare',
    keys: 1,
    regionLevel: 4,
    rng: sequenceRng([0, 1, 0, 60, 99]),
  });
  expect(opened.ok).toBe(true);
  if (!opened.ok) {
    return;
  }
  expect(opened.value.map((stack) => stack.itemId)).toEqual([
    'gold',
    'gear_rare',
    'gear_epic',
    'gear_epic',
  ]);
  expect(opened.value[0]?.qty).toBe(200);
  for (const stack of opened.value.slice(1)) {
    expect(stack.qty).toBe(1);
    expect(stack.itemLevel).toBe(4);
    expect(stack.itemId).not.toBe('gear_unique');
  }

  for (let seed = 1; seed <= 25; seed += 1) {
    const result = openChest({ tier: 'rare', keys: 1, regionLevel: 7, rng: mulberry32(seed) });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      continue;
    }
    const gear = result.value.filter((stack) => stack.itemId.startsWith('gear_'));
    expect(result.value[0]?.itemId).toBe('gold');
    expect(gear.length).toBeGreaterThanOrEqual(2);
    expect(gear.length).toBeLessThanOrEqual(3);
    expect(result.value).toHaveLength(1 + gear.length);
    const goldQty = result.value[0]?.qty ?? 0;
    expect(goldQty).toBeGreaterThanOrEqual(50 * 7);
    expect(goldQty).toBeLessThanOrEqual(200 * 7);
    for (const stack of gear) {
      expect(stack.itemId === 'gear_rare' || stack.itemId === 'gear_epic').toBe(true);
      expect(stack.itemLevel).toBe(7);
    }
  }
});

test('common chest needs no key and epic chest needs two plus a unique component', () => {
  const common = openChest({
    tier: 'common',
    keys: 0,
    regionLevel: 2,
    rng: sequenceRng([0, 0, 0]),
  });
  expect(common).toEqual({
    ok: true,
    value: [
      { itemId: 'gold', qty: 20 },
      { itemId: 'gear_common', qty: 1, itemLevel: 2 },
    ],
  });

  const short = openChest({ tier: 'epic', keys: 1, regionLevel: 10, rng: sequenceRng([]) });
  expect(short).toEqual({ ok: false, code: 'keys' });

  const epic = openChest({
    tier: 'epic',
    keys: 2,
    regionLevel: 10,
    rng: sequenceRng([0, 0, 0, 50, 99]),
  });
  expect(epic.ok).toBe(true);
  if (!epic.ok) {
    return;
  }
  expect(epic.value.map((stack) => stack.itemId)).toEqual([
    'gold',
    'gear_epic',
    'gear_epic',
    'gear_epic',
    'unique_component',
  ]);
  expect(epic.value[0]?.qty).toBe(2000);
  expect(epic.value[4]).toEqual({ itemId: 'unique_component', qty: 1 });
});
