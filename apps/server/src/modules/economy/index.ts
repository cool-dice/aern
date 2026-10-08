import type { GameModule, ModuleContext } from '../../shared/module';
import { memoryEconomyRepository, type EconomyRepository } from './repository';
import { createEconomyService } from './service';
import type { EconomyService } from './types';

export type { EconomyRepository } from './repository';
export { memoryEconomyRepository, newEconomyCharacter } from './repository';
export { createEconomyService } from './service';
export type {
  EconomyCharacter,
  EconomyItem,
  EconomyService,
  OfferTradeInput,
  PortalNode,
  TradeOffer,
} from './types';

export interface EconomyModule extends GameModule {
  service: EconomyService;
}

export function createEconomyModule(
  repository: EconomyRepository = memoryEconomyRepository(),
): EconomyModule {
  const service = createEconomyService(repository);
  return {
    name: 'economy',
    service,
    start(ctx: ModuleContext): void {
      const now = ctx.now();
      if (!Number.isFinite(now)) {
        throw new Error('economy module clock is not finite');
      }
      if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
        throw new Error('economy module bus is incomplete');
      }
    },
  };
}
