import type { DungeonLayout } from '@rift/domain/dungeon';
import type { DungeonInstance, EntryLock, InstanceRepository } from './types';

export function memoryInstanceRepository(): InstanceRepository {
  const instances = new Map<string, DungeonInstance>();
  const locks = new Map<string, EntryLock>();

  return {
    findById(id) {
      const found = instances.get(id);
      return found ? cloneInstance(found) : undefined;
    },
    findByKey(key) {
      for (const instance of instances.values()) {
        if (instance.key === key) {
          return cloneInstance(instance);
        }
      }
      return undefined;
    },
    list() {
      return [...instances.values()].map(cloneInstance);
    },
    insert(instance) {
      if (instances.has(instance.id)) {
        throw new Error(`duplicate instance ${instance.id}`);
      }
      instances.set(instance.id, cloneInstance(instance));
    },
    update(instance) {
      if (!instances.has(instance.id)) {
        throw new Error(`missing instance ${instance.id}`);
      }
      instances.set(instance.id, cloneInstance(instance));
    },
    delete(id) {
      instances.delete(id);
    },
    findLock(characterId, nodeId, edgeId) {
      const found = locks.get(lockId(characterId, nodeId, edgeId));
      return found ? { ...found } : undefined;
    },
    saveLock(lock) {
      locks.set(lockId(lock.characterId, lock.nodeId, lock.edgeId), { ...lock });
    },
  };
}

function lockId(characterId: string, nodeId: string, edgeId: string): string {
  return `${characterId}\0${nodeId}\0${edgeId}`;
}

function cloneLayout(layout: DungeonLayout): DungeonLayout {
  return {
    entranceId: layout.entranceId,
    bossIds: [...layout.bossIds],
    edges: layout.edges.map((pair) => {
      const left = pair[0];
      const right = pair[1];
      if (left === undefined || right === undefined) {
        throw new Error('dungeon edge is missing an endpoint');
      }
      return [left, right] as [number, number];
    }),
    rooms: layout.rooms.map((room) => ({ ...room })),
  };
}

function cloneInstance(instance: DungeonInstance): DungeonInstance {
  return {
    id: instance.id,
    key: instance.key,
    scope: instance.scope,
    chunk: instance.chunk,
    seedText: instance.seedText,
    layout: cloneLayout(instance.layout),
    nodeId: instance.nodeId,
    edgeId: instance.edgeId,
    windowStartMs: instance.windowStartMs,
    present: [...instance.present],
    entrants: [...instance.entrants],
    groups: instance.groups.map((group) => ({
      groupId: group.groupId,
      partySize: group.partySize,
      memberIds: [...group.memberIds],
    })),
    expireAt: instance.expireAt,
    frozenRemainingMs: instance.frozenRemainingMs,
  };
}
