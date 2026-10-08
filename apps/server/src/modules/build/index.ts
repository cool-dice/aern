import type { GameModule, ModuleContext } from '../../shared/module';
import { createBus } from '../../shared/bus';
import { createBuildService, type BuildService } from './service';

export interface BuildModule extends GameModule {
  service: BuildService;
}

export function createBuildModule(): BuildModule {
  let service = createBuildService(createBus());
  return {
    name: 'build',
    get service() {
      return service;
    },
    start(ctx: ModuleContext) {
      service = createBuildService(ctx.bus);
    },
  };
}
