import { prototypeWorld, type WorldEdge, type WorldNode } from '@rift/domain/world';

export interface WorldRepository {
  load(): { nodes: WorldNode[]; edges: WorldEdge[] };
  /** Present when a database URL is configured. The memory adapter omits it. */
  saveSnapshot?(payload: unknown): Promise<void>;
  loadSnapshot?(): Promise<unknown | null>;
}

/** Prototype graph in memory. Persistence is not part of this module. */
export function memoryWorldRepository(): WorldRepository {
  return {
    load: () => prototypeWorld(),
  };
}
