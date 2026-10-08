import { err, ok, type Result } from './result';
import {
  CREATION_STAT_POINTS,
  MAX_POINTS_PER_STAT,
  STAT_BASE,
  STAT_IDS,
  applyCap,
  emptyPoints,
  type StatBlock,
  type StatId,
} from './stats';

export type Controller = 'player' | 'bot';
export type SideId = 'light' | 'dark';
export type RaceId = 'human' | 'demon' | 'elf' | 'dark_elf' | 'dwarf' | 'goblin' | 'troll' | 'ogre';

export interface RaceDef {
  id: RaceId;
  side: SideId;
  modifiers: StatBlock;
}

/** Artifact 2 modifiers. Each race sums to +6. GDD v1 bonuses are not used. */
export const RACES: readonly RaceDef[] = Object.freeze([
  race('human', 'light', {
    body: 1,
    reaction: 1,
    accuracy: 1,
    will: 1,
    perception: 1,
    technique: 1,
  }),
  race('demon', 'dark', {
    body: 1,
    reaction: 1,
    accuracy: 1,
    will: 1,
    perception: 1,
    technique: 1,
  }),
  race('elf', 'light', {
    body: -2,
    reaction: 3,
    accuracy: 1,
    will: 2,
    perception: 2,
    technique: 0,
  }),
  race('dark_elf', 'dark', {
    body: 2,
    reaction: 3,
    accuracy: 1,
    will: -2,
    perception: 2,
    technique: 0,
  }),
  race('dwarf', 'light', {
    body: 3,
    reaction: -2,
    accuracy: 0,
    will: 1,
    perception: 2,
    technique: 2,
  }),
  race('goblin', 'dark', {
    body: -2,
    reaction: 2,
    accuracy: 1,
    will: 0,
    perception: 2,
    technique: 3,
  }),
  race('troll', 'light', {
    body: 3,
    reaction: 1,
    accuracy: -2,
    will: 2,
    perception: 0,
    technique: 2,
  }),
  race('ogre', 'dark', {
    body: 3,
    reaction: -2,
    accuracy: 0,
    will: 2,
    perception: 1,
    technique: 2,
  }),
]);

export interface Appearance {
  skin: string;
  hair: string;
  eyes: string;
  horns: boolean;
  ears: string;
  tattoos: string;
  scars: string;
  heightCm: number;
  build: string;
}

export interface CharacterDraft {
  raceId: RaceId;
  controller: Controller;
  side: SideId;
  clean: boolean;
  name: string;
  appearance: Appearance;
  points: StatBlock;
  unspent: number;
  stats: StatBlock;
  languages: Record<'common_light' | 'common_dark' | 'ancient', number>;
  level: 1;
  experience: 0;
}

export type CreateError =
  | 'name'
  | 'race_side'
  | 'points_total'
  | 'points_stat'
  | 'points_negative'
  | 'appearance';

const NAME_PATTERN = /^[\p{L}\p{Nd} ]+$/u;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 16;
const MAX_APPEARANCE_LENGTH = 32;
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 250;

const APPEARANCE_TEXT = ['skin', 'hair', 'eyes', 'ears', 'tattoos', 'scars', 'build'] as const;

const STARTING_LANGUAGES: Record<SideId, CharacterDraft['languages']> = {
  light: { common_light: 100, common_dark: 0, ancient: 0 },
  dark: { common_light: 0, common_dark: 100, ancient: 0 },
};

export function sideOf(controller: Controller): SideId {
  return controller === 'player' ? 'light' : 'dark';
}

/**
 * Final stat at creation: `min(clean ? 25 : 20, STAT_BASE + points + racial)`.
 * The cap is `applyCap` with no temporary bonus. Allocated points stay separate from the base 5.
 */
export function finalStat(pointsInStat: number, racial: number, clean: boolean): number {
  return applyCap(STAT_BASE + pointsInStat + racial, clean, 0);
}

