import { expect, test } from 'vitest';
import { assertCatalogId, createEntityId } from './ids';
import { mulberry32 } from './rng';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('createEntityId is stable and matches UUID v4', () => {
  const first = createEntityId(mulberry32(1));
  const second = createEntityId(mulberry32(1));
  expect(first).toBe(second);
  expect(first).toMatch(UUID_V4);
});

test('assertCatalogId accepts snake_case', () => {
  expect(assertCatalogId('rusty_sword')).toBe('rusty_sword');
});

test('assertCatalogId rejects non-ascii', () => {
  expect(() => assertCatalogId('Ржавый')).toThrow(Error);
});
