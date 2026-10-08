import { expect, test } from 'vitest';
import { GAME_DAY_MS, REAL_SECOND_MS, dayPhase } from './time';
import {
  ANNOUNCE_LEAD_MS,
  DAY_MS,
  EPOCH_MS,
  MONTH_DAYS,
  RESOURCE_NODES_CLOSED_MS,
  SEASON_DAYS,
  SEASON_RESOURCE_BONUS,
  YEAR_DAYS,
  holidayAt,
  holidayMultiplier,
  invasionPhase,
  invasionRepelled,
  invasionReward,
  monthAt,
  monthDayAt,
  nextWaveMultiplier,
  resourceNodesClosedUntil,
  seasonAt,
  seasonResource,
  seasonSpawnTag,
  seasonWeatherBonus,
  spawnMultiplier,
  spawnMultiplierForTags,
  weatherDurationMinutes,
  weatherEffect,
} from './events';

const MINUTE_MS = 60 * REAL_SECOND_MS;

test('epoch constants match the world calendar', () => {
  expect(EPOCH_MS).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  expect(DAY_MS).toBe(86_400_000);
  expect(MONTH_DAYS).toBe(28);
  expect(YEAR_DAYS).toBe(336);
  expect(SEASON_DAYS).toBe(84);
  expect(SEASON_RESOURCE_BONUS).toBe(1);
});

test('epoch is awakening, month 1, rift day', () => {
  expect(seasonAt(EPOCH_MS)).toBe('awakening');
  expect(monthAt(EPOCH_MS)).toBe(1);
  expect(monthDayAt(EPOCH_MS)).toBe(1);
  expect(holidayAt(EPOCH_MS)).toBe('rift_day');
  expect(seasonResource('awakening')).toBe('wood');
});

test('84 days after the epoch is heat', () => {
  expect(seasonAt(EPOCH_MS + 84 * DAY_MS)).toBe('heat');
  expect(monthAt(EPOCH_MS + 84 * DAY_MS)).toBe(4);
  expect(seasonAt(EPOCH_MS + 84 * DAY_MS - 1)).toBe('awakening');
});

test('seasons follow 84-day blocks and wrap the 336-day year', () => {
  expect(seasonAt(EPOCH_MS + 168 * DAY_MS)).toBe('fade');
  expect(seasonAt(EPOCH_MS + 252 * DAY_MS)).toBe('frost');
  expect(seasonAt(EPOCH_MS + 336 * DAY_MS)).toBe('awakening');
  expect(holidayAt(EPOCH_MS + 336 * DAY_MS)).toBe('rift_day');
  expect(monthAt(EPOCH_MS + 336 * DAY_MS)).toBe(1);
});

test('time before the epoch clamps to awakening', () => {
  expect(seasonAt(EPOCH_MS - 1)).toBe('awakening');
  expect(monthAt(EPOCH_MS - 1)).toBe(1);
  expect(holidayAt(EPOCH_MS - 1)).toBe('rift_day');
  expect(seasonAt(-1)).toBe('awakening');
});

test('day and night do not change season multipliers', () => {
  const night = EPOCH_MS + GAME_DAY_MS / 2;
  expect(dayPhase(night)).toBe('night');
  expect(seasonAt(night)).toBe('awakening');
  expect(spawnMultiplier(seasonAt(night), 'pack')).toBe(1.2);
  expect(spawnMultiplier(seasonAt(EPOCH_MS), 'pack')).toBe(
    spawnMultiplier(seasonAt(night), 'pack'),
  );
});

test('spawn multiplier is 1.2 for the season tag and does not stack', () => {
  expect(seasonSpawnTag('awakening')).toBe('pack');
  expect(seasonSpawnTag('heat')).toBe('fire');
  expect(seasonSpawnTag('fade')).toBe('undead');
  expect(seasonSpawnTag('frost')).toBe('ice');

  expect(spawnMultiplier('awakening', 'pack')).toBe(1.2);
  expect(spawnMultiplier('heat', 'fire')).toBe(1.2);
  expect(spawnMultiplier('fade', 'undead')).toBe(1.2);
  expect(spawnMultiplier('frost', 'ice')).toBe(1.2);
  expect(spawnMultiplier('awakening', 'fire')).toBe(1);
  expect(spawnMultiplier('frost', 'armor')).toBe(1);
  expect(spawnMultiplierForTags('heat', ['fire', 'desert', 'fire'])).toBe(1.2);
});

