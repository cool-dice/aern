import { expect, test } from 'vitest';
import { applyWear } from './items';
import { mulberry32, type Rng } from './rng';
import {
  advanceRelic,
  installDurationMs,
  installGold,
  relicBonuses,
  removeRelic,
  socketCount,
  startInstall,
  type RelicState,
  type RelicSubtype,
} from './relics';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function relic(overrides: Partial<RelicState> & Pick<RelicState, 'subtype'>): RelicState {
  return {
    grade: 'common',
    durability: 100,
    fed: true,
    onlineWornMs: 0,
    silencedUntilMs: 0,
    echoIds: [],
    ...overrides,
  };
}

function scripted(units: readonly number[]): Rng {
  let index = 0;
  return {
    nextUnit(): number {
      const value = units[index];
      index += 1;
      if (value === undefined) {
        return 1;
      }
      return value;
    },
    nextInt(): number {
      throw new Error('nextInt was not expected');
    },
  };
}

function neverRng(): Rng {
  return {
    nextUnit(): number {
      throw new Error('rng should not be used');
    },
    nextInt(): number {
      throw new Error('rng should not be used');
    },
  };
}

function advance(
  state: RelicState,
  hours: number,
  options?: {
    amino?: number;
    cells?: number;
    nowMs?: number;
    rng?: Rng;
    onlineDeltaMs?: number;
  },
) {
  return advanceRelic({
    relic: state,
    onlineDeltaMs: options?.onlineDeltaMs ?? hours * HOUR_MS,
    amino: options?.amino ?? 0,
    cells: options?.cells ?? 0,
    nowMs: options?.nowMs ?? 0,
    rng: options?.rng ?? scripted([]),
  });
}

test('sockets are 1/2/3/3, including unique', () => {
  expect(socketCount('common')).toBe(1);
  expect(socketCount('rare')).toBe(2);
  expect(socketCount('epic')).toBe(3);
  expect(socketCount('unique')).toBe(3);
});

test('install durations and gold match the subtype table', () => {
  const table: Record<RelicSubtype, { ms: number; gold: number }> = {
    spore: { ms: 0, gold: 0 },
    culture: { ms: 30 * MINUTE_MS, gold: 100 },
    symbiont: { ms: 60 * MINUTE_MS, gold: 250 },
    plate: { ms: 0, gold: 0 },
    mechanism: { ms: 30 * MINUTE_MS, gold: 100 },
    crystal: { ms: 60 * MINUTE_MS, gold: 250 },
  };
  for (const subtype of Object.keys(table) as RelicSubtype[]) {
    expect(installDurationMs(subtype)).toBe(table[subtype].ms);
    expect(installGold(subtype)).toBe(table[subtype].gold);
  }
});

test('spore install keeps gold and is ready now; symbiont costs 250 and 60 minutes', () => {
  const now = 5_000;
  const spore = startInstall({
    clean: false,
    inCombat: false,
    inCityOrHub: true,
    gold: 40,
    subtype: 'spore',
    nowMs: now,
  });
  expect(spore).toEqual({ ok: true, value: { gold: 40, readyAtMs: now } });

  const symbiont = startInstall({
    clean: false,
    inCombat: false,
    inCityOrHub: true,
    gold: 250,
    subtype: 'symbiont',
    nowMs: now,
  });
  expect(symbiont).toEqual({
    ok: true,
    value: { gold: 0, readyAtMs: now + 60 * MINUTE_MS },
  });

  const short = startInstall({
    clean: false,
    inCombat: false,
    inCityOrHub: true,
    gold: 249,
    subtype: 'symbiont',
    nowMs: now,
  });
  expect(short).toEqual({ ok: false, code: 'gold' });
});

test('install refuses a clean character, combat, and zones outside a city or hub', () => {
  const base = {
    clean: false,
    inCombat: false,
    inCityOrHub: true,
    gold: 0,
    subtype: 'spore' as const,
    nowMs: 10,
  };
  expect(startInstall({ ...base, clean: true })).toEqual({ ok: false, code: 'clean' });
  expect(startInstall({ ...base, inCombat: true, gold: 500 })).toEqual({
    ok: false,
    code: 'combat',
  });
  expect(startInstall({ ...base, inCityOrHub: false, gold: 500 })).toEqual({
    ok: false,
    code: 'zone',
  });
  expect(
    startInstall({
      clean: true,
      inCombat: true,
      inCityOrHub: false,
      gold: 0,
      subtype: 'symbiont',
      nowMs: 10,
    }),
  ).toEqual({ ok: false, code: 'clean' });
});

