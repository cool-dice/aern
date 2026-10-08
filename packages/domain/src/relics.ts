import { applyWear, type GradeId, type ImplantSlot } from './items';
import { err, ok, type Result } from './result';
import type { Rng } from './rng';
import { MAX_LEVEL, STAT_IDS, type StatId } from './stats';

export type RelicSubtype = 'spore' | 'culture' | 'symbiont' | 'plate' | 'mechanism' | 'crystal';

/** Online hour. Degradation, feeding, and risk rolls use this, not calendar time. */
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const JAM_MS = 10 * MINUTE_MS;

const SOCKETS: Record<GradeId, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  unique: 3,
};

type Family = 'bio' | 'mech';

interface SubtypeRule {
  family: Family;
  installMs: number;
  gold: number;
  /** Durability points lost per fed online hour. */
  wearPerHour: number;
}

const RULES: Record<RelicSubtype, SubtypeRule> = {
  spore: { family: 'bio', installMs: 0, gold: 0, wearPerHour: 5 },
  culture: { family: 'bio', installMs: 30 * MINUTE_MS, gold: 100, wearPerHour: 2 },
  symbiont: { family: 'bio', installMs: 60 * MINUTE_MS, gold: 250, wearPerHour: 1 },
  plate: { family: 'mech', installMs: 0, gold: 0, wearPerHour: 1 },
  mechanism: { family: 'mech', installMs: 30 * MINUTE_MS, gold: 100, wearPerHour: 2 },
  crystal: { family: 'mech', installMs: 60 * MINUTE_MS, gold: 250, wearPerHour: 1 },
};

interface RiskDef {
  id: 'mold' | 'mutation' | 'reject' | 'corrosion' | 'jam';
  chance: number;
}

const BIO_RISKS: readonly RiskDef[] = [
  { id: 'mold', chance: 0.05 },
  { id: 'mutation', chance: 0.01 },
  { id: 'reject', chance: 0.02 },
];

const MECH_RISKS: readonly RiskDef[] = [
  { id: 'corrosion', chance: 0.03 },
  { id: 'jam', chance: 0.02 },
];

const MECHANISM_STATS: readonly StatId[] = ['technique', 'perception'];
const CRYSTAL_STATS: readonly StatId[] = ['will', 'accuracy'];

export function socketCount(grade: GradeId): number {
  return SOCKETS[grade];
}

export function installDurationMs(subtype: RelicSubtype): number {
  return RULES[subtype].installMs;
}

export function installGold(subtype: RelicSubtype): number {
  return RULES[subtype].gold;
}

export interface RelicState {
  subtype: RelicSubtype;
  grade: GradeId;
  durability: number;
  fed: boolean;
  onlineWornMs: number;
  silencedUntilMs: number;
  bonusStat?: StatId;
  penaltyStat?: StatId;
  echoIds: string[];
  /**
   * Artifact 4 §3. One relic per body category: head, torso, hands, legs.
   * Echo sockets are `socketCount` (1/2/3/3) and are not this field.
   */
  implantSlot?: ImplantSlot;
}

/**
 * `busy` is reserved for a caller that is already in another timed action.
 * `startInstall` has no busy input, so this code is not produced here.
 */
export type RelicError = 'clean' | 'combat' | 'zone' | 'gold' | 'busy';

export function startInstall(input: {
  clean: boolean;
  inCombat: boolean;
  inCityOrHub: boolean;
  gold: number;
  subtype: RelicSubtype;
  nowMs: number;
}): Result<{ gold: number; readyAtMs: number }, RelicError> {
  assertGold(input.gold);
  assertFinite('nowMs', input.nowMs);
  if (input.clean) {
    return err('clean');
  }
  if (input.inCombat) {
    return err('combat');
  }
  if (!input.inCityOrHub) {
    return err('zone');
  }
  const cost = installGold(input.subtype);
  if (input.gold < cost) {
    return err('gold');
  }
  return ok({
    gold: input.gold - cost,
    readyAtMs: input.nowMs + installDurationMs(input.subtype),
  });
}

