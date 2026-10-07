import { expect, test } from 'vitest';
import {
  ANNOUNCE_LEAD_MS,
  EPOCH_MS,
  DAY_MS,
  weatherEffect,
} from '../../../../../packages/domain/src/events';
import type { Rng } from '../../../../../packages/domain/src/rng';
import { REAL_SECOND_MS } from '../../../../../packages/domain/src/time';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createEventModule } from './index';
import { createEventService } from './service';

const REGION = 'ash_woods';
const MINUTE_MS = 60 * REAL_SECOND_MS;

function unitRng(value: number): Rng {
  return {
    nextUnit: () => value,
    nextInt: () => {
      throw new Error('planWeather reads nextUnit');
    },
  };
}

function scriptedRng(units: readonly number[]): Rng {
  let index = 0;
  return {
    nextUnit() {
      const value = units[index] ?? 0;
      index += 1;
      return value;
    },
    nextInt: () => {
      throw new Error('planWeather reads nextUnit');
    },
  };
}

function startedService(startMs: number) {
  const clock = manualClock(startMs);
  const service = createEventService();
  const eventModule = createEventModule(service);
  eventModule.start({ bus: createBus(), now: () => clock.now() });
  return { clock, service, eventModule };
}

test('epoch snapshot is awakening with wood', () => {
  const { clock, service, eventModule } = startedService(EPOCH_MS);
  const snap = service.snapshot(eventModule.now(), REGION, false);

  expect(clock.now()).toBe(EPOCH_MS);
  expect(snap.season).toBe('awakening');
  expect(snap.resourceBonus).toBe('wood');
  expect(snap.spawnTagMultiplier).toBe(1.2);
  expect(snap.weather).toBeNull();
  expect(snap.invasion).toBeNull();
  expect(snap.announced).toBe(false);
});

test('planWeather announces when nextUnit is 0 and skips when it is 0.99', () => {
  const hit = createEventService();
  hit.planWeather(REGION, EPOCH_MS, unitRng(0));
  const announced = hit.snapshot(EPOCH_MS, REGION, false);
  expect(announced.announced).toBe(true);
  expect(announced.weather).toBeNull();

  const miss = createEventService();
  miss.planWeather(REGION, EPOCH_MS, unitRng(0.99));
  const quiet = miss.snapshot(EPOCH_MS, REGION, false);
  expect(quiet.announced).toBe(false);
  expect(quiet.weather).toBeNull();
});

test('a constant zero roll becomes fog after the five minute lead', () => {
  const { clock, service } = startedService(EPOCH_MS);
  service.planWeather(REGION, clock.now(), unitRng(0));
  clock.advance(ANNOUNCE_LEAD_MS - 1);
  expect(service.snapshot(clock.now(), REGION, false).weather).toBeNull();
  expect(service.snapshot(clock.now(), REGION, false).announced).toBe(true);

  clock.advance(1);
  expect(service.snapshot(clock.now(), REGION, false).announced).toBe(false);
  expect(service.snapshot(clock.now(), REGION, false).weather).toEqual(weatherEffect('fog', false));

  clock.advance(15 * MINUTE_MS - 1);
  expect(service.snapshot(clock.now(), REGION, false).weather).toEqual(weatherEffect('fog', false));
  clock.advance(1);
  expect(service.snapshot(clock.now(), REGION, false).weather).toBeNull();
  expect(service.snapshot(clock.now(), REGION, false).announced).toBe(false);
});

test('season weather bonus scales the plan chance', () => {
  const roll = 0.115;
  const awakening = createEventService();
  awakening.planWeather(REGION, EPOCH_MS, unitRng(roll));
  expect(awakening.snapshot(EPOCH_MS, REGION, false).announced).toBe(false);

  const heat = createEventService();
  const heatMs = EPOCH_MS + 84 * DAY_MS;
  heat.planWeather(REGION, heatMs, unitRng(roll));
  const snap = heat.snapshot(heatMs, REGION, false);
  expect(snap.season).toBe('heat');
  expect(snap.resourceBonus).toBe('crystals');
  expect(snap.announced).toBe(true);
});

test('startInvasion is wave1 after ten minutes on the manual clock', () => {
  const { clock, service } = startedService(EPOCH_MS);
  service.startInvasion(REGION, clock.now());
  expect(service.snapshot(clock.now(), REGION, false).invasion).toBe('prepare');

  clock.advance(10 * MINUTE_MS - 1);
  expect(service.snapshot(clock.now(), REGION, false).invasion).toBe('prepare');

  clock.advance(1);
  expect(service.snapshot(clock.now(), REGION, false).invasion).toBe('wave1');
});

test('safe zone clears acid damage', () => {
  const { clock, service } = startedService(EPOCH_MS);
  service.planWeather(REGION, clock.now(), scriptedRng([0, 0.25]));
  clock.advance(ANNOUNCE_LEAD_MS);

  const outside = service.snapshot(clock.now(), REGION, false);
  expect(outside.weather).toEqual(weatherEffect('acid', false));
  expect(outside.weather?.hpPerSecond).toBe(1);

  const sheltered = service.snapshot(clock.now(), REGION, true);
  expect(sheltered.weather).toEqual(weatherEffect('acid', true));
  expect(sheltered.weather?.hpPerSecond).toBe(0);

  expect(service.effectsFor({ regionId: REGION, safe: true }, clock.now())).toEqual(
    weatherEffect('acid', true),
  );
  expect(service.effectsFor({ regionId: REGION, safe: false }, clock.now())?.hpPerSecond).toBe(1);
});

test('schedules stay on their own region', () => {
  const { clock, service } = startedService(EPOCH_MS);
  service.planWeather(REGION, clock.now(), unitRng(0));
  service.startInvasion(REGION, clock.now());
  clock.advance(ANNOUNCE_LEAD_MS + 10 * MINUTE_MS);

  const other = service.snapshot(clock.now(), 'other', false);
  expect(other.weather).toBeNull();
  expect(other.announced).toBe(false);
  expect(other.invasion).toBeNull();
  expect(service.effectsFor({ regionId: 'other', safe: false }, clock.now())).toBeNull();
});

test('the module follows the manual clock and does not read Date.now or Math.random', () => {
  const clock = manualClock(EPOCH_MS);
  const eventModule = createEventModule();
  expect(() => eventModule.now()).toThrow(/not started/);
  eventModule.start({ bus: createBus(), now: () => clock.now() });

  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  Math.random = () => {
    throw new Error('Math.random must not be read');
  };
  try {
    expect(eventModule.now()).toBe(EPOCH_MS);
    eventModule.service.planWeather(REGION, eventModule.now(), unitRng(0));
    clock.advance(ANNOUNCE_LEAD_MS);
    eventModule.service.startInvasion(REGION, eventModule.now());
    clock.advance(10 * MINUTE_MS);
    const snap = eventModule.service.snapshot(eventModule.now(), REGION, true);
    expect(snap.season).toBe('awakening');
    expect(snap.invasion).toBe('wave1');
    expect(snap.weather).toEqual(weatherEffect('fog', true));
    expect(eventModule.name).toBe('event');
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
});