test('spore loses 5 durability with food and 10 without, and amino does not go negative', () => {
  const fed = advance(relic({ subtype: 'spore' }), 1, { amino: 1, rng: scripted([1, 1, 1]) });
  expect(fed.relic.durability).toBe(95);
  expect(fed.relic.durability).toBe(applyWear(100, 5));
  expect(fed.amino).toBe(0);
  expect(fed.relic.fed).toBe(true);
  expect(fed.risks).toEqual([]);

  const hungry = advance(relic({ subtype: 'spore' }), 1, { amino: 0, rng: scripted([1, 1, 1]) });
  expect(hungry.relic.durability).toBe(90);
  expect(hungry.amino).toBe(0);
  expect(hungry.relic.fed).toBe(false);

  const twoHours = advance(relic({ subtype: 'spore' }), 2, {
    amino: 1,
    rng: scripted([1, 1, 1, 1, 1, 1]),
  });
  expect(twoHours.amino).toBe(0);
  expect(twoHours.relic.durability).toBe(85);
  expect(twoHours.relic.fed).toBe(false);
});

test('plate loses 1 in the first hour; an unfed mechanism loses 4 on the second hour', () => {
  const plate = advance(relic({ subtype: 'plate' }), 1, { cells: 0, rng: scripted([1, 1]) });
  expect(plate.relic.durability).toBe(99);
  expect(plate.relic.fed).toBe(true);
  expect(plate.cells).toBe(0);

  const first = advance(relic({ subtype: 'mechanism' }), 1, { cells: 0, rng: scripted([1, 1]) });
  expect(first.relic.durability).toBe(98);
  expect(first.cells).toBe(0);

  const second = advance(first.relic, 1, { cells: 0, rng: scripted([1, 1]) });
  expect(first.relic.durability - second.relic.durability).toBe(4);
  expect(second.relic.durability).toBe(94);
  expect(second.relic.fed).toBe(false);

  const fedSecond = advance(first.relic, 1, { cells: 1, rng: scripted([1, 1]) });
  expect(first.relic.durability - fedSecond.relic.durability).toBe(2);
  expect(fedSecond.cells).toBe(0);
  expect(fedSecond.relic.fed).toBe(true);
});

test('corrosion triggers on the first nextUnit of 0 and takes 5 more; 0.5 does not', () => {
  const hit = advance(relic({ subtype: 'plate' }), 1, { rng: scripted([0, 1]) });
  expect(hit.risks).toEqual(['corrosion']);
  expect(hit.relic.durability).toBe(applyWear(applyWear(100, 1), 5));
  expect(hit.relic.durability).toBe(94);

  const miss = advance(relic({ subtype: 'plate' }), 1, { rng: scripted([0.5, 0.5]) });
  expect(miss.risks).toEqual([]);
  expect(miss.relic.durability).toBe(99);
  expect(hit.relic.durability).toBe(miss.relic.durability - 5);
});

test('removal returns echo ids and refuses combat or a zone outside the city', () => {
  const state = relic({
    subtype: 'crystal',
    durability: 0,
    echoIds: ['echo-a', 'echo-b'],
  });
  const removed = removeRelic(state, true, false);
  expect(removed).toEqual({ ok: true, value: { lostEchoIds: ['echo-a', 'echo-b'] } });
  if (removed.ok) {
    removed.value.lostEchoIds.push('mutated');
  }
  expect(state.echoIds).toEqual(['echo-a', 'echo-b']);
  expect(removeRelic(state, true, true)).toEqual({ ok: false, code: 'combat' });
  expect(removeRelic(state, false, false)).toEqual({ ok: false, code: 'zone' });
  expect(removeRelic(state, false, true)).toEqual({ ok: false, code: 'combat' });
});

