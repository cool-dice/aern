import { step, type Cell, type Dir } from '@rift/domain/movement';
import { err, ok, type Result } from '@rift/domain/result';
import { canWalk, type NodeKind, type WorldEdge, type WorldNode } from '@rift/domain/world';

export interface GeoNode {
  id: string;
  x: number;
  y: number;
  kind: NodeKind;
  safe: boolean;
  side: 'light' | 'dark' | 'center';
  regionId: string;
}

export interface Geography {
  nodes: GeoNode[];
  edges: WorldEdge[];
  barrierDown: boolean;
}

function asWorld(node: GeoNode): WorldNode {
  return {
    id: node.id,
    kind: node.kind,
    safe: node.safe,
    side: node.side,
    regionId: node.regionId,
  };
}

function neighbors(geography: Geography, nodeId: string): GeoNode[] {
  const found: GeoNode[] = [];
  for (const edge of geography.edges) {
    const other = edge.a === nodeId ? edge.b : edge.b === nodeId ? edge.a : undefined;
    if (other === undefined) {
      continue;
    }
    const node = geography.nodes.find((candidate) => candidate.id === other);
    if (node !== undefined) {
      found.push(node);
    }
  }
  return found;
}

function bestAligned(from: GeoNode, linked: readonly GeoNode[], dir: Dir): GeoNode | undefined {
  const delta = step({ x: 0, y: 0 }, dir);
  const dirLen = Math.hypot(delta.x, delta.y);
  let best: GeoNode | undefined;
  let bestScore = 0;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const neighbor of linked) {
    const vx = neighbor.x - from.x;
    const vy = neighbor.y - from.y;
    const len = Math.hypot(vx, vy);
    if (len === 0 || dirLen === 0) {
      continue;
    }
    const cosine = (vx * delta.x + vy * delta.y) / (len * dirLen);
    // Eight facings. A neighbor more than half a facing away is not that exit.
    if (cosine < Math.cos(Math.PI / 8)) {
      continue;
    }
    const closerTie = Math.abs(cosine - bestScore) <= 1e-9 && len < bestLen;
    if (best === undefined || cosine > bestScore + 1e-9 || closerTie) {
      best = neighbor;
      bestScore = cosine;
      bestLen = len;
    }
  }
  return best;
}

function primordial(node: GeoNode): boolean {
  return node.kind === 'primordial' || node.id.startsWith('primordial_');
}

/**
 * Leave `fromId` along an edge. `to` names the edge. A direction picks the
 * best-aligned neighbor. The barrier and the primordial rings stay shut
 * until `barrierDown`.
 */
export function neighborStep(input: {
  geography: Geography;
  fromId: string;
  dir: Dir;
  to?: string;
}): Result<{ nodeId: string; cell: Cell }, 'no_edge' | 'barrier'> {
  const from = input.geography.nodes.find((node) => node.id === input.fromId);
  if (from === undefined) {
    return err('no_edge');
  }
  const linked = neighbors(input.geography, from.id);
  const chosen =
    input.to !== undefined ? linked.find((node) => node.id === input.to) : bestAligned(from, linked, input.dir);
  if (chosen === undefined) {
    return err('no_edge');
  }
  const walked = canWalk({
    edges: input.geography.edges,
    from: from.id,
    to: chosen.id,
    barrierDown: input.geography.barrierDown,
    nodes: input.geography.nodes.map(asWorld),
  });
  if (!walked.ok) {
    return err(walked.code);
  }
  if (primordial(chosen) && !input.geography.barrierDown) {
    return err('barrier');
  }
  return ok({ nodeId: chosen.id, cell: { x: chosen.x, y: chosen.y } });
}
