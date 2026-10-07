import type { EquipSlot } from '@rift/domain/items';
import type { StatBlock } from '@rift/domain/stats';
import type { InventoryCharacter, InventoryState, ItemStack } from './types';

export interface InventoryRepository {
  load(characterId: string): Promise<InventoryState | null>;
  save(state: InventoryState): Promise<void>;
}

function copyStats(stats: StatBlock): StatBlock {
  return { ...stats };
}

function copyCharacter(character: InventoryCharacter): InventoryCharacter {
  return {
    level: character.level,
    stats: copyStats(character.stats),
  };
}

function copyStack(stack: ItemStack): ItemStack {
  return {
    slot: stack.slot,
    itemId: stack.itemId,
    qty: stack.qty,
    durability: stack.durability,
    equipped: stack.equipped,
    equipSlots: [...stack.equipSlots] as EquipSlot[],
  };
}

function copyState(state: InventoryState): InventoryState {
  return {
    characterId: state.characterId,
    gold: state.gold,
    stacks: state.stacks.map(copyStack),
    character: state.character === null ? null : copyCharacter(state.character),
    totalWeightKg: state.totalWeightKg,
    overloadPenalty: state.overloadPenalty,
  };
}

export class MemoryInventoryRepository implements InventoryRepository {
  private readonly byCharacter = new Map<string, InventoryState>();

  async load(characterId: string): Promise<InventoryState | null> {
    const state = this.byCharacter.get(characterId);
    return state === undefined ? null : copyState(state);
  }

  async save(state: InventoryState): Promise<void> {
    this.byCharacter.set(state.characterId, copyState(state));
  }
}
