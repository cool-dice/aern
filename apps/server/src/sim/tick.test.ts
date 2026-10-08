import { limbMax, type LimbId } from '@rift/domain/combat';
import type { Dir } from '@rift/domain/movement';
import { mulberry32 } from '@rift/domain/rng';
import type { StatusInstance } from '@rift/domain/status';
import { expect, test } from 'vitest';
import {
  LOGOUT_GRACE_MS,
  snapshotLag,
  stepTick,
  type AttackCommand,
  type SimEntity,
  type SimWorld,
} from './tick';

function limbsAt(maxHp: number): Record<LimbId, number> {
  return {
    head: limbMax(maxHp, 'head'),
    torso: limbMax(maxHp, 'torso'),
    arm_left: limbMax(maxHp, 'arm_left'),
    arm_right: limbMax(maxHp, 'arm_right'),
    leg_left: limbMax(maxHp, 'leg_left'),
    leg_right: limbMax(maxHp, 'leg_right'),
  };
}

function entity(partial: Partial<SimEntity> & Pick<SimEntity, 'id'>): SimEntity {
  const maxHp = partial.maxHp ?? 100;
  return {
    id: partial.id,
    reaction: partial.reaction ?? 10,
    accuracyStat: partial.accuracyStat ?? 10,
    accuracyScore: partial.accuracyScore ?? 10,
    evasion: partial.evasion ?? 0,
    armor: partial.armor ?? 0,
    will: partial.will ?? 10,
    od: partial.od ?? 0,
    odFrac: partial.odFrac ?? 0,
    hp: partial.hp ?? maxHp,
    maxHp,
    cell: partial.cell ?? { x: 0, y: 0 },
    inCombat: partial.inCombat ?? false,
    stunned: partial.stunned ?? false,
    statuses: partial.statuses ?? [],
    phase: partial.phase ?? 'online',
    isBot: partial.isBot ?? false,
    logoutRequested: partial.logoutRequested,
    logoutLeftMs: partial.logoutLeftMs,
    carrierOffline: partial.carrierOffline,
    frozen: partial.frozen,
    cover: partial.cover,
    overloaded: partial.overloaded,
    legsDestroyed: partial.legsDestroyed,
    limbs: partial.limbs ?? limbsAt(maxHp),
    monsterId: partial.monsterId,
    level: partial.level,
    baseDamage: partial.baseDamage,
    damage: partial.damage,
    eliteId: partial.eliteId,
    phaseCount: partial.phaseCount,
    bossPhase: partial.bossPhase,
    phases: partial.phases,
    speedMultiplier: partial.speedMultiplier,
    rank: partial.rank,
    bindNodeId: partial.bindNodeId,
    bindCell: partial.bindCell,
    inventory: partial.inventory,
    roomId: partial.roomId,
    dungeonId: partial.dungeonId,
    dungeonRooms: partial.dungeonRooms,
    dungeonEdges: partial.dungeonEdges,
    lastAttackerId: partial.lastAttackerId,
    seasonTag: partial.seasonTag,
    nodeId: partial.nodeId,
    inEncounter: partial.inEncounter,
    instanceId: partial.instanceId,
  };
}

function world(partial: Partial<SimWorld> & Pick<SimWorld, 'entities'>): SimWorld {
  return {
    tick: partial.tick ?? 0,
    nowMs: partial.nowMs ?? 0,
    entities: partial.entities,
    corpses: partial.corpses ?? [],
    rejections: partial.rejections ?? [],
    obstacles: partial.obstacles ?? [],
    history: partial.history ?? [],
    lootTables: partial.lootTables,
    geography: partial.geography,
    barrierDown: partial.barrierDown,
    warCities: partial.warCities,
    invasion: partial.invasion,
  };
}

function runTicks(start: SimWorld, count: number): SimWorld {
  let current = start;
  for (let i = 0; i < count; i += 1) {
    current = stepTick(current, [], mulberry32(1));
  }
  return current;
}

function attack(
  partial: Partial<AttackCommand> & Pick<AttackCommand, 'attackerId' | 'targetId'>,
): AttackCommand {
  return {
    type: 'attack',
    attackerId: partial.attackerId,
    targetId: partial.targetId,
    weaponDamage: partial.weaponDamage ?? 10,
    odCost: partial.odCost ?? 1,
    range: partial.range ?? 10,
    los: partial.los ?? true,
    aim: partial.aim ?? null,
    melee: partial.melee ?? false,
    friendlyFire: partial.friendlyFire ?? false,
    sameGroup: partial.sameGroup ?? false,
    pvpOpen: partial.pvpOpen ?? false,
    safeZone: partial.safeZone ?? false,
    issuedAtMs: partial.issuedAtMs ?? 0,
    distance: partial.distance,
  };
}