export function createCharacter(input: {
  raceId: RaceId;
  controller: Controller;
  clean: boolean;
  name: string;
  appearance: Appearance;
  points: StatBlock;
}): Result<CharacterDraft, CreateError> {
  if (!isValidName(input.name)) {
    return err('name');
  }
  if (!isValidAppearance(input.appearance)) {
    return err('appearance');
  }

  const race = findRace(input.raceId);
  const side = sideOf(input.controller);
  if (race.side !== side) {
    return err('race_side');
  }

  const allocated = validatePoints(input.points);
  if (!allocated.ok) {
    return allocated;
  }

  const stats = emptyPoints();
  for (const id of STAT_IDS) {
    stats[id] = finalStat(
      requireStat(allocated.value, id),
      requireStat(race.modifiers, id),
      input.clean,
    );
  }

  return ok({
    raceId: race.id,
    controller: input.controller,
    side,
    clean: input.clean,
    name: input.name,
    appearance: copyAppearance(input.appearance),
    points: allocated.value,
    unspent: 0,
    stats,
    languages: { ...STARTING_LANGUAGES[side] },
    level: 1,
    experience: 0,
  });
}

function race(id: RaceId, side: SideId, modifiers: StatBlock): RaceDef {
  return Object.freeze({
    id,
    side,
    modifiers: Object.freeze({ ...modifiers }),
  });
}

function findRace(id: RaceId): RaceDef {
  const found = RACES.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`unknown race ${id}`);
  }
  return found;
}

function validatePoints(points: StatBlock): Result<StatBlock, CreateError> {
  const allocated = emptyPoints();
  let sum = 0;
  for (const id of STAT_IDS) {
    const value = points[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return err('points_stat');
    }
    allocated[id] = value;
    sum += value;
  }
  if (sum !== CREATION_STAT_POINTS) {
    return err('points_total');
  }
  for (const id of STAT_IDS) {
    const value = requireStat(allocated, id);
    if (value < 0) {
      return err('points_negative');
    }
    if (!Number.isInteger(value) || value > MAX_POINTS_PER_STAT) {
      return err('points_stat');
    }
  }
  return ok(allocated);
}

function isValidName(name: string): boolean {
  if (typeof name !== 'string') {
    return false;
  }
  const length = [...name].length;
  if (length < MIN_NAME_LENGTH || length > MAX_NAME_LENGTH) {
    return false;
  }
  if (!NAME_PATTERN.test(name)) {
    return false;
  }
  return !name.startsWith(' ') && !name.endsWith(' ') && !name.includes('  ');
}

function isValidAppearance(appearance: Appearance): boolean {
  if (appearance === null || typeof appearance !== 'object') {
    return false;
  }
  for (const field of APPEARANCE_TEXT) {
    if (!isAppearanceText(appearance[field])) {
      return false;
    }
  }
  if (typeof appearance.horns !== 'boolean') {
    return false;
  }
  return (
    typeof appearance.heightCm === 'number' &&
    Number.isFinite(appearance.heightCm) &&
    appearance.heightCm >= MIN_HEIGHT_CM &&
    appearance.heightCm <= MAX_HEIGHT_CM
  );
}

function isAppearanceText(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const length = [...value].length;
  return length >= 1 && length <= MAX_APPEARANCE_LENGTH;
}

function copyAppearance(appearance: Appearance): Appearance {
  return {
    skin: appearance.skin,
    hair: appearance.hair,
    eyes: appearance.eyes,
    horns: appearance.horns,
    ears: appearance.ears,
    tattoos: appearance.tattoos,
    scars: appearance.scars,
    heightCm: appearance.heightCm,
    build: appearance.build,
  };
}

function requireStat(block: StatBlock, id: StatId): number {
  const value = block[id];
  if (value === undefined) {
    throw new Error(`missing stat ${id}`);
  }
  return value;
}
