import type { GameModule, ModuleContext } from '../../shared/module';
import { memoryInstanceRepository } from './repository';
import { createDungeonService } from './service';
import type { DungeonService, InstanceRepository } from './types';

export type {
  DungeonGroup,
  DungeonInstance,
  DungeonService,
  EntryLock,
  InstanceRepository,
} from './types';
export { memoryInstanceRepository } from './repository';
export {
  DUNGEON_GROUP_CAP,
  DUNGEON_LOCK_MS,
  DUNGEON_PLAYER_CAP,
  createDungeonService,
} from './service';
export type { DungeonGenerator } from './service';

export interface DungeonModule extends GameModule {
  service: DungeonService;
}

export function createDungeonModule(
  repository: InstanceRepository = memoryInstanceRepository(),
): DungeonModule {
  const service = createDungeonService(repository);
  return {
    name: 'dungeon',
    service,
    start(ctx: ModuleContext): void {
      assertContext(ctx);
    },
  };
}

function assertContext(ctx: ModuleContext): void {
  const now = ctx.now();
  if (!Number.isFinite(now)) {
    throw new Error('dungeon module clock is not finite');
  }
  if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
    throw new Error('dungeon module bus is incomplete');
  }
}
