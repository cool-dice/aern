import { STARTING_DURABILITY, canEquip, type EquipSlot } from '@rift/domain/items';
import { err, ok } from '@rift/domain/result';
import { derive } from '@rift/domain/stats';
import type { InventoryRepository } from './repository';
import type {
  CatalogItem,
  InventoryService,
  InventoryState,
  ItemCatalog,
  ItemStack,
} from './types';

export const STARTER_GOLD = 100;

export const STARTER_LOADOUT = [
  { itemId: 'rusty_sword', qty: 1 },
  { itemId: 'leather_jacket', qty: 1 },
  { itemId: 'bandage', qty: 3 },
  { itemId: 'ammo_light', qty: 20 },
] as const;

export interface InventoryServiceOptions {
  repository: InventoryRepository;
  catalog: ItemCatalog;
}

export function createInventoryService(options: InventoryServiceOptions): InventoryService {
  const { repository, catalog } = options;

  return {
    async grantStarter(characterId) {
      const loadout = STARTER_LOADOUT.map((entry) => ({
        itemId: entry.itemId,
        qty: entry.qty,
        item: requireItem(catalog, entry.itemId),
      }));
      const state = (await repository.load(characterId)) ?? emptyState(characterId);
      state.gold += STARTER_GOLD;
      let slot = nextSlot(state.stacks);
      for (const entry of loadout) {
        state.stacks.push({
          slot,
          itemId: entry.itemId,
          qty: entry.qty,
          durability: STARTING_DURABILITY,
          equipped: false,
          equipSlots: [],
        });
        slot += 1;
      }
      refreshCarry(state, catalog);
      await repository.save(state);
    },

    async equip(characterId, itemId) {
      const state = await repository.load(characterId);
      if (state === null) {
        return err('missing');
      }
      const stack = state.stacks.find((entry) => entry.itemId === itemId);
      if (stack === undefined) {
        return err('missing');
      }
      const item = requireItem(catalog, stack.itemId);
      if (item.slot === undefined) {
        return err('not_equippable');
      }
      if (item.twoHanded === true && item.slot !== 'main_hand') {
        throw new Error(`two-handed item ${item.id} must use main_hand`);
      }
      const equipped = canEquip(stack.durability, {
        slot: item.slot,
        twoHanded: item.twoHanded === true,
        occupied: occupiedExcept(state.stacks, stack.slot),
      });
      if (!equipped.ok) {
        return err(equipped.code);
      }
      stack.equipped = true;
      stack.equipSlots = [...equipped.value];
      refreshCarry(state, catalog);
      await repository.save(state);
      return ok(undefined);
    },

    async list(characterId) {
      const state = await repository.load(characterId);
      if (state === null) {
        return { gold: 0, items: [] };
      }
      const ordered = [...state.stacks].sort((left, right) => left.slot - right.slot);
      return {
        gold: state.gold,
        items: ordered.map((stack) => ({
          itemId: stack.itemId,
          equipped: stack.equipped,
        })),
      };
    },
  };
}

function emptyState(characterId: string): InventoryState {
  return {
    characterId,
    gold: 0,
    stacks: [],
    character: null,
    totalWeightKg: 0,
    overloadPenalty: 0,
  };
}

function nextSlot(stacks: readonly ItemStack[]): number {
  let max = -1;
  for (const stack of stacks) {
    if (stack.slot > max) {
      max = stack.slot;
    }
  }
  return max + 1;
}

function requireItem(catalog: ItemCatalog, id: string): CatalogItem {
  const found = catalog.items.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`catalog item not found: ${id}`);
  }
  if (!Number.isFinite(found.weightKg) || found.weightKg < 0) {
    throw new Error(`catalog item weight is invalid: ${id}`);
  }
  return found;
}

function occupiedExcept(
  stacks: readonly ItemStack[],
  slot: number,
): Partial<Record<EquipSlot, boolean>> {
  const occupied: Partial<Record<EquipSlot, boolean>> = {};
  for (const stack of stacks) {
    if (stack.slot === slot || !stack.equipped) {
      continue;
    }
    for (const equipSlot of stack.equipSlots) {
      occupied[equipSlot] = true;
    }
  }
  return occupied;
}

function refreshCarry(state: InventoryState, catalog: ItemCatalog): void {
  let totalWeightKg = 0;
  for (const stack of state.stacks) {
    const item = requireItem(catalog, stack.itemId);
    totalWeightKg += item.weightKg * stack.qty;
  }
  state.totalWeightKg = totalWeightKg;
  if (state.character === null) {
    state.overloadPenalty = 0;
    return;
  }
  state.overloadPenalty = derive({
    stats: state.character.stats,
    level: state.character.level,
    totalWeightKg,
  }).overloadPenalty;
}
