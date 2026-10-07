import { expect, test } from 'vitest';
import {
  INSTANCE_TTL_MS,
  difficultyMultipliers,
  generateDungeon,
  sameSeedWindow,
  type DungeonLayout,
  type DungeonSize,
  type Room,
} from './dungeon';

const SPECS: Record<
  DungeonSize,
  { ordinary: [number, number]; secrets: [number, number]; roads: [number, number]; bosses: number }
> = {
  small: { ordinary: [5, 7], secrets: [1, 1], roads: [1, 2], bosses: 1 },
  medium: { ordinary: [8, 12], secrets: [1, 2], roads: [2, 3], bosses: 1 },
  large: { ordinary: [13, 20], secrets: [2, 3], roads: [3, 5], bosses: 1 },
  raid: { ordinary: [21, 30], secrets: [3, 4], roads: [5, 7], bosses: 2 },
};

function shape(layout: DungeonLayout): string {
  return layout.rooms.map((room) => `${room.kind}@${room.x},${room.y}`).join('|');
}

function reachable(layout: DungeonLayout): Set<number> {
  const adj = new Map<number, number[]>();
  for (const room of layout.rooms) adj.set(room.id, []);
  for (const [a, b] of layout.edges) {
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
  return seen;
}

function layersOf(layout: DungeonLayout): number[][] {
  const adj = new Map<number, number[]>();
  for (const room of layout.rooms) adj.set(room.id, []);
  for (const [a, b] of layout.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort((left, right) => left - right);
  const seen = new Set<number>([layout.entranceId]);
  const layers: number[][] = [];
  let frontier = [layout.entranceId];
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
  return layers;
}

function isCorridor(room: Room): boolean {
  const minor = Math.min(room.w, room.h);
  const major = Math.max(room.w, room.h);
  return minor >= 1 && minor <= 3 && major >= 5 && major <= 15;
}

function expectBand(layout: DungeonLayout, size: DungeonSize): void {
  const spec = SPECS[size];
  const secrets = layout.rooms.filter((room) => room.kind === 'secret');
  const ordinary = layout.rooms.length - secrets.length;
  expect(ordinary).toBeGreaterThanOrEqual(spec.ordinary[0]);
  expect(ordinary).toBeLessThanOrEqual(spec.ordinary[1]);
  expect(secrets.length).toBeGreaterThanOrEqual(spec.secrets[0]);
  expect(secrets.length).toBeLessThanOrEqual(spec.secrets[1]);
  expect(layout.bossIds).toHaveLength(spec.bosses);

  const seen = reachable(layout);
  expect(seen.size).toBe(layout.rooms.length);
  const ids = new Set(layout.rooms.map((room) => room.id));
  const edgeKeys = new Set<string>();
  for (const [a, b] of layout.edges) {
    expect(ids.has(a)).toBe(true);
    expect(ids.has(b)).toBe(true);
    expect(a).not.toBe(b);
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    expect(edgeKeys.has(key)).toBe(false);
    edgeKeys.add(key);
  }
  const roads = layout.edges.length - layout.rooms.length + 1;
  expect(roads).toBeGreaterThanOrEqual(spec.roads[0]);
  expect(roads).toBeLessThanOrEqual(spec.roads[1]);

  const entrance = layout.rooms.find((room) => room.id === layout.entranceId);
  expect(entrance?.kind === 'empty' || entrance?.kind === 'transition').toBe(true);
  for (const bossId of layout.bossIds) {
    expect(seen.has(bossId)).toBe(true);
    const boss = layout.rooms.find((room) => room.id === bossId);
    expect(boss?.kind).toBe('boss');
    expect(boss?.w).toBe(20);
    expect(boss?.h).toBe(20);
  }

  const centers = new Set<string>();
  for (const room of layout.rooms) {
    centers.add(`${room.x * 2 + room.w}:${room.y * 2 + room.h}`);
    if (room.kind === 'secret') {
      expect(room.w).toBe(5);
      expect(room.h).toBe(5);
    } else if (room.kind === 'empty' || room.kind === 'transition') {
      expect(isCorridor(room)).toBe(true);
    } else if (room.kind !== 'boss') {
      expect(room.w).toBe(room.h);
      expect([5, 10, 15]).toContain(room.w);
    }
  }
  expect(centers.size).toBe(layout.rooms.length);

  const layers = layersOf(layout);
  for (let layer = 0; layer < layers.length; layer += 1) {
    const row = layers[layer];
    if (!row) continue;
    for (let index = 0; index < row.length; index += 1) {
      const room = layout.rooms.find((item) => item.id === row[index]);
      expect(room?.x).toBe(layer * 20);
      expect(room?.y).toBe(index * 20);
    }
  }
}

test('one seed and size yield deep-equal layouts', () => {
  expect(generateDungeon('shared-seed', 'large')).toEqual(generateDungeon('shared-seed', 'large'));
  expect(generateDungeon('', 'small')).toEqual(generateDungeon('', 'small'));
});

test('a different seed changes a coordinate or a kind', () => {
  const left = generateDungeon('rift-a', 'small');
  const right = generateDungeon('rift-b', 'small');
  expect(shape(left)).not.toBe(shape(right));
});

test('small dungeons have 5..7 ordinary rooms, one secret, and a reachable boss', () => {
  for (let i = 0; i < 20; i += 1) {
    const layout = generateDungeon(`small-${i}`, 'small');
    const secrets = layout.rooms.filter((room) => room.kind === 'secret');
    const ordinary = layout.rooms.length - secrets.length;
    expect(ordinary).toBeGreaterThanOrEqual(5);
    expect(ordinary).toBeLessThanOrEqual(7);
    expect(secrets).toHaveLength(1);
    expect(layout.bossIds).toHaveLength(1);
    const bossId = layout.bossIds[0];
    expect(bossId).toBeDefined();
    expect(reachable(layout).has(bossId ?? -1)).toBe(true);
    expectBand(layout, 'small');
  }
});

test('raid secrets sit beyond the 21..30 base rooms and both bosses are reachable', () => {
  for (let i = 0; i < 20; i += 1) {
    const layout = generateDungeon(`raid-${i}`, 'raid');
    const secrets = layout.rooms.filter((room) => room.kind === 'secret');
    const ordinary = layout.rooms.length - secrets.length;
    expect(ordinary).toBeGreaterThanOrEqual(21);
    expect(ordinary).toBeLessThanOrEqual(30);
    expect(secrets.length).toBeGreaterThanOrEqual(3);
    expect(secrets.length).toBeLessThanOrEqual(4);
    expect(layout.rooms.length).toBe(ordinary + secrets.length);
    expect(layout.bossIds).toHaveLength(2);
    const seen = reachable(layout);
    for (const bossId of layout.bossIds) expect(seen.has(bossId)).toBe(true);
    expectBand(layout, 'raid');
  }
});

test('medium and large dungeons stay inside their bands', () => {
  for (const size of ['medium', 'large'] as const) {
    for (let i = 0; i < 20; i += 1) {
      expectBand(generateDungeon(`${size}-${i}`, size), size);
    }
  }
});

test('sameSeedWindow buckets timestamps by five minutes', () => {
  expect(sameSeedWindow(0, 299_999)).toBe(true);
  expect(sameSeedWindow(0, 300_000)).toBe(false);
  expect(sameSeedWindow(300_000, 599_999)).toBe(true);
  expect(sameSeedWindow(299_999, 300_000)).toBe(false);
});

test('difficulty multipliers follow the dungeon table', () => {
  expect(difficultyMultipliers('raid')).toEqual({ hp: 3, damage: 2, loot: 3, xp: 3 });
  expect(difficultyMultipliers('easy')).toEqual({ hp: 0.75, damage: 0.75, loot: 0.75, xp: 0.75 });
  expect(difficultyMultipliers('normal')).toEqual({ hp: 1, damage: 1, loot: 1, xp: 1 });
  expect(difficultyMultipliers('hard')).toEqual({ hp: 1.5, damage: 1.25, loot: 1.5, xp: 1.5 });
  expect(difficultyMultipliers('epic')).toEqual({ hp: 2, damage: 1.5, loot: 2, xp: 2 });
  expect(INSTANCE_TTL_MS).toBe(600_000);
});
