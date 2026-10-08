import type { GameModule, ModuleContext } from '../../shared/module';
import { memoryWorldRepository, type WorldRepository } from './repository';
import { createWorldService } from './service';
import type { WorldService } from './types';

export type { WorldRepository } from './repository';
export { memoryWorldRepository } from './repository';
export { createWorldService } from './service';
export type { WorldService } from './types';

export interface WorldModule extends GameModule {
  service: WorldService;
}

export function createWorldModule(
  repository: WorldRepository = memoryWorldRepository(),
): WorldModule {
  const service = createWorldService(repository);
  return {
    name: 'world',
    service,
    start(ctx: ModuleContext): void {
      assertContext(ctx);
    },
  };
}

function assertContext(ctx: ModuleContext): void {
  const now = ctx.now();
  if (!Number.isFinite(now)) {
    throw new Error('world module clock is not finite');
  }
  if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
    throw new Error('world module bus is incomplete');
  }
}
