import { hashSeed, mulberry32, type Rng } from './rng';

export type DungeonSize = 'small' | 'medium' | 'large' | 'raid';
export type RoomKind =
  | 'combat'
  | 'loot'
  | 'trap'
  | 'event'
  | 'boss'
  | 'transition'
  | 'empty'
  | 'secret';

export interface Room {
  id: number;
  kind: RoomKind;
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface DungeonLayout {
  rooms: Room[];
  edges: [number, number][];
  entranceId: number;
  bossIds: number[];
}

/** Instance lifetime after the last player leaves. The generator only publishes it. */
export const INSTANCE_TTL_MS = 600_000;

const SEED_WINDOW_MS = 300_000;
const LAYER_STEP = 20;
const ENTRANCE_ID = 0;

const QUOTA_KINDS = ['combat', 'loot', 'trap', 'event', 'boss', 'transition', 'empty'] as const;
type QuotaKind = (typeof QUOTA_KINDS)[number];

/** Shares in percent. Largest-remainder uses integers so 0.1 does not drift. */
const QUOTA_WEIGHT: Record<QuotaKind, number> = {
  combat: 40,
  loot: 15,
  trap: 10,
  event: 10,
  boss: 5,
  transition: 10,
  empty: 10,
};

interface SizeSpec {
  rooms: readonly [number, number];
  clusters: readonly [number, number];
  roads: readonly [number, number];
  bosses: number;
  secrets: readonly [number, number];
}

const SIZES: Record<DungeonSize, SizeSpec> = {
  small: { rooms: [5, 7], clusters: [2, 3], roads: [1, 2], bosses: 1, secrets: [1, 1] },
  medium: { rooms: [8, 12], clusters: [3, 4], roads: [2, 3], bosses: 1, secrets: [1, 2] },
  large: { rooms: [13, 20], clusters: [4, 6], roads: [3, 5], bosses: 1, secrets: [2, 3] },
  raid: { rooms: [21, 30], clusters: [6, 8], roads: [5, 7], bosses: 2, secrets: [3, 4] },
};

const DIFFICULTY = {
  easy: { hp: 0.75, damage: 0.75, loot: 0.75, xp: 0.75 },
  normal: { hp: 1, damage: 1, loot: 1, xp: 1 },
  hard: { hp: 1.5, damage: 1.25, loot: 1.5, xp: 1.5 },
  epic: { hp: 2, damage: 1.5, loot: 2, xp: 2 },
  raid: { hp: 3, damage: 2, loot: 3, xp: 3 },
} as const;

export function generateDungeon(seedText: string, size: DungeonSize): DungeonLayout {
  const rng = mulberry32(hashSeed(seedText));
  const spec = SIZES[size];
  const roomCount = rollRange(rng, spec.rooms[0], spec.rooms[1]);
  const clusterCount = rollRange(rng, spec.clusters[0], spec.clusters[1]);
  const roadCount = rollRange(rng, spec.roads[0], spec.roads[1]);
  const secretCount = rollRange(rng, spec.secrets[0], spec.secrets[1]);

  // Cluster count lengthens the entrance-to-first-boss spine. The spine is still at least 3.
  const minChain = Math.max(3, clusterCount);
  if (roomCount < minChain) {
    bug('not enough rooms for the entrance chain');
  }
  const chainLen = minChain + rng.nextInt(roomCount - minChain + 1);

  const edges: [number, number][] = [];
  const linked = new Set<string>();
  for (let id = 1; id < chainLen; id += 1) {
    tryLink(linked, edges, id - 1, id);
  }
  for (let id = chainLen; id < roomCount; id += 1) {
    tryLink(linked, edges, rng.nextInt(id), id);
  }
  addRoads(rng, roomCount, roadCount, linked, edges);

  const bossIds = pickBossIds(rng, roomCount, chainLen, spec.bosses);
  const kinds = assignKinds(rng, roomCount, bossIds);
  const rooms: Room[] = [];
  for (let id = 0; id < kinds.length; id += 1) {
    const kind = kinds[id];
    if (kind === undefined) bug('missing kind');
    const footprint = footprintFor(kind, rng);
    rooms.push({ id, kind, w: footprint.w, h: footprint.h, x: 0, y: 0 });
  }
  addSecrets(rng, rooms, linked, edges, secretCount);

  if (edges.length - rooms.length + 1 !== roadCount) {
    bug('road count drifted');
  }

  assignCoordinates(rooms, edges, ENTRANCE_ID);
  const layout: DungeonLayout = {
    rooms,
    edges: [...edges].sort((left, right) => left[0] - right[0] || left[1] - right[1]),
    entranceId: ENTRANCE_ID,
    bossIds: [...bossIds].sort((left, right) => left - right),
  };
  assertLayout(layout);
  return layout;
}

export function sameSeedWindow(aMs: number, bMs: number): boolean {
  return Math.floor(aMs / SEED_WINDOW_MS) === Math.floor(bMs / SEED_WINDOW_MS);
}

export function difficultyMultipliers(id: 'easy' | 'normal' | 'hard' | 'epic' | 'raid'): {
  hp: number;
  damage: number;
  loot: number;
  xp: number;
} {
  const row = DIFFICULTY[id];
  return { hp: row.hp, damage: row.damage, loot: row.loot, xp: row.xp };
}

function rollRange(rng: Rng, min: number, max: number): number {
  return min + rng.nextInt(max - min + 1);
}

function orderedEdge(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function edgeKey(a: number, b: number): string {
  const edge = orderedEdge(a, b);
  return `${edge[0]}:${edge[1]}`;
}

function tryLink(linked: Set<string>, edges: [number, number][], a: number, b: number): boolean {
  if (a === b) return false;
  const key = edgeKey(a, b);
  if (linked.has(key)) return false;
  linked.add(key);
  edges.push(orderedEdge(a, b));
  return true;
}

function addRoads(
  rng: Rng,
  roomCount: number,
  roadCount: number,
  linked: Set<string>,
  edges: [number, number][],
): void {
  let added = 0;
  let guard = 0;
  while (added < roadCount && guard < 10_000) {
    guard += 1;
    const left = rng.nextInt(roomCount);
    let right = rng.nextInt(roomCount - 1);
    if (right >= left) right += 1;
    if (tryLink(linked, edges, left, right)) added += 1;
  }
  if (added < roadCount) {
    for (let left = 0; left < roomCount && added < roadCount; left += 1) {
      for (let right = left + 1; right < roomCount && added < roadCount; right += 1) {
        if (tryLink(linked, edges, left, right)) added += 1;
      }
    }
  }
  if (added !== roadCount) bug('could not place roads');
}

function pickBossIds(rng: Rng, roomCount: number, chainLen: number, bossCount: number): number[] {
  const chainEnd = chainLen - 1;
  const bossIds = [chainEnd];
  const pool: number[] = [];
  for (let id = 1; id < roomCount; id += 1) {
    if (id !== chainEnd) pool.push(id);
  }
  while (bossIds.length < bossCount) {
    if (pool.length === 0) bug('not enough rooms for bosses');
    const picked = pool.splice(rng.nextInt(pool.length), 1)[0];
    if (picked === undefined) bug('boss pool');
    bossIds.push(picked);
  }
  return bossIds;
}

function quotaCounts(roomCount: number): Record<QuotaKind, number> {
  const counts = {
    combat: 0,
    loot: 0,
    trap: 0,
    event: 0,
    boss: 0,
    transition: 0,
    empty: 0,
  } satisfies Record<QuotaKind, number>;
  const remainders: { kind: QuotaKind; rem: number; index: number }[] = [];
  let used = 0;
  QUOTA_KINDS.forEach((kind, index) => {
    const product = roomCount * QUOTA_WEIGHT[kind];
    const floor = Math.floor(product / 100);
    counts[kind] = floor;
    used += floor;
    remainders.push({ kind, rem: product % 100, index });
  });
  remainders.sort((left, right) => right.rem - left.rem || left.index - right.index);
  let left = roomCount - used;
  for (const remainder of remainders) {
    if (left === 0) break;
    counts[remainder.kind] += 1;
    left -= 1;
  }
  if (left !== 0) bug('quota remainder');
  return counts;
}

function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const from = items[i];
    const to = items[j];
    if (from === undefined || to === undefined) bug('shuffle');
    items[i] = to;
    items[j] = from;
  }
}

