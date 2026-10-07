import type { Appearance, Controller, RaceId } from '@rift/domain/character';
import type { Result } from '@rift/domain/result';
import type { StatBlock, StatId } from '@rift/domain/stats';

export type { Result };

/** Life phase stored on the character. `dead` is not a stored phase. */
export type CharacterPhase = 'online' | 'downed';

export interface PrototypeFeatures {
  playableRaces: readonly RaceId[];
}

/**
 * Inventory port. The character module does not import the inventory module.
 * Tests and compose pass an implementation.
 */
export interface StarterGranter {
  grant(characterId: string): Promise<void>;
}

export interface CharacterRecord {
  id: string;
  accountId: string;
  name: string;
  raceId: RaceId;
  controller: Controller;
  level: number;
  /** XP inside the current level. */
  experience: number;
  clean: boolean;
  createdAtMs: number;
  bindNodeId: string;
  hp: number;
  /** Outside combat this is the will stat, which is the OD limit. */
  od: number;
  appearance: Appearance;
  points: StatBlock;
  unspent: number;
  stats: StatBlock;
  languages: Record<'common_light' | 'common_dark' | 'ancient', number>;
  phase: CharacterPhase;
}

export interface CharacterService {
  create(input: {
    accountId: string;
    controller: 'player' | 'bot';
    name: string;
    clean: boolean;
    points: StatBlock;
    appearance: Appearance;
  }): Promise<Result<{ characterId: string }, string>>;
  grantXp(characterId: string, amount: number): Promise<void>;
  spend(characterId: string, stat: StatId): Promise<Result<void, string>>;
}
