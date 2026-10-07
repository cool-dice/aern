import type { GameModule, ModuleContext } from '../../shared/module';
import { MemoryCharacterRepository, type CharacterRepository } from './repository';
import { createCharacterService, type CharacterServiceOptions } from './service';
import type { CharacterService, PrototypeFeatures, StarterGranter } from './types';

export interface CharacterModule extends GameModule {
  service: CharacterService;
}

export interface CreateCharacterModuleOptions {
  granter: StarterGranter;
  features: PrototypeFeatures;
  bus: BusLike;
  repository?: CharacterRepository;
  /** Clock used before `start`. `start` replaces it with `ModuleContext.now`. */
  now?: () => number;
}

interface BusLike {
  emit: CharacterServiceOptions['bus']['emit'];
  on: CharacterServiceOptions['bus']['on'];
}

export function createCharacterModule(options: CreateCharacterModuleOptions): CharacterModule {
  const runtime: CharacterServiceOptions = {
    repository: options.repository ?? new MemoryCharacterRepository(),
    granter: options.granter,
    features: options.features,
    bus: options.bus,
    now: options.now ?? (() => 0),
  };
  const service = createCharacterService({
    repository: runtime.repository,
    granter: runtime.granter,
    features: runtime.features,
    get bus() {
      return runtime.bus;
    },
    now: () => runtime.now(),
  });

  return {
    name: 'character',
    service,
    start(ctx: ModuleContext): void {
      assertContext(ctx);
      runtime.bus = ctx.bus;
      runtime.now = ctx.now;
    },
  };
}

function assertContext(ctx: ModuleContext): void {
  const now = ctx.now();
  if (!Number.isFinite(now)) {
    throw new Error('character module clock is not finite');
  }
  if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
    throw new Error('character module bus is incomplete');
  }
}

export { MemoryCharacterRepository } from './repository';
export type { CharacterRepository } from './repository';
export { createCharacterService } from './service';
export type { CharacterServiceOptions } from './service';
export type {
  CharacterPhase,
  CharacterRecord,
  CharacterService,
  PrototypeFeatures,
  StarterGranter,
} from './types';
