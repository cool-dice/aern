import {
  INSTANCE_TTL_MS,
  generateDungeon,
  type DungeonLayout,
  type DungeonSize,
} from '@rift/domain/dungeon';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createDungeonModule } from './index';
import { memoryInstanceRepository } from './repository';
import { DUNGEON_LOCK_MS, createDungeonService, type DungeonGenerator } from './service';
import type { DungeonService, InstanceRepository } from './types';

const NODE = 'light_dungeon';
const EDGE = 'cross_light__light_dungeon';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function input(
  characterId: string,
  nowMs: number,
  extra?: { groupId?: string; partySize?: number; nodeId?: string; edgeId?: string },
) {
  return {
    characterId,
    nodeId: extra?.nodeId ?? NODE,
    edgeId: extra?.edgeId ?? EDGE,
    groupId: extra?.groupId ?? characterId,
    nowMs,
    partySize: extra?.partySize ?? 1,
  };
}

function entered(
  service: DungeonService,
  characterId: string,
  nowMs: number,
  extra?: { groupId?: string; partySize?: number; nodeId?: string; edgeId?: string },
): { instanceId: string; layout: DungeonLayout } {
  const result = service.enter(input(characterId, nowMs, extra));
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result.value;
}

function entrance(layout: DungeonLayout) {
  return layout.rooms.find((room) => room.id === layout.entranceId);
}

function countingService(repository: InstanceRepository = memoryInstanceRepository()): {
  service: DungeonService;
  repository: InstanceRepository;
  seeds: string[];
  sizes: DungeonSize[];
} {
  const seeds: string[] = [];
  const sizes: DungeonSize[] = [];
  const generate: DungeonGenerator = (seedText, size) => {
    seeds.push(seedText);
    sizes.push(size);
    return generateDungeon(seedText, size);
  };
  return {
    repository,
    seeds,
    sizes,
    service: createDungeonService(repository, generate),
  };
}

test('two players in one window share the instance and the entrance', () => {
  const { service, seeds, sizes } = countingService();
  const first = entered(service, 'alpha', 0);
  const second = entered(service, 'beta', 299_999);

  expect(first.instanceId).toMatch(UUID_V4);
  expect(second.instanceId).toBe(first.instanceId);
  expect(second.layout.entranceId).toBe(first.layout.entranceId);
  expect(entrance(second.layout)).toEqual(entrance(first.layout));
  expect(second.layout).toEqual(first.layout);
  expect(seeds).toEqual(['light_dungeon|cross_light__light_dungeon|1970-01-01T00:00:00.000Z']);
  expect(sizes).toEqual(['small']);
});

test('a later window and another edge do not join the open instance', () => {
  const { service } = countingService();
  const first = entered(service, 'alpha', 0);
  const nextWindow = entered(service, 'beta', 300_000);
  const otherEdge = entered(service, 'gamma', 0, { edgeId: 'fort_humans__edge_light' });

  expect(nextWindow.instanceId).not.toBe(first.instanceId);
  expect(otherEdge.instanceId).not.toBe(first.instanceId);
});

test('the ninth player is full and does not generate another layout', () => {
  const { service, seeds } = countingService();
  let instanceId = '';
  for (let index = 0; index < 8; index += 1) {
    instanceId = entered(service, `hero-${index}`, 1_000).instanceId;
  }

  const ninth = service.enter(input('hero-8', 1_000));

  expect(ninth).toEqual({ ok: false, code: 'full' });
  expect(seeds).toHaveLength(1);
  expect(instanceId).not.toBe('');
});

test('a group of four reserves a batch and each person counts toward eight', () => {
  const { service, seeds } = countingService();
  const first = entered(service, 'solo-0', 0);
  for (let index = 1; index < 5; index += 1) {
    expect(entered(service, `solo-${index}`, 0).instanceId).toBe(first.instanceId);
  }

  const blocked = service.enter(input('party-0', 0, { groupId: 'party', partySize: 4 }));
  expect(blocked).toEqual({ ok: false, code: 'full' });

  const sixth = entered(service, 'solo-5', 0);
  expect(sixth.instanceId).toBe(first.instanceId);
  expect(seeds).toHaveLength(1);

  const open = countingService();
  const leader = entered(open.service, 'member-0', 0, { groupId: 'party', partySize: 4 });
  for (let index = 1; index < 4; index += 1) {
    const member = entered(open.service, `member-${index}`, 0, { groupId: 'party', partySize: 4 });
    expect(member.instanceId).toBe(leader.instanceId);
  }
  const rival = entered(open.service, 'rival-0', 0, { groupId: 'rival', partySize: 4 });
  expect(rival.instanceId).toBe(leader.instanceId);
  expect(open.service.enter(input('extra', 0))).toEqual({ ok: false, code: 'full' });
  expect(open.seeds).toHaveLength(1);
});