test('season resources and weather frequency bonuses', () => {
  expect(seasonResource('awakening')).toBe('wood');
  expect(seasonResource('heat')).toBe('crystals');
  expect(seasonResource('fade')).toBe('spores');
  expect(seasonResource('frost')).toBe('metal');
  expect(seasonWeatherBonus('awakening')).toBe(1.1);
  expect(seasonWeatherBonus('heat')).toBe(1.2);
  expect(seasonWeatherBonus('fade')).toBe(1.15);
  expect(seasonWeatherBonus('frost')).toBe(1.15);
});

test('first day starts 14 days after month 6', () => {
  const start = EPOCH_MS + (28 * 5 + 14) * DAY_MS;
  expect(monthAt(start)).toBe(6);
  expect(monthDayAt(start)).toBe(15);
  expect(holidayAt(start)).toBe('first_day');
  expect(holidayAt(start + DAY_MS)).toBe('first_day');
  expect(holidayAt(start + 2 * DAY_MS)).toBe(null);
});

test('holiday is null on month 1 day 2', () => {
  const day = EPOCH_MS + DAY_MS;
  expect(monthAt(day)).toBe(1);
  expect(monthDayAt(day)).toBe(2);
  expect(holidayAt(day)).toBe(null);
});

test('barrier day covers the first three days of month 12', () => {
  const start = EPOCH_MS + 28 * 11 * DAY_MS;
  expect(seasonAt(start)).toBe('frost');
  expect(holidayAt(start)).toBe('barrier_day');
  expect(holidayAt(start + DAY_MS)).toBe('barrier_day');
  expect(holidayAt(start + 2 * DAY_MS)).toBe('barrier_day');
  expect(holidayAt(start + 3 * DAY_MS)).toBe(null);
});

test('holiday multipliers', () => {
  expect(holidayMultiplier('rift_day', 'loreXp')).toBe(1.1);
  expect(holidayMultiplier('rift_day', 'craft')).toBe(1);
  expect(holidayMultiplier('first_day', 'craft')).toBe(1.1);
  expect(holidayMultiplier('barrier_day', 'keeperDamage')).toBe(1.1);
  expect(holidayMultiplier(null, 'loreXp')).toBe(1);
});

test('safe zone clears acid hp damage', () => {
  expect(weatherEffect('acid', false).hpPerSecond).toBe(1);
  expect(weatherEffect('acid', false).armor).toBe(0.9);
  expect(weatherEffect('acid', true).hpPerSecond).toBe(0);
  expect(weatherEffect('acid', true).armor).toBe(1);
});

test('weather effects, durations, and safe-zone identity', () => {
  expect(ANNOUNCE_LEAD_MS).toBe(5 * MINUTE_MS);
  expect(weatherDurationMinutes('fog')).toBe(15);
  expect(weatherDurationMinutes('sand')).toBe(20);
  expect(weatherDurationMinutes('acid')).toBe(10);
  expect(weatherDurationMinutes('storm')).toBe(15);
  expect(weatherDurationMinutes('magnetic')).toBe(30);
  expect(weatherDurationMinutes('blood_moon')).toBe(20);
  expect(weatherDurationMinutes('ice_wind')).toBe(15);
  expect(weatherDurationMinutes('spore_fog')).toBe(25);

  expect(weatherEffect('fog', false)).toEqual({ vision: 0.5, rangedAccuracy: -2 });
  expect(weatherEffect('sand', false)).toEqual({ speed: 0.7, accuracy: -2, anomalyDamage: 1.2 });
  expect(weatherEffect('storm', false)).toEqual({ energyWeapon: 1.2, resist: 0.8 });
  expect(weatherEffect('magnetic', false)).toEqual({ portals: false });
  expect(weatherEffect('magnetic', true)).toEqual({ portals: true });
  expect(weatherEffect('blood_moon', false)).toEqual({ monsterDamage: 1.3, loot: 1.2 });
  expect(weatherEffect('ice_wind', false)).toEqual({
    speed: 0.8,
    hpPerSecond: 1,
    fireVulnerability: 1.2,
  });
  expect(weatherEffect('ice_wind', true).hpPerSecond).toBe(0);
  expect(weatherEffect('spore_fog', false)).toEqual({ mutationChance: 0.1, perception: -1 });
  expect(weatherEffect('fog', true)).toEqual({ vision: 1, rangedAccuracy: 0 });
});

