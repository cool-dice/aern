import type { Rng } from '@rift/domain/rng';
import { mulberry32 } from '@rift/domain/rng';
import type { GameModule, ModuleContext } from '../../shared/module';
import { createBus } from '../../shared/bus';
import { createGatheringService, type GatheringService } from './service';

export interface GatheringModule extends GameModule {
  service: GatheringService;
}

export function createGatheringModule(rng: Rng = mulberry32(1)): GatheringModule {
  let service = createGatheringService(rng, createBus());
  return {
    name: 'gathering',
    get service() {
      return service;
    },
    start(ctx: ModuleContext) {
      service = createGatheringService(rng, ctx.bus);
    },
  };
}
