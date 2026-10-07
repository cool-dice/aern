import type { Bus } from './bus';

export interface ModuleContext {
  bus: Bus;
  now: () => number;
}

export interface GameModule {
  name: string;
  start(ctx: ModuleContext): void;
}
