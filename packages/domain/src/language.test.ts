import { expect, test } from 'vitest';
import {
  canCraftLanguage,
  chatPresentation,
  clampUpy,
  gainUpy,
  garble,
  questLanguageAccess,
  replacementRate,
  type LanguageId,
  type UpyGain,
  type UpyState,
} from './language';
import { mulberry32, type Rng } from './rng';
import type { Result } from './result';

function throwingRng(): Rng {
  return {
    nextInt(): number {
      throw new Error('nextInt');
    },
    nextUnit(): number {
      throw new Error('nextUnit');
    },
  };
}

function scriptedRng(units: number[]): Rng {
  let index = 0;
  return {
    nextInt(): number {
      throw new Error('nextInt');
    },
    nextUnit(): number {
      const value = units[index];
      index += 1;
      if (value === undefined) {
        throw new Error('rng exhausted');
      }
      return value;
    },
  };
}

function state(
  values: Partial<Record<LanguageId, number>> = {},
  lastLessonMs: UpyState['lastLessonMs'] = {},
): UpyState {
  return {
    values: {
      common_light: values.common_light ?? 0,
      common_dark: values.common_dark ?? 0,
      ancient: values.ancient ?? 0,
    },
    lastLessonMs: { ...lastLessonMs },
  };
}

function unwrap<T, E extends string>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result.value;
}

test('replacement rate follows the inclusive lower bounds', () => {
  const cases: Array<[number, number]> = [
    [0, 0.9],
    [10, 0.9],
    [11, 0.6],
    [30, 0.6],
    [31, 0.3],
    [60, 0.3],
    [61, 0.1],
    [85, 0.1],
    [86, 0],
    [100, 0],
  ];
  for (const [upy, rate] of cases) {
    expect(replacementRate(upy)).toBe(rate);
  }
});

test('clampUpy keeps values inside 0..100', () => {
  expect(clampUpy(-4)).toBe(0);
  expect(clampUpy(0)).toBe(0);
  expect(clampUpy(37)).toBe(37);
  expect(clampUpy(100)).toBe(100);
  expect(clampUpy(140)).toBe(100);
});

test('garble replaces letters, keeps spaces and digits, and repeats for the same seed', () => {
  expect(garble('Ab 1', 0, scriptedRng([0.5, 0.95]))).toBe('?b 1');
  expect(garble('Ab 1', 0, scriptedRng([0.95, 0.5]))).toBe('A? 1');
  expect(garble('A!', 0, scriptedRng([0, 0]))).toBe('??');
  expect(garble('12 34', 0, throwingRng())).toBe('12 34');
  expect(() => garble('A', 0, throwingRng())).toThrow(/nextUnit/);

  const once = garble('Ab 1', 0, mulberry32(1));
  const twice = garble('Ab 1', 0, mulberry32(1));
  expect(twice).toBe(once);
  expect(once[2]).toBe(' ');
  expect(once[3]).toBe('1');
});

test('garble at rate 0 returns the original string without touching rng', () => {
  expect(garble('Ab 1', 86, throwingRng())).toBe('Ab 1');
  expect(garble('Ab 1', 100, throwingRng())).toBe('Ab 1');
});

test('replacement uses a strict less-than comparison against the rate', () => {
  expect(garble('A', 11, scriptedRng([0.6]))).toBe('A');
  expect(garble('A', 11, scriptedRng([0.599]))).toBe('?');
});

test('chat at 0 is the raw sender text and does not draw rng', () => {
  expect(chatPresentation('сырой', 0, 'перевод', throwingRng())).toEqual({
    mode: 'raw',
    text: 'сырой',
  });
});

test('chat at 100 returns the translation and does not draw rng', () => {
  expect(chatPresentation('сырой', 100, 'перевод', throwingRng())).toEqual({
    mode: 'translated',
    text: 'перевод',
  });
});

test('chat between 1 and 99 garbles the original text', () => {
  expect(chatPresentation('Ab', 10, 'перевод', scriptedRng([0, 0.95]))).toEqual({
    mode: 'garbled',
    text: '?b',
  });
  expect(chatPresentation('Ab 1', 90, 'перевод', throwingRng())).toEqual({
    mode: 'garbled',
    text: 'Ab 1',
  });
});

test('teacher with 100 gold raises 0 to 5 and a repeat is on cooldown', () => {
  const before = state();
  const first = unwrap(
    gainUpy({
      state: before,
      language: 'common_light',
      gain: 'teacher',
      nowMs: 1_000,
      onlineMsSinceLastPassive: 0,
      gold: 100,
    }),
  );
  expect(first.gold).toBe(0);
  expect(first.consumedBook).toBe(false);
  expect(first.state.values.common_light).toBe(5);
  expect(first.state.lastLessonMs.common_light).toBe(1_000);
  expect(before.values.common_light).toBe(0);
  expect(before.lastLessonMs.common_light).toBeUndefined();

  const cooled = gainUpy({
    state: first.state,
    language: 'common_light',
    gain: 'teacher',
    nowMs: 1_000,
    onlineMsSinceLastPassive: 0,
    gold: 100,
  });
  expect(cooled).toEqual({ ok: false, code: 'cooldown' });
  expect(first.state.values.common_light).toBe(5);
  expect(first.state.lastLessonMs.common_light).toBe(1_000);
});

