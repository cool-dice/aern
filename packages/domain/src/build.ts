import { err, ok, type Result } from './result';
import { MAX_LEVEL, derive, emptyPoints } from './stats';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Two online hours without use advances forgetting by one step. */
const FORGET_STEP_MS = 2 * HOUR_MS;
const PURIFY_MS = 24 * HOUR_MS;
const RECOVER_GOLD = 50;
const RECOVER_CHANNEL_MS = 30 * MINUTE_MS;

const PATH_GOLD: Record<1 | 2 | 3, number> = {
  1: 100,
  2: 300,
  3: 800,
};

/** Artifact 7 channel lengths: grade 1 is 30 min, grade 2 is 1 h, grade 3 is 2 h. */
const PATH_CHANNEL_MS: Record<1 | 2 | 3, number> = {
  1: 30 * MINUTE_MS,
  2: 1 * HOUR_MS,
  3: 2 * HOUR_MS,
};

const FORGETTING_MULTIPLIER: Record<0 | 1 | 2 | 3, number> = {
  0: 1,
  1: 0.75,
  2: 0.5,
  3: 0,
};

const FIRST_ENGINEER_KIT = 'first_engineer_kit';

export type ProgramKind = 'echo' | 'path';

export interface Program {
  templateId: string;
  grade: 1 | 2 | 3;
  kind: ProgramKind;
  forgetting: 0 | 1 | 2 | 3;
  idleMs: number;
}

export interface CoreRef {
  templateId: string;
  grade: 1 | 2 | 3 | 4 | 5;
  implant: boolean;
}

export interface BuildState {
  clean: boolean;
  purifyingUntilMs: number | null;
  level: number;
  will: number;
  programs: Program[];
  /** Zero or one core. */
  cores: CoreRef[];
  /**
   * Free relic sockets remaining. Totals stay in `socketCount` (relics.ts):
   * common 1, rare 2, epic 3, unique 3.
   */
  relicSocketFree: number;
  inCityOrHub: boolean;
  inCombat: boolean;
}

/**
 * `nn` is reserved. Exceeding neural load does not refuse an install or a study;
 * `neuroshock` reports the overload. Artifact 6 describes that consequence, not a ban.
 * `busy` is a purification already in progress (`beginPurify`).
 */
export type BuildError =
  | 'zone'
  | 'combat'
  | 'duplicate'
  | 'slots'
  | 'sockets'
  | 'nn'
  | 'incompatible'
  | 'gold'
  | 'core_taken'
  | 'requirements'
  | 'busy';

/** Progression cap for installed programs. `floor(level / 3)`. */
export function progressionSlots(level: number): number {
  assertLevel(level);
  return Math.floor(level / 3);
}

export function nnCostProgram(grade: 1 | 2 | 3): number {
  switch (grade) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    default: {
      const unknown: never = grade;
      throw new RangeError(`program grade must be 1, 2, or 3, got ${String(unknown)}`);
    }
  }
}

export function nnCostCore(grade: 1 | 2 | 3 | 4 | 5): number {
  switch (grade) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 3:
    case 4:
      return 2;
    case 5:
      return 3;
    default: {
      const unknown: never = grade;
      throw new RangeError(`core grade must be 1..5, got ${String(unknown)}`);
    }
  }
}

/** Programs and cores only. Relics, weapons, armor, and consumables cost nothing. */
export function nnUsed(state: BuildState): number {
  assertState(state);
  let total = 0;
  for (const program of state.programs) {
    total += nnCostProgram(program.grade);
  }
  for (const core of state.cores) {
    total += nnCostCore(core.grade);
  }
  return total;
}

/**
 * True when occupied neural load is above the derived limit.
 * Combat reads this flag and applies speed ×0.5 and damage ×0.5 until the load drops.
 * Neuroshock is not resisted and is not a task-011 status id.
 */
/** Speed and weapon damage while neural load is over the limit. */
export const NEUROSHOCK_FACTOR = 0.5;

export function neuroshock(state: BuildState): boolean {
  return nnUsed(state) > neuralLimit(state);
}

/** Halves a non-negative combat number while neuroshock is active. */
export function neuroshockScale(value: number, shocked: boolean): number {
  if (!shocked) {
    return value;
  }
  return value * NEUROSHOCK_FACTOR;
}

/** Forgetting steps: ×1, ×0.75, ×0.5, ×0. Load at step 3 is still occupied. */
export function effectMultiplier(program: Program): number {
  assertProgram(program);
  return FORGETTING_MULTIPLIER[program.forgetting];
}

/**
 * Installs an echo in a city or hub. Takes one progression slot and one free relic socket.
 * Overload is allowed: the returned state may have `neuroshock` true, and `nn` is not returned.
 */
