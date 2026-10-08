import { mulberry32 } from '@rift/domain/rng';
import type { ClientCommand } from '@rift/protocol';
import { expect, test } from 'vitest';
import { toSimCommand } from './commands';
import { prototypeEncounter, prototypeIncludesFullKeeper, spawnNamed } from './population';
import { stepTick, type SimWorld } from './tick';

test('entering the world places the player, the prototype set, elites, and the level-20 keeper', () => {
  const entities = prototypeEncounter({ playerId: 'lia', bindNodeId: 'fort_humans' });
  const ids = entities.map((entity) => entity.monsterId ?? 'player');
  expect(ids.slice(0, 6)).toEqual([
    'player',
    'spore_rat',
    'bandit',
    'cyborg_dog',
    'scout_drone',
    'keeper_patrol',
  ]);
  expect(ids).toContain('keeper_enhanced_prototype');
  expect(entities.filter((entity) => entity.eliteId != null && entity.eliteId !== '')).not.toHaveLength(0);
  expect(entities.find((entity) => entity.monsterId === 'keeper_enhanced')).toBeUndefined();
  expect(prototypeIncludesFullKeeper()).toBe(false);
  const full = spawnNamed('keeper_enhanced', 'keeper-enhanced');
  expect(full?.monsterId).toBe('keeper_enhanced');
  expect(full?.phaseCount).toBe(3);
  expect(full?.level).toBe(50);
  expect(entities[0]?.phase).toBe('online');
  expect(entities[0]?.bindNodeId).toBe('fort_humans');
  expect(entities[0]?.progress?.level).toBe(1);
  expect(entities[0]?.quests).toEqual([]);

  const player = entities[0];
  expect(player?.id).toBe('lia');
  if (player !== undefined) {
    player.od = 1;
    player.odFrac = 1;
  }
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
  const moved = next.entities.find((entity) => entity.id === 'lia');
  expect(moved?.cell).toEqual({ x: 1, y: 0 });
  expect(moved?.od).toBe(0);
  expect(moved?.odFrac).toBe(0.3);
  expect(next.entities.filter((entity) => entity.monsterId !== undefined).length).toBeGreaterThanOrEqual(6);
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
