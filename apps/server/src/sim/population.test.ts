import { mulberry32 } from '@rift/domain/rng';
import type { ClientCommand } from '@rift/protocol';
import { expect, test } from 'vitest';
import { toSimCommand } from './commands';
import { prototypeEncounter, prototypeIncludesFullKeeper } from './population';
import { stepTick, type SimWorld } from './tick';

test('entering the world places the player and the five prototype monsters', () => {
  const entities = prototypeEncounter({ playerId: 'lia', bindNodeId: 'fort_humans' });
  const ids = entities.map((entity) => entity.monsterId ?? 'player');
  expect(ids).toEqual([
    'player',
    'spore_rat',
    'bandit',
    'cyborg_dog',
    'scout_drone',
    'keeper_patrol',
  ]);
  expect(prototypeIncludesFullKeeper()).toBe(false);
  expect(entities[0]?.phase).toBe('online');
  expect(entities[0]?.bindNodeId).toBe('fort_humans');

  const command = toSimCommand(step('lia'));
  expect(command).not.toBeNull();
  const world: SimWorld = {
    tick: 0,
    nowMs: 0,
    entities,
    corpses: [],
    rejections: [],
    obstacles: [],
    history: [],
  };
  const next = stepTick(world, command === null ? [] : [command], mulberry32(1));
  expect(next.entities.find((entity) => entity.id === 'lia')?.cell).toEqual({ x: 1, y: 0 });
  expect(next.entities.filter((entity) => entity.monsterId !== undefined)).toHaveLength(5);
});

function step(entityId: string): ClientCommand {
  return {
    commandId: 'step-1',
    seq: 1,
    issuedAtMs: 0,
    action: 'step_e',
    params: { entityId },
  };
}