test('a party larger than four is split into separate seeds', () => {
  const { service, seeds } = countingService();
  const ids: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    ids.push(entered(service, `big-${index}`, 0, { groupId: 'big', partySize: 5 }).instanceId);
  }
  const solo = entered(service, 'solo', 0);

  expect(new Set(ids.slice(0, 4)).size).toBe(1);
  expect(ids[4]).not.toBe(ids[0]);
  expect(solo.instanceId).not.toBe(ids[0]);
  expect(solo.instanceId).not.toBe(ids[4]);
  expect(seeds).toHaveLength(3);
});

test('leave and an online tick after ten minutes deletes; offline does not', () => {
  const repository = memoryInstanceRepository();
  const { service } = countingService(repository);
  const now = 0;
  const first = entered(service, 'alpha', now);
  service.leave(first.instanceId, 'alpha', now);

  service.tickTtl(now + INSTANCE_TTL_MS - 1, true);
  expect(repository.list()).toHaveLength(1);

  service.tickTtl(now + INSTANCE_TTL_MS, false);
  expect(repository.list()).toHaveLength(1);

  service.tickTtl(now + INSTANCE_TTL_MS, true);
  expect(repository.list()).toHaveLength(0);
});

test('offline time freezes the remaining ttl', () => {
  const repository = memoryInstanceRepository();
  const { service } = countingService(repository);
  const first = entered(service, 'alpha', 0);
  service.leave(first.instanceId, 'alpha', 0);

  service.tickTtl(100_000, false);
  expect(repository.list()).toHaveLength(1);

  service.tickTtl(INSTANCE_TTL_MS, true);
  expect(repository.list()).toHaveLength(1);

  service.tickTtl(INSTANCE_TTL_MS + 500_000, true);
  expect(repository.list()).toHaveLength(0);
});

test('the same character returns while the instance lives and is locked after deletion', () => {
  const repository = memoryInstanceRepository();
  const { service } = countingService(repository);
  const now = 0;
  const first = entered(service, 'alpha', now);
  entered(service, 'beta', now);
  service.leave(first.instanceId, 'alpha', now);

  const returned = entered(service, 'alpha', now);
  expect(returned.instanceId).toBe(first.instanceId);
  service.tickTtl(now + INSTANCE_TTL_MS, true);
  expect(repository.list()).toHaveLength(1);

  service.leave(first.instanceId, 'alpha', now);
  service.leave(first.instanceId, 'beta', now);
  service.tickTtl(now + INSTANCE_TTL_MS, true);
  expect(repository.list()).toHaveLength(0);

  const locked = service.enter(input('alpha', now + INSTANCE_TTL_MS));
  expect(locked).toEqual({ ok: false, code: 'locked' });

  const other = entered(service, 'gamma', now + INSTANCE_TTL_MS);
  expect(other.instanceId).not.toBe(first.instanceId);

  const stillLocked = service.enter(input('alpha', now + INSTANCE_TTL_MS + DUNGEON_LOCK_MS - 1));
  expect(stillLocked).toEqual({ ok: false, code: 'locked' });

  const afterLock = entered(service, 'alpha', now + INSTANCE_TTL_MS + DUNGEON_LOCK_MS);
  expect(afterLock.instanceId).not.toBe(first.instanceId);
});

test('dungeon module starts from the bus clock and does not listen', () => {
  const bus = createBus();
  const clock = manualClock(0);
  const dungeon = createDungeonModule();

  dungeon.start({ bus, now: () => clock.now() });

  expect(dungeon.name).toBe('dungeon');
  const result = dungeon.service.enter(input('alpha', clock.now()));
  expect(result.ok).toBe(true);
});
