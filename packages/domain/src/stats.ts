export const STAT_IDS = [
  'body',
  'reaction',
  'accuracy',
  'will',
  'perception',
  'technique',
] as const;
export type StatId = (typeof STAT_IDS)[number];
export type StatBlock = Record<StatId, number>;

export const STAT_BASE = 5;
export const CREATION_STAT_POINTS = 20;
export const MAX_POINTS_PER_STAT = 10;
export const CAP_NORMAL = 20;
export const CAP_CLEAN = 25;
export const CAP_TEMPORARY = 30;
export const MAX_LEVEL = 50;

export interface DerivedInput {
  stats: StatBlock;
  level: number;
  totalWeightKg: number;
}

export interface DerivedStats {
  hp: number;
  odLimit: number;
  odRegenPerSecond: number;
  carryKg: number;
  overloadPenalty: number;
  evasion: number;
  accuracyScore: number;
  initiative: number;
  nnLimit: number;
  effectResist: number;
  hack: number;
  craft: number;
  repair: number;
  visionRadius: number;
  cellsPerStep: number;
  cellsPerRun: number;
  runOdCost: 3;
}

export function emptyPoints(): StatBlock {
  return {
    body: 0,
    reaction: 0,
    accuracy: 0,
    will: 0,
    perception: 0,
    technique: 0,
  };
}

export function derive(input: DerivedInput): DerivedStats {
  if (!(input.level >= 1 && input.level <= MAX_LEVEL)) {
    throw new RangeError(`level must be in [1, ${MAX_LEVEL}], got ${String(input.level)}`);
  }

  const { body, reaction, accuracy, will, perception, technique } = input.stats;
  const totalWeightKg = input.totalWeightKg < 0 ? 0 : input.totalWeightKg;
  const carryKg = body * 5 + 10;
  const overloadPenalty = Math.max(0, Math.floor((totalWeightKg - carryKg) / 10));

  return {
    hp: body * 10 + input.level * 5,
    odLimit: will,
    odRegenPerSecond: 1 + reaction / 5,
    carryKg,
    overloadPenalty,
    evasion: reaction + perception - overloadPenalty,
    accuracyScore: accuracy + Math.floor(perception / 2),
    initiative: reaction,
    nnLimit: will * 2,
    effectResist: will + Math.floor(body / 2),
    hack: technique + perception,
    craft: technique,
    repair: technique,
    visionRadius: 5 + Math.floor(perception / 2),
    cellsPerStep: cellsPerOd(reaction),
    cellsPerRun: cellsPerRun(reaction),
    runOdCost: 3,
  };
}

export function damageMultiplier(accuracyStat: number): number {
  return 1 + accuracyStat / 20;
}

export function applyCap(value: number, clean: boolean, temporaryBonus: number): number {
  const lifestyleCap = clean ? CAP_CLEAN : CAP_NORMAL;
  return Math.min(CAP_TEMPORARY, Math.min(lifestyleCap, value) + temporaryBonus);
}

/** Cells moved for 1 OD. `< 15 → 1`, `< 25 → 2`, otherwise `3`. */
export function cellsPerOd(reaction: number): number {
  if (reaction < 15) {
    return 1;
  }
  if (reaction < 25) {
    return 2;
  }
  return 3;
}

/** Cells covered by a 3 OD run. `< 15 → 4`, `< 25 → 6`, otherwise `8`. */
function cellsPerRun(reaction: number): number {
  if (reaction < 15) {
    return 4;
  }
  if (reaction < 25) {
    return 6;
  }
  return 8;
}
