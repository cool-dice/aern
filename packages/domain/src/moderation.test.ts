import { expect, test } from 'vitest';
import {
  CHAT_BAN_MS,
  MUTE_1H_MS,
  classifyMessage,
  falseReportSanction,
  sanctionForCheatStrikes,
} from './moderation';

const NOW_MS = 1_700_000_000_000;

function classify(input: {
  text: string;
  recentTexts?: string[];
  recentMs?: number[];
  blacklist?: string[];
  automutesIn24h?: number;
  nowMs?: number;
}) {
  return classifyMessage({
    text: input.text,
    recentTexts: input.recentTexts ?? [],
    recentMs: input.recentMs ?? [],
    nowMs: input.nowMs ?? NOW_MS,
    blacklist: input.blacklist ?? [],
    automutesIn24h: input.automutesIn24h ?? 0,
  });
}

function priors(texts: string[], ageMs: number): { recentTexts: string[]; recentMs: number[] } {
  return {
    recentTexts: texts,
    recentMs: texts.map(() => NOW_MS - ageMs),
  };
}

test('fifth identical message within ten seconds mutes', () => {
  expect(classify({ text: 'same', ...priors(['same', 'same', 'same', 'same'], 1_000) })).toBe(
    'mute_1h',
  );
});

test('three identical messages are not spam', () => {
  expect(classify({ text: 'same', ...priors(['same', 'same'], 1_000) })).toBe('none');
});

test('four identical messages are not spam', () => {
  expect(classify({ text: 'same', ...priors(['same', 'same', 'same'], 1_000) })).toBe('none');
});

test('eighth message within ten seconds mutes', () => {
  const seven = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
  expect(classify({ text: 'm8', ...priors(seven, 1_000) })).toBe('mute_1h');
});

test('seven messages within ten seconds are not spam', () => {
  const six = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
  expect(classify({ text: 'm7', ...priors(six, 1_000) })).toBe('none');
});

test('ninth message eleven seconds later with an empty window is clean', () => {
  const agedOut = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  expect(classify({ text: 'ninth', ...priors(agedOut, 11_000) })).toBe('none');
});

test('spam equality trims and keeps case', () => {
  expect(classify({ text: '  same  ', ...priors(['same', 'same', 'same', 'same'], 1_000) })).toBe(
    'mute_1h',
  );
  expect(classify({ text: 'same', ...priors(['Same', 'Same', 'Same', 'Same'], 1_000) })).toBe(
    'none',
  );
});

test('messages exactly ten seconds old count and older ones do not', () => {
  expect(classify({ text: 'same', ...priors(['same', 'same', 'same', 'same'], 10_000) })).toBe(
    'mute_1h',
  );
  expect(classify({ text: 'same', ...priors(['same', 'same', 'same', 'same'], 10_001) })).toBe(
    'none',
  );
});

test('caps of length 8 mutes', () => {
  expect(classify({ text: 'AAAAAAAA' })).toBe('mute_1h');
});

test('caps shorter than 8 is clean', () => {
  expect(classify({ text: 'AAAAAAA' })).toBe('none');
});

test('half uppercase is not caps', () => {
  expect(classify({ text: 'AaAaAaAa' })).toBe('none');
});

test('uppercase ratio must be strictly above 0.7 and ignores non-letters', () => {
  expect(classify({ text: 'AAAAAAAaaa' })).toBe('none');
  expect(classify({ text: 'AAAAAAAAaa' })).toBe('mute_1h');
  expect(classify({ text: '12345678' })).toBe('none');
  expect(classify({ text: '!!!!!!!!' })).toBe('none');
  expect(classify({ text: 'AAAAAA12' })).toBe('mute_1h');
});

test('caps and spam together return one mute', () => {
  expect(
    classify({
      text: 'AAAAAAAA',
      ...priors(['AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA'], 500),
    }),
  ).toBe('mute_1h');
});

test('blacklist word slug mutes', () => {
  expect(classify({ text: 'slug', blacklist: ['slug'] })).toBe('mute_1h');
  expect(classify({ text: 'hello SLUG there', blacklist: ['Slug'] })).toBe('mute_1h');
  expect(classify({ text: 'slugger', blacklist: ['slug'] })).toBe('none');
  expect(classify({ text: 'slug', blacklist: [] })).toBe('none');
});

test('third automute in a day is a seven day chat ban', () => {
  expect(classify({ text: 'AAAAAAAA', automutesIn24h: 2 })).toBe('chat_ban_7d');
  expect(classify({ text: 'AAAAAAAA', automutesIn24h: 1 })).toBe('mute_1h');
  expect(classify({ text: 'hello', automutesIn24h: 2 })).toBe('none');
});

test('three cheat strikes ban the account and a repeat is permanent', () => {
  expect(sanctionForCheatStrikes(3, false)).toBe('account_ban_7d');
  expect(sanctionForCheatStrikes(2, false)).toBe('none');
  expect(sanctionForCheatStrikes(2, true)).toBe('none');
  expect(sanctionForCheatStrikes(3, true)).toBe('permanent');
});

test('false report is a 24 hour mute', () => {
  expect(falseReportSanction()).toBe('mute_24h');
});

test('sanction durations match the fixed windows', () => {
  expect(MUTE_1H_MS).toBe(3_600_000);
  expect(CHAT_BAN_MS).toBe(7 * 86_400_000);
});
