import {
  GRADES,
  STARTING_DURABILITY,
  applyWear,
  canEquip,
  itemStatValue,
  type GradeId,
} from './items';
import { err, ok, type Result } from './result';
import type { Rng } from './rng';

export type CraftSkill = 'weaponsmith' | 'armorer' | 'biotech' | 'mechanic' | 'alchemist';
export type StationId = 'forge' | 'bench' | 'lab' | 'workshop' | 'alchemy';
export type MaterialQuality = 'normal' | 'cleaned' | 'pure';
export type CraftKind = 'item' | 'consumable' | 'relic';

export interface SkillState {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  xp: number;
}

export const SKILL_OPEN_GOLD = 500;
export const SKILL_MASTER_GOLD = 5_000;
export const CRAFT_LANGUAGE_MIN = 60;

export const STATION_BY_SKILL: Record<CraftSkill, StationId> = {
  weaponsmith: 'forge',
  armorer: 'bench',
  biotech: 'lab',
  mechanic: 'workshop',
  alchemist: 'alchemy',
};

/** Echoes, paths, and relic shards drop or are gathered. They are not recipe outputs. */
export const UNCRAFTABLE_OUTPUTS = ['echo', 'path', 'relic_shard'] as const;
export type UncraftableOutput = (typeof UNCRAFTABLE_OUTPUTS)[number];

const MINUTE_MS = 60_000;
const MIN_SALVAGE_MS = MINUTE_MS;
const SALVAGE_NUMERATOR = 3;
const SALVAGE_DENOMINATOR = 10;

const GRADE_ORDER = ['common', 'rare', 'epic', 'unique'] as const satisfies readonly GradeId[];

const GRADE_XP: Record<GradeId, number> = {
  common: 1,
  rare: 3,
  epic: 10,
  unique: 50,
};

/** Xp inside the current level required to reach the next one. Level 10 is bought, not earned. */
function xpToNext(level: SkillState['level']): number | undefined {
  switch (level) {
    case 1:
      return 10;
    case 2:
      return 25;
    case 3:
      return 50;
    case 4:
      return 100;
    case 5:
      return 200;
    case 6:
      return 350;
    case 7:
      return 550;
    case 8:
      return 800;
    case 9:
      return 1100;
    case 10:
      return undefined;
  }
}

