import { expect, test } from 'vitest';
import {
  HACK_ALPHABET,
  LOCKOUT_MS,
  guess,
  hackDifficulty,
  newHack,
  silenceMs,
  type KeeperKind,
} from './hack';
import { mulberry32, type Rng } from './rng';
import { SIM_TICK_MS } from './time';

test('HACK_ALPHABET is the eight glyphs ABCDEFGH', () => {
  expect(HACK_ALPHABET).toBe('ABCDEFGH');
});

test('hackDifficulty follows base minus floor(technique / 2), floored at 1', () => {
  expect(hackDifficulty('patrol', 0)).toBe(10);
  expect(hackDifficulty('patrol', 10)).toBe(5);
  expect(hackDifficulty('guard', 0)).toBe(20);
  expect(hackDifficulty('destroyer', 0)).toBe(30);
  expect(hackDifficulty('unique', 0)).toBe(40);
  expect(hackDifficulty('unique', 100)).toBe(1);
  expect(hackDifficulty('unique', 1_000)).toBe(1);
});

test('silence lasts 60s, 30s, 15s, and 10s on the 100 ms tick', () => {
  expect(silenceMs('patrol')).toBe(60_000);
  expect(silenceMs('guard')).toBe(30_000);
  expect(silenceMs('destroyer')).toBe(15_000);
  expect(silenceMs('unique')).toBe(10_000);
  const kinds: KeeperKind[] = ['patrol', 'guard', 'destroyer', 'unique'];
  for (const kind of kinds) {
    expect(silenceMs(kind) % SIM_TICK_MS).toBe(0);
  }
});

test('lockout is 10 minutes', () => {
  expect(LOCKOUT_MS).toBe(600_000);
  expect(LOCKOUT_MS % SIM_TICK_MS).toBe(0);
});

test('newHack draws four symbols with nextInt(8), repeats allowed', () => {
  const planned = [0, 1, 2, 3];
  let cursor = 0;
  const scripted: Rng = {
    nextInt(maxExclusive: number): number {
      expect(maxExclusive).toBe(8);
      const next = planned[cursor];
      cursor += 1;
      if (next === undefined) {
        throw new Error('extra draw');
      }
      return next;
    },
    nextUnit(): number {
      throw new Error('nextUnit is not used');
    },
  };
  const session = newHack('patrol', scripted);
  expect(cursor).toBe(4);
  expect(session).toEqual({ password: 'ABCD', attemptsLeft: 3 });

  const repeats: Rng = {
    nextInt(maxExclusive: number): number {
      expect(maxExclusive).toBe(8);
      return 0;
    },
    nextUnit(): number {
      throw new Error('nextUnit is not used');
    },
  };
  expect(newHack('destroyer', repeats).password).toBe('AAAA');
});

test('one seed yields one password', () => {
  const patrol = newHack('patrol', mulberry32(1));
  const again = newHack('patrol', mulberry32(1));
  const unique = newHack('unique', mulberry32(1));
  expect(patrol.password).toBe(again.password);
  expect(unique.password).toBe(patrol.password);
  expect(patrol.password).toHaveLength(4);
  expect(patrol.attemptsLeft).toBe(3);
  for (const symbol of patrol.password) {
    expect(HACK_ALPHABET.includes(symbol)).toBe(true);
  }
});

test('ABXX against ABCD scores two bulls and spends an attempt', () => {
  expect(guess('ABCD', 'ABXX', 3)).toEqual({
    ok: true,
    value: { correct: false, bulls: 2, attemptsLeft: 2 },
  });
});

test('a swapped pair is bulls only, not cows', () => {
  expect(guess('ABCD', 'ABDC', 3)).toEqual({
    ok: true,
    value: { correct: false, bulls: 2, attemptsLeft: 2 },
  });
});

test('the correct password succeeds and still spends the attempt', () => {
  expect(guess('ABCD', 'ABCD', 3)).toEqual({
    ok: true,
    value: { correct: true, bulls: 4, attemptsLeft: 2 },
  });
  expect(guess('ABCD', 'ABCD', 1)).toEqual({
    ok: true,
    value: { correct: true, bulls: 4, attemptsLeft: 0 },
  });
});

test('three misses leave attempts at 0, and the fourth call is exhausted', () => {
  let attemptsLeft = 3;
  for (const attempt of ['XXXX', 'YYYY', 'ZZZZ']) {
    const result = guess('ABCD', attempt, attemptsLeft);
    expect(result).toEqual({
      ok: true,
      value: { correct: false, bulls: 0, attemptsLeft: attemptsLeft - 1 },
    });
    if (result.ok) {
      attemptsLeft = result.value.attemptsLeft;
    }
  }
  expect(attemptsLeft).toBe(0);
  expect(guess('ABCD', 'DDDD', 0)).toEqual({ ok: false, code: 'exhausted' });
  expect(guess('ABCD', 'ABCD', 0)).toEqual({ ok: false, code: 'exhausted' });
});

test('a length-3 attempt is format and does not spend an attempt', () => {
  expect(guess('ABCD', 'ABC', 3)).toEqual({ ok: false, code: 'format' });
  expect(guess('ABCD', 'ABXX', 3)).toEqual({
    ok: true,
    value: { correct: false, bulls: 2, attemptsLeft: 2 },
  });
});
