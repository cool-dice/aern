import { prototypeWorld, type WorldEdge, type WorldNode } from '@rift/domain/world';

export interface WorldRepository {
  load(): { nodes: WorldNode[]; edges: WorldEdge[] };
}

/** Prototype graph in memory. Persistence is not part of this module. */
export function memoryWorldRepository(): WorldRepository {
  return {
    load: () => prototypeWorld(),
  };
}