export function installEcho(state: BuildState, program: Program): Result<BuildState, BuildError> {
  assertState(state);
  assertProgram(program);
  const place = placeError(state);
  if (place) {
    return place;
  }
  if (state.clean || program.kind !== 'echo') {
    return err('incompatible');
  }
  if (hasTemplate(state, program.templateId)) {
    return err('duplicate');
  }
  if (state.programs.length >= progressionSlots(state.level)) {
    return err('slots');
  }
  if (state.relicSocketFree < 1) {
    return err('sockets');
  }
  return ok(
    copyState(state, {
      programs: [...state.programs.map(cloneProgram), cloneProgram(program)],
      relicSocketFree: state.relicSocketFree - 1,
    }),
  );
}

/**
 * Starts a path channel in a city or hub, outside combat.
 * Grade 1/2/3 costs 100/300/800 and is ready after 30 min / 1 h / 2 h.
 * The instruction item itself is removed by the caller. The path is installed now.
 */
export function learnPath(
  state: BuildState,
  program: Program,
  gold: number,
  nowMs: number,
): Result<{ state: BuildState; gold: number; readyAtMs: number }, BuildError> {
  assertState(state);
  assertProgram(program);
  assertGold(gold);
  assertFinite('nowMs', nowMs);
  const place = placeError(state);
  if (place) {
    return place;
  }
  if (!state.clean || program.kind !== 'path') {
    return err('incompatible');
  }
  if (hasTemplate(state, program.templateId)) {
    return err('duplicate');
  }
  if (state.programs.length >= progressionSlots(state.level)) {
    return err('slots');
  }
  const cost = PATH_GOLD[program.grade];
  if (gold < cost) {
    return err('gold');
  }
  return ok({
    state: copyState(state, {
      programs: [...state.programs.map(cloneProgram), cloneProgram(program)],
    }),
    gold: gold - cost,
    readyAtMs: nowMs + PATH_CHANNEL_MS[program.grade],
  });
}

/**
 * Online idle advances path forgetting. Use clears idle and does not restore a lost step.
 * At 3, forgetting stops; further idle is kept and the neural load stays occupied.
 */
export function tickForgetting(program: Program, onlineDeltaMs: number, used: boolean): Program {
  assertProgram(program);
  assertFinite('onlineDeltaMs', onlineDeltaMs);
  if (onlineDeltaMs < 0) {
    throw new RangeError(`onlineDeltaMs must be >= 0, got ${String(onlineDeltaMs)}`);
  }
  if (typeof used !== 'boolean') {
    throw new RangeError('used must be a boolean');
  }
  if (used) {
    return cloneProgram({ ...program, idleMs: 0 });
  }

  let idleMs = program.idleMs + onlineDeltaMs;
  let forgetting: 0 | 1 | 2 | 3 = program.forgetting;
  if (forgetting < 3) {
    const steps = Math.floor(idleMs / FORGET_STEP_MS);
    const applied = Math.min(steps, 3 - forgetting);
    forgetting = shiftForgetting(forgetting, applied);
    idleMs -= applied * FORGET_STEP_MS;
  }
  return cloneProgram({ ...program, forgetting, idleMs });
}

/** One forgetting step back: 30 online minutes and 50 gold, in a city or hub, not in combat. */
export function recoverForgetting(
  state: BuildState,
  templateId: string,
  gold: number,
  nowMs: number,
): Result<{ state: BuildState; gold: number; readyAtMs: number }, BuildError> {
  assertState(state);
  assertTemplateId(templateId);
  assertGold(gold);
  assertFinite('nowMs', nowMs);
  const place = placeError(state);
  if (place) {
    return place;
  }
  const found = findProgram(state, templateId);
  if (!found || found.program.kind !== 'path' || found.program.forgetting === 0) {
    return err('requirements');
  }
  if (gold < RECOVER_GOLD) {
    return err('gold');
  }
  const programs = state.programs.map(cloneProgram);
  const current = programs[found.index];
  if (!current) {
    return err('requirements');
  }
  programs[found.index] = cloneProgram({
    ...current,
    forgetting: stepDown(current.forgetting),
  });
  return ok({
    state: copyState(state, { programs }),
    gold: gold - RECOVER_GOLD,
    readyAtMs: nowMs + RECOVER_CHANNEL_MS,
  });
}

/**
 * Equips the only core. Gold is checked and not spent: this task sets no core price,
 * and the result does not carry a balance.
 * `first_engineer_kit` requires a clean character, level ≥ 20, an external grade-5 core,
 * and at least one grade-3 path. Otherwise `requirements`.
 */
