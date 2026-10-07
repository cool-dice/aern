import { REAL_SECOND_MS, addMs } from './time';

/** 2026-01-01T00:00:00.000Z. World months count from here, not the civil calendar. */
export const EPOCH_MS = Date.UTC(2026, 0, 1);

/**
 * Real UTC day. Cosmetic day and night live in `time.ts` (`GAME_DAY_MS`) and do not
 * change season, spawn, gathering, or weather multipliers.
 */
export const DAY_MS = 86_400 * REAL_SECOND_MS;

export const MONTH_DAYS = 28;
export const YEAR_DAYS = 12 * MONTH_DAYS;
export const SEASON_DAYS = 3 * MONTH_DAYS;

export const SEASON_SPAWN_MULTIPLIER = 1.2;
export const SEASON_RESOURCE_BONUS = 1;

/** Weather and precursor anomalies are announced this long before they start. */
export const ANNOUNCE_LEAD_MS = 5 * 60 * REAL_SECOND_MS;

/** After the hub falls, regional resource nodes stay closed for one real hour. */
export const RESOURCE_NODES_CLOSED_MS = 60 * 60 * REAL_SECOND_MS;

export type SeasonId = 'awakening' | 'heat' | 'fade' | 'frost';
export type SeasonResource = 'wood' | 'crystals' | 'spores' | 'metal';
export type HolidayId = 'rift_day' | 'first_day' | 'barrier_day';
export type HolidayStat = 'loreXp' | 'craft' | 'keeperDamage';
export type InvasionPhase = 'prepare' | 'wave1' | 'wave2' | 'climax' | 'end' | 'done';
export type InvasionRewardKind =
  | 'monsters_10'
  | 'elite'
  | 'invasion_boss'
  | 'node_hold'
  | 'hub_hold';

export interface InvasionReward {
  gold: number;
  xp: number;
  relicShardChance: number;
  uniqueComponentChance: number;
  coreChance: number;
}

export const WEATHER_IDS = [
  'fog',
  'sand',
  'acid',
  'storm',
  'magnetic',
  'blood_moon',
  'ice_wind',
  'spore_fog',
] as const;

export type WeatherId = (typeof WEATHER_IDS)[number];

const SEASON_ORDER: readonly SeasonId[] = ['awakening', 'heat', 'fade', 'frost'];

const SPAWN_TAG: Record<SeasonId, string> = {
  awakening: 'pack',
  heat: 'fire',
  fade: 'undead',
  frost: 'ice',
};

const RESOURCE: Record<SeasonId, SeasonResource> = {
  awakening: 'wood',
  heat: 'crystals',
  fade: 'spores',
  frost: 'metal',
};

/** Multiplier on the base weather-roll chance. Awakening +10% is 1.1, heat +20% is 1.2. */
const WEATHER_BONUS: Record<SeasonId, number> = {
  awakening: 1.1,
  heat: 1.2,
  fade: 1.15,
  frost: 1.15,
};

const MINUTE_MS = 60 * REAL_SECOND_MS;

interface WeatherDefinition {
  minutes: number;
  effect: Record<string, number | boolean>;
}

const WEATHER: Record<WeatherId, WeatherDefinition> = {
  fog: { minutes: 15, effect: { vision: 0.5, rangedAccuracy: -2 } },
  sand: { minutes: 20, effect: { speed: 0.7, accuracy: -2, anomalyDamage: 1.2 } },
  acid: { minutes: 10, effect: { hpPerSecond: 1, armor: 0.9 } },
  storm: { minutes: 15, effect: { energyWeapon: 1.2, resist: 0.8 } },
  magnetic: { minutes: 30, effect: { portals: false } },
  blood_moon: { minutes: 20, effect: { monsterDamage: 1.3, loot: 1.2 } },
  ice_wind: { minutes: 15, effect: { speed: 0.8, hpPerSecond: 1, fireVulnerability: 1.2 } },
  spore_fog: { minutes: 25, effect: { mutationChance: 0.1, perception: -1 } },
};

/** Values that mean "this key does nothing". Safe zones swap the active effect for these. */
const WEATHER_IDENTITY: Record<string, number | boolean> = {
  vision: 1,
  rangedAccuracy: 0,
  speed: 1,
  accuracy: 0,
  anomalyDamage: 1,
  hpPerSecond: 0,
  armor: 1,
  energyWeapon: 1,
  resist: 1,
  portals: true,
  monsterDamage: 1,
  loot: 1,
  fireVulnerability: 1,
  mutationChance: 0,
  perception: 0,
};

const INVASION_REWARDS: Record<InvasionRewardKind, InvasionReward> = {
  monsters_10: { gold: 200, xp: 500, relicShardChance: 0, uniqueComponentChance: 0, coreChance: 0 },
  elite: { gold: 500, xp: 1000, relicShardChance: 0.2, uniqueComponentChance: 0, coreChance: 0 },
  invasion_boss: {
    gold: 2000,
    xp: 5000,
    relicShardChance: 0,
    uniqueComponentChance: 0.1,
    coreChance: 0,
  },
  node_hold: { gold: 300, xp: 800, relicShardChance: 0, uniqueComponentChance: 0, coreChance: 0 },
  hub_hold: {
    gold: 1000,
    xp: 2000,
    relicShardChance: 0,
    uniqueComponentChance: 0,
    coreChance: 0.05,
  },
};

const INVASION_REWARD_KINDS = new Set<string>(Object.keys(INVASION_REWARDS));

function assertFiniteMs(nowMs: number): void {
  if (!Number.isFinite(nowMs)) {
    throw new RangeError(`nowMs must be finite, got ${String(nowMs)}`);
  }
}

