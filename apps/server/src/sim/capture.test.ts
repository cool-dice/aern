import { readFileSync } from 'node:fs';
import { WAR_HOLD_MS, WAR_MUSTER_MS } from '@rift/domain/guild';
import { expect, test } from 'vitest';
import { readCaptures, tickCaptures } from './capture';

const war = { cityId: 'fort_humans', startsAtMs: -WAR_MUSTER_MS };
const contenders = [{ cityId: 'fort_humans', guildId: 'wolves' }];

test('tickCaptures calls warWinner and settleWar, and a muster hold does not win', () => {
  const compose = readFileSync(new URL('../compose.ts', import.meta.url), 'utf8');
  const tick = readFileSync(new URL('../compose.ts', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./capture.ts', import.meta.url), 'utf8');
  const tickOnce = tick.slice(tick.indexOf('function tickOnce'), tick.indexOf('function simSnapshot'));
  expect(compose.includes('tickCaptures(')).toBe(true);
  expect(tickOnce.includes('tickCaptures(')).toBe(true);
  expect(compose.includes('readCaptures(')).toBe(true);
  expect(source.includes('advanceHold(')).toBe(true);
  expect(source.includes('holdWins(')).toBe(true);
  expect(source.includes('warWinner(')).toBe(true);
  expect(source.includes('settleWar(')).toBe(true);
  expect(readCaptures({ captures: [{ cityId: 'fort_humans', guildId: 'wolves', heldMs: 600_000, won: true }] })).toEqual([
    { cityId: 'fort_humans', guildId: 'wolves', heldMs: 600_000, won: true },
  ]);
  const present = [{ cityId: 'fort_humans', guildId: 'wolves' }];
  const muster = { cityId: 'fort_humans', startsAtMs: 0 };
  let held = tickCaptures({
    holds: [],
    wars: [muster],
    nowMs: 0,
    deltaMs: 100,
    present,
    contenders,
  });
  held = tickCaptures({
    holds: held,
    wars: [muster],
    nowMs: WAR_HOLD_MS,
    deltaMs: WAR_HOLD_MS,
    present,
    contenders,
  });
  expect(held[0]).toMatchObject({ guildId: 'wolves', heldMs: 0, won: false });
});

test('one contender guild on the city accrues the hold during assault and 600000 ms wins', () => {
  const present = [{ cityId: 'fort_humans', guildId: 'wolves' }];
  let holds = tickCaptures({ holds: [], wars: [war], nowMs: 0, deltaMs: 100, present, contenders });
  expect(holds[0]).toMatchObject({ cityId: 'fort_humans', guildId: 'wolves', heldMs: 0, won: false });
  for (let step = 0; step < 6_000; step += 1) {
    holds = tickCaptures({
      holds,
      wars: [war],
      nowMs: 100 * (step + 1),
      deltaMs: 100,
      present,
      contenders,
    });
  }
  expect(holds[0]).toMatchObject({ guildId: 'wolves', heldMs: 600_000, won: true });
  const contested = tickCaptures({
    holds,
    wars: [war],
    nowMs: 700_000,
    deltaMs: 100,
    present: [...present, { cityId: 'fort_humans', guildId: 'ashes' }],
    contenders,
  });
  expect(contested[0]).toMatchObject({ guildId: 'wolves', heldMs: 600_000, won: true });
});

test('a mercenary or a guild that did not register cannot take the city', () => {
  const present = [{ cityId: 'fort_humans', guildId: 'wolves', mercenary: true }];
  const held = tickCaptures({
    holds: [],
    wars: [war],
    nowMs: WAR_HOLD_MS,
    deltaMs: WAR_HOLD_MS,
    present,
    contenders,
  });
  expect(held[0]).toMatchObject({ won: false, guildId: null });
  const outsider = tickCaptures({
    holds: [],
    wars: [war],
    nowMs: WAR_HOLD_MS,
    deltaMs: WAR_HOLD_MS,
    present: [{ cityId: 'fort_humans', guildId: 'ashes' }],
    contenders,
  });
  expect(outsider[0]).toMatchObject({ won: false, guildId: null });
});

test('a second guild on the city resets a hold that has not been won', () => {
  const alone = [{ cityId: 'fort_humans', guildId: 'wolves' }];
  let holds = tickCaptures({ holds: [], wars: [war], nowMs: 0, deltaMs: 100, present: alone, contenders });
  holds = tickCaptures({ holds, wars: [war], nowMs: 100, deltaMs: 100, present: alone, contenders });
  expect(holds[0]?.heldMs).toBe(100);
  const reset = tickCaptures({
    holds,
    wars: [war],
    nowMs: 200,
    deltaMs: 100,
    present: [...alone, { cityId: 'fort_humans', guildId: 'ashes' }],
    contenders,
  });
  expect(reset[0]).toMatchObject({ cityId: 'fort_humans', guildId: null, heldMs: 0, won: false });
});

test('the finish settles a draw and stores the 3 day cooldown', () => {
  const present = [
    { cityId: 'fort_humans', guildId: 'wolves' },
    { cityId: 'fort_humans', guildId: 'ashes' },
  ];
  const both = [
    { cityId: 'fort_humans', guildId: 'wolves' },
    { cityId: 'fort_humans', guildId: 'ashes' },
  ];
  const finishAt = WAR_MUSTER_MS + 60 * 60 * 1000;
  const held = tickCaptures({
    holds: [{ cityId: 'fort_humans', guildId: 'defenders', heldMs: 0, won: true, ownerGuildId: 'defenders' }],
    wars: [{ cityId: 'fort_humans', startsAtMs: 0 }],
    nowMs: finishAt,
    deltaMs: 100,
    present,
    contenders: both,
  });
  expect(held[0]).toMatchObject({
    won: true,
    guildId: 'defenders',
    settled: true,
    drawEndedAtMs: finishAt,
  });
});
