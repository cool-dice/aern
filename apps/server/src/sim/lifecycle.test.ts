import { CORPSE_MS, REVIVE_HP_RATIO } from '@rift/domain/death';
import { mulberry32 } from '@rift/domain/rng';
import { expect, test } from 'vitest';
import { stepTick, type SimEntity, type SimWorld } from './tick';

function player(partial: Partial<SimEntity> = {}): SimEntity {
  return {
    id: partial.id ?? 'lia',
    reaction: 10,
    accuracyStat: 8,
    accuracyScore: 8,
    evasion: 0,
    armor: 0,
    will: 5,
    od: 4,
    odFrac: 4,
    hp: partial.hp ?? 0,
    maxHp: partial.maxHp ?? 40,
    cell: partial.cell ?? { x: 4, y: 4 },
    inCombat: false,
    stunned: false,
    statuses: [],
    phase: partial.phase ?? 'online',
    isBot: false,
    bindNodeId: 'fort_humans',
    bindCell: { x: 0, y: 0 },
    inventory: partial.inventory ?? [
      {
        itemId: 'relic_shard',
        questItem: true,
        questOwnerId: 'lia',
        durability: 100,
        equipped: false,
      },
    ],
  };
}

function world(entities: SimEntity[], nowMs = 1_000): SimWorld {
  return {
    tick: 0,
    nowMs,
    entities,
    corpses: [],
    rejections: [],
    obstacles: [],
    history: [],
  };
}

test('zero HP downs the player and keeps the quest item owner-bound', () => {
  const fallen = stepTick(world([player(), { ...player({ id: 'thief' }), inventory: [] }]), [], mulberry32(1));
  const body = fallen.entities.find((entity) => entity.id === 'lia');
  expect(body?.phase).toBe('downed');
  expect(body?.hp).toBeLessThanOrEqual(0);
  expect(fallen.corpses[0]?.stacks?.[0]).toMatchObject({
    itemId: 'relic_shard',
    questItem: true,
    questOwnerId: 'lia',
  });

  const stolen = stepTick(
    fallen,
    [
      {
        type: 'loot',
        entityId: 'thief',
        victimId: 'lia',
        itemId: 'relic_shard',
        issuedAtMs: fallen.nowMs,
      },
    ],
    mulberry32(1),
  );
  expect(stolen.rejections).toEqual([{ entityId: 'thief', code: 'quest' }]);

  const kept = stepTick(
    fallen,
    [
      {
        type: 'loot',
        entityId: 'lia',
        victimId: 'lia',
        itemId: 'relic_shard',
        issuedAtMs: fallen.nowMs,
      },
    ],
    mulberry32(1),
  );
  expect(kept.rejections).toEqual([]);
  expect(kept.entities.find((entity) => entity.id === 'lia')?.inventory?.[0]?.itemId).toBe('relic_shard');
});

test('respawn returns full HP at the bind cell and revive uses thirty percent', () => {
  const fallen = stepTick(world([player()]), [], mulberry32(1));
  const spawned = stepTick(
    fallen,
    [{ type: 'respawn', entityId: 'lia', issuedAtMs: fallen.nowMs }],
    mulberry32(1),
  );
  const body = spawned.entities[0];
  expect(body?.phase).toBe('online');
  expect(body?.hp).toBe(40);
  expect(body?.cell).toEqual({ x: 0, y: 0 });

  const again = stepTick(world([player()]), [], mulberry32(1));
  const revived = stepTick(
    again,
    [{ type: 'revive', entityId: 'lia', victimId: 'lia', issuedAtMs: again.nowMs }],
    mulberry32(1),
  );
  expect(revived.entities[0]?.hp).toBe(Math.max(1, Math.floor(40 * REVIVE_HP_RATIO)));
  expect(revived.corpses).toEqual([]);

  const expired = stepTick(
    { ...again, nowMs: again.nowMs + CORPSE_MS },
    [{ type: 'revive', entityId: 'lia', victimId: 'lia', issuedAtMs: again.nowMs + CORPSE_MS }],
    mulberry32(1),
  );
  expect(expired.rejections[0]?.code).toBe('expired');
});
