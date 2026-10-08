const UINT32 = 2 ** 32;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export interface Rng {
  /** целое в диапазоне [0, maxExclusive) */
  nextInt(maxExclusive: number): number;
  /** [0, 1) */
  nextUnit(): number;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return {
    nextUnit(): number {
      return nextUint32() / UINT32;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32) {
        throw new RangeError(
          `maxExclusive must be an integer in [1, ${UINT32}], got ${String(maxExclusive)}`,
        );
      }
      const limit = UINT32 - (UINT32 % maxExclusive);
      let sample = nextUint32();
      while (sample >= limit) {
        sample = nextUint32();
      }
      return sample % maxExclusive;
    },
  };
}

export function hashSeed(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of utf8Bytes(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    let point = code;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next !== undefined && next >= 0xdc00 && next <= 0xdfff) {
        point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      } else {
        pushReplacement(bytes);
        continue;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      pushReplacement(bytes);
      continue;
    }
    pushCodePoint(bytes, point);
  }
  return bytes;
}

function pushReplacement(bytes: number[]): void {
  bytes.push(0xef, 0xbf, 0xbd);
}

function pushCodePoint(bytes: number[], point: number): void {
  if (point < 0x80) {
    bytes.push(point);
    return;
  }
  if (point < 0x800) {
    bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    return;
  }
  if (point < 0x10000) {
    bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    return;
  }
  bytes.push(
    0xf0 | (point >> 18),
    0x80 | ((point >> 12) & 0x3f),
    0x80 | ((point >> 6) & 0x3f),
    0x80 | (point & 0x3f),
  );
}
