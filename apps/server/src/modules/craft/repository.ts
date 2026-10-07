import { randomUUID } from 'node:crypto';
import type { CrafterState, CrafterStore, CraftedItem, ItemSink, MaterialBank } from './types';

function copyStacks(stacks: Record<string, number>): Record<string, number> {
  return { ...stacks };
}

function sameStacks(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftIds = Object.keys(left);
  if (leftIds.length !== Object.keys(right).length) {
    return false;
  }
  for (const id of leftIds) {
    if (left[id] !== right[id]) {
      return false;
    }
  }
  return true;
}

function copySkills(skills: CrafterState['skills']): CrafterState['skills'] {
  const copy: CrafterState['skills'] = {};
  for (const [id, skill] of Object.entries(skills)) {
    if (skill) {
      copy[id as keyof CrafterState['skills']] = { level: skill.level, xp: skill.xp };
    }
  }
  return copy;
}

function copyCrafter(state: CrafterState): CrafterState {
  return {
    nodeId: state.nodeId,
    inCombat: state.inCombat,
    languageUpy: state.languageUpy,
    gold: state.gold,
    skills: copySkills(state.skills),
  };
}

export class MemoryCrafterStore implements CrafterStore {
  private readonly rows = new Map<string, CrafterState>();

  async get(characterId: string): Promise<CrafterState | undefined> {
    const row = this.rows.get(characterId);
    return row ? copyCrafter(row) : undefined;
  }

  async save(characterId: string, state: CrafterState): Promise<void> {
    this.rows.set(characterId, copyCrafter(state));
  }
}

export class MemoryMaterialBank implements MaterialBank {
  private readonly rows = new Map<string, Record<string, number>>();

  async seed(characterId: string, stacks: Record<string, number>): Promise<void> {
    this.rows.set(characterId, copyStacks(stacks));
  }

  async read(characterId: string): Promise<Record<string, number>> {
    return copyStacks(this.rows.get(characterId) ?? {});
  }

  async commit(
    characterId: string,
    expected: Record<string, number>,
    next: Record<string, number>,
  ): Promise<boolean> {
    const current = this.rows.get(characterId) ?? {};
    if (!sameStacks(current, expected)) {
      return false;
    }
    this.rows.set(characterId, copyStacks(next));
    return true;
  }
}

export class MemoryItemSink implements ItemSink {
  readonly placed: (CraftedItem & { itemId: string })[] = [];

  async put(item: CraftedItem): Promise<{ itemId: string }> {
    const itemId = randomUUID();
    this.placed.push({ ...item, itemId });
    return { itemId };
  }
}
