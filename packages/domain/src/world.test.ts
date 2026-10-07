import { expect, test } from 'vitest';
import {
  PROTOTYPE_NODE_IDS,
  canBind,
  canPortal,
  canWalk,
  neighbors,
  prototypeWorld,
  pvpAllowed,
  type WorldEdge,
  type WorldNode,
} from './world';

const CATALOG_ID = /^[a-z0-9_]{1,64}$/;

function reach(edges: WorldEdge[], start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    for (const next of neighbors(edges, current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function findNode(nodes: WorldNode[], id: string): WorldNode {
  const found = nodes.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`missing node ${id}`);
  }
  return found;
}

test('prototype ids match the task list and are catalog ids', () => {
  expect(PROTOTYPE_NODE_IDS).toEqual([
    'fort_humans',
    'cross_light',
    'plains_mine',
    'plains_grove',
    'light_dungeon',
    'edge_light',
    'obsidian_tower',
    'cross_dark',
    'lava_mine',
    'lava_fungus',
    'dark_dungeon',
    'barrier_gate',
    'primordial_city',
  ]);

  const world = prototypeWorld();
  expect(world.nodes.map((item) => item.id)).toEqual([...PROTOTYPE_NODE_IDS]);
  for (const item of world.nodes) {
    expect(item.id).toMatch(CATALOG_ID);
    expect(item.regionId).toMatch(CATALOG_ID);
  }
  for (const item of world.edges) {
    expect(item.id).toMatch(CATALOG_ID);
    expect(item.length).toBeGreaterThan(0);
    expect(Number.isInteger(item.length)).toBe(true);
  }
});

test('only cities are safe; zone side is stored on the node', () => {
  const { nodes } = prototypeWorld();
  for (const item of nodes) {
    expect(item.safe).toBe(item.kind === 'city');
  }

  expect(findNode(nodes, 'fort_humans')).toMatchObject({
    kind: 'city',
    safe: true,
    side: 'light',
    regionId: 'plains',
  });
  expect(findNode(nodes, 'obsidian_tower')).toMatchObject({
    kind: 'city',
    safe: true,
    side: 'dark',
    regionId: 'lava',
  });
  expect(findNode(nodes, 'cross_light')).toMatchObject({
    kind: 'hub',
    safe: false,
    side: 'light',
    regionId: 'plains',
  });
  expect(findNode(nodes, 'edge_light').kind).toBe('dungeon');
  expect(findNode(nodes, 'barrier_gate')).toMatchObject({
    kind: 'barrier',
    safe: false,
    side: 'center',
    regionId: 'center',
  });
  expect(findNode(nodes, 'primordial_city')).toMatchObject({
    kind: 'primordial',
    safe: false,
    side: 'center',
    regionId: 'center',
  });
});

test('fort reaches light_dungeon through neighbours; primordial is unreachable', () => {
  const { edges } = prototypeWorld();
  expect(reach(edges, 'fort_humans').has('light_dungeon')).toBe(true);
  expect(neighbors(edges, 'primordial_city')).toEqual([]);
  expect(reach(edges, 'fort_humans').has('primordial_city')).toBe(false);
});

test('the graph is undirected and has no direct light-dark edge', () => {
  const { edges } = prototypeWorld();
  expect(edges).toHaveLength(11);
  for (const item of edges) {
    expect(neighbors(edges, item.a)).toContain(item.b);
    expect(neighbors(edges, item.b)).toContain(item.a);
  }
  expect(neighbors(edges, 'cross_light')).not.toContain('cross_dark');
  expect(neighbors(edges, 'barrier_gate').sort()).toEqual(['cross_dark', 'cross_light']);
});

test('a closed barrier blocks a step onto barrier_gate; the flag opens it', () => {
  const world = prototypeWorld();
  const input = {
    edges: world.edges,
    nodes: world.nodes,
    from: 'cross_light',
    to: 'barrier_gate',
  };
  expect(canWalk({ ...input, barrierDown: false })).toEqual({ ok: false, code: 'barrier' });
  expect(canWalk({ ...input, barrierDown: true })).toEqual({ ok: true, value: 'ok' });
  expect(
    canWalk({
      ...input,
      from: 'barrier_gate',
      to: 'cross_dark',
      barrierDown: false,
    }),
  ).toEqual({ ok: false, code: 'barrier' });
  expect(
    canWalk({
      ...input,
      from: 'barrier_gate',
      to: 'cross_dark',
      barrierDown: true,
    }),
  ).toEqual({ ok: true, value: 'ok' });
});

test('canWalk is one step and refuses a missing edge', () => {
  const world = prototypeWorld();
  expect(
    canWalk({
      edges: world.edges,
      nodes: world.nodes,
      from: 'fort_humans',
      to: 'light_dungeon',
      barrierDown: true,
    }),
  ).toEqual({ ok: false, code: 'no_edge' });
  expect(
    canWalk({
      edges: world.edges,
      nodes: world.nodes,
      from: 'cross_light',
      to: 'cross_dark',
      barrierDown: true,
    }),
  ).toEqual({ ok: false, code: 'no_edge' });
  expect(
    canWalk({
      edges: world.edges,
      nodes: world.nodes,
      from: 'fort_humans',
      to: 'edge_light',
      barrierDown: false,
    }),
  ).toEqual({ ok: true, value: 'ok' });
});

test('a barrier-kind node blocks the step even when its id is not barrier_gate', () => {
  const nodes: WorldNode[] = [
    { id: 'camp', kind: 'hub', safe: false, side: 'light', regionId: 'plains' },
    { id: 'seal', kind: 'barrier', safe: false, side: 'center', regionId: 'center' },
  ];
  const edges: WorldEdge[] = [{ id: 'camp__seal', a: 'camp', b: 'seal', length: 4 }];
  expect(canWalk({ edges, nodes, from: 'camp', to: 'seal', barrierDown: false })).toEqual({
    ok: false,
    code: 'barrier',
  });
  expect(canWalk({ edges, nodes, from: 'seal', to: 'camp', barrierDown: true })).toEqual({
    ok: true,
    value: 'ok',
  });
});

test('city is not PvP, hub is, and a city war opens PvP', () => {
  const { nodes } = prototypeWorld();
  const city = findNode(nodes, 'fort_humans');
  const hub = findNode(nodes, 'cross_light');
  expect(pvpAllowed(city, false)).toBe(false);
  expect(pvpAllowed(hub, false)).toBe(true);
  expect(pvpAllowed(city, true)).toBe(true);
  expect(pvpAllowed(findNode(nodes, 'light_dungeon'), false)).toBe(true);
  expect(pvpAllowed(findNode(nodes, 'plains_mine'), false)).toBe(true);
  expect(pvpAllowed(findNode(nodes, 'barrier_gate'), false)).toBe(true);
  expect(pvpAllowed(findNode(nodes, 'primordial_city'), false)).toBe(true);
});

test('bind is refused in a hub and in a city during combat', () => {
  const { nodes } = prototypeWorld();
  expect(canBind(findNode(nodes, 'cross_light'), false)).toEqual({
    ok: false,
    code: 'not_city',
  });
  expect(canBind(findNode(nodes, 'fort_humans'), true)).toEqual({ ok: false, code: 'combat' });
  expect(canBind(findNode(nodes, 'fort_humans'), false)).toEqual({ ok: true, value: 'ok' });
  expect(canBind(findNode(nodes, 'obsidian_tower'), false)).toEqual({ ok: true, value: 'ok' });
  expect(canBind(findNode(nodes, 'primordial_city'), false)).toEqual({
    ok: false,
    code: 'not_city',
  });
});

test('portal only between visited cities', () => {
  const { nodes } = prototypeWorld();
  const fort = findNode(nodes, 'fort_humans');
  const tower = findNode(nodes, 'obsidian_tower');
  const hub = findNode(nodes, 'cross_light');

  expect(canPortal({ from: fort, to: tower, visited: ['fort_humans', 'obsidian_tower'] })).toEqual({
    ok: true,
    value: 'ok',
  });
  expect(canPortal({ from: hub, to: fort, visited: ['cross_light', 'fort_humans'] })).toEqual({
    ok: false,
    code: 'not_city',
  });
  expect(canPortal({ from: fort, to: tower, visited: ['fort_humans'] })).toEqual({
    ok: false,
    code: 'unvisited',
  });
  expect(canPortal({ from: fort, to: tower, visited: [] })).toEqual({
    ok: false,
    code: 'unvisited',
  });
});

test('prototypeWorld returns a copy', () => {
  const first = prototypeWorld();
  first.nodes.pop();
  const edge = first.edges[0];
  if (edge !== undefined) {
    edge.length = 1;
  }
  const second = prototypeWorld();
  expect(second.nodes).toHaveLength(PROTOTYPE_NODE_IDS.length);
  expect(second.edges[0]?.length).toBe(10);
});