function move(id: string, dir: Dir, running: boolean, issuedAtMs = 0) {
  return { type: 'move' as const, entityId: id, dir, running, issuedAtMs };
}

function bleed(expiresAtMs = 100_000): StatusInstance {
  return { id: 'bleed', expiresAtMs, sourceId: 'src' };
}

test('combat OD goes from 1 to 4 in one second at regen 3', () => {
  const done = runTicks(
    world({
      entities: [entity({ id: 'a', inCombat: true, od: 1, odFrac: 1, reaction: 10, will: 10 })],
    }),
    10,
  );
  const actor = done.entities[0];
  expect(actor?.od).toBe(4);
  expect(actor?.odFrac).toBe(4);
  expect(done.tick).toBe(10);
  expect(done.nowMs).toBe(1_000);
});

test('out of combat OD goes from 0 to 3 in one second at regen 3', () => {
  const done = runTicks(
    world({
      entities: [entity({ id: 'a', inCombat: false, od: 0, odFrac: 0, reaction: 10, will: 10 })],
    }),
    10,
  );
  const actor = done.entities[0];
  expect(actor?.od).toBe(3);
  expect(actor?.odFrac).toBe(3);
});

test('reaction 13 keeps the 3.6 fractional accumulator', () => {
  const start = world({
    entities: [entity({ id: 'a', inCombat: false, od: 0, odFrac: 0, reaction: 13, will: 10 })],
  });
  const once = stepTick(start, [], mulberry32(1));
  expect(once.entities[0]?.odFrac).toBe(0.36);
  expect(once.entities[0]?.od).toBe(0);

  const done = runTicks(start, 10);
  expect(done.entities[0]?.odFrac).toBe(3.6);
  expect(done.entities[0]?.od).toBe(3);
});

test('OD does not regen above will', () => {
  const done = runTicks(
    world({
      entities: [entity({ id: 'a', od: 0, odFrac: 0, reaction: 10, will: 2 })],
    }),
    10,
  );
  expect(done.entities[0]?.od).toBe(2);
  expect(done.entities[0]?.odFrac).toBe(2);
});

test('attack without OD is rejected and the target HP stays', () => {
  const start = world({
    entities: [
      entity({ id: 'a', inCombat: true, od: 0, odFrac: 0, cell: { x: 0, y: 0 } }),
      entity({ id: 'b', inCombat: true, od: 4, odFrac: 4, hp: 40, cell: { x: 1, y: 0 } }),
    ],
  });
  const before = structuredClone(start);
  const quiet = stepTick(start, [], mulberry32(1));
  const rejected = stepTick(start, [attack({ attackerId: 'a', targetId: 'b' })], mulberry32(1));

  expect(start).toEqual(before);
  expect(rejected.rejections).toEqual([{ entityId: 'a', code: 'no_od' }]);
  expect(rejected.entities[1]?.hp).toBe(40);
  expect(rejected.entities[0]).toEqual(quiet.entities[0]);
  expect(rejected.entities[1]).toEqual(quiet.entities[1]);
});

test('an opening aimed attack that cannot pay does not enter combat', () => {
  const start = world({
    entities: [
      entity({ id: 'a', inCombat: false, od: 8, odFrac: 8 }),
      entity({ id: 'b', inCombat: false, hp: 40, cell: { x: 1, y: 0 } }),
    ],
  });
  const quiet = stepTick(start, [], mulberry32(1));
  const rejected = stepTick(
    start,
    [attack({ attackerId: 'a', targetId: 'b', aim: 'head', distance: 1 })],
    mulberry32(1),
  );
  expect(rejected.rejections).toEqual([{ entityId: 'a', code: 'no_od' }]);
  expect(rejected.entities[0]).toEqual(quiet.entities[0]);
  expect(rejected.entities[1]).toEqual(quiet.entities[1]);
  expect(rejected.entities[1]?.hp).toBe(40);
});

