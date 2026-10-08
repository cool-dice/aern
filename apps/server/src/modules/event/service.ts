import {
  ANNOUNCE_LEAD_MS,
  WEATHER_IDS,
  invasionPhase,
  holidayAt,
  holidayMultiplier,
  seasonAt,
  seasonResource,
  seasonSpawnTag,
  seasonWeatherBonus,
  spawnMultiplier,
  weatherDurationMinutes,
  weatherEffect,
} from '../../../../../packages/domain/src/events';
import type { Rng } from '../../../../../packages/domain/src/rng';
import { REAL_SECOND_MS } from '../../../../../packages/domain/src/time';
import { createEventRepository, type EventRepository } from './repository';
import type { CharacterNode, EventService, EventSnapshot, WeatherPlan } from './types';

const MINUTE_MS = 60 * REAL_SECOND_MS;

function durationMs(weatherId: string): number {
  return weatherDurationMinutes(weatherId) * MINUTE_MS;
}

function activeWeather(plans: readonly WeatherPlan[], nowMs: number): WeatherPlan | null {
  let active: WeatherPlan | null = null;
  for (const plan of plans) {
    const endMs = plan.startMs + durationMs(plan.weatherId);
    if (nowMs >= plan.startMs && nowMs < endMs) {
      if (active === null || plan.startMs >= active.startMs) {
        active = plan;
      }
    }
  }
  return active;
}

function inAnnounceWindow(plans: readonly WeatherPlan[], nowMs: number): boolean {
  for (const plan of plans) {
    const opensMs = plan.startMs - ANNOUNCE_LEAD_MS;
    if (nowMs >= opensMs && nowMs < plan.startMs) {
      return true;
    }
  }
  return false;
}

function weatherIdAt(unit: number): string | null {
  const raw = Math.floor(unit * WEATHER_IDS.length);
  const index = Math.min(WEATHER_IDS.length - 1, Math.max(0, raw));
  return WEATHER_IDS[index] ?? null;
}

export function createEventService(
  repository: EventRepository = createEventRepository(),
): EventService {
  function effectAt(
    regionId: string,
    nowMs: number,
    inSafe: boolean,
  ): Record<string, number | boolean> | null {
    const active = activeWeather(repository.weatherFor(regionId), nowMs);
    if (active === null) {
      return null;
    }
    return weatherEffect(active.weatherId, inSafe);
  }

  return {
    snapshot(nowMs, regionId, inSafe): EventSnapshot {
      const season = seasonAt(nowMs);
      const holiday = holidayAt(nowMs);
      const plans = repository.weatherFor(regionId);
      const startedAt = repository.invasionStartedAt(regionId);
      return {
        season,
        resourceBonus: seasonResource(season),
        spawnTag: seasonSpawnTag(season),
        spawnTagMultiplier: spawnMultiplier(season, seasonSpawnTag(season)),
        weather: effectAt(regionId, nowMs, inSafe),
        weatherId: activeWeather(plans, nowMs)?.weatherId ?? null,
        invasion: startedAt === null ? null : invasionPhase(nowMs - startedAt),
        announced: inAnnounceWindow(plans, nowMs),
        holiday,
        craftBonus: holidayMultiplier(holiday, 'craft'),
        loreBonus: holidayMultiplier(holiday, 'loreXp'),
        keeperBonus: holidayMultiplier(holiday, 'keeperDamage'),
        invasionActive: holiday === 'barrier_day',
      };
    },

    planWeather(regionId, nowMs, rng: Rng): void {
      const chance = 0.1 * seasonWeatherBonus(seasonAt(nowMs));
      if (rng.nextUnit() >= chance) {
        return;
      }
      const weatherId = weatherIdAt(rng.nextUnit());
      if (weatherId === null) {
        return;
      }
      repository.addWeather({
        regionId,
        weatherId,
        startMs: nowMs + ANNOUNCE_LEAD_MS,
      });
    },

    startInvasion(regionId, nowMs): void {
      repository.startInvasion(regionId, nowMs);
    },

    effectsFor(characterNode: CharacterNode, now: number) {
      return effectAt(characterNode.regionId, now, characterNode.safe);
    },
  };
}
