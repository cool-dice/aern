import { randomUUID } from 'node:crypto';
import {
  INSTANCE_TTL_MS,
  generateDungeon,
  sameSeedWindow,
  type DungeonLayout,
  type DungeonSize,
} from '@rift/domain/dungeon';
import type { DungeonInstance, DungeonService, InstanceRepository, Result } from './types';

/** People in one living instance. The generator does not enforce this. */
export const DUNGEON_PLAYER_CAP = 8;
/** A party larger than this is split across seeds. */
export const DUNGEON_GROUP_CAP = 4;
/** Re-entry ban written when an instance is deleted. */
export const DUNGEON_LOCK_MS = 24 * 60 * 60 * 1000;

const SEED_WINDOW_MS = 300_000;
const PROTOTYPE_SIZE: DungeonSize = 'small';

export type DungeonGenerator = (seedText: string, size: DungeonSize) => DungeonLayout;

type EnterInput = Parameters<DungeonService['enter']>[0];

export function createDungeonService(
  repository: InstanceRepository,
  generate: DungeonGenerator = generateDungeon,
): DungeonService {
  let worldOffline = false;

  function enter(input: EnterInput): ReturnType<DungeonService['enter']> {
    assertPartySize(input.partySize);
    const home = findHome(input);
    if (home) {
      return ok(rejoin(home, input.characterId));
    }

    const lock = repository.findLock(input.characterId, input.nodeId, input.edgeId);
    if (lock && input.nowMs < lock.untilMs) {
      return err('locked');
    }

    if (input.partySize <= DUNGEON_GROUP_CAP) {
      return enterShared(input);
    }
    return enterSplit(input);
  }

  function enterShared(input: EnterInput): ReturnType<DungeonService['enter']> {
    const windowStartMs = windowStart(input.nowMs);
    const key = sharedKey(windowStartMs, input.nodeId, input.edgeId);
    const existing = repository.findByKey(key);
    if (existing) {
      assertSameWindow(existing, input.nowMs);
      if (!canAcceptShared(existing, input)) {
        return err('full');
      }
      addMember(existing, input);
      repository.update(existing);
      return ok(view(existing));
    }

    if (input.partySize > DUNGEON_PLAYER_CAP) {
      return err('full');
    }
    const created = createInstance(key, 'shared', null, input, windowStartMs);
    repository.insert(created);
    return ok(view(created));
  }

  function enterSplit(input: EnterInput): ReturnType<DungeonService['enter']> {
    const windowStartMs = windowStart(input.nowMs);
    for (let chunk = 0; chunk < 10_000; chunk += 1) {
      const key = chunkKey(windowStartMs, input.nodeId, input.edgeId, input.groupId, chunk);
      const existing = repository.findByKey(key);
      if (!existing) {
        const created = createInstance(key, 'chunk', chunk, input, windowStartMs);
        repository.insert(created);
        return ok(view(created));
      }
      assertSameWindow(existing, input.nowMs);
      if (canAcceptChunk(existing, input.groupId)) {
        addMember(existing, input);
        repository.update(existing);
        return ok(view(existing));
      }
    }
    throw new Error('dungeon split could not place the group');
  }

  function leave(instanceId: string, characterId: string, nowMs: number): void {
    const instance = repository.findById(instanceId);
    if (!instance || !instance.present.includes(characterId)) {
      return;
    }
    instance.present = instance.present.filter((id) => id !== characterId);
    if (instance.present.length === 0) {
      instance.expireAt = nowMs + INSTANCE_TTL_MS;
      instance.frozenRemainingMs = null;
    }
    repository.update(instance);
  }

  function tickTtl(nowMs: number, worldOnline: boolean): void {
    if (!worldOnline) {
      worldOffline = true;
      for (const instance of repository.list()) {
        if (instance.expireAt !== null && instance.frozenRemainingMs === null) {
          repository.update({
            ...instance,
            frozenRemainingMs: instance.expireAt - nowMs,
            expireAt: null,
          });
        }
      }
      return;
    }

    if (worldOffline) {
      worldOffline = false;
      for (const instance of repository.list()) {
        if (instance.frozenRemainingMs !== null) {
          repository.update({
            ...instance,
            expireAt: nowMs + instance.frozenRemainingMs,
            frozenRemainingMs: null,
          });
        }
      }
    }

    for (const instance of repository.list()) {
      if (instance.expireAt === null || nowMs < instance.expireAt) {
        continue;
      }
      for (const characterId of instance.entrants) {
        repository.saveLock({
          characterId,
          nodeId: instance.nodeId,
          edgeId: instance.edgeId,
          untilMs: nowMs + DUNGEON_LOCK_MS,
        });
      }
      repository.delete(instance.id);
    }
  }

  function findHome(input: EnterInput): DungeonInstance | undefined {
    return repository
      .list()
      .find(
        (instance) =>
          instance.nodeId === input.nodeId &&
          instance.edgeId === input.edgeId &&
          instance.entrants.includes(input.characterId),
      );
  }

  function rejoin(
    instance: DungeonInstance,
    characterId: string,
  ): { instanceId: string; layout: DungeonLayout } {
    if (!instance.present.includes(characterId)) {
      instance.present.push(characterId);
    }
    instance.expireAt = null;
    instance.frozenRemainingMs = null;
    repository.update(instance);
    return view(instance);
  }

  function createInstance(
    key: string,
    scope: DungeonInstance['scope'],
    chunk: number | null,
    input: EnterInput,
    windowStartMs: number,
  ): DungeonInstance {
    const seedText = seedFor(input, windowStartMs, chunk);
    const layout = generate(seedText, PROTOTYPE_SIZE);
    const instance: DungeonInstance = {
      id: randomUUID(),
      key,
      scope,
      chunk,
      seedText,
      layout,
      nodeId: input.nodeId,
      edgeId: input.edgeId,
      windowStartMs,
      present: [],
      entrants: [],
      groups: [],
      expireAt: null,
      frozenRemainingMs: null,
    };
    addMember(instance, input);
    return instance;
  }

  return { enter, leave, tickTtl };
}