test('the first attack enters combat at 1 OD and 0 HP downs the target', () => {
  const start = world({
    entities: [
      entity({ id: 'a', inCombat: false, od: 8, odFrac: 8.4, cell: { x: 0, y: 0 } }),
      entity({ id: 'b', inCombat: false, od: 5, odFrac: 5, hp: 10, cell: { x: 1, y: 0 } }),
    ],
  });
  const done = stepTick(
    start,
    [attack({ attackerId: 'a', targetId: 'b', weaponDamage: 100, distance: 1 })],
    mulberry32(1),
  );
  const attacker = done.entities[0];
  const target = done.entities[1];
  expect(done.rejections).toEqual([]);
  expect(attacker?.inCombat).toBe(true);
  expect(attacker?.od).toBe(0);
  expect(attacker?.odFrac).toBe(0);
  expect(target?.inCombat).toBe(true);
  expect(target?.od).toBe(1);
  expect(target?.odFrac).toBe(1);
  expect(target?.hp).toBeLessThan(0);
  expect(target?.phase).toBe('downed');
  expect(done.corpses[0]?.victimId).toBe('b');
});

test('spending OD keeps the fraction', () => {
  const start = world({
    entities: [entity({ id: 'a', inCombat: true, od: 4, odFrac: 4.6, cell: { x: 0, y: 0 } })],
  });
  const done = stepTick(start, [move('a', 'n', false)], mulberry32(1));
  const actor = done.entities[0];
  expect(done.rejections).toEqual([]);
  expect(actor?.cell).toEqual({ x: 0, y: -1 });
  expect(actor?.od).toBe(3);
  expect(actor?.odFrac).toBe(3.9);
});

test('a combat step costs 1 OD and a run costs 3', () => {
  const stepWorld = stepTick(
    world({
      entities: [entity({ id: 'a', inCombat: true, od: 5, odFrac: 5 })],
    }),
    [move('a', 'n', false)],
    mulberry32(1),
  );
  expect(stepWorld.entities[0]?.od).toBe(4);
  expect(stepWorld.entities[0]?.odFrac).toBe(4.3);
  expect(stepWorld.entities[0]?.cell).toEqual({ x: 0, y: -1 });

  const runWorld = stepTick(
    world({
      entities: [entity({ id: 'a', inCombat: true, od: 5, odFrac: 5, reaction: 10 })],
    }),
    [move('a', 'n', true)],
    mulberry32(1),
  );
  expect(runWorld.entities[0]?.od).toBe(2);
  expect(runWorld.entities[0]?.odFrac).toBe(2.3);
  expect(runWorld.entities[0]?.cell).toEqual({ x: 0, y: -4 });
});

test('outside combat a step does not spend OD', () => {
  const done = stepTick(
    world({ entities: [entity({ id: 'a', inCombat: false, od: 0, odFrac: 0 })] }),
    [move('a', 'e', false)],
    mulberry32(1),
  );
  expect(done.rejections).toEqual([]);
  expect(done.entities[0]?.cell).toEqual({ x: 1, y: 0 });
  expect(done.entities[0]?.od).toBe(0);
  expect(done.entities[0]?.odFrac).toBe(0.3);
});

test('a blocked step rejects and leaves the entity where regen left it', () => {
  const start = world({
    entities: [entity({ id: 'a', inCombat: true, od: 5, odFrac: 5 })],
    obstacles: [{ x: 0, y: -1 }],
  });
  const quiet = stepTick(start, [], mulberry32(1));
  const blocked = stepTick(start, [move('a', 'n', false)], mulberry32(1));
  expect(blocked.rejections).toEqual([{ entityId: 'a', code: 'blocked' }]);
  expect(blocked.entities[0]).toEqual(quiet.entities[0]);
});

test('a keeper drops a phase and a loot stack when its HP crosses the cut', () => {
  const start = world({
    entities: [
      entity({
        id: 'keeper',
        monsterId: 'keeper_enhanced_prototype',
        level: 20,
        hp: 199,
        maxHp: 400,
        baseDamage: 18,
        damage: 18,
        phaseCount: 2,
        bossPhase: 1,
        phases: [
          { index: 1 },
          { index: 2, hpBelow: 0.5, damageMultiplier: 1.5 },
        ],
        rank: 'boss',
      }),
    ],
    lootTables: {
      keeper_enhanced_prototype: [{ itemId: 'keeper_core', chance: 1, min: 1, max: 1, kind: 'component' }],
    },
  });
  const phased = stepTick(start, [], mulberry32(1));
  expect(phased.entities[0]?.bossPhase).toBe(2);
  expect(phased.entities[0]?.damage).toBe(27);
  expect(phased.corpses).toEqual([]);

  const fallen = stepTick(
    world({
      entities: [entity({ ...start.entities[0]!, hp: 0 })],
      lootTables: start.lootTables,
    }),
    [],
    mulberry32(3),
  );
  expect(fallen.entities).toEqual([]);
  expect(fallen.corpses[0]?.victimId).toBe('keeper');
  expect(fallen.corpses[0]?.stacks).toEqual([{ itemId: 'keeper_core', qty: 1 }]);
});

