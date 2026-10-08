import type { CraftSkill, SkillState, StartedCraft } from '@rift/domain/craft';

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; code: E };

export type CraftGrade = StartedCraft['grade'];

/** Where the character is standing. Only `city` and `hub` may craft. */
export interface CrafterState {
  nodeId: string;
  inCombat: boolean;
  languageUpy: number;
  gold: number;
  skills: Partial<Record<CraftSkill, SkillState>>;
}

export interface CrafterStore {
  get(characterId: string): Promise<CrafterState | undefined>;
  save(characterId: string, state: CrafterState): Promise<void>;
}

/**
 * Material stacks for one character.
 * `commit` is atomic: it writes `next` only when the stored stacks still equal
 * `expected`, and otherwise leaves the bank untouched.
 */
export interface MaterialBank {
  read(characterId: string): Promise<Record<string, number>>;
  commit(
    characterId: string,
    expected: Record<string, number>,
    next: Record<string, number>,
  ): Promise<boolean>;
}

export interface CraftedItem {
  characterId: string;
  templateId: string;
  grade: CraftGrade;
  itemLevel: number;
  recipeId: string;
}

/** Inventory insert. The craft module does not import the inventory module. */
export interface ItemSink {
  put(item: CraftedItem): Promise<{ itemId: string }>;
}

export interface CraftRng {
  nextInt(maxExclusive: number): number;
  nextUnit(): number;
}

export interface CraftService {
  start(input: {
    characterId: string;
    recipeId: string;
    itemLevel: number;
    accelerate: boolean;
    nowMs: number;
  }): Promise<Result<{ readyAtMs: number; jobId: string; goldSpent: number }, string>>;
  complete(
    characterId: string,
    jobId: string,
    nowMs: number,
  ): Promise<Result<{ itemId: string }, 'early' | 'missing'>>;
  salvage(input: {
    characterId: string;
    recipeId: string;
    grade: CraftGrade;
  }): Promise<Result<{ materials: Record<string, number>; durationMs: number }, string>>;
  buySkill(input: {
    characterId: string;
    skill: CraftSkill;
    target: 1 | 10;
    teacher: boolean;
  }): Promise<Result<{ skill: SkillState; gold: number }, string>>;
}