/** Days since the epoch. Instants before the epoch clamp to day 0 (awakening, rift day). */
function dayIndexAt(nowMs: number): number {
  assertFiniteMs(nowMs);
  const raw = Math.floor((nowMs - EPOCH_MS) / DAY_MS);
  return raw < 0 ? 0 : raw;
}

export function monthAt(nowMs: number): number {
  return Math.floor((dayIndexAt(nowMs) % YEAR_DAYS) / MONTH_DAYS) + 1;
}

export function monthDayAt(nowMs: number): number {
  return (dayIndexAt(nowMs) % MONTH_DAYS) + 1;
}

export function seasonAt(nowMs: number): SeasonId {
  const index = Math.floor((monthAt(nowMs) - 1) / 3);
  return SEASON_ORDER[index] ?? 'frost';
}

export function seasonResource(season: SeasonId): SeasonResource {
  return RESOURCE[season];
}

export function seasonSpawnTag(season: SeasonId): string {
  return SPAWN_TAG[season];
}

/** Seasonal frequency factor. A later roll uses `0.1 * seasonWeatherBonus(season)`. */
export function seasonWeatherBonus(season: SeasonId): number {
  return WEATHER_BONUS[season];
}

export function spawnMultiplier(season: SeasonId, tag: string): number {
  return tag === SPAWN_TAG[season] ? SEASON_SPAWN_MULTIPLIER : 1;
}

/** Several matching tags stay at 1.2. Callers must not multiply per tag. */
export function spawnMultiplierForTags(season: SeasonId, tags: readonly string[]): number {
  let multiplier = 1;
  for (const tag of tags) {
    const next = spawnMultiplier(season, tag);
    if (next > multiplier) {
      multiplier = next;
    }
  }
  return multiplier;
}

export function holidayAt(nowMs: number): HolidayId | null {
  const month = monthAt(nowMs);
  const day = monthDayAt(nowMs);
  if (month === 1 && day === 1) {
    return 'rift_day';
  }
  if (month === 6 && (day === 15 || day === 16)) {
    return 'first_day';
  }
  if (month === 12 && day >= 1 && day <= 3) {
    return 'barrier_day';
  }
  return null;
}

export function holidayMultiplier(holiday: HolidayId | null, stat: HolidayStat): number {
  if (holiday === 'rift_day' && stat === 'loreXp') {
    return 1.1;
  }
  if (holiday === 'first_day' && stat === 'craft') {
    return 1.1;
  }
  if (holiday === 'barrier_day' && stat === 'keeperDamage') {
    return 1.1;
  }
  return 1;
}

function isWeatherId(id: string): id is WeatherId {
  return (WEATHER_IDS as readonly string[]).includes(id);
}

function weatherDefinition(id: string): WeatherDefinition {
  if (!isWeatherId(id)) {
    throw new Error(`unknown weather: ${id}`);
  }
  return WEATHER[id];
}

export function weatherDurationMinutes(id: string): number {
  return weatherDefinition(id).minutes;
}

/**
 * Safe zones drop every weather modifier to its identity.
 * `hpPerSecond` is damage taken per real second while the effect applies; shelter is not a
 * separate argument, so a caller that already models shelter passes `inSafe` or skips the tick.
 */
export function applyWeather(
  effect: Record<string, number | boolean>,
  inSafe: boolean,
): Record<string, number | boolean> {
  if (!inSafe) {
    return { ...effect };
  }
  const neutral: Record<string, number | boolean> = {};
  for (const [key, value] of Object.entries(effect)) {
    const identity = WEATHER_IDENTITY[key];
    if (identity !== undefined) {
      neutral[key] = identity;
    } else if (typeof value === 'boolean') {
      neutral[key] = true;
    } else {
      neutral[key] = 0;
    }
  }
  return neutral;
}

export function weatherEffect(id: string, inSafe: boolean): Record<string, number | boolean> {
  return applyWeather(weatherDefinition(id).effect, inSafe);
}

/**
 * Boundaries belong to the following phase: 10 min is wave1, 60 min is done.
 * Negative elapsed (before the clock starts) stays in prepare.
 */
export function invasionPhase(elapsedMs: number): InvasionPhase {
  if (elapsedMs < 10 * MINUTE_MS) {
    return 'prepare';
  }
  if (elapsedMs < 25 * MINUTE_MS) {
    return 'wave1';
  }
  if (elapsedMs < 40 * MINUTE_MS) {
    return 'wave2';
  }
  if (elapsedMs < 55 * MINUTE_MS) {
    return 'climax';
  }
  if (elapsedMs < 60 * MINUTE_MS) {
    return 'end';
  }
  return 'done';
}

/** Each full 10% of the wave killed removes 5% strength from the next wave, capped at −50%. */
export function nextWaveMultiplier(killedRatio: number): number {
  if (!Number.isFinite(killedRatio) || killedRatio <= 0) {
    return 1;
  }
  const steps = Math.floor(killedRatio * 10 + 1e-9);
  const capped = Math.min(steps, 10);
  return 1 - capped * 0.05;
}

/** The invasion is repelled only when its boss dies during the climax phase. */
export function invasionRepelled(phase: InvasionPhase, bossKilled: boolean): boolean {
  return bossKilled && phase === 'climax';
}

export function resourceNodesClosedUntil(hubDestroyedAtMs: number): number {
  return addMs(hubDestroyedAtMs, RESOURCE_NODES_CLOSED_MS);
}

export function invasionReward(kind: string): InvasionReward {
  if (!INVASION_REWARD_KINDS.has(kind)) {
    throw new Error(`unknown invasion reward: ${kind}`);
  }
  const reward = INVASION_REWARDS[kind as InvasionRewardKind];
  return { ...reward };
}
