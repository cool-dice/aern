import { expect, test } from 'vitest';
import { combatWeather, seasonSpawnCount, weatheredGatherSeconds } from './weather';

test('fog, sand, acid, blood moon, and spore fog change combat numbers', () => {
  expect(combatWeather('fog', false)).toMatchObject({ speed: 1, rangedAccuracy: -2 });
  expect(combatWeather('fog', false).speed).toBe(1);
  expect(combatWeather('sand', false).speed).toBe(0.7);
  expect(combatWeather('acid', false).hpPerSecond).toBe(1);
  expect(combatWeather('blood_moon', false)).toMatchObject({ monsterDamage: 1.3, loot: 1.2 });
  expect(combatWeather('spore_fog', false)).toMatchObject({ perception: -1 });
  expect(combatWeather('fog', true).rangedAccuracy).toBe(0);
});

test('season spawn is 1.2 and day phase is not an input', () => {
  expect(seasonSpawnCount(5)).toBe(6);
  expect(combatWeather(null, false).monsterDamage).toBe(1);
  const nightIgnored = combatWeather('sand', false);
  expect(nightIgnored.speed).toBe(combatWeather('sand', false).speed);
});

test('sand lengthens gathering', () => {
  const calm = weatheredGatherSeconds(10, 0, 'basic', true, 1);
  const sand = weatheredGatherSeconds(10, 0, 'basic', true, 0.7);
  expect(sand).toBeGreaterThan(calm);
});
