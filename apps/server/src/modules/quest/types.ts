import type { QuestDef } from '@rift/content';

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; code: E };

/** Catalog row plus the optional fields the domain stores on progress. */
export type QuestOffer = QuestDef & {
  contract?: boolean;
  itemIds?: string[];
  expiresAtMs?: number;
};

/** Gold and xp leave through this port. The quest module does not import character. */
export interface RewardSink {
  grant(characterId: string, reward: { gold: number; xp: number }): Promise<void>;
}

/**
 * Level is read at turn-in. `upy` is the giver's language for `acceptQuest`.
 * The starter-city NPC speaks the character's side language, where own-language УПЯ is 100.
 */
export interface QuestCharacterView {
  levelOf(characterId: string): Promise<number>;
  upyOf(characterId: string): Promise<number>;
}

export interface QuestService {
  accept(characterId: string, questId: string, nowMs: number): Promise<Result<void, string>>;
  report(characterId: string, questId: string, objectiveId: string, amount: number): Promise<void>;
  turnIn(
    characterId: string,
    questId: string,
  ): Promise<Result<{ gold: number; xp: number }, string>>;
  abandon(
    characterId: string,
    questId: string,
  ): Promise<Result<{ removeItemIds: string[] }, string>>;
}
