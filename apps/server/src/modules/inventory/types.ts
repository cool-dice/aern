import type { EquipSlot } from '@rift/domain/items';
import type { Result } from '@rift/domain/result';
import type { StatBlock } from '@rift/domain/stats';

export type { Result };

/** `weightKg` is the weight of one unit. Stack weight is `weightKg * qty`. */
export interface CatalogItem {
  id: string;
  weightKg: number;
  slot?: EquipSlot;
  twoHanded?: boolean;
}

export interface ItemCatalog {
  items: readonly CatalogItem[];
}

/** Character snapshot kept by the inventory repository. Tests fill this in. */
export interface InventoryCharacter {
  stats: StatBlock;
  level: number;
}

export interface ItemStack {
  slot: number;
  itemId: string;
  qty: number;
  durability: number;
  equipped: boolean;
  equipSlots: EquipSlot[];
}

export interface InventoryState {
  characterId: string;
  gold: number;
  stacks: ItemStack[];
  character: InventoryCharacter | null;
  totalWeightKg: number;
  overloadPenalty: number;
}

export interface InventoryService {
  grantStarter(characterId: string): Promise<void>;
  equip(characterId: string, itemId: string): Promise<Result<void, string>>;
  list(
    characterId: string,
  ): Promise<{ gold: number; items: { itemId: string; equipped: boolean }[] }>;
}