function assertPartySize(partySize: number): void {
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new Error(`invalid party size: ${partySize}`);
  }
}

function windowStart(nowMs: number): number {
  return Math.floor(nowMs / SEED_WINDOW_MS) * SEED_WINDOW_MS;
}

function sharedKey(windowStartMs: number, nodeId: string, edgeId: string): string {
  return `shared:${windowStartMs}|${nodeId}|${edgeId}`;
}

function chunkKey(
  windowStartMs: number,
  nodeId: string,
  edgeId: string,
  groupId: string,
  chunk: number,
): string {
  return `chunk:${windowStartMs}|${nodeId}|${edgeId}|${groupId}|${chunk}`;
}

function seedFor(input: EnterInput, windowStartMs: number, chunk: number | null): string {
  const iso = new Date(windowStartMs).toISOString();
  if (chunk === null) {
    return `${input.nodeId}|${input.edgeId}|${iso}`;
  }
  return `${input.nodeId}|${input.edgeId}|${input.groupId}|${chunk}|${iso}`;
}

function assertSameWindow(instance: DungeonInstance, nowMs: number): void {
  if (!sameSeedWindow(instance.windowStartMs, nowMs)) {
    throw new Error('instance key crossed a seed window');
  }
}

function seatsHeld(instance: DungeonInstance): number {
  let pending = 0;
  for (const group of instance.groups) {
    pending += Math.max(0, group.partySize - group.memberIds.length);
  }
  return instance.present.length + pending;
}

function canAcceptShared(instance: DungeonInstance, input: EnterInput): boolean {
  const group = instance.groups.find((item) => item.groupId === input.groupId);
  if (group) {
    return group.memberIds.length < group.partySize;
  }
  return seatsHeld(instance) + input.partySize <= DUNGEON_PLAYER_CAP;
}

function canAcceptChunk(instance: DungeonInstance, groupId: string): boolean {
  const group = instance.groups.find((item) => item.groupId === groupId);
  const entered = group?.memberIds.length ?? 0;
  return entered < DUNGEON_GROUP_CAP && instance.present.length < DUNGEON_PLAYER_CAP;
}

function addMember(instance: DungeonInstance, input: EnterInput): void {
  if (!instance.entrants.includes(input.characterId)) {
    instance.entrants.push(input.characterId);
  }
  if (!instance.present.includes(input.characterId)) {
    instance.present.push(input.characterId);
  }
  let group = instance.groups.find((item) => item.groupId === input.groupId);
  if (!group) {
    group = { groupId: input.groupId, partySize: input.partySize, memberIds: [] };
    instance.groups.push(group);
  }
  if (!group.memberIds.includes(input.characterId)) {
    group.memberIds.push(input.characterId);
  }
  instance.expireAt = null;
  instance.frozenRemainingMs = null;
}

function view(instance: DungeonInstance): { instanceId: string; layout: DungeonLayout } {
  return {
    instanceId: instance.id,
    layout: {
      entranceId: instance.layout.entranceId,
      bossIds: [...instance.layout.bossIds],
      edges: instance.layout.edges.map((pair) => [pair[0], pair[1]] as [number, number]),
      rooms: instance.layout.rooms.map((room) => ({ ...room })),
    },
  };
}

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E extends string>(code: E): Result<never, E> {
  return { ok: false, code };
}
