import type { CoreRef, Program } from '@rift/domain/build';
import type { Appearance, Controller, RaceId } from '@rift/domain/character';
import type { GradeId } from '@rift/domain/items';
import type { RelicState } from '@rift/domain/relics';
import type { Result } from '@rift/domain/result';
import type { StatBlock, StatId } from '@rift/domain/stats';

export type { Result };

/** Life phase stored on the character. `dead` is not a stored phase. */
export type CharacterPhase = 'online' | 'downed';

/** Echo, path, and relic install results kept on the character row. */
export interface CharacterBuild {
  programs: Program[];
  cores: CoreRef[];
  relicSocketFree: number;
  relicGrade: GradeId;
  purifyingUntilMs: number | null;
  echoIds: string[];
  /** Worn relics. Purification counts this stack, and `removeRelic` takes one off. */
  relics?: RelicState[];
}

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
  /** Absent until an echo, path, or relic is installed. */
  build?: CharacterBuild | null;
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
