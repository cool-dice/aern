import type { GameModule, ModuleContext } from '../../shared/module';
import { createEventService } from './service';
import type { EventService } from './types';

export interface EventModule extends GameModule {
  readonly service: EventService;
  /** Instant from the clock passed to `start`. There is no interval. */
  now(): number;
}

export function createEventModule(service: EventService = createEventService()): EventModule {
  let current: ModuleContext | null = null;
  return {
    name: 'event',
    service,
    start(ctx) {
      current = ctx;
    },
    now() {
      if (current === null) {
        throw new Error('event module is not started');
      }
      return current.now();
    },
  };
}

export { createEventRepository, type EventRepository } from './repository';
export { createEventService } from './service';
export type { CharacterNode, EventService, EventSnapshot, WeatherPlan } from './types';
