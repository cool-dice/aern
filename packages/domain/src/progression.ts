import { err, ok, type Result } from './result';
import { MAX_LEVEL, MAX_POINTS_PER_STAT, type StatBlock, type StatId } from './stats';

const PVP_SAME_LEVEL_XP = 20;
const PVP_XP_COOLDOWN_MS = 600_000;

export type MonsterKind = 'normal' | 'elite' | 'elite_boss' | 'unique_boss';

const MONSTER_XP_BONUS: Record<MonsterKind, number> = {
  normal: 0,
  elite: 5,
  elite_boss: 50,
  unique_boss: 100,
};

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be in [1, ${MAX_LEVEL}], got ${String(level)}`);
  }
}

/**
 * XP required to advance from `level` to the next one.
 * `floor(100 * level ** 1.5)`, and 0 at max level because XP no longer accumulates.
 */
export function xpToNext(level: number): number {
  assertLevel(level);
  if (level === MAX_LEVEL) {
    return 0;
  }
  return Math.floor(100 * level ** 1.5);
}

export function monsterXp(monsterLevel: number, kind: MonsterKind): number {
  if (!Number.isInteger(monsterLevel) || monsterLevel < 1) {
    throw new RangeError(`monsterLevel must be an integer >= 1, got ${String(monsterLevel)}`);
  }
  return monsterLevel * 10 + MONSTER_XP_BONUS[kind];
}

/** Per-participant share. The division remainder is discarded. */
export function splitXp(total: number, participants: number): number {
  if (!Number.isInteger(participants) || participants < 1) {
    throw new RangeError(`participants must be an integer >= 1, got ${String(participants)}`);
  }
  if (!(total >= 0)) {
    throw new RangeError(`total must be >= 0, got ${String(total)}`);
  }
  return Math.floor(total / participants);
}

export function pvpXp(killerLevel: number, victimLevel: number): number {
  assertLevel(killerLevel);
  assertLevel(victimLevel);
  const levelsBelow = killerLevel - victimLevel;
  if (levelsBelow <= 0) {
    return PVP_SAME_LEVEL_XP + (victimLevel - killerLevel) * 2;
  }
  if (levelsBelow <= 5) {
    return 10;
  }
  if (levelsBelow <= 10) {
    return 5;
  }
  return 0;
}

export interface Progress {
  level: number;
  /** XP inside the current level. */
  xp: number;
  unspent: number;
  points: StatBlock;
}

function copyPoints(points: StatBlock): StatBlock {
  return {
    body: points.body,
    reaction: points.reaction,
    accuracy: points.accuracy,
    will: points.will,
    perception: points.perception,
    technique: points.technique,
  };
}

export function grantXp(progress: Progress, amount: number): Progress {
  if (!(amount >= 0)) {
    throw new RangeError(`amount must be >= 0, got ${String(amount)}`);
  }
  assertLevel(progress.level);

  const points = copyPoints(progress.points);
  if (progress.level === MAX_LEVEL) {
    return {
      level: progress.level,
      xp: 0,
      unspent: progress.unspent,
      points,
    };
  }

  let level = progress.level;
  let xp = progress.xp + amount;
  let unspent = progress.unspent;
  while (level < MAX_LEVEL) {
    const cost = xpToNext(level);
    if (xp < cost) {
      break;
    }
    xp -= cost;
    level += 1;
    unspent += 1;
  }
  if (level === MAX_LEVEL) {
    xp = 0;
  }

  return { level, xp, unspent, points };
}

export function spendPoint(
  progress: Progress,
  stat: StatId,
): Result<Progress, 'none' | 'stat_cap'> {
  if (progress.unspent <= 0) {
    return err('none');
  }
  const allocated = progress.points[stat] ?? 0;
  if (allocated >= MAX_POINTS_PER_STAT) {
    return err('stat_cap');
  }
  return ok({
    level: progress.level,
    xp: progress.xp,
    unspent: progress.unspent - 1,
    points: {
      ...copyPoints(progress.points),
      [stat]: allocated + 1,
    },
  });
}

export function itemTier(level: number): 1 | 2 | 3 | 4 | 5 {
  assertLevel(level);
  if (level >= 40) {
    return 5;
  }
  if (level >= 30) {
    return 4;
  }
  if (level >= 20) {
    return 3;
  }
  if (level >= 10) {
    return 2;
  }
  return 1;
}

export function pvpXpAllowed(lastKillMs: number | undefined, nowMs: number): boolean {
  if (lastKillMs === undefined) {
    return true;
  }
  return nowMs - lastKillMs >= PVP_XP_COOLDOWN_MS;
}