test('culture adds 1 per 10 online hours, capped so the stat bonus is at most 6', () => {
  const culture = (hours: number): RelicState =>
    relic({
      subtype: 'culture',
      grade: 'epic',
      bonusStat: 'will',
      onlineWornMs: hours * HOUR_MS,
    });
  expect(relicBonuses(culture(0), 1, 0)).toEqual({ stats: { will: 1 }, armor: 0, active: true });
  expect(relicBonuses(culture(10), 20, 0)).toEqual({ stats: { will: 2 }, armor: 0, active: true });
  expect(relicBonuses(culture(50), 20, 0)).toEqual({ stats: { will: 6 }, armor: 0, active: true });
  expect(relicBonuses(culture(60), 20, 0)).toEqual({ stats: { will: 6 }, armor: 0, active: true });
  const almost = relic({
    subtype: 'culture',
    bonusStat: 'body',
    onlineWornMs: 10 * HOUR_MS - 1,
  });
  expect(relicBonuses(almost, 1, 0).stats.body).toBe(1);
});

test('symbiont bonus is 1 plus one per 5 levels, capped at 6', () => {
  const state = relic({ subtype: 'symbiont', bonusStat: 'perception' });
  expect(relicBonuses(state, 1, 0).stats.perception).toBe(1);
  expect(relicBonuses(state, 4, 0).stats.perception).toBe(1);
  expect(relicBonuses(state, 5, 0).stats.perception).toBe(2);
  expect(relicBonuses(state, 25, 0).stats.perception).toBe(6);
  expect(relicBonuses(state, 50, 0).stats.perception).toBe(6);
  expect(() => relicBonuses(state, 0, 0)).toThrow(RangeError);
  expect(() => relicBonuses(state, 51, 0)).toThrow(RangeError);
});

test('flat subtype bonuses stay off itemStatValue and turn off while silenced or destroyed', () => {
  const spore = relic({ subtype: 'spore', bonusStat: 'accuracy', penaltyStat: 'body' });
  expect(relicBonuses(spore, 10, 0)).toEqual({
    stats: { accuracy: 2, body: -1 },
    armor: 0,
    active: true,
  });
  expect(relicBonuses({ ...spore, durability: 0 }, 10, 0)).toEqual({
    stats: {},
    armor: 0,
    active: false,
  });

  const plate = relic({ subtype: 'plate' });
  expect(relicBonuses(plate, 3, 0)).toEqual({ stats: {}, armor: 1, active: true });
  expect(relicBonuses({ ...plate, silencedUntilMs: 1_000 }, 3, 999).active).toBe(false);
  expect(relicBonuses({ ...plate, silencedUntilMs: 1_000 }, 3, 1_000)).toEqual({
    stats: {},
    armor: 1,
    active: true,
  });

  expect(relicBonuses(relic({ subtype: 'mechanism', bonusStat: 'technique' }), 8, 0)).toEqual({
    stats: { technique: 1 },
    armor: 0,
    active: true,
  });
  expect(
    relicBonuses(relic({ subtype: 'mechanism', bonusStat: 'perception' }), 8, 0).stats,
  ).toEqual({
    perception: 1,
  });
  expect(relicBonuses(relic({ subtype: 'crystal', bonusStat: 'will' }), 8, 0).stats).toEqual({
    will: 1,
  });
  expect(relicBonuses(relic({ subtype: 'crystal', bonusStat: 'accuracy' }), 8, 0).stats).toEqual({
    accuracy: 1,
  });
  expect(() => relicBonuses(relic({ subtype: 'mechanism', bonusStat: 'will' }), 8, 0)).toThrow(
    RangeError,
  );
  expect(() =>
    relicBonuses(relic({ subtype: 'spore', bonusStat: 'body', penaltyStat: 'body' }), 8, 0),
  ).toThrow(RangeError);
});

test('reject and jam share silencedUntilMs and keep the later deadline', () => {
  const now = 50_000;
  const rejected = advance(relic({ subtype: 'culture', bonusStat: 'will' }), 1, {
    amino: 1,
    nowMs: now,
    rng: scripted([1, 1, 0]),
  });
  expect(rejected.risks).toEqual(['reject']);
  expect(rejected.relic.silencedUntilMs).toBe(now + HOUR_MS);
  expect(relicBonuses(rejected.relic, 4, now).active).toBe(false);
  expect(relicBonuses(rejected.relic, 4, now + HOUR_MS).active).toBe(true);

  const jammed = advance(relic({ subtype: 'crystal', silencedUntilMs: now + HOUR_MS }), 1, {
    nowMs: now,
    rng: scripted([1, 0]),
  });
  expect(jammed.risks).toEqual(['jam']);
  expect(jammed.relic.silencedUntilMs).toBe(now + HOUR_MS);

  const freshJam = advance(relic({ subtype: 'crystal' }), 1, {
    nowMs: now,
    rng: scripted([1, 0]),
  });
  expect(freshJam.relic.silencedUntilMs).toBe(now + 10 * MINUTE_MS);
});