test('unknown weather id throws', () => {
  expect(() => weatherEffect('rain', false)).toThrow(/unknown weather/);
});

test('invasion phase boundaries belong to the next phase', () => {
  expect(invasionPhase(599_999)).toBe('prepare');
  expect(invasionPhase(600_000)).toBe('wave1');
  expect(invasionPhase(0)).toBe('prepare');
  expect(invasionPhase(-1)).toBe('prepare');
  expect(invasionPhase(25 * MINUTE_MS - 1)).toBe('wave1');
  expect(invasionPhase(25 * MINUTE_MS)).toBe('wave2');
  expect(invasionPhase(40 * MINUTE_MS)).toBe('climax');
  expect(invasionPhase(55 * MINUTE_MS - 1)).toBe('climax');
  expect(invasionPhase(55 * MINUTE_MS)).toBe('end');
  expect(invasionPhase(60 * MINUTE_MS - 1)).toBe('end');
  expect(invasionPhase(60 * MINUTE_MS)).toBe('done');
  expect(invasionPhase(90 * MINUTE_MS)).toBe('done');
});

test('next wave loses 5% per 10% killed, capped at half', () => {
  expect(nextWaveMultiplier(0)).toBe(1);
  expect(nextWaveMultiplier(0.09)).toBe(1);
  expect(nextWaveMultiplier(0.1)).toBeCloseTo(0.95);
  expect(nextWaveMultiplier(0.19)).toBeCloseTo(0.95);
  expect(nextWaveMultiplier(0.2)).toBeCloseTo(0.9);
  expect(nextWaveMultiplier(1)).toBeCloseTo(0.5);
  expect(nextWaveMultiplier(1.4)).toBeCloseTo(0.5);
});

test('boss killed in climax repels the invasion', () => {
  expect(invasionRepelled('climax', true)).toBe(true);
  expect(invasionRepelled('climax', false)).toBe(false);
  expect(invasionRepelled('wave2', true)).toBe(false);
  expect(invasionRepelled('end', true)).toBe(false);
});

test('destroyed hub closes resource nodes for one hour', () => {
  expect(RESOURCE_NODES_CLOSED_MS).toBe(60 * 60 * REAL_SECOND_MS);
  expect(resourceNodesClosedUntil(1_000)).toBe(1_000 + RESOURCE_NODES_CLOSED_MS);
});

test('invasion rewards match artifact 21 section 5.3', () => {
  expect(invasionReward('monsters_10')).toEqual({
    gold: 200,
    xp: 500,
    relicShardChance: 0,
    uniqueComponentChance: 0,
    coreChance: 0,
  });
  expect(invasionReward('elite')).toEqual({
    gold: 500,
    xp: 1000,
    relicShardChance: 0.2,
    uniqueComponentChance: 0,
    coreChance: 0,
  });
  expect(invasionReward('invasion_boss')).toEqual({
    gold: 2000,
    xp: 5000,
    relicShardChance: 0,
    uniqueComponentChance: 0.1,
    coreChance: 0,
  });
  expect(invasionReward('node_hold')).toEqual({
    gold: 300,
    xp: 800,
    relicShardChance: 0,
    uniqueComponentChance: 0,
    coreChance: 0,
  });
  expect(invasionReward('hub_hold')).toEqual({
    gold: 1000,
    xp: 2000,
    relicShardChance: 0,
    uniqueComponentChance: 0,
    coreChance: 0.05,
  });
  expect(() => invasionReward('title')).toThrow(/unknown invasion reward/);
});