test('an aimed leg hit sets legsDestroyed and the run pays the penalty', () => {
  const start = world({
    entities: [
      entity({ id: 'a', od: 5, cell: { x: 0, y: 0 }, accuracyScore: 20, reaction: 10 }),
      entity({ id: 'b', od: 0, cell: { x: 1, y: 0 }, evasion: 0, maxHp: 40, hp: 40 }),
    ],
  });
  const hit = stepTick(
    start,
    [
      {
        type: 'attack',
        attackerId: 'a',
        targetId: 'b',
        weaponDamage: 8,
        odCost: 0,
        range: 1,
        los: true,
        aim: 'leg_left',
        melee: true,
        friendlyFire: false,
        sameGroup: false,
        pvpOpen: true,
        safeZone: false,
        issuedAtMs: 0,
      },
    ],
    mulberry32(1),
  );
  const target = hit.entities.find((row) => row.id === 'b');
  expect(target?.legsDestroyed).toBe(1);
  expect(target?.hp).toBeGreaterThan(0);
  const ran = stepTick(
    world({
      entities: [
        entity({
          id: 'b',
          od: 5,
          reaction: 10,
          legsDestroyed: 1,
          cell: { x: 0, y: 0 },
        }),
      ],
    }),
    [
      {
        type: 'move',
        entityId: 'b',
        dir: 'e',
        running: true,
        issuedAtMs: 0,
      },
    ],
    mulberry32(2),
  );
  expect(ran.entities[0]?.cell.x).toBe(2);
});

test('dungeon steps stay on connected rooms', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        od: 3,
        odFrac: 3,
        roomId: 0,
        dungeonId: 'inst',
        dungeonRooms: [
          { id: 0, x: 0, y: 0 },
          { id: 1, x: 4, y: 1 },
        ],
        dungeonEdges: [[0, 1]],
        cell: { x: 0, y: 0 },
      }),
    ],
  });
  const moved = stepTick(
    start,
    [{ type: 'move', entityId: 'a', dir: 'e', running: false, issuedAtMs: 0 }],
    mulberry32(1),
  );
  expect(moved.rejections).toEqual([]);
  expect(moved.entities[0]).toMatchObject({ roomId: 1, cell: { x: 4, y: 1 } });
  const free = stepTick(
    world({
      entities: [entity({ id: 'a', od: 3, odFrac: 3, cell: { x: 0, y: 0 } })],
    }),
    [{ type: 'move', entityId: 'a', dir: 'e', running: false, issuedAtMs: 0 }],
    mulberry32(1),
  );
  expect(free.entities[0]?.cell).toEqual({ x: 1, y: 0 });
});

test('neuroshock halves speed and weapon damage while overloaded', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        reaction: 15,
        inCombat: true,
        od: 5,
        odFrac: 5,
        overloaded: true,
        cell: { x: 0, y: 0 },
      }),
      entity({ id: 't', evasion: 0, od: 0, hp: 100, cell: { x: 3, y: 0 } }),
    ],
  });
  const moved = stepTick(start, [move('a', 'e', false)], mulberry32(1));
  expect(moved.rejections).toEqual([]);
  expect(moved.entities[0]?.cell).toEqual({ x: 1, y: 0 });

  const struck = stepTick(
    start,
    [attack({ attackerId: 'a', targetId: 't', weaponDamage: 10, distance: 1 })],
    mulberry32(1),
  );
  expect(struck.rejections).toEqual([]);
  expect(struck.entities[1]?.hp).toBe(93);
});

