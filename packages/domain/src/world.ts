import { assertCatalogId } from './ids';
import { err, ok, type Result } from './result';

export type NodeKind = 'city' | 'hub' | 'dungeon' | 'resource' | 'primordial' | 'barrier';

export interface WorldNode {
  id: string;
  kind: NodeKind;
  safe: boolean;
  side: 'light' | 'dark' | 'center';
  regionId: string;
}

export interface WorldEdge {
  id: string;
  a: string;
  b: string;
  length: number;
}

/** Catalog ids shared by the server and tests. Content JSON repeats this set. */
export const PROTOTYPE_NODE_IDS = [
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
] as const;

export type PrototypeNodeId = (typeof PROTOTYPE_NODE_IDS)[number];

const REGION_PLAINS = 'plains';
const REGION_LAVA = 'lava';
const REGION_CENTER = 'center';

/** One step on the prototype grid (content places neighbours 10 cells apart). */
const STEP_CELLS = 10;
/**
 * Hub-to-barrier hop. Also the dark city-to-hub hop: the prototype has no
 * `edge_dark` node, so that single edge replaces fort—edge—hub (10 + 10).
 */
const LONG_CELLS = 20;

const BARRIER_GATE: PrototypeNodeId = 'barrier_gate';

function node(
  id: PrototypeNodeId,
  kind: NodeKind,
  side: WorldNode['side'],
  regionId: string,
): WorldNode {
  return {
    id: assertCatalogId(id),
    kind,
    safe: kind === 'city',
    side,
    regionId: assertCatalogId(regionId),
  };
}

function edge(a: PrototypeNodeId, b: PrototypeNodeId, length: number): WorldEdge {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`invalid edge length: ${length}`);
  }
  const left = a < b ? a : b;
  const right = a < b ? b : a;
  return {
    id: assertCatalogId(`${left}__${right}`),
    a: assertCatalogId(a),
    b: assertCatalogId(b),
    length,
  };
}

function buildPrototype(): { nodes: WorldNode[]; edges: WorldEdge[] } {
  const nodes: WorldNode[] = [
    node('fort_humans', 'city', 'light', REGION_PLAINS),
    node('cross_light', 'hub', 'light', REGION_PLAINS),
    node('plains_mine', 'resource', 'light', REGION_PLAINS),
    node('plains_grove', 'resource', 'light', REGION_PLAINS),
    node('light_dungeon', 'dungeon', 'light', REGION_PLAINS),
    // Travel minidungeon. NodeKind has no edge variant.
    node('edge_light', 'dungeon', 'light', REGION_PLAINS),
    node('obsidian_tower', 'city', 'dark', REGION_LAVA),
    node('cross_dark', 'hub', 'dark', REGION_LAVA),
    node('lava_mine', 'resource', 'dark', REGION_LAVA),
    node('lava_fungus', 'resource', 'dark', REGION_LAVA),
    node('dark_dungeon', 'dungeon', 'dark', REGION_LAVA),
    node('barrier_gate', 'barrier', 'center', REGION_CENTER),
    node('primordial_city', 'primordial', 'center', REGION_CENTER),
  ];

  const edges: WorldEdge[] = [
    edge('fort_humans', 'edge_light', STEP_CELLS),
    edge('edge_light', 'cross_light', STEP_CELLS),
    edge('cross_light', 'light_dungeon', STEP_CELLS),
    edge('fort_humans', 'plains_mine', STEP_CELLS),
    edge('fort_humans', 'plains_grove', STEP_CELLS),
    edge('cross_light', 'barrier_gate', LONG_CELLS),
    edge('obsidian_tower', 'cross_dark', LONG_CELLS),
    edge('cross_dark', 'dark_dungeon', STEP_CELLS),
    edge('obsidian_tower', 'lava_mine', STEP_CELLS),
    edge('obsidian_tower', 'lava_fungus', STEP_CELLS),
    edge('cross_dark', 'barrier_gate', LONG_CELLS),
  ];

  const ids = new Set(nodes.map((item) => item.id));
  if (ids.size !== nodes.length) {
    throw new Error('duplicate prototype node id');
  }
  for (const item of edges) {
    if (!ids.has(item.a) || !ids.has(item.b)) {
      throw new Error(`edge ${item.id} references an unknown node`);
    }
  }

  return { nodes, edges };
}

const PROTOTYPE = buildPrototype();

export function prototypeWorld(): { nodes: WorldNode[]; edges: WorldEdge[] } {
  return {
    nodes: PROTOTYPE.nodes.map((item) => ({ ...item })),
    edges: PROTOTYPE.edges.map((item) => ({ ...item })),
  };
}

export function neighbors(edges: WorldEdge[], nodeId: string): string[] {
  const found: string[] = [];
  for (const item of edges) {
    if (item.a === nodeId) {
      found.push(item.b);
    } else if (item.b === nodeId) {
      found.push(item.a);
    }
  }
  return found;
}

export function pvpAllowed(node: WorldNode, warOpen: boolean): boolean {
  if (warOpen) {
    return true;
  }
  return !node.safe;
}

function isBarrierTransit(nodes: readonly WorldNode[], nodeId: string): boolean {
  if (nodeId === BARRIER_GATE) {
    return true;
  }
  const found = nodes.find((item) => item.id === nodeId);
  return found?.kind === 'barrier';
}

export function canWalk(input: {
  edges: WorldEdge[];
  from: string;
  to: string;
  barrierDown: boolean;
  nodes: WorldNode[];
}): Result<'ok', 'no_edge' | 'barrier'> {
  const linked = input.edges.some(
    (item) =>
      (item.a === input.from && item.b === input.to) ||
      (item.a === input.to && item.b === input.from),
  );
  if (!linked) {
    return err('no_edge');
  }
  const crossesBarrier =
    isBarrierTransit(input.nodes, input.from) || isBarrierTransit(input.nodes, input.to);
  if (crossesBarrier && !input.barrierDown) {
    return err('barrier');
  }
  return ok('ok');
}

export function canBind(node: WorldNode, inCombat: boolean): Result<'ok', 'not_city' | 'combat'> {
  if (node.kind !== 'city') {
    return err('not_city');
  }
  if (inCombat) {
    return err('combat');
  }
  return ok('ok');
}

/**
 * Portal eligibility only. Price, cooldown, and the cross-side barrier fee
 * live in the economy module. Both ends must be visited cities.
 */
export function canPortal(input: {
  from: WorldNode;
  to: WorldNode;
  visited: readonly string[];
}): Result<'ok', 'not_city' | 'unvisited'> {
  if (input.from.kind !== 'city' || input.to.kind !== 'city') {
    return err('not_city');
  }
  const visited = new Set(input.visited);
  if (!visited.has(input.from.id) || !visited.has(input.to.id)) {
    return err('unvisited');
  }
  return ok('ok');
}