export function advanceRelic(input: {
  relic: RelicState;
  onlineDeltaMs: number;
  amino: number;
  cells: number;
  nowMs: number;
  rng: Rng;
}): { relic: RelicState; amino: number; cells: number; risks: string[] } {
  assertFinite('onlineDeltaMs', input.onlineDeltaMs);
  if (input.onlineDeltaMs < 0) {
    throw new RangeError(`onlineDeltaMs must be >= 0, got ${String(input.onlineDeltaMs)}`);
  }
  assertCount('amino', input.amino);
  assertCount('cells', input.cells);
  assertFinite('nowMs', input.nowMs);
  assertFinite('onlineWornMs', input.relic.onlineWornMs);
  if (input.relic.onlineWornMs < 0) {
    throw new RangeError(`onlineWornMs must be >= 0, got ${String(input.relic.onlineWornMs)}`);
  }
  assertFinite('durability', input.relic.durability);

  const rule = RULES[input.relic.subtype];
  const prev = input.relic.onlineWornMs;
  const onlineWornMs = prev + input.onlineDeltaMs;
  const firstHour = Math.floor(prev / HOUR_MS) + 1;
  const lastHour = Math.floor(onlineWornMs / HOUR_MS);

  let durability = input.relic.durability;
  let fed = input.relic.fed;
  let amino = input.amino;
  let cells = input.cells;
  let silencedUntilMs = input.relic.silencedUntilMs;
  const risks: string[] = [];

  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    if (!(durability > 0)) {
      break;
    }
    const needsFood = rule.family === 'bio' || hour % 2 === 0;
    let fedThisHour = true;
    if (needsFood) {
      if (rule.family === 'bio') {
        if (amino > 0) {
          amino -= 1;
        } else {
          fedThisHour = false;
        }
      } else if (cells > 0) {
        cells -= 1;
      } else {
        fedThisHour = false;
      }
    }
    fed = fedThisHour;
    durability = applyWear(durability, fedThisHour ? rule.wearPerHour : rule.wearPerHour * 2);
    if (!(durability > 0)) {
      continue;
    }
    const table = rule.family === 'bio' ? BIO_RISKS : MECH_RISKS;
    for (const risk of table) {
      if (!(input.rng.nextUnit() < risk.chance)) {
        continue;
      }
      risks.push(risk.id);
      if (risk.id === 'corrosion') {
        durability = applyWear(durability, 5);
      } else if (risk.id === 'reject') {
        silencedUntilMs = Math.max(silencedUntilMs, input.nowMs + HOUR_MS);
      } else if (risk.id === 'jam') {
        silencedUntilMs = Math.max(silencedUntilMs, input.nowMs + JAM_MS);
      }
    }
  }

  return {
    relic: {
      ...input.relic,
      durability,
      fed,
      onlineWornMs,
      silencedUntilMs,
      echoIds: [...input.relic.echoIds],
    },
    amino,
    cells,
    risks,
  };
}

export function removeRelic(
  relic: RelicState,
  inCityOrHub: boolean,
  inCombat: boolean,
): Result<{ lostEchoIds: string[] }, 'zone' | 'combat'> {
  if (inCombat) {
    return err('combat');
  }
  if (!inCityOrHub) {
    return err('zone');
  }
  return ok({ lostEchoIds: [...relic.echoIds] });
}

export function relicBonuses(
  relic: RelicState,
  characterLevel: number,
  nowMs: number,
): { stats: Partial<Record<StatId, number>>; armor: number; active: boolean } {
  if (!(characterLevel >= 1 && characterLevel <= MAX_LEVEL)) {
    throw new RangeError(`level must be in [1, ${MAX_LEVEL}], got ${String(characterLevel)}`);
  }
  assertFinite('nowMs', nowMs);
  const active = relic.durability > 0 && !(nowMs < relic.silencedUntilMs);
  if (!active) {
    return { stats: {}, armor: 0, active: false };
  }

  switch (relic.subtype) {
    case 'spore': {
      const bonus = requireStat(relic, STAT_IDS);
      const penalty = relic.penaltyStat;
      if (penalty === undefined || !hasStat(STAT_IDS, penalty) || penalty === bonus) {
        throw new RangeError('spore requires a different penaltyStat');
      }
      return { stats: { [bonus]: 2, [penalty]: -1 }, armor: 0, active: true };
    }
    case 'culture': {
      const bonus = requireStat(relic, STAT_IDS);
      assertWorn(relic.onlineWornMs);
      const grown = Math.min(5, Math.floor(relic.onlineWornMs / (10 * HOUR_MS)));
      return { stats: { [bonus]: 1 + grown }, armor: 0, active: true };
    }
    case 'symbiont': {
      const bonus = requireStat(relic, STAT_IDS);
      const grown = Math.min(5, Math.floor(characterLevel / 5));
      return { stats: { [bonus]: 1 + grown }, armor: 0, active: true };
    }
    case 'plate':
      return { stats: {}, armor: 1, active: true };
    case 'mechanism': {
      const bonus = requireStat(relic, MECHANISM_STATS);
      return { stats: { [bonus]: 1 }, armor: 0, active: true };
    }
    case 'crystal': {
      const bonus = requireStat(relic, CRYSTAL_STATS);
      return { stats: { [bonus]: 1 }, armor: 0, active: true };
    }
    default: {
      const unknown: never = relic.subtype;
      throw new RangeError(`unknown relic subtype ${String(unknown)}`);
    }
  }
}

function requireStat(relic: RelicState, allowed: readonly StatId[]): StatId {
  const stat = relic.bonusStat;
  if (stat === undefined || !hasStat(allowed, stat)) {
    throw new RangeError(`${relic.subtype} bonusStat is missing or not allowed`);
  }
  return stat;
}

function hasStat(allowed: readonly StatId[], stat: StatId): boolean {
  return allowed.some((candidate) => candidate === stat);
}

function assertWorn(onlineWornMs: number): void {
  if (!Number.isFinite(onlineWornMs) || onlineWornMs < 0) {
    throw new RangeError(`onlineWornMs must be finite and >= 0, got ${String(onlineWornMs)}`);
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite, got ${String(value)}`);
  }
}

function assertGold(gold: number): void {
  if (!Number.isInteger(gold) || gold < 0) {
    throw new RangeError(`gold must be an integer >= 0, got ${String(gold)}`);
  }
}

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${String(value)}`);
  }
}