test('mutation empower increases the hit', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        inCombat: true,
        od: 5,
        odFrac: 5,
        statuses: [
          { id: 'mutation', expiresAtMs: 100_000, sourceId: 'src', mutationEffect: 'empower' },
        ],
      }),
      entity({ id: 't', evasion: 0, od: 0, hp: 100, cell: { x: 1, y: 0 } }),
    ],
  });
  const done = stepTick(
    start,
    [attack({ attackerId: 'a', targetId: 't', weaponDamage: 10, distance: 1 })],
    mulberry32(1),
  );
  expect(done.entities[1]?.hp).toBe(78);
});

test('slow halves the cells of a long step', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        reaction: 15,
        inCombat: true,
        od: 5,
        odFrac: 5,
        statuses: [{ id: 'slow', expiresAtMs: 100_000, sourceId: 'src' }],
      }),
    ],
  });
  const done = stepTick(start, [move('a', 'e', false)], mulberry32(1));
  expect(done.rejections).toEqual([]);
  expect(done.entities[0]?.cell).toEqual({ x: 1, y: 0 });
  expect(done.entities[0]?.od).toBe(4);
  expect(done.entities[0]?.odFrac).toBe(4.4);
});

test('higher reaction attacks first and a dodge spends the only OD', () => {
  const start = world({
    entities: [
      entity({ id: 'slow', reaction: 1, inCombat: true, od: 5, odFrac: 5, cell: { x: 0, y: 0 } }),
      entity({ id: 'fast', reaction: 20, inCombat: true, od: 5, odFrac: 5, cell: { x: 0, y: 1 } }),
      entity({
        id: 't',
        inCombat: true,
        od: 1,
        odFrac: 1,
        evasion: 100,
        hp: 100,
        cell: { x: 1, y: 0 },
      }),
    ],
  });
  const done = stepTick(
    start,
    [
      attack({ attackerId: 'slow', targetId: 't', weaponDamage: 10, issuedAtMs: 5 }),
      attack({ attackerId: 'fast', targetId: 't', weaponDamage: 4, issuedAtMs: 5 }),
    ],
    mulberry32(1),
  );
  expect(done.rejections).toEqual([]);
  expect(done.entities[2]?.hp).toBe(85);
  expect(done.entities[2]?.od).toBe(0);
});

test('ten ticks of bleed remove 1 HP and do not down the entity', () => {
  const start = world({
    entities: [entity({ id: 'a', hp: 20, statuses: [bleed()] })],
  });
  const early = runTicks(start, 9);
  expect(early.entities[0]?.hp).toBe(20);
  const done = runTicks(start, 10);
  expect(done.entities[0]?.hp).toBe(19);
  expect(done.entities[0]?.phase).toBe('online');
  expect(runTicks(start, 20).entities[0]?.hp).toBe(18);
});

test('stun is checked between status seconds and blocks movement', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        inCombat: true,
        od: 5,
        odFrac: 5,
        statuses: [{ id: 'stun', expiresAtMs: 1_500, sourceId: 'src' }],
      }),
    ],
  });
  const during = stepTick(start, [move('a', 'n', false)], mulberry32(1));
  expect(during.entities[0]?.stunned).toBe(true);
  expect(during.rejections).toEqual([{ entityId: 'a', code: 'stun_blocked' }]);
  expect(during.entities[0]?.cell).toEqual({ x: 0, y: 0 });

  const expired = runTicks(start, 15);
  expect(expired.nowMs).toBe(1_500);
  expect(expired.entities[0]?.stunned).toBe(false);
  expect(expired.entities[0]?.statuses).toEqual([]);
});

test('lag 0 returns the newest snapshot and lag 500 returns the oldest of six', () => {
  const history = [0, 100, 200, 300, 400, 500].map((nowMs) =>
    world({ nowMs, entities: [entity({ id: 'a', hp: nowMs })] }),
  );
  const newest = history[5];
  const oldest = history[0];
  expect(newest).toBeDefined();
  expect(oldest).toBeDefined();
  expect(snapshotLag(history, 0)).toBe(newest);
  expect(snapshotLag(history, 500)).toBe(oldest);
  expect(snapshotLag(history, 600)).toBe(oldest);
  expect(snapshotLag(history, 250).nowMs).toBe(200);
});

test('stepTick keeps the last six snapshots', () => {
  const done = runTicks(world({ entities: [entity({ id: 'a' })] }), 7);
  expect(done.history.map((snap) => snap.nowMs)).toEqual([200, 300, 400, 500, 600, 700]);
  expect(snapshotLag(done.history, 0).nowMs).toBe(700);
  expect(snapshotLag(done.history, 500).nowMs).toBe(200);
  expect(done.history[0]?.history).toEqual([]);
});

