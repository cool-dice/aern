import type { Rng } from '@rift/domain/rng';
import { mulberry32 } from '@rift/domain/rng';
import type { GameModule, ModuleContext } from '../../shared/module';
import { createBus } from '../../shared/bus';
import { createHackService, type HackService } from './service';

export interface HackModule extends GameModule {
  service: HackService;
}

export function createHackModule(rng: Rng = mulberry32(1)): HackModule {
  let service = createHackService(rng, createBus());
  return {
    name: 'hack',
    get service() {
      return service;
    },
    start(ctx: ModuleContext) {
      service = createHackService(rng, ctx.bus);
    },
  };
}