export function equipCore(
  state: BuildState,
  core: CoreRef,
  gold: number,
): Result<BuildState, BuildError> {
  assertState(state);
  assertCore(core);
  assertGold(gold);
  const place = placeError(state);
  if (place) {
    return place;
  }
  if (state.cores.length > 0) {
    return err('core_taken');
  }
  if (core.templateId === FIRST_ENGINEER_KIT && !engineerKitAllowed(state, core)) {
    return err('requirements');
  }
  if (core.implant && state.clean) {
    return err('incompatible');
  }
  return ok(copyState(state, { cores: [cloneCore(core)] }));
}

/** Drops the core. Only in a city or hub, and not in combat. */
export function unequipCore(state: BuildState): Result<BuildState, 'zone' | 'combat'> {
  assertState(state);
  const place = placeError(state);
  if (place) {
    return place;
  }
  return ok(copyState(state, { cores: [] }));
}

/** Installing a relic on a clean character breaks purity immediately. Paths stay. */
export function breakClean(state: BuildState, nowMs: number): BuildState {
  assertState(state);
  assertFinite('nowMs', nowMs);
  return copyState(state, { clean: false });
}

/**
 * Starts the 24 online-hour return to clean. Relics or implant cores still worn → `still_impure`.
 * A purification already recorded → `busy`. `clean` stays false until `completePurify`.
 */
export function beginPurify(
  state: BuildState,
  relicsLeft: number,
  implantCoresLeft: number,
  nowMs: number,
): Result<BuildState, 'busy' | 'still_impure'> {
  assertState(state);
  assertCount('relicsLeft', relicsLeft);
  assertCount('implantCoresLeft', implantCoresLeft);
  assertFinite('nowMs', nowMs);
  if (relicsLeft > 0 || implantCoresLeft > 0) {
    return err('still_impure');
  }
  if (state.purifyingUntilMs !== null) {
    return err('busy');
  }
  return ok(
    copyState(state, {
      clean: false,
      purifyingUntilMs: nowMs + PURIFY_MS,
    }),
  );
}

/**
 * Before the deadline, the build stays impure. At the deadline, `clean` becomes true
 * and path forgetting (and idle) returns to 0 so the next tick does not re-apply a stored idle.
 */
export function completePurify(state: BuildState, nowMs: number): BuildState {
  assertState(state);
  assertFinite('nowMs', nowMs);
  const until = state.purifyingUntilMs;
  if (until === null || nowMs < until) {
    return copyState(state);
  }
  return copyState(state, {
    clean: true,
    purifyingUntilMs: null,
    programs: state.programs.map((program) => {
      if (program.kind !== 'path') {
        return cloneProgram(program);
      }
      return cloneProgram({ ...program, forgetting: 0, idleMs: 0 });
    }),
  });
}

function neuralLimit(state: BuildState): number {
  const stats = emptyPoints();
  stats.will = state.will;
  return derive({ stats, level: state.level, totalWeightKg: 0 }).nnLimit;
}

function engineerKitAllowed(state: BuildState, core: CoreRef): boolean {
  if (!state.clean || state.level < 20 || core.implant || core.grade !== 5) {
    return false;
  }
  return state.programs.some((program) => program.kind === 'path' && program.grade === 3);
}

function placeError(state: BuildState): Result<never, 'zone' | 'combat'> | undefined {
  if (state.inCombat) {
    return err('combat');
  }
  if (!state.inCityOrHub) {
    return err('zone');
  }
  return undefined;
}

function hasTemplate(state: BuildState, templateId: string): boolean {
  return state.programs.some((program) => program.templateId === templateId);
}

function findProgram(
  state: BuildState,
  templateId: string,
): { index: number; program: Program } | undefined {
  const index = state.programs.findIndex((program) => program.templateId === templateId);
  if (index < 0) {
    return undefined;
  }
  const program = state.programs[index];
  if (!program) {
    return undefined;
  }
  return { index, program };
}

function shiftForgetting(current: 0 | 1 | 2 | 3, applied: number): 0 | 1 | 2 | 3 {
  const next = current + applied;
  if (next === 0 || next === 1 || next === 2 || next === 3) {
    return next;
  }
  throw new RangeError(`forgetting stepped out of range: ${String(next)}`);
}

function stepDown(value: 0 | 1 | 2 | 3): 0 | 1 | 2 {
  if (value === 1) {
    return 0;
  }
  if (value === 2) {
    return 1;
  }
  if (value === 3) {
    return 2;
  }
  return 0;
}

interface BuildPatch {
  clean?: boolean;
  purifyingUntilMs?: number | null;
  level?: number;
  will?: number;
  programs?: Program[];
  cores?: CoreRef[];
  relicSocketFree?: number;
  inCityOrHub?: boolean;
  inCombat?: boolean;
}