test('online time keeps the remainder and only full hours tick', () => {
  const partial = advance(relic({ subtype: 'spore' }), 0, {
    amino: 3,
    onlineDeltaMs: HOUR_MS - 1,
    rng: neverRng(),
  });
  expect(partial.relic.durability).toBe(100);
  expect(partial.relic.onlineWornMs).toBe(HOUR_MS - 1);
  expect(partial.amino).toBe(3);

  const crossed = advance(partial.relic, 0, {
    amino: 3,
    onlineDeltaMs: 1,
    rng: scripted([1, 1, 1]),
  });
  expect(crossed.relic.onlineWornMs).toBe(HOUR_MS);
  expect(crossed.relic.durability).toBe(95);
  expect(crossed.amino).toBe(2);
});

test('a destroyed relic stops eating and does not roll risks', () => {
  const dying = advance(relic({ subtype: 'spore', durability: 6 }), 3, {
    amino: 5,
    rng: scripted([1, 1, 1]),
  });
  expect(dying.relic.durability).toBe(0);
  expect(dying.amino).toBe(3);
  expect(dying.risks).toEqual([]);

  const already = advance(relic({ subtype: 'plate', durability: 0, fed: true }), 4, {
    cells: 4,
    rng: neverRng(),
  });
  expect(already.cells).toBe(4);
  expect(already.relic.fed).toBe(true);
  expect(already.relic.onlineWornMs).toBe(4 * HOUR_MS);
});

test('wear that hits zero skips that hour of risks', () => {
  const result = advance(relic({ subtype: 'plate', durability: 1 }), 1, { rng: neverRng() });
  expect(result.relic.durability).toBe(0);
  expect(result.risks).toEqual([]);
});

test('mech cells are spent on even hours only and never go negative', () => {
  const result = advance(relic({ subtype: 'mechanism' }), 4, {
    cells: 1,
    rng: scripted([1, 1, 1, 1, 1, 1, 1, 1]),
  });
  expect(result.cells).toBe(0);
  expect(result.relic.durability).toBe(90);
  expect(result.relic.fed).toBe(false);
});

test('the same rng seed produces the same risks', () => {
  const run = () => advance(relic({ subtype: 'spore' }), 8, { amino: 8, rng: mulberry32(11) });
  const first = run();
  const second = run();
  expect(first.risks).toEqual(second.risks);
  expect(first.relic.durability).toBe(second.relic.durability);
  expect(first.relic.silencedUntilMs).toBe(second.relic.silencedUntilMs);
  expect(first.amino).toBe(0);
});

test('advanceRelic does not mutate the input relic', () => {
  const echoIds = ['echo-1'];
  const state = relic({ subtype: 'plate', echoIds });
  const result = advance(state, 1, { rng: scripted([0, 0]) });
  expect(state.durability).toBe(100);
  expect(state.echoIds).toEqual(['echo-1']);
  expect(result.relic.echoIds).not.toBe(state.echoIds);
  expect(result.risks).toEqual(['corrosion', 'jam']);
});

test('program errors throw RangeError', () => {
  expect(() =>
    startInstall({
      clean: false,
      inCombat: false,
      inCityOrHub: true,
      gold: -1,
      subtype: 'plate',
      nowMs: 0,
    }),
  ).toThrow(RangeError);
  expect(() => advance(relic({ subtype: 'plate' }), 0, { onlineDeltaMs: -1 })).toThrow(RangeError);
  expect(() => advance(relic({ subtype: 'plate' }), 1, { amino: -1 })).toThrow(RangeError);
  expect(() => advance(relic({ subtype: 'plate' }), 1, { cells: 1.5 })).toThrow(RangeError);
});
