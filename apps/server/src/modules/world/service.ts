import { canWalk } from '@rift/domain/world';
import type { WorldRepository } from './repository';
import { memoryWorldRepository } from './repository';
import type { WorldService } from './types';

export function createWorldService(
  repository: WorldRepository = memoryWorldRepository(),
): WorldService {
  return {
    graph() {
      return repository.load();
    },
    walk(from, to, barrierDown) {
      const { nodes, edges } = repository.load();
      return canWalk({ edges, nodes, from, to, barrierDown });
    },
  };
}