function copyState(state: BuildState, patch: BuildPatch = {}): BuildState {
  return {
    clean: patch.clean !== undefined ? patch.clean : state.clean,
    purifyingUntilMs:
      patch.purifyingUntilMs !== undefined ? patch.purifyingUntilMs : state.purifyingUntilMs,
    level: patch.level !== undefined ? patch.level : state.level,
    will: patch.will !== undefined ? patch.will : state.will,
    programs: patch.programs !== undefined ? patch.programs : state.programs.map(cloneProgram),
    cores: patch.cores !== undefined ? patch.cores : state.cores.map(cloneCore),
    relicSocketFree:
      patch.relicSocketFree !== undefined ? patch.relicSocketFree : state.relicSocketFree,
    inCityOrHub: patch.inCityOrHub !== undefined ? patch.inCityOrHub : state.inCityOrHub,
    inCombat: patch.inCombat !== undefined ? patch.inCombat : state.inCombat,
  };
}

function cloneProgram(program: Program): Program {
  return {
    templateId: program.templateId,
    grade: program.grade,
    kind: program.kind,
    forgetting: program.forgetting,
    idleMs: program.idleMs,
  };
}

function cloneCore(core: CoreRef): CoreRef {
  return {
    templateId: core.templateId,
    grade: core.grade,
    implant: core.implant,
  };
}

function assertState(state: BuildState): void {
  if (state === null || typeof state !== 'object') {
    throw new RangeError('state must be an object');
  }
  assertLevel(state.level);
  if (!Number.isFinite(state.will)) {
    throw new RangeError(`will must be finite, got ${String(state.will)}`);
  }
  if (!Array.isArray(state.programs)) {
    throw new RangeError('programs must be an array');
  }
  const seen = new Set<string>();
  for (const program of state.programs) {
    assertProgram(program);
    if (seen.has(program.templateId)) {
      throw new RangeError(`duplicate templateId in state: ${program.templateId}`);
    }
    seen.add(program.templateId);
  }
  if (!Array.isArray(state.cores)) {
    throw new RangeError('cores must be an array');
  }
  if (state.cores.length > 1) {
    throw new RangeError(`cores must contain 0 or 1 entries, got ${String(state.cores.length)}`);
  }
  for (const core of state.cores) {
    assertCore(core);
  }
  assertCount('relicSocketFree', state.relicSocketFree);
  if (state.purifyingUntilMs !== null && !Number.isFinite(state.purifyingUntilMs)) {
    throw new RangeError(
      `purifyingUntilMs must be finite or null, got ${String(state.purifyingUntilMs)}`,
    );
  }
  if (
    typeof state.clean !== 'boolean' ||
    typeof state.inCityOrHub !== 'boolean' ||
    typeof state.inCombat !== 'boolean'
  ) {
    throw new RangeError('clean, inCityOrHub, and inCombat must be booleans');
  }
}

function assertProgram(program: Program): void {
  if (program === null || typeof program !== 'object') {
    throw new RangeError('program must be an object');
  }
  assertTemplateId(program.templateId);
  if (program.kind !== 'echo' && program.kind !== 'path') {
    throw new RangeError(`program kind must be echo or path, got ${String(program.kind)}`);
  }
  if (program.grade !== 1 && program.grade !== 2 && program.grade !== 3) {
    throw new RangeError(`program grade must be 1, 2, or 3, got ${String(program.grade)}`);
  }
  if (
    program.forgetting !== 0 &&
    program.forgetting !== 1 &&
    program.forgetting !== 2 &&
    program.forgetting !== 3
  ) {
    throw new RangeError(`forgetting must be 0..3, got ${String(program.forgetting)}`);
  }
  if (!Number.isFinite(program.idleMs) || program.idleMs < 0) {
    throw new RangeError(`idleMs must be finite and >= 0, got ${String(program.idleMs)}`);
  }
}

function assertCore(core: CoreRef): void {
  if (core === null || typeof core !== 'object') {
    throw new RangeError('core must be an object');
  }
  assertTemplateId(core.templateId);
  if (
    core.grade !== 1 &&
    core.grade !== 2 &&
    core.grade !== 3 &&
    core.grade !== 4 &&
    core.grade !== 5
  ) {
    throw new RangeError(`core grade must be 1..5, got ${String(core.grade)}`);
  }
  if (typeof core.implant !== 'boolean') {
    throw new RangeError('implant must be a boolean');
  }
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level)) {
    throw new RangeError(`level must be an integer in [1, ${MAX_LEVEL}], got ${String(level)}`);
  }
  derive({ stats: emptyPoints(), level, totalWeightKg: 0 });
}

function assertTemplateId(templateId: string): void {
  if (typeof templateId !== 'string' || templateId.length === 0) {
    throw new RangeError('templateId must be a non-empty string');
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite, got ${String(value)}`);
  }
}

function assertGold(gold: number): void {
  if (!Number.isInteger(gold) || gold < 0) {
    throw new RangeError(`gold must be an integer >= 0, got ${String(gold)}`);
  }
}

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${String(value)}`);
  }
}