function assignKinds(rng: Rng, roomCount: number, bossIds: readonly number[]): RoomKind[] {
  const counts = quotaCounts(roomCount);
  const kinds: RoomKind[] = [];
  for (const kind of QUOTA_KINDS) {
    for (let i = 0; i < counts[kind]; i += 1) kinds.push(kind);
  }
  if (kinds.length !== roomCount) bug('quota does not sum to room count');
  shuffle(rng, kinds);
  forceBosses(kinds, bossIds);
  forceEntrance(kinds, rng);
  return kinds;
}

function forceBosses(kinds: RoomKind[], bossIds: readonly number[]): void {
  const designated = new Set(bossIds);
  const extras: number[] = [];
  for (let id = 0; id < kinds.length; id += 1) {
    if (kinds[id] === 'boss' && !designated.has(id)) extras.push(id);
  }
  for (const id of bossIds) {
    const current = kinds[id];
    if (current === undefined) bug('boss room missing');
    if (current === 'boss') continue;
    const extra = extras.pop();
    if (extra !== undefined) kinds[extra] = current;
    kinds[id] = 'boss';
  }
  for (const extra of extras) kinds[extra] = 'combat';
}

function forceEntrance(kinds: RoomKind[], rng: Rng): void {
  const current = kinds[ENTRANCE_ID];
  if (current === undefined) bug('missing entrance');
  if (current === 'empty' || current === 'transition') return;
  kinds[ENTRANCE_ID] = rng.nextInt(2) === 0 ? 'empty' : 'transition';
}

