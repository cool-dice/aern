import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  CRAFT_LANGUAGE_MIN,
  SKILL_MASTER_GOLD,
  SKILL_OPEN_GOLD,
  buySkillLevel,
  craftDurationMs,
  gradeWeights,
  maxItemLevel,
  rollGrade,
  salvage,
  startCraft,
  trainSkill,
  type CraftSkill,
  type MaterialQuality,
  type SkillState,
  type StartCraftInput,
  type StationId,
} from './craft';
import { mulberry32, type Rng } from './rng';

const NORMAL_WEIGHTS: Record<SkillState['level'], Record<string, number>> = {
  1: { common: 70, rare: 20, epic: 8, unique: 2 },
  2: { common: 65, rare: 22, epic: 10, unique: 3 },
  3: { common: 60, rare: 24, epic: 12, unique: 4 },
  4: { common: 55, rare: 25, epic: 14, unique: 6 },
  5: { common: 50, rare: 25, epic: 16, unique: 9 },
  6: { common: 45, rare: 25, epic: 18, unique: 12 },
  7: { common: 40, rare: 24, epic: 20, unique: 16 },
  8: { common: 35, rare: 23, epic: 22, unique: 20 },
  9: { common: 30, rare: 22, epic: 24, unique: 24 },
  10: { common: 25, rare: 20, epic: 25, unique: 30 },
};

function scripted(value: number, seen: number[] = []): Rng {
  return {
    nextInt(maxExclusive: number): number {
      seen.push(maxExclusive);
      if (value >= maxExclusive) {
        throw new Error(`scripted roll ${String(value)} is outside [0, ${String(maxExclusive)})`);
      }
      return value;
    },
    nextUnit(): number {
      return 0;
    },
  };
}

function craftInput(overrides: Partial<StartCraftInput> = {}): StartCraftInput {
  return {
    skill: { level: 1, xp: 0 },
    station: 'forge',
    recipeSkill: 'weaponsmith',
    recipeStation: 'forge',
    languageUpy: CRAFT_LANGUAGE_MIN,
    inCityOrHub: true,
    inCombat: false,
    requestedItemLevel: 1,
    recipeMin: 1,
    recipeMax: 5,
    materials: { metal: 5 },
    need: { metal: 5 },
    uniqueComponent: false,
    hasUniqueComponent: false,
    forbidden: false,
    materialCostGold: 10,
    gold: 100,
    accelerate: false,
    alreadyAccelerated: false,
    rng: mulberry32(1),
    nowMs: 1_000_000,
    ...overrides,
  };
}

