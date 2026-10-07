import type { WorldEdge, WorldNode } from '@rift/domain/world';

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E };

export interface WorldService {
  graph(): { nodes: WorldNode[]; edges: WorldEdge[] };
  walk(from: string, to: string, barrierDown: boolean): Result<'ok', 'no_edge' | 'barrier'>;
}
