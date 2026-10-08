import type { WeatherPlan } from './types';

export interface EventRepository {
  addWeather(plan: WeatherPlan): void;
  weatherFor(regionId: string): readonly WeatherPlan[];
  startInvasion(regionId: string, startMs: number): void;
  invasionStartedAt(regionId: string): number | null;
}

/** In-memory schedule. No timers and no shared module state. */
export function createEventRepository(): EventRepository {
  const weather: WeatherPlan[] = [];
  const invasions = new Map<string, number>();

  return {
    addWeather(plan) {
      weather.push({
        regionId: plan.regionId,
        weatherId: plan.weatherId,
        startMs: plan.startMs,
      });
    },
    weatherFor(regionId) {
      return weather.filter((plan) => plan.regionId === regionId);
    },
    startInvasion(regionId, startMs) {
      invasions.set(regionId, startMs);
    },
    invasionStartedAt(regionId) {
      const startedAt = invasions.get(regionId);
      return startedAt === undefined ? null : startedAt;
    },
  };
}
