import { expect, test } from 'vitest';
import { hashSeed, mulberry32, type Rng } from './rng';

function fiveInts(rng: Rng): number[] {
  return [rng.nextInt(100), rng.nextInt(100), rng.nextInt(100), rng.nextInt(100), rng.nextInt(100)];
}

test('same seed yields the same nextInt sequence', () => {
  expect(fiveInts(mulberry32(1))).toEqual(fiveInts(mulberry32(1)));
});

test('different seeds diverge on the first number', () => {
  expect(mulberry32(1).nextInt(100)).not.toBe(mulberry32(2).nextInt(100));
});

test('nextInt(1) is always 0', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 32; i += 1) {
    expect(rng.nextInt(1)).toBe(0);
  }
});

test('nextInt(0) and negative bounds throw RangeError', () => {
  const rng = mulberry32(1);
  expect(() => rng.nextInt(0)).toThrow(RangeError);
  expect(() => rng.nextInt(-1)).toThrow(RangeError);
  expect(() => rng.nextInt(-100)).toThrow(RangeError);
});

test('nextInt(10) hits every digit for seed 1', () => {
  const rng = mulberry32(1);
  const seen = new Set<number>();
  for (let i = 0; i < 10_000; i += 1) {
    seen.add(rng.nextInt(10));
  }
  for (let digit = 0; digit < 10; digit += 1) {
    expect(seen.has(digit)).toBe(true);
  }
});

test('hashSeed is FNV-1a 32-bit over UTF-8', () => {
  expect(hashSeed('')).toBe(0x811c9dc5);
  expect(hashSeed('a')).toBe(0xe40c292c);
  expect(hashSeed('foobar')).toBe(0xbf9cf968);
  expect(hashSeed('rift')).toBe(hashSeed('rift'));
  expect(hashSeed('rift')).not.toBe(hashSeed('Rift'));
  expect(hashSeed('Ржавый')).toBe(0x8750fdb6);
  expect(hashSeed('😀')).toBe(0x33a29608);
});
