import type { Bus } from '../../shared/bus';

/**
 * Same shape as the domain `Result`. The domain barrel is empty, so this module
 * declares the type beside the validator port instead of importing `sim/validate.ts`.
 */
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E };

/** Silence strictly longer than this replaces the sidecar action with utility. */
export const SIDECAR_TIMEOUT_MS = 200;

/** Accepted policy train requests must be at least this far apart. */
export const POLICY_TRAIN_PERIOD_MS = 24 * 60 * 60 * 1000;

/** Accepted adapter train requests must be at least this far apart. */
export const ADAPTER_TRAIN_PERIOD_MS = 6 * 60 * 60 * 1000;

export type DecisionSource = 'policy' | 'utility';

export type TrainKind = 'policy' | 'adapter';

export interface SubmitInput {
  characterId: string;
  action: string;
  legal: string[];
  sidecarAtMs: number;
  nowMs: number;
  hp: number;
  maxHp: number;
  od: number;
  nearestEnemy: number | null;
  weaponRange: number;
}

export interface Decision {
  action: string;
  source: DecisionSource;
}

export interface MemoryEntry {
  atMs: number;
  text: string;
}

export interface BotMemory {
  active: readonly MemoryEntry[];
  archive: readonly MemoryEntry[];
  working: readonly MemoryEntry[];
}

export interface AiRejection {
  characterId: string;
  code: string;
  atMs: number;
}

export interface TrainAcceptance {
  atMs: number;
}

/**
 * Game-rule check for one bot command. Implemented outside this module;
 * tests pass a fake. This file does not import `sim/validate.ts`.
 */
export interface Validator {
  validate(command: { characterId: string; action: string }): Promise<Result<true, string>>;
}

/** Removes a bot from the world when its carrier goes offline. */
export interface BotPresence {
  remove(characterId: string): void;
}

/** Corpse creation. Carrier offline must not call this. */
export interface CorpsePort {
  create(characterId: string): void;
}

export interface AiPorts {
  validator: Validator;
  presence: BotPresence;
  corpse: CorpsePort;
}

export interface AiService {
  submit(input: SubmitInput): Promise<Result<Decision, string>>;
  remember(characterId: string, entry: MemoryEntry): void;
  memory(characterId: string): BotMemory;
  requestTrain(kind: TrainKind, nowMs: number): Result<TrainAcceptance, 'early'>;
  onCarrierOffline(characterId: string): void;
  rejections(): readonly AiRejection[];
}

/** Bus and clock assigned by `GameModule.start`. */
export interface AiRuntime {
  bus: Bus | null;
  now: (() => number) | null;
}