test('teacher cooldown ends at 24 hours and does not block another language', () => {
  const learned = unwrap(
    gainUpy({
      state: state(),
      language: 'common_light',
      gain: 'teacher',
      nowMs: 5_000,
      onlineMsSinceLastPassive: 0,
      gold: 250,
    }),
  );
  const tooSoon = gainUpy({
    state: learned.state,
    language: 'common_light',
    gain: 'teacher',
    nowMs: 5_000 + 86_400_000 - 1,
    onlineMsSinceLastPassive: 0,
    gold: 250,
  });
  expect(tooSoon).toEqual({ ok: false, code: 'cooldown' });
  expect(learned.state.values.common_light).toBe(5);

  const ready = unwrap(
    gainUpy({
      state: learned.state,
      language: 'common_light',
      gain: 'teacher',
      nowMs: 5_000 + 86_400_000,
      onlineMsSinceLastPassive: 0,
      gold: 250,
    }),
  );
  expect(ready.state.values.common_light).toBe(10);
  expect(ready.state.lastLessonMs.common_light).toBe(5_000 + 86_400_000);
  expect(ready.gold).toBe(150);

  const other = unwrap(
    gainUpy({
      state: learned.state,
      language: 'ancient',
      gain: 'teacher',
      nowMs: 5_000,
      onlineMsSinceLastPassive: 0,
      gold: 100,
    }),
  );
  expect(other.state.values.ancient).toBe(5);
  expect(other.state.values.common_light).toBe(5);
  expect(other.state.lastLessonMs.ancient).toBe(5_000);
  expect(other.state.lastLessonMs.common_light).toBe(5_000);
});

test('teacher with 99 gold does not change state', () => {
  const before = state({ common_light: 12, common_dark: 3 }, { ancient: 10 });
  const snapshot = structuredClone(before);
  const result = gainUpy({
    state: before,
    language: 'common_light',
    gain: 'teacher',
    nowMs: 50,
    onlineMsSinceLastPassive: 9_000_000,
    gold: 99,
  });
  expect(result).toEqual({ ok: false, code: 'gold' });
  expect(before).toEqual(snapshot);
});

test('teacher at 78 stops at 80 and at 80 returns cap', () => {
  const raised = unwrap(
    gainUpy({
      state: state({ common_light: 78 }),
      language: 'common_light',
      gain: 'teacher',
      nowMs: 80,
      onlineMsSinceLastPassive: 0,
      gold: 100,
    }),
  );
  expect(raised.state.values.common_light).toBe(80);
  expect(raised.gold).toBe(0);
  expect(raised.state.lastLessonMs.common_light).toBe(80);

  const capped = state({ common_dark: 80, common_light: 4 });
  const snapshot = structuredClone(capped);
  const result = gainUpy({
    state: capped,
    language: 'common_dark',
    gain: 'teacher',
    nowMs: 90,
    onlineMsSinceLastPassive: 0,
    gold: 500,
  });
  expect(result).toEqual({ ok: false, code: 'cap' });
  expect(capped).toEqual(snapshot);
});

test('book raises 97 to 100 and is consumed', () => {
  const before = state({ ancient: 97, common_light: 4 });
  const result = unwrap(
    gainUpy({
      state: before,
      language: 'ancient',
      gain: 'book',
      nowMs: 12,
      onlineMsSinceLastPassive: 0,
      gold: 40,
    }),
  );
  expect(result.state.values.ancient).toBe(100);
  expect(result.state.values.common_light).toBe(4);
  expect(result.consumedBook).toBe(true);
  expect(result.gold).toBe(40);
  expect(result.state.lastLessonMs.ancient).toBeUndefined();
  expect(before.values.ancient).toBe(97);
});

test('passive, interaction, and ruins apply their gains without consuming a book', () => {
  const cases: Array<{ gain: UpyGain; onlineMs: number; from: number; to: number }> = [
    { gain: 'passive', onlineMs: 7_200_000, from: 10, to: 11 },
    { gain: 'interaction', onlineMs: 0, from: 10, to: 12 },
    { gain: 'ruins_success', onlineMs: 0, from: 50, to: 60 },
    { gain: 'ruins_fail', onlineMs: 0, from: 50, to: 51 },
  ];
  for (const entry of cases) {
    const result = unwrap(
      gainUpy({
        state: state({ common_dark: entry.from }),
        language: 'common_dark',
        gain: entry.gain,
        nowMs: 1,
        onlineMsSinceLastPassive: entry.onlineMs,
        gold: 7,
      }),
    );
    expect(result.state.values.common_dark).toBe(entry.to);
    expect(result.consumedBook).toBe(false);
    expect(result.gold).toBe(7);
    expect(result.state.lastLessonMs.common_dark).toBeUndefined();
  }

  const early = state({ common_dark: 10 });
  const snapshot = structuredClone(early);
  expect(
    gainUpy({
      state: early,
      language: 'common_dark',
      gain: 'passive',
      nowMs: 1,
      onlineMsSinceLastPassive: 7_200_000 - 1,
      gold: 7,
    }),
  ).toEqual({ ok: false, code: 'not_ready' });
  expect(early).toEqual(snapshot);

  const capped = unwrap(
    gainUpy({
      state: state({ ancient: 95 }),
      language: 'ancient',
      gain: 'ruins_success',
      nowMs: 1,
      onlineMsSinceLastPassive: 0,
      gold: 1,
    }),
  );
  expect(capped.state.values.ancient).toBe(100);
});

test('craft and quest gates', () => {
  expect(canCraftLanguage(59)).toBe(false);
  expect(canCraftLanguage(60)).toBe(true);
  expect(questLanguageAccess(30)).toBe('deny');
  expect(questLanguageAccess(31)).toBe('garbled');
  expect(questLanguageAccess(60)).toBe('garbled');
  expect(questLanguageAccess(61)).toBe('full');
});