const BASE_WEIGHTS: Record<SkillState['level'], Record<GradeId, number>> = {
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

const ITEM_MINUTES: Record<GradeId, number> = {
  common: 10,
  rare: 30,
  epic: 60,
  unique: 120,
};

const CONSUMABLE_MINUTES = 5;
const RELIC_MINUTES = 90;
const UNIQUE_RELIC_MINUTES = 120;

export type CraftError =
  | 'zone'
  | 'combat'
  | 'station'
  | 'language'
  | 'level'
  | 'materials'
  | 'forbidden'
  | 'gold'
  | 'accelerate';

export type SalvageError = 'unique' | 'zone';
export type SkillBuyError = 'gold' | 'teacher' | 'xp' | 'level';

export interface StartCraftInput {
  skill: SkillState;
  station: StationId;
  recipeSkill: CraftSkill;
  recipeStation: StationId;
  languageUpy: number;
  inCityOrHub: boolean;
  inCombat: boolean;
  requestedItemLevel: number;
  /** Inclusive recipe level fork. Outside it, the craft fails with `level`. */
  recipeMin: number;
  recipeMax: number;
  materials: Record<string, number>;
  need: Record<string, number>;
  /** Recipe lists a boss component. Without one, a unique roll becomes epic. */
  uniqueComponent: boolean;
  hasUniqueComponent: boolean;
  /**
   * Stack id of the boss component inside `need` and `materials`.
   * When omitted, a `need` key named `unique_component` is used if present.
   * The component is spent only when the finished grade stays unique.
   */
  uniqueComponentId?: string;
  /** Set for echoes, paths, relic shards, and any other recipe the catalog marks forbidden. */
  forbidden: boolean;
  /** Exact ids that can never be crafted, even if `forbidden` was left false. */
  outputId?: string;
  /**
   * Material sum only. The caller computes it (price × qty).
   * Rushing adds `floor(materialCostGold * 0.5)` and does not import ./economy.ts.
   */
  materialCostGold: number;
  gold: number;
  accelerate: boolean;
  alreadyAccelerated: boolean;
  rng: Rng;
  nowMs: number;
  quality?: MaterialQuality;
  kind?: CraftKind;
  /** Recipe-authored duration. Omitted recipes use `craftDurationMs`. */
  recipeDurationMs?: number;
}

export interface StartedCraft {
  skill: SkillState;
  grade: GradeId;
  itemLevel: number;
  materials: Record<string, number>;
  gold: number;
  readyAtMs: number;
  accelerated: boolean;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be an integer >= 0, got ${String(value)}`);
  }
}

function assertStacks(stacks: Record<string, number>, label: string): void {
  for (const [id, qty] of Object.entries(stacks)) {
    if (!Number.isInteger(qty) || qty < 0) {
      throw new RangeError(`${label}[${id}] must be an integer >= 0, got ${String(qty)}`);
    }
  }
}

function assertSkill(skill: SkillState): void {
  if (!Object.prototype.hasOwnProperty.call(BASE_WEIGHTS, skill.level)) {
    throw new RangeError(`skill level must be an integer in 1..10, got ${String(skill.level)}`);
  }
  assertNonNegativeInteger(skill.xp, 'skill.xp');
}

function gradeBand(grade: GradeId) {
  const band = GRADES[grade];
  if (!band) {
    throw new RangeError(`unknown grade: ${String(grade)}`);
  }
  return band;
}

/**
 * A finished piece uses the item grade band. Fresh durability is equippable;
 * unique gear is allowed here, and the boss-component rule lives in `startCraft`.
 */
function assertCraftedProduct(grade: GradeId, itemLevel: number): void {
  const stat = itemStatValue(grade, itemLevel);
  const band = gradeBand(grade);
  if (stat < band.statMin || stat > band.statMax) {
    throw new RangeError(
      `crafted ${grade} stat ${String(stat)} is outside ${String(band.statMin)}..${String(band.statMax)}`,
    );
  }
  const durability = applyWear(STARTING_DURABILITY, 0);
  const equipped = canEquip(durability, {
    slot: 'main_hand',
    twoHanded: false,
    occupied: {},
  });
  if (!equipped.ok) {
    throw new RangeError('fresh crafted gear cannot be equipped');
  }
}

function isUncraftableOutput(outputId: string | undefined): boolean {
  return outputId !== undefined && (UNCRAFTABLE_OUTPUTS as readonly string[]).includes(outputId);
}

export function maxItemLevel(skillLevel: number): number {
  if (!Number.isInteger(skillLevel) || skillLevel < 1 || skillLevel > 10) {
    throw new RangeError(`skill level must be an integer in 1..10, got ${String(skillLevel)}`);
  }
  return skillLevel * 5;
}

export function gradeWeights(level: number, quality: MaterialQuality): Record<GradeId, number> {
  if (!Object.prototype.hasOwnProperty.call(BASE_WEIGHTS, level)) {
    throw new RangeError(`skill level must be an integer in 1..10, got ${String(level)}`);
  }
  const base = BASE_WEIGHTS[level as SkillState['level']];
  const weights: Record<GradeId, number> = {
    common: base.common,
    rare: base.rare,
    epic: base.epic,
    unique: base.unique,
  };
  if (quality === 'normal') {
    return weights;
  }
  if (quality === 'cleaned') {
    const take = Math.min(5, weights.common);
    weights.common -= take;
    weights.rare += 5;
    return weights;
  }
  if (quality === 'pure') {
    const take = Math.min(10, weights.common);
    weights.common -= take;
    weights.rare += 5;
    weights.epic += 5;
    return weights;
  }
  throw new RangeError(`unknown material quality: ${String(quality)}`);
}

/**
 * Walk common → rare → epic → unique.
 * Sum ≤ 100 uses `nextInt(sum)`. A quality shift that pushes the sum past 100
 * rolls `nextInt(10000)` against thresholds scaled to that sum.
 */
export function rollGrade(weights: Record<GradeId, number>, rng: Rng): GradeId {
  const parts: number[] = [];
  let sum = 0;
  for (const grade of GRADE_ORDER) {
    const weight = weights[grade];
    if (!Number.isInteger(weight) || weight < 0) {
      throw new RangeError(`weight ${grade} must be an integer >= 0, got ${String(weight)}`);
    }
    parts.push(weight);
    sum += weight;
  }
  if (sum <= 0) {
    throw new RangeError('grade weights must sum to a positive integer');
  }
  if (sum > 100) {
    const roll = rng.nextInt(10_000);
    let acc = 0;
    for (let i = 0; i < GRADE_ORDER.length; i += 1) {
      acc += parts[i] ?? 0;
      const threshold = Math.floor((acc * 10_000) / sum);
      if (roll < threshold) {
        return GRADE_ORDER[i] ?? 'unique';
      }
    }
    return 'unique';
  }
  const roll = rng.nextInt(sum);
  let acc = 0;
  for (let i = 0; i < GRADE_ORDER.length; i += 1) {
    acc += parts[i] ?? 0;
    if (roll < acc) {
      return GRADE_ORDER[i] ?? 'unique';
    }
  }
  return 'unique';
}

export function craftDurationMs(grade: GradeId, kind: CraftKind): number {
  gradeBand(grade);
  if (kind === 'consumable') {
    return CONSUMABLE_MINUTES * MINUTE_MS;
  }
  if (kind === 'relic') {
    const minutes = grade === 'unique' ? UNIQUE_RELIC_MINUTES : RELIC_MINUTES;
    return minutes * MINUTE_MS;
  }
  if (kind === 'item') {
    return ITEM_MINUTES[grade] * MINUTE_MS;
  }
  throw new RangeError(`unknown craft kind: ${String(kind)}`);
}

export function trainSkill(skill: SkillState, grade: GradeId): SkillState {
  assertSkill(skill);
  const gain = GRADE_XP[grade];
  if (gain === undefined) {
    throw new RangeError(`unknown grade: ${String(grade)}`);
  }
  let level: SkillState['level'] = skill.level;
  let xp = skill.xp + gain;
  while (level < 9) {
    const need = xpToNext(level);
    if (need === undefined || xp < need) {
      break;
    }
    xp -= need;
    level = (level + 1) as SkillState['level'];
  }
  return { level, xp };
}

export function buySkillLevel(
  skill: SkillState | null,
  gold: number,
  teacher: boolean,
  target: 1 | 10,
): Result<{ skill: SkillState; gold: number }, SkillBuyError> {
  assertNonNegativeInteger(gold, 'gold');
  if (target === 1) {
    if (skill !== null) {
      return err('level');
    }
    if (!teacher) {
      return err('teacher');
    }
    if (gold < SKILL_OPEN_GOLD) {
      return err('gold');
    }
    return ok({ skill: { level: 1, xp: 0 }, gold: gold - SKILL_OPEN_GOLD });
  }
  if (target !== 10) {
    throw new RangeError(`skill purchase target must be 1 or 10, got ${String(target)}`);
  }
  if (skill === null || skill.level !== 9) {
    return err('level');
  }
  assertSkill(skill);
  if (!teacher) {
    return err('teacher');
  }
  const masterXp = xpToNext(9);
  if (masterXp === undefined || skill.xp < masterXp) {
    return err('xp');
  }
  if (gold < SKILL_MASTER_GOLD) {
    return err('gold');
  }
  return ok({ skill: { level: 10, xp: 0 }, gold: gold - SKILL_MASTER_GOLD });
}

function componentIdOf(input: StartCraftInput): string | undefined {
  if (!input.uniqueComponent) {
    return undefined;
  }
  if (input.uniqueComponentId !== undefined && input.uniqueComponentId.length > 0) {
    return input.uniqueComponentId;
  }
  if (Object.prototype.hasOwnProperty.call(input.need, 'unique_component')) {
    return 'unique_component';
  }
  return undefined;
}

function componentReady(input: StartCraftInput, componentId: string | undefined): boolean {
  if (!input.uniqueComponent || !input.hasUniqueComponent) {
    return false;
  }
  if (componentId === undefined) {
    return true;
  }
  const qty = input.need[componentId] ?? 0;
  if (qty === 0) {
    return true;
  }
  return (input.materials[componentId] ?? 0) >= qty;
}

function missingMaterials(
  materials: Record<string, number>,
  need: Record<string, number>,
  componentId: string | undefined,
): boolean {
  for (const [id, qty] of Object.entries(need)) {
    if (id === componentId) {
      continue;
    }
    if ((materials[id] ?? 0) < qty) {
      return true;
    }
  }
  return false;
}

function spendMaterials(
  materials: Record<string, number>,
  need: Record<string, number>,
  componentId: string | undefined,
  consumeComponent: boolean,
): Record<string, number> {
  const next: Record<string, number> = { ...materials };
  for (const [id, qty] of Object.entries(need)) {
    if (qty === 0) {
      continue;
    }
    if (id === componentId && !consumeComponent) {
      continue;
    }
    const left = (next[id] ?? 0) - qty;
    if (left < 0) {
      throw new RangeError(`material ${id} went negative`);
    }
    if (left === 0) {
      delete next[id];
    } else {
      next[id] = left;
    }
  }
  return next;
}

/** Half of the material sum, rounded down. Charged only when this craft actually rushes. */
function rushFee(materialCostGold: number): number {
  return Math.floor(materialCostGold * 0.5);
}

function resolveDurationMs(input: StartCraftInput, grade: GradeId, kind: CraftKind): number {
  if (input.recipeDurationMs === undefined) {
    return craftDurationMs(grade, kind);
  }
  if (!Number.isInteger(input.recipeDurationMs) || input.recipeDurationMs < 1) {
    throw new RangeError(
      `recipeDurationMs must be an integer >= 1, got ${String(input.recipeDurationMs)}`,
    );
  }
  return input.recipeDurationMs;
}

export function startCraft(input: StartCraftInput): Result<StartedCraft, CraftError> {
  assertSkill(input.skill);
  assertStacks(input.materials, 'materials');
  assertStacks(input.need, 'need');
  assertNonNegativeInteger(input.materialCostGold, 'materialCostGold');
  assertNonNegativeInteger(input.gold, 'gold');
  assertNonNegativeInteger(input.nowMs, 'nowMs');
  if (!Number.isFinite(input.languageUpy)) {
    throw new RangeError(`languageUpy must be finite, got ${String(input.languageUpy)}`);
  }
  if (!Number.isInteger(input.recipeMin) || !Number.isInteger(input.recipeMax)) {
    throw new RangeError('recipe level range must be integers');
  }
  if (input.recipeMin > input.recipeMax) {
    throw new RangeError('recipeMin cannot exceed recipeMax');
  }
  const quality = input.quality ?? 'normal';
  if (quality !== 'normal' && quality !== 'cleaned' && quality !== 'pure') {
    throw new RangeError(`unknown material quality: ${String(quality)}`);
  }
  const kind = input.kind ?? 'item';

  if (!input.inCityOrHub) {
    return err('zone');
  }
  if (input.inCombat) {
    return err('combat');
  }
  const expectedStation = STATION_BY_SKILL[input.recipeSkill];
  if (
    expectedStation === undefined ||
    input.station !== expectedStation ||
    input.recipeStation !== expectedStation
  ) {
    return err('station');
  }
  if (input.languageUpy < CRAFT_LANGUAGE_MIN) {
    return err('language');
  }
  if (input.forbidden || isUncraftableOutput(input.outputId)) {
    return err('forbidden');
  }
  const cap = maxItemLevel(input.skill.level);
  if (
    !Number.isInteger(input.requestedItemLevel) ||
    input.requestedItemLevel < 1 ||
    input.requestedItemLevel > cap ||
    input.requestedItemLevel < input.recipeMin ||
    input.requestedItemLevel > input.recipeMax
  ) {
    return err('level');
  }

  const componentId = componentIdOf(input);
  if (missingMaterials(input.materials, input.need, componentId)) {
    return err('materials');
  }
  if (input.accelerate && input.alreadyAccelerated) {
    return err('accelerate');
  }
  const fee = input.accelerate ? rushFee(input.materialCostGold) : 0;
  if (input.accelerate && input.gold < fee) {
    return err('gold');
  }

  let grade = rollGrade(gradeWeights(input.skill.level, quality), input.rng);
  if (grade === 'unique' && !componentReady(input, componentId)) {
    grade = 'epic';
  }
  const materials = spendMaterials(input.materials, input.need, componentId, grade === 'unique');
  const baseMs = resolveDurationMs(input, grade, kind);
  const durationMs = input.accelerate ? Math.floor(baseMs / 2) : baseMs;
  assertCraftedProduct(grade, input.requestedItemLevel);
  return ok({
    skill: trainSkill(input.skill, grade),
    grade,
    itemLevel: input.requestedItemLevel,
    materials,
    gold: input.gold - fee,
    readyAtMs: input.nowMs + durationMs,
    accelerated: input.accelerate,
  });
}

export function salvage(input: {
  grade: GradeId;
  need: Record<string, number>;
  craftMs: number;
  inCityOrHub: boolean;
}): Result<{ materials: Record<string, number>; durationMs: number }, SalvageError> {
  assertNonNegativeInteger(input.craftMs, 'craftMs');
  assertStacks(input.need, 'need');
  if (!input.inCityOrHub) {
    return err('zone');
  }
  if (input.grade === 'unique') {
    return err('unique');
  }
  gradeBand(input.grade);
  const materials: Record<string, number> = {};
  for (const [id, qty] of Object.entries(input.need)) {
    const returned = Math.floor((qty * SALVAGE_NUMERATOR) / SALVAGE_DENOMINATOR);
    if (returned > 0) {
      materials[id] = returned;
    }
  }
  const durationMs = Math.max(MIN_SALVAGE_MS, Math.floor(input.craftMs / 10));
  return ok({ materials, durationMs });
}