test('an empty lag buffer throws', () => {
  expect(() => snapshotLag([], 0)).toThrow(RangeError);
});

test('a bot with carrierOffline disappears and leaves no corpse', () => {
  const start = world({
    entities: [
      entity({ id: 'bot', isBot: true, carrierOffline: true, hp: 10 }),
      entity({ id: 'player', carrierOffline: true, hp: 10 }),
    ],
    corpses: [{ victimId: 'already' }],
  });
  const done = stepTick(start, [], mulberry32(1));
  expect(done.entities.map((item) => item.id)).toEqual(['player']);
  expect(done.corpses).toEqual([{ victimId: 'already' }]);
});

test('logout outside combat counts down logoutLeftMs and then freezes offline', () => {
  const start = world({
    entities: [entity({ id: 'a', logoutRequested: true, logoutLeftMs: 200, od: 1, odFrac: 1 })],
  });
  const once = stepTick(start, [], mulberry32(1));
  expect(once.entities[0]?.phase).toBe('online');
  expect(once.entities[0]?.logoutLeftMs).toBe(100);
  expect(once.entities.map((item) => item.id)).toEqual(['a']);

  const twice = stepTick(once, [], mulberry32(1));
  expect(twice.entities[0]?.phase).toBe('offline');
  expect(twice.entities[0]?.frozen).toBe(true);
  expect(twice.entities[0]?.logoutLeftMs).toBe(0);
  expect(twice.entities.map((item) => item.id)).toEqual(['a']);

  const frozen = stepTick(twice, [], mulberry32(1));
  expect(frozen.entities[0]?.odFrac).toBe(twice.entities[0]?.odFrac);
  expect(frozen.entities[0]?.hp).toBe(twice.entities[0]?.hp);
  expect(frozen.entities[0]?.phase).toBe('offline');
});

test('logout outside combat starts at LOGOUT_GRACE_MS when leftMs is unset', () => {
  const done = stepTick(
    world({ entities: [entity({ id: 'a', logoutRequested: true })] }),
    [],
    mulberry32(1),
  );
  expect(LOGOUT_GRACE_MS).toBe(600_000);
  expect(done.entities[0]?.logoutLeftMs).toBe(LOGOUT_GRACE_MS - 100);
  expect(done.entities[0]?.phase).toBe('online');
});

test('logout in combat does not set logoutLeftMs', () => {
  const done = stepTick(
    world({
      entities: [entity({ id: 'a', inCombat: true, od: 1, odFrac: 1, logoutRequested: true })],
    }),
    [],
    mulberry32(1),
  );
  expect(done.entities[0]?.logoutLeftMs).toBeUndefined();
  expect(done.entities[0]?.phase).toBe('online');
  expect(done.entities[0]?.inCombat).toBe(true);
});

test('ten stepTick calls are deterministic', () => {
  const start = world({
    entities: [
      entity({
        id: 'a',
        reaction: 13,
        od: 1,
        odFrac: 1,
        inCombat: true,
        hp: 30,
        statuses: [bleed()],
      }),
      entity({ id: 'b', reaction: 13, od: 1, odFrac: 1, inCombat: true, cell: { x: 2, y: 0 } }),
    ],
  });
  const commands = [
    attack({ attackerId: 'a', targetId: 'b', issuedAtMs: 0 }),
    attack({ attackerId: 'b', targetId: 'a', issuedAtMs: 0 }),
  ];
  const left = runWith(start, commands);
  const right = runWith(start, commands);
  expect(left).toEqual(right);
  expect(left.tick).toBe(10);
});

test('an adjacent monster steps in and spends a melee attack on the player', () => {
  const start = world({
    entities: [
      entity({ id: 'lia', hp: 40, maxHp: 40, armor: 0, evasion: 0, cell: { x: 0, y: 0 }, inEncounter: true }),
      entity({
        id: 'rat',
        monsterId: 'spore_rat',
        damage: 8,
        hp: 12,
        maxHp: 12,
        cell: { x: 1, y: 0 },
        accuracyStat: 20,
        accuracyScore: 20,
      }),
    ],
  });
  const fought = stepTick(start, [], mulberry32(1));
  const player = fought.entities.find((entity) => entity.id === 'lia');
  expect(player?.hp).toBeLessThan(40);
});

