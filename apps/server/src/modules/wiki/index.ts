import type { GameModule, ModuleContext } from '../../shared/module';
import { createBus } from '../../shared/bus';
import { createWikiService, type WikiService } from './service';

export interface WikiModule extends GameModule {
  service: WikiService;
}

export function createWikiModule(): WikiModule {
  let service = createWikiService(createBus());
  return {
    name: 'wiki',
    get service() {
      return service;
    },
    start(ctx: ModuleContext) {
      service = createWikiService(ctx.bus);
    },
  };
}
