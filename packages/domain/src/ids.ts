import type { Rng } from './rng';

export type EntityId = string; // UUID v4
export type CatalogId = string; // snake_case [a-z0-9_]{1,64}

const CATALOG_ID = /^[a-z0-9_]{1,64}$/;

export function createEntityId(rng: Rng): EntityId {
  const bytes: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    bytes.push(rng.nextInt(256));
  }
  const timeHi = bytes[6] ?? 0;
  const clockSeq = bytes[8] ?? 0;
  bytes[6] = (timeHi & 0x0f) | 0x40;
  bytes[8] = (clockSeq & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function assertCatalogId(value: string): CatalogId {
  if (!CATALOG_ID.test(value)) {
    throw new Error(`invalid catalog id: ${value}`);
  }
  return value;
}
