import type { InvasionPhase, SeasonId } from '../../../../../packages/domain/src/events';
import type { Rng } from '../../../../../packages/domain/src/rng';

/** A character's current node. Safe zones drop weather damage. */
export interface CharacterNode {
  regionId: string;
  safe: boolean;
}

/**
 * One scheduled anomaly. `startMs` is when the effect begins, five minutes
 * after the announcement.
 */
export interface WeatherPlan {
  regionId: string;
  weatherId: string;
  startMs: number;
}

export interface EventSnapshot {
  season: SeasonId;
  /** Seasonal gathering resource (`wood`, `crystals`, `spores`, `metal`). */
  resourceBonus: string;
  /** Spawn multiplier for this season's tag. Matching tags are 1.2 and do not stack. */
  spawnTagMultiplier: number;
  weather: Record<string, number | boolean> | null;
  /** Active anomaly id, or null while none has started. */
  weatherId: string | null;
  invasion: InvasionPhase | null;
  /** True while `now` sits in a plan's five-minute announcement window. */
  announced: boolean;
}

export interface EventService {
  snapshot(nowMs: number, regionId: string, inSafe: boolean): EventSnapshot;
  planWeather(regionId: string, nowMs: number, rng: Rng): void;
  startInvasion(regionId: string, nowMs: number): void;
  effectsFor(characterNode: CharacterNode, now: number): Record<string, number | boolean> | null;
}