function footprintFor(kind: RoomKind, rng: Rng): { w: number; h: number } {
  if (kind === 'boss') return { w: 20, h: 20 };
  if (kind === 'secret') return { w: 5, h: 5 };
  if (kind === 'empty' || kind === 'transition') {
    return { w: 1 + rng.nextInt(3), h: 5 + rng.nextInt(11) };
  }
  const sides = [5, 10, 15] as const;
  const side = sides[rng.nextInt(sides.length)];
  if (side === undefined) bug('room side');
  return { w: side, h: side };
}

function addSecrets(
  rng: Rng,
  rooms: Room[],
  linked: Set<string>,
  edges: [number, number][],
  secretCount: number,
): void {
  for (let index = 0; index < secretCount; index += 1) {
    const candidates: number[] = [];
    for (const room of rooms) {
      if (room.kind !== 'boss') candidates.push(room.id);
    }
    if (candidates.length === 0) bug('no room for a secret');
    const parentId = candidates[rng.nextInt(candidates.length)];
    if (parentId === undefined) bug('secret parent');
    const id = rooms.length;
    const footprint = footprintFor('secret', rng);
    rooms.push({ id, kind: 'secret', w: footprint.w, h: footprint.h, x: 0, y: 0 });
    if (!tryLink(linked, edges, parentId, id)) bug('secret edge');
  }
}

function assignCoordinates(
  rooms: Room[],
  edges: readonly [number, number][],
  entranceId: number,
): void {
  const byId = new Map<number, Room>();
  const adj = new Map<number, number[]>();
  for (const room of rooms) {
    byId.set(room.id, room);
    adj.set(room.id, []);
  }
  for (const [a, b] of edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort((left, right) => left - right);

  const seen = new Set<number>([entranceId]);
  const layers: number[][] = [];
  let frontier = [entranceId];
  while (frontier.length > 0) {
    layers.push(frontier);
    const next: number[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  for (let layer = 0; layer < layers.length; layer += 1) {
    const row = layers[layer];
    if (!row) bug('missing layer');
    for (let index = 0; index < row.length; index += 1) {
      const id = row[index];
      if (id === undefined) bug('missing layer room');
      const room = byId.get(id);
      if (!room) bug('missing room');
      room.x = layer * LAYER_STEP;
      room.y = index * LAYER_STEP;
    }
  }
}

function assertLayout(layout: DungeonLayout): void {
  const ids = new Set<number>();
  for (const room of layout.rooms) {
    if (ids.has(room.id)) bug('duplicate room id');
    ids.add(room.id);
  }
  if (!ids.has(layout.entranceId)) bug('missing entrance');

  const adj = new Map<number, number[]>();
  for (const id of ids) adj.set(id, []);
  const edgeKeys = new Set<string>();
  for (const [a, b] of layout.edges) {
    if (a === b || !ids.has(a) || !ids.has(b)) bug('dangling edge');
    const key = edgeKey(a, b);
    if (edgeKeys.has(key)) bug('duplicate edge');
    edgeKeys.add(key);
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }

  const seen = new Set<number>([layout.entranceId]);
  const queue = [layout.entranceId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    for (const neighbor of adj.get(id) ?? []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }

  if (layout.bossIds.length === 0) bug('missing boss');
  for (const bossId of layout.bossIds) {
    if (!seen.has(bossId)) bug('boss unreachable');
  }
  if (seen.size !== layout.rooms.length) bug('room outside entrance component');

  const entrance = layout.rooms.find((room) => room.id === layout.entranceId);
  if (!entrance || (entrance.kind !== 'empty' && entrance.kind !== 'transition')) {
    bug('entrance is not empty or transition');
  }
  const bossIdSet = new Set(layout.bossIds);
  for (const room of layout.rooms) {
    if (room.kind === 'boss' && !bossIdSet.has(room.id)) bug('unlisted boss');
    if (bossIdSet.has(room.id)) {
      if (room.kind !== 'boss' || room.w !== 20 || room.h !== 20) bug('boss is not an arena');
    }
  }

  const centers = new Set<string>();
  for (const room of layout.rooms) {
    const key = `${room.x * 2 + room.w}:${room.y * 2 + room.h}`;
    if (centers.has(key)) bug('room centers collide');
    centers.add(key);
  }
}

function bug(message: string): never {
  throw new Error(`dungeon generator bug: ${message}`);
}
