import type { GameModule, ModuleContext } from '../../shared/module';
import { MemoryGuildRepository } from './repository';
import { GuildService } from './service';
import type {
  GoldPort,
  GuildMode,
  GuildRepository,
  GuildService as GuildServiceApi,
} from './types';

export interface GuildModule extends GameModule {
  service: GuildServiceApi;
  repository: GuildRepository;
}

export interface GuildModuleOptions {
  mode: GuildMode;
  gold?: GoldPort;
  repository?: GuildRepository;
}

export function createGuildModule(options: GuildModuleOptions): GuildModule {
  const repository = options.repository ?? new MemoryGuildRepository();
  let now: () => number = () => {
    throw new Error('guild module has not been started');
  };
  const service = new GuildService({
    mode: options.mode,
    repository,
    gold: options.gold,
    now: () => now(),
  });
  return {
    name: 'guild',
    service,
    repository,
    start(ctx: ModuleContext): void {
      now = ctx.now;
    },
  };
}

export { MemoryGuildRepository } from './repository';
export type {
  CreateGuildInput,
  DeclareWarInput,
  GoldPort,
  GuildMemberInput,
  GuildMode,
  GuildRepository,
  GuildService,
  Result,
  StoredGuild,
  StoredWar,
  WithdrawInput,
} from './types';
