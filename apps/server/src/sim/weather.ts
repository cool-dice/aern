import { SEASON_SPAWN_MULTIPLIER, weatherEffect } from '@rift/domain/events';
import { gatherSeconds, type ToolId } from '@rift/domain/gathering';

export interface WeatherMods {
  speed: number;
  hpPerSecond: number;
  monsterDamage: number;
  rangedAccuracy: number;
  accuracy: number;
  loot: number;
  perception: number;
  /** Fog and similar anomalies shrink sight. 1 leaves the base radius. */
  vision: number;
  /** Spore weather rolls a timed mutation when this is above 0. */
  mutationChance: number;
}

const IDENTITY: WeatherMods = {
  speed: 1,
  hpPerSecond: 0,
  monsterDamage: 1,
  rangedAccuracy: 0,
  accuracy: 0,
  loot: 1,
  perception: 0,
  vision: 1,
  mutationChance: 0,
};

/** Day and night are not inputs. Artifact 7 keeps them cosmetic. */
export function combatWeather(id: string | null | undefined, safeZone: boolean): WeatherMods {
  if (id === null || id === undefined || id === '') {
    return { ...IDENTITY };
  }
  const effect = weatherEffect(id, safeZone);
  return {
    speed: numberOf(effect.speed, 1),
    hpPerSecond: numberOf(effect.hpPerSecond, 0),
    monsterDamage: numberOf(effect.monsterDamage, 1),
    rangedAccuracy: numberOf(effect.rangedAccuracy, 0),
    accuracy: numberOf(effect.accuracy, 0),
    loot: numberOf(effect.loot, 1),
    perception: numberOf(effect.perception, 0),
    vision: numberOf(effect.vision, 1),
    mutationChance: numberOf(effect.mutationChance, 0),
  };
}

export function seasonSpawnCount(base: number): number {
  return Math.max(0, Math.round(base * SEASON_SPAWN_MULTIPLIER));
}

/** Slower weather stretches gathering. Speed 1 leaves `gatherSeconds` unchanged. */
export function weatheredGatherSeconds(
  baseSeconds: number,
  technique: number,
  tool: ToolId,
  techniqueGateOk: boolean,
  weatherSpeed: number,
): number {
  const seconds = gatherSeconds(baseSeconds, technique, tool, techniqueGateOk);
  if (weatherSpeed >= 1 || weatherSpeed <= 0) {
    return seconds;
  }
  return Math.max(1, Math.floor(seconds / weatherSpeed));
}

function numberOf(value: number | boolean | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