test('a player on the geography graph is not chased, and a step uses the edge', () => {
  const geography = {
    barrierDown: false,
    nodes: [
      { id: 'fort_humans', x: 0, y: 0, kind: 'city' as const, safe: true, side: 'light' as const, regionId: 'plains' },
      { id: 'edge_light', x: 10, y: 0, kind: 'dungeon' as const, safe: false, side: 'light' as const, regionId: 'plains' },
    ],
    edges: [{ id: 'a', a: 'fort_humans', b: 'edge_light', length: 10 }],
  };
  const start = world({
    geography,
    entities: [
      entity({ id: 'lia', hp: 40, maxHp: 40, cell: { x: 0, y: 0 }, nodeId: 'fort_humans' }),
      entity({
        id: 'rat',
        monsterId: 'spore_rat',
        damage: 8,
        hp: 12,
        maxHp: 12,
        cell: { x: 1, y: 0 },
        inEncounter: true,
        instanceId: 'lia',
      }),
    ],
  });
  const stayed = stepTick(start, [], mulberry32(1));
  expect(stayed.entities.find((row) => row.id === 'lia')?.hp).toBe(40);
  const moved = stepTick(
    stayed,
    [{ type: 'move', entityId: 'lia', dir: 'e', running: false, issuedAtMs: 0 }],
    mulberry32(1),
  );
  expect(moved.entities.find((row) => row.id === 'lia')).toMatchObject({
    nodeId: 'edge_light',
    cell: { x: 10, y: 0 },
  });
  expect(moved.geography?.nodes).toHaveLength(2);
  const refused = stepTick(
    moved,
    [{ type: 'move', entityId: 'lia', dir: 'nw', running: false, issuedAtMs: 0 }],
    mulberry32(1),
  );
  expect(refused.rejections).toContainEqual({ entityId: 'lia', code: 'no_edge' });
  expect(refused.entities.find((row) => row.id === 'lia')?.nodeId).toBe('edge_light');
});

test('a city geography ignores client pvp flags until war, a wave, or the encounter', () => {
  const geography = {
    barrierDown: false,
    nodes: [
      { id: 'fort_humans', x: 0, y: 0, kind: 'city' as const, safe: true, side: 'light' as const, regionId: 'plains' },
    ],
    edges: [],
  };
  const fighters = [
    entity({ id: 'lia', nodeId: 'fort_humans', cell: { x: 0, y: 0 }, hp: 40, maxHp: 40, evasion: 0, armor: 0 }),
    entity({ id: 'kai', nodeId: 'fort_humans', cell: { x: 0, y: 0 }, hp: 40, maxHp: 40, evasion: 0, armor: 0 }),
  ];
  const hit = attack({
    attackerId: 'lia',
    targetId: 'kai',
    melee: true,
    range: 1,
    weaponDamage: 12,
    odCost: 0,
    pvpOpen: true,
    safeZone: false,
  });
  const blocked = stepTick(world({ geography, entities: fighters }), [hit], mulberry32(1));
  expect(blocked.rejections).toContainEqual({ entityId: 'lia', code: 'safe' });
  expect(blocked.entities.find((row) => row.id === 'kai')?.hp).toBe(40);

  const war = stepTick(world({ geography, warCities: ['fort_humans'], entities: fighters }), [hit], mulberry32(1));
  expect(war.entities.find((row) => row.id === 'kai')?.hp).toBeLessThan(40);

  const wave = stepTick(world({ geography, invasion: 'wave1', entities: fighters }), [hit], mulberry32(1));
  expect(wave.entities.find((row) => row.id === 'kai')?.hp).toBeLessThan(40);

  const open = stepTick(
    world({
      geography,
      entities: [
        entity({
          id: 'lia',
          nodeId: 'fort_humans',
          inEncounter: true,
          cell: { x: 0, y: 0 },
          hp: 40,
          maxHp: 40,
          evasion: 0,
          armor: 0,
        }),
        fighters[1]!,
      ],
    }),
    [hit],
    mulberry32(1),
  );
  expect(open.entities.find((row) => row.id === 'kai')?.hp).toBeLessThan(40);
});

function runWith(start: SimWorld, commands: AttackCommand[]): SimWorld {
  let current = start;
  for (let i = 0; i < 10; i += 1) {
    current = stepTick(current, i === 0 ? commands : [], mulberry32(7));
  }
  return current;
}
