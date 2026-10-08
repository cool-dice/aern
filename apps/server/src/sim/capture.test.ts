import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readCaptures, tickCaptures } from './capture';

const war = { cityId: 'fort_humans', startsAtMs: 0 };

test('tickOnce calls tickCaptures, which calls advanceHold and holdWins', () => {
  const compose = readFileSync(new URL('../compose.ts', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./capture.ts', import.meta.url), 'utf8');
  expect(compose.includes('tickCaptures(')).toBe(true);
  expect(compose.includes('readCaptures(')).toBe(true);
  expect(source.includes('advanceHold(')).toBe(true);
  expect(source.includes('holdWins(')).toBe(true);
  expect(readCaptures({ captures: [{ cityId: 'fort_humans', guildId: 'wolves', heldMs: 600_000, won: true }] })).toEqual([
    { cityId: 'fort_humans', guildId: 'wolves', heldMs: 600_000, won: true },
  ]);
});

test('one guild on the city accrues the hold and 600000 ms wins', () => {
  const present = [{ cityId: 'fort_humans', guildId: 'wolves' }];
  let holds = tickCaptures({ holds: [], wars: [war], nowMs: 0, deltaMs: 100, present });
  expect(holds).toEqual([{ cityId: 'fort_humans', guildId: 'wolves', heldMs: 0, won: false }]);
  for (let step = 0; step < 6_000; step += 1) {
    holds = tickCaptures({ holds, wars: [war], nowMs: 100 * (step + 1), deltaMs: 100, present });
  }
  expect(holds[0]).toMatchObject({ guildId: 'wolves', heldMs: 600_000, won: true });
  const contested = tickCaptures({
    holds,
    wars: [war],
    nowMs: 700_000,
    deltaMs: 100,
    present: [...present, { cityId: 'fort_humans', guildId: 'ashes' }],
  });
  expect(contested[0]).toMatchObject({ guildId: 'wolves', heldMs: 600_000, won: true });
});

test('a second guild on the city resets a hold that has not been won', () => {
  const alone = [{ cityId: 'fort_humans', guildId: 'wolves' }];
  let holds = tickCaptures({ holds: [], wars: [war], nowMs: 0, deltaMs: 100, present: alone });
  holds = tickCaptures({ holds, wars: [war], nowMs: 100, deltaMs: 100, present: alone });
  expect(holds[0]?.heldMs).toBe(100);
  const reset = tickCaptures({
    holds,
    wars: [war],
    nowMs: 200,
    deltaMs: 100,
    present: [...alone, { cityId: 'fort_humans', guildId: 'ashes' }],
  });
  expect(reset).toEqual([{ cityId: 'fort_humans', guildId: null, heldMs: 0, won: false }]);
});
