import { mulberry32 } from '@rift/domain/rng';
import { expect, test } from 'vitest';
import {
  ELITE_MODIFIERS,
  KEEPER_FULL,
  KEEPER_PROTOTYPE,
  resolveBossPhase,
  rolledLoot,
  spawnMonster,
} from './bestiary';

test('spore elite adds 20 percent HP and the six modifiers are present', () => {
  expect(ELITE_MODIFIERS.map((modifier) => modifier.id)).toEqual([
    'fiery',
    'poisonous',
    'armored',
    'fast',
    'spore',
    'energetic',
  ]);
  const rat = spawnMonster({
    entityId: 'rat',
    template: {
      id: 'spore_rat',
      level: 1,
      hp: 15,
      damage: 3,
      armor: 0,
      accuracy: 5,
      evasion: 8,
      phaseCount: 1,
      phases: [{ index: 1 }],
      prototype: true,
      rank: 'basic',
    },
    cell: { x: 1, y: 0 },
    eliteId: 'spore',
  });
  expect(rat.hp).toBe(18);
  expect(rat.maxHp).toBe(18);
  expect(rat.eliteId).toBe('spore');
});

test('prototype keeper is level 20 with two phases and the full keeper is level 50 with three', () => {
  const proto = spawnMonster({
    entityId: 'proto',
    template: KEEPER_PROTOTYPE,
    cell: { x: 2, y: 0 },
  });
  expect(proto.level).toBe(20);
  expect(proto.phaseCount).toBe(2);
  expect(proto.prototype).toBe(true);
  expect(resolveBossPhase(400, 400, KEEPER_PROTOTYPE.phases)).toEqual({
    phase: 1,
    damageMultiplier: 1,
  });
  expect(resolveBossPhase(199, 400, KEEPER_PROTOTYPE.phases)).toEqual({
    phase: 2,
    damageMultiplier: 1.5,
  });

  const full = spawnMonster({
    entityId: 'full',
    template: KEEPER_FULL,
    cell: { x: 3, y: 0 },
  });
  expect(full.level).toBe(50);
  expect(full.phaseCount).toBe(3);
  expect(full.prototype).toBe(false);
  expect(resolveBossPhase(1000, 1000, KEEPER_FULL.phases).phase).toBe(1);
  expect(resolveBossPhase(500, 1000, KEEPER_FULL.phases).phase).toBe(2);
  expect(resolveBossPhase(200, 1000, KEEPER_FULL.phases).phase).toBe(3);
});

test('death loot uses the table and elite quantity', () => {
  const stacks = rolledLoot({
    entries: [{ itemId: 'metal', chance: 1, min: 1, max: 1, kind: 'resource' }],
    rng: mulberry32(2),
    elite: true,
    monsterLevel: 3,
  });
  expect(stacks).toEqual([{ itemId: 'metal', qty: 2 }]);
});
