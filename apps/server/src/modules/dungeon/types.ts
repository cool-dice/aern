import type { DungeonLayout } from '@rift/domain/dungeon';

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E };

export interface DungeonService {
  enter(input: {
    characterId: string;
    nodeId: string;
    edgeId: string;
    groupId: string;
    nowMs: number;
    partySize: number;
  }): Result<{ instanceId: string; layout: DungeonLayout }, 'full' | 'locked'>;
  leave(instanceId: string, characterId: string, nowMs: number): void;
  tickTtl(nowMs: number, worldOnline: boolean): void;
}

export interface DungeonGroup {
  groupId: string;
  partySize: number;
  memberIds: string[];
}

export interface DungeonInstance {
  id: string;
  key: string;
  scope: 'shared' | 'chunk';
  chunk: number | null;
  seedText: string;
  layout: DungeonLayout;
  nodeId: string;
  edgeId: string;
  windowStartMs: number;
  /** Characters inside right now. */
  present: string[];
  /** Everyone who entered, including characters who already left. */
  entrants: string[];
  groups: DungeonGroup[];
  /** Set when the instance is empty. Cleared when someone returns. */
  expireAt: number | null;
  /** Remaining TTL captured while the whole world is offline. */
  frozenRemainingMs: number | null;
}

export interface EntryLock {
  characterId: string;
  nodeId: string;
  edgeId: string;
  untilMs: number;
}

/**
 * Instance storage. Task 044 supplies the Redis adapter; tests use memory.
 * Locks outlive the instance, so they stay on this port.
 */
export interface InstanceRepository {
  findById(id: string): DungeonInstance | undefined;
  findByKey(key: string): DungeonInstance | undefined;
  list(): DungeonInstance[];
  insert(instance: DungeonInstance): void;
  update(instance: DungeonInstance): void;
  delete(id: string): void;
  findLock(characterId: string, nodeId: string, edgeId: string): EntryLock | undefined;
  saveLock(lock: EntryLock): void;
}
