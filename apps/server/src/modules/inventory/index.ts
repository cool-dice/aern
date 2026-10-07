import type { GameModule, ModuleContext } from '../../shared/module';
import { MemoryInventoryRepository, type InventoryRepository } from './repository';
import { createInventoryService } from './service';
import type { InventoryService, ItemCatalog } from './types';

export interface InventoryModule extends GameModule {
  service: InventoryService;
}

export interface CreateInventoryModuleOptions {
  catalog: ItemCatalog;
  repository?: InventoryRepository;
}

export function createInventoryModule(options: CreateInventoryModuleOptions): InventoryModule {
  const service = createInventoryService({
    repository: options.repository ?? new MemoryInventoryRepository(),
    catalog: options.catalog,
  });

  return {
    name: 'inventory',
    service,
    start(ctx: ModuleContext): void {
      assertContext(ctx);
    },
  };
}

function assertContext(ctx: ModuleContext): void {
  const now = ctx.now();
  if (!Number.isFinite(now)) {
    throw new Error('inventory module clock is not finite');
  }
  if (typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
    throw new Error('inventory module bus is incomplete');
  }
}

export { MemoryInventoryRepository } from './repository';
export type { InventoryRepository } from './repository';
export { STARTER_GOLD, STARTER_LOADOUT, createInventoryService } from './service';
export type { InventoryServiceOptions } from './service';
export type {
  CatalogItem,
  InventoryCharacter,
  InventoryService,
  InventoryState,
  ItemCatalog,
  ItemStack,
} from './types';