test('craft.ts does not import economy.ts', () => {
  const source = readFileSync(new URL('./craft.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/from\s+['"][^'"]*economy['"]/);
  expect(source).not.toMatch(/import\s*\(\s*['"][^'"]*economy['"]/);
});

test('normal grade weights snapshot every skill level', () => {
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
  expect(levels.map((level) => gradeWeights(level, 'normal'))).toEqual(
    levels.map((level) => NORMAL_WEIGHTS[level]),
  );
});

test('cleaned and pure shift common into rare and epic, never unique', () => {
  expect(gradeWeights(1, 'cleaned')).toEqual({ common: 65, rare: 25, epic: 8, unique: 2 });
  expect(gradeWeights(1, 'pure')).toEqual({ common: 60, rare: 25, epic: 13, unique: 2 });
  expect(gradeWeights(10, 'pure')).toEqual({ common: 15, rare: 25, epic: 30, unique: 30 });
  for (let level = 1; level <= 10; level += 1) {
    const normal = gradeWeights(level, 'normal');
    const cleaned = gradeWeights(level, 'cleaned');
    const pure = gradeWeights(level, 'pure');
    expect(cleaned).toEqual({
      common: normal.common - 5,
      rare: normal.rare + 5,
      epic: normal.epic,
      unique: normal.unique,
    });
    expect(pure).toEqual({
      common: normal.common - 10,
      rare: normal.rare + 5,
      epic: normal.epic + 5,
      unique: normal.unique,
    });
  }
});

test('gradeWeights returns a fresh object', () => {
  const weights = gradeWeights(1, 'normal');
  weights.common = 0;
  expect(gradeWeights(1, 'normal').common).toBe(70);
});

test('rollGrade walks common, rare, epic, unique on nextInt(sum)', () => {
  const weights = gradeWeights(1, 'normal');
  const seen: number[] = [];
  expect(rollGrade(weights, scripted(0, seen))).toBe('common');
  expect(seen).toEqual([100]);
  expect(rollGrade(weights, scripted(69))).toBe('common');
  expect(rollGrade(weights, scripted(70))).toBe('rare');
  expect(rollGrade(weights, scripted(89))).toBe('rare');
  expect(rollGrade(weights, scripted(90))).toBe('epic');
  expect(rollGrade(weights, scripted(97))).toBe('epic');
  expect(rollGrade(weights, scripted(98))).toBe('unique');
  expect(rollGrade(weights, scripted(99))).toBe('unique');
});

test('weights above 100 roll nextInt(10000) on scaled thresholds', () => {
  const seen: number[] = [];
  const weights = { common: 0, rare: 40, epic: 40, unique: 30 };
  expect(rollGrade(weights, scripted(9999, seen))).toBe('unique');
  expect(seen).toEqual([10_000]);
  expect(rollGrade(weights, scripted(0))).toBe('rare');
  expect(rollGrade(weights, scripted(3636))).toBe('epic');
});

test('seed 53 lands in the last 2% bucket and is unique', () => {
  expect(rollGrade(gradeWeights(1, 'normal'), mulberry32(53))).toBe('unique');
});

test('durations are fixed minutes: consumables 5, items by grade, relics 90 or 120', () => {
  expect(craftDurationMs('common', 'consumable')).toBe(300_000);
  expect(craftDurationMs('rare', 'consumable')).toBe(300_000);
  expect(craftDurationMs('unique', 'consumable')).toBe(300_000);
  expect(craftDurationMs('common', 'item')).toBe(600_000);
  expect(craftDurationMs('rare', 'item')).toBe(1_800_000);
  expect(craftDurationMs('epic', 'item')).toBe(3_600_000);
  expect(craftDurationMs('unique', 'item')).toBe(7_200_000);
  expect(craftDurationMs('common', 'relic')).toBe(5_400_000);
  expect(craftDurationMs('epic', 'relic')).toBe(5_400_000);
  expect(craftDurationMs('unique', 'relic')).toBe(7_200_000);
});

test('max item level is skill times 5', () => {
  expect(maxItemLevel(1)).toBe(5);
  expect(maxItemLevel(2)).toBe(10);
  expect(maxItemLevel(10)).toBe(50);
  expect(() => maxItemLevel(0)).toThrow(RangeError);
  expect(() => maxItemLevel(11)).toThrow(RangeError);
});

test('a common craft spends materials, awards 1 xp, and finishes in 10 minutes', () => {
  const input = craftInput();
  const result = startCraft(input);
  expect(result).toEqual({
    ok: true,
    value: {
      skill: { level: 1, xp: 1 },
      grade: 'common',
      itemLevel: 1,
      materials: {},
      gold: 100,
      readyAtMs: 1_000_000 + 600_000,
      accelerated: false,
    },
  });
  expect(input.materials).toEqual({ metal: 5 });
  expect(input.skill).toEqual({ level: 1, xp: 0 });
  expect(input.gold).toBe(100);
});

test('seed 53 without a boss component returns epic and does not spend a component', () => {
  const result = startCraft(
    craftInput({
      rng: mulberry32(53),
      uniqueComponent: false,
      hasUniqueComponent: false,
      materials: { metal: 5, unique_component: 1 },
      need: { metal: 5 },
    }),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.grade).toBe('epic');
  expect(result.value.skill).toEqual({ level: 2, xp: 0 });
  expect(result.value.materials).toEqual({ unique_component: 1 });
  expect(result.value.readyAtMs).toBe(1_000_000 + 3_600_000);
});

test('a unique roll spends the boss component only when the recipe has one and the crafter holds it', () => {
  const withComponent = startCraft(
    craftInput({
      rng: mulberry32(53),
      uniqueComponent: true,
      hasUniqueComponent: true,
      materials: { metal: 5, unique_component: 1 },
      need: { metal: 5, unique_component: 1 },
      kind: 'relic',
    }),
  );
  expect(withComponent).toEqual({
    ok: true,
    value: {
      skill: { level: 3, xp: 15 },
      grade: 'unique',
      itemLevel: 1,
      materials: {},
      gold: 100,
      readyAtMs: 1_000_000 + 7_200_000,
      accelerated: false,
    },
  });

  const namedBossPart = startCraft(
    craftInput({
      rng: mulberry32(1),
      uniqueComponent: true,
      hasUniqueComponent: true,
      uniqueComponentId: 'keeper_heart',
      materials: { metal: 5, keeper_heart: 1 },
      need: { metal: 5, keeper_heart: 1 },
    }),
  );
  expect(namedBossPart.ok).toBe(true);
  if (namedBossPart.ok) {
    expect(namedBossPart.value.grade).toBe('common');
    expect(namedBossPart.value.materials).toEqual({ keeper_heart: 1 });
  }

  const missing = startCraft(
    craftInput({
      rng: mulberry32(53),
      uniqueComponent: true,
      hasUniqueComponent: false,
      materials: { metal: 5, unique_component: 1 },
      need: { metal: 5, unique_component: 1 },
    }),
  );
  expect(missing.ok).toBe(true);
  if (missing.ok) {
    expect(missing.value.grade).toBe('epic');
    expect(missing.value.materials).toEqual({ unique_component: 1 });
  }
});

test('item level 6 at skill 1 is above the cap of 5', () => {
  expect(
    startCraft(
      craftInput({
        requestedItemLevel: 6,
        recipeMin: 1,
        recipeMax: 50,
      }),
    ),
  ).toEqual({ ok: false, code: 'level' });
});

test('recipe fork outside the skill cap is still a level error', () => {
  expect(
    startCraft(
      craftInput({
        skill: { level: 10, xp: 0 },
        requestedItemLevel: 4,
        recipeMin: 5,
        recipeMax: 20,
      }),
    ),
  ).toEqual({ ok: false, code: 'level' });
});

test('language 59 cannot craft, language 60 can', () => {
  expect(startCraft(craftInput({ languageUpy: 59 }))).toEqual({ ok: false, code: 'language' });
  expect(startCraft(craftInput({ languageUpy: 60 })).ok).toBe(true);
});

test('the station must be the one for that skill', () => {
  expect(startCraft(craftInput({ station: 'bench' }))).toEqual({ ok: false, code: 'station' });
  expect(
    startCraft(
      craftInput({
        station: 'bench',
        recipeStation: 'bench',
        recipeSkill: 'weaponsmith',
      }),
    ),
  ).toEqual({ ok: false, code: 'station' });
  const pairs = [
    ['weaponsmith', 'forge'],
    ['armorer', 'bench'],
    ['biotech', 'lab'],
    ['mechanic', 'workshop'],
    ['alchemist', 'alchemy'],
  ] as const satisfies ReadonlyArray<readonly [CraftSkill, StationId]>;
  for (const [recipeSkill, station] of pairs) {
    expect(startCraft(craftInput({ recipeSkill, recipeStation: station, station })).ok).toBe(true);
  }
});

test('combat and the open world both refuse a craft', () => {
  expect(startCraft(craftInput({ inCombat: true }))).toEqual({ ok: false, code: 'combat' });
  expect(startCraft(craftInput({ inCityOrHub: false, inCombat: true }))).toEqual({
    ok: false,
    code: 'zone',
  });
  expect(startCraft(craftInput({ inCityOrHub: false }))).toEqual({ ok: false, code: 'zone' });
});

test('echoes, paths, and relic shards are forbidden outputs', () => {
  expect(startCraft(craftInput({ forbidden: true }))).toEqual({ ok: false, code: 'forbidden' });
  expect(startCraft(craftInput({ outputId: 'echo' }))).toEqual({ ok: false, code: 'forbidden' });
  expect(startCraft(craftInput({ outputId: 'path' }))).toEqual({ ok: false, code: 'forbidden' });
  expect(startCraft(craftInput({ outputId: 'relic_shard' }))).toEqual({
    ok: false,
    code: 'forbidden',
  });
  const calls: number[] = [];
  expect(startCraft(craftInput({ forbidden: true, rng: scripted(0, calls) }))).toEqual({
    ok: false,
    code: 'forbidden',
  });
  expect(calls).toEqual([]);
});

test('short materials fail before the roll and do not change the stack', () => {
  const calls: number[] = [];
  const input = craftInput({
    materials: { metal: 4, wood: 2 },
    rng: scripted(0, calls),
  });
  expect(startCraft(input)).toEqual({ ok: false, code: 'materials' });
  expect(calls).toEqual([]);
  expect(input.materials).toEqual({ metal: 4, wood: 2 });
});

test('acceleration charges floor(half the material sum) once and halves a common 10 minutes', () => {
  const rushed = startCraft(
    craftInput({
      accelerate: true,
      materialCostGold: 10,
      gold: 100,
      nowMs: 1_000_000,
      rng: mulberry32(1),
    }),
  );
  expect(rushed).toEqual({
    ok: true,
    value: {
      skill: { level: 1, xp: 1 },
      grade: 'common',
      itemLevel: 1,
      materials: {},
      gold: 95,
      readyAtMs: 1_000_000 + 300_000,
      accelerated: true,
    },
  });

  const odd = startCraft(
    craftInput({
      accelerate: true,
      materialCostGold: 11,
      gold: 5,
      nowMs: 0,
      rng: mulberry32(1),
    }),
  );
  expect(odd.ok).toBe(true);
  if (odd.ok) {
    expect(odd.value.gold).toBe(0);
    expect(odd.value.readyAtMs).toBe(300_000);
  }
  expect(
    startCraft(
      craftInput({
        accelerate: true,
        materialCostGold: 11,
        gold: 4,
        rng: scripted(0),
      }),
    ),
  ).toEqual({ ok: false, code: 'gold' });

  const calls: number[] = [];
  const blocked = craftInput({
    accelerate: true,
    alreadyAccelerated: true,
    gold: 100,
    materialCostGold: 11,
    rng: scripted(0, calls),
  });
  expect(startCraft(blocked)).toEqual({ ok: false, code: 'accelerate' });
  expect(blocked.gold).toBe(100);
  expect(blocked.materials).toEqual({ metal: 5 });
  expect(calls).toEqual([]);
});

test('quality pure moves a skill-1 roll of 87 from rare to epic', () => {
  const normal = startCraft(
    craftInput({ rng: mulberry32(67), quality: 'normal' as MaterialQuality }),
  );
  const pure = startCraft(craftInput({ rng: mulberry32(67), quality: 'pure' }));
  expect(normal.ok && normal.value.grade).toBe('rare');
  expect(pure.ok && pure.value.grade).toBe('epic');
  if (normal.ok) {
    expect(normal.value.skill).toEqual({ level: 1, xp: 3 });
  }
});

test('relics, consumables, and an explicit recipe duration keep their clocks', () => {
  const relic = startCraft(craftInput({ kind: 'relic', rng: mulberry32(1) }));
  expect(relic.ok && relic.value.readyAtMs).toBe(1_000_000 + 5_400_000);
  const ammo = startCraft(craftInput({ kind: 'consumable', rng: mulberry32(67) }));
  expect(ammo.ok && ammo.value.grade).toBe('rare');
  expect(ammo.ok && ammo.value.readyAtMs).toBe(1_000_000 + 300_000);
  const custom = startCraft(
    craftInput({
      recipeDurationMs: 120_000,
      accelerate: true,
      rng: mulberry32(1),
    }),
  );
  expect(custom.ok && custom.value.readyAtMs).toBe(1_000_000 + 60_000);
});

test('leftover stacks stay and zero salvage returns are omitted', () => {
  const crafted = startCraft(
    craftInput({
      materials: { metal: 8, wood: 2 },
      need: { metal: 5 },
    }),
  );
  expect(crafted.ok && crafted.value.materials).toEqual({ metal: 3, wood: 2 });
});

test('unique gear is not salvaged; other gear returns 30% floored, at least one minute', () => {
  expect(
    salvage({
      grade: 'unique',
      need: { metal: 5 },
      craftMs: 600_000,
      inCityOrHub: true,
    }),
  ).toEqual({ ok: false, code: 'unique' });
  expect(
    salvage({
      grade: 'common',
      need: { metal: 5 },
      craftMs: 600_000,
      inCityOrHub: false,
    }),
  ).toEqual({ ok: false, code: 'zone' });
  expect(
    salvage({
      grade: 'common',
      need: { metal: 5 },
      craftMs: 600_000,
      inCityOrHub: true,
    }),
  ).toEqual({ ok: true, value: { materials: { metal: 1 }, durationMs: 60_000 } });
  expect(
    salvage({
      grade: 'rare',
      need: { metal: 1, wood: 4 },
      craftMs: 10_000,
      inCityOrHub: true,
    }),
  ).toEqual({ ok: true, value: { materials: { wood: 1 }, durationMs: 60_000 } });
});

test('common xp is 1, and ten common crafts raise skill 1 to level 2 with 0 xp', () => {
  expect(trainSkill({ level: 1, xp: 0 }, 'common')).toEqual({ level: 1, xp: 1 });
  let skill: SkillState = { level: 1, xp: 0 };
  for (let i = 0; i < 10; i += 1) {
    const result = startCraft(craftInput({ skill, rng: mulberry32(1) }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    skill = result.value.skill;
  }
  expect(skill).toEqual({ level: 2, xp: 0 });
});

test('xp levels through 9 and stops there even past 1100', () => {
  expect(trainSkill({ level: 1, xp: 0 }, 'unique')).toEqual({ level: 3, xp: 15 });
  let skill: SkillState = { level: 2, xp: 0 };
  for (let i = 0; i < 8; i += 1) {
    skill = trainSkill(skill, 'rare');
  }
  expect(skill).toEqual({ level: 2, xp: 24 });
  skill = trainSkill(skill, 'rare');
  expect(skill).toEqual({ level: 3, xp: 2 });
  expect(trainSkill({ level: 9, xp: 1090 }, 'unique')).toEqual({ level: 9, xp: 1140 });
});

test('buying level 10 without a teacher does not spend gold', () => {
  const skill: SkillState = { level: 9, xp: 1100 };
  expect(buySkillLevel(skill, SKILL_MASTER_GOLD, false, 10)).toEqual({
    ok: false,
    code: 'teacher',
  });
  expect(skill).toEqual({ level: 9, xp: 1100 });
  expect(buySkillLevel(skill, SKILL_MASTER_GOLD, true, 10)).toEqual({
    ok: true,
    value: { skill: { level: 10, xp: 0 }, gold: 0 },
  });
  expect(buySkillLevel(skill, SKILL_MASTER_GOLD - 1, true, 10)).toEqual({
    ok: false,
    code: 'gold',
  });
  expect(buySkillLevel({ level: 9, xp: 1099 }, SKILL_MASTER_GOLD, true, 10)).toEqual({
    ok: false,
    code: 'xp',
  });
  expect(buySkillLevel({ level: 8, xp: 5_000 }, SKILL_MASTER_GOLD, true, 10)).toEqual({
    ok: false,
    code: 'level',
  });
  expect(buySkillLevel(null, SKILL_MASTER_GOLD, true, 10)).toEqual({ ok: false, code: 'level' });
});

test('opening a skill costs 500 gold and a teacher', () => {
  expect(SKILL_OPEN_GOLD).toBe(500);
  expect(SKILL_MASTER_GOLD).toBe(5_000);
  expect(buySkillLevel(null, 500, true, 1)).toEqual({
    ok: true,
    value: { skill: { level: 1, xp: 0 }, gold: 0 },
  });
  expect(buySkillLevel(null, 499, true, 1)).toEqual({ ok: false, code: 'gold' });
  expect(buySkillLevel(null, 500, false, 1)).toEqual({ ok: false, code: 'teacher' });
  expect(buySkillLevel({ level: 1, xp: 0 }, 500, true, 1)).toEqual({ ok: false, code: 'level' });
});
