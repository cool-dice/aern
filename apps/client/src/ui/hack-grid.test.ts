import { expect, test } from 'vitest';
import { HACK_ALPHABET } from './models';
import { hackGrid } from './hack-grid';

test('hack grid is four rows of alphabet symbols', () => {
  const rows = hackGrid('ABCD');
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row).toHaveLength(4);
    for (const symbol of row) {
      expect(HACK_ALPHABET).toContain(symbol);
    }
  }
  expect(rows[0]).toEqual(['A', 'B', 'C', 'D']);
});
