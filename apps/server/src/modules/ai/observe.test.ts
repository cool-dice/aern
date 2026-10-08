import { expect, test } from 'vitest';
import { OBSERVATION_LENGTH } from '@rift/domain/ai';
import { actorsAreSilent, observeEntity } from './observe';

test('a player and a rat encode 896 numbers with a live actors block', () => {
  const vector = observeEntity({
    player: { hp: 40, maxHp: 40, x: 0, y: 0 },
    monsters: [{ hp: 12, maxHp: 12, x: 3, y: 0 }],
  });
  expect(vector).toHaveLength(OBSERVATION_LENGTH);
  expect(vector).toHaveLength(896);
  expect(actorsAreSilent(vector)).toBe(false);
  expect(vector.every((value) => value >= 0 && value <= 1)).toBe(true);
});
