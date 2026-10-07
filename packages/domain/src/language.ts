import { err, ok, type Result } from './result';
import type { Rng } from './rng';

export type LanguageId = 'common_light' | 'common_dark' | 'ancient';

export interface UpyState {
  values: Record<LanguageId, number>;
  lastLessonMs: Partial<Record<LanguageId, number>>;
}

export type UpyGain =
  | 'passive'
  | 'interaction'
  | 'teacher'
  | 'book'
  | 'ruins_success'
  | 'ruins_fail';

const UPY_MAX = 100;
const TEACHER_CAP = 80;
const TEACHER_COST = 100;
const TEACHER_COOLDOWN_MS = 86_400_000;
const PASSIVE_ONLINE_MS = 7_200_000;

const GAIN_AMOUNT: Record<UpyGain, number> = {
  passive: 1,
  interaction: 2,
  teacher: 5,
  book: 3,
  ruins_success: 10,
  ruins_fail: 1,
};

export function clampUpy(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > UPY_MAX) {
    return UPY_MAX;
  }
  return value;
}

export function replacementRate(upy: number): number {
  const value = clampUpy(upy);
  if (value < 11) {
    return 0.9;
  }
  if (value < 31) {
    return 0.6;
  }
  if (value < 61) {
    return 0.3;
  }
  if (value < 86) {
    return 0.1;
  }
  return 0;
}

function isPreserved(char: string): boolean {
  return char === ' ' || (char >= '0' && char <= '9');
}

export function garble(text: string, upy: number, rng: Rng): string {
  const rate = replacementRate(upy);
  if (rate === 0) {
    return text;
  }
  let out = '';
  for (const char of text) {
    if (isPreserved(char)) {
      out += char;
      continue;
    }
    out += rng.nextUnit() < rate ? '?' : char;
  }
  return out;
}

export function chatPresentation(
  text: string,
  listenerUpy: number,
  translated: string,
  rng: Rng,
): { mode: 'raw' | 'garbled' | 'translated'; text: string } {
  const upy = clampUpy(listenerUpy);
  if (upy >= UPY_MAX) {
    return { mode: 'translated', text: translated };
  }
  if (upy <= 0) {
    return { mode: 'raw', text };
  }
  return { mode: 'garbled', text: garble(text, upy, rng) };
}

export function canCraftLanguage(upy: number): boolean {
  return clampUpy(upy) >= 60;
}

export function questLanguageAccess(upy: number): 'deny' | 'garbled' | 'full' {
  const value = clampUpy(upy);
  if (value <= 30) {
    return 'deny';
  }
  if (value <= 60) {
    return 'garbled';
  }
  return 'full';
}

export function gainUpy(input: {
  state: UpyState;
  language: LanguageId;
  gain: UpyGain;
  nowMs: number;
  onlineMsSinceLastPassive: number;
  gold: number;
}): Result<
  { state: UpyState; gold: number; consumedBook: boolean },
  'cap' | 'gold' | 'cooldown' | 'not_ready'
> {
  const current = input.state.values[input.language];

  if (input.gain === 'teacher') {
    if (current >= TEACHER_CAP) {
      return err('cap');
    }
    if (input.gold < TEACHER_COST) {
      return err('gold');
    }
    const lastLessonMs = input.state.lastLessonMs[input.language];
    if (lastLessonMs !== undefined && input.nowMs - lastLessonMs < TEACHER_COOLDOWN_MS) {
      return err('cooldown');
    }
  } else if (input.gain === 'passive' && input.onlineMsSinceLastPassive < PASSIVE_ONLINE_MS) {
    return err('not_ready');
  }

  const ceiling = input.gain === 'teacher' ? TEACHER_CAP : UPY_MAX;
  const next: UpyState = {
    values: {
      ...input.state.values,
      [input.language]: clampUpy(Math.min(ceiling, current + GAIN_AMOUNT[input.gain])),
    },
    lastLessonMs:
      input.gain === 'teacher'
        ? { ...input.state.lastLessonMs, [input.language]: input.nowMs }
        : { ...input.state.lastLessonMs },
  };

  return ok({
    state: next,
    gold: input.gain === 'teacher' ? input.gold - TEACHER_COST : input.gold,
    consumedBook: input.gain === 'book',
  });
}
