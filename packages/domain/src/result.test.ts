import { expect, test } from 'vitest';
import { err, ok } from './result';

test('ok wraps a value', () => {
  const result = ok(7);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(7);
  }
});

test('err wraps a code', () => {
  const result = err('not_found');
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe('not_found');
  }
});
