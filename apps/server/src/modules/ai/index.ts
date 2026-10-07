import type { GameModule, ModuleContext } from '../../shared/module';
import { createAiRepository } from './repository';
import { createAiService } from './service';
import type { AiPorts, AiRuntime, AiService } from './types';

export interface AiModule extends GameModule {
  name: 'ai';
  service: AiService;
  start(ctx: ModuleContext): void;
}

export function createAiModule(ports: AiPorts): AiModule {
  const runtime: AiRuntime = { bus: null, now: null };
  const service = createAiService(ports, createAiRepository(), runtime);

  return {
    name: 'ai',
    service,
    start(ctx) {
      runtime.bus = ctx.bus;
      runtime.now = ctx.now;
    },
  };
}

export { ADAPTER_TRAIN_PERIOD_MS, POLICY_TRAIN_PERIOD_MS, SIDECAR_TIMEOUT_MS } from './types';
export type {
  AiPorts,
  AiRejection,
  AiService,
  BotMemory,
  BotPresence,
  CorpsePort,
  Decision,
  DecisionSource,
  MemoryEntry,
  Result,
  SubmitInput,
  TrainAcceptance,
  TrainKind,
  Validator,
} from './types';
