import { expect, test } from 'vitest';
import { ACTION_IDS, derive, prototypeWorld, seasonAt } from './index';

test('domain barrel re-exports the public API', () => {
  expect(ACTION_IDS.length).toBe(64);
  expect(prototypeWorld().nodes.length).toBeGreaterThanOrEqual(10);
  expect(
    derive({
      stats: {
        body: 5,
        reaction: 5,
        accuracy: 5,
        will: 5,
        perception: 5,
        technique: 5,
      },
      level: 1,
      totalWeightKg: 0,
    }).hp,
  ).toBe(55);
  expect(seasonAt(Date.UTC(2026, 0, 1))).toBe('awakening');
});
