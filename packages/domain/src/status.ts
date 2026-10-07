import { derive, type DerivedInput } from './stats';
import { REAL_SECOND_MS } from './time';

export const STATUS_IDS = ['bleed', 'stun', 'burn', 'slow', 'poison', 'mutation'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export interface StatusInstance {
  id: StatusId;
  expiresAtMs: number;
  sourceId: string;
}

/** Difficulty from task 011. Resist strictly greater than this rejects the status. */
export const STATUS_DIFFICULTY: Record<StatusId, number> = {
  bleed: 8,
  stun: 12,
  burn: 10,
  slow: 6,
  poison: 10,
  mutation: 14,
};

/** Real-time duration in seconds. Stored on instances as milliseconds. */
export const STATUS_DURATION_SECONDS: Record<StatusId, number> = {
  bleed: 10,
  stun: 3,
  burn: 5,
  slow: 5,
  poison: 10,
  mutation: 60,
};

const HP_LOSS_PER_SECOND: Record<StatusId, number> = {
  bleed: 1,
  stun: 0,
  burn: 2,
  slow: 0,
  poison: 1,
  mutation: 0,
};

export function statusDifficulty(id: StatusId): number {
  return STATUS_DIFFICULTY[id];
}

export function statusDurationMs(id: StatusId): number {
  return STATUS_DURATION_SECONDS[id] * REAL_SECOND_MS;
}

/** Effect resistance is `derive(input).effectResist` (`will + floor(body / 2)`). */
export function statusResist(input: DerivedInput): number {
  return derive(input).effectResist;
}

export function tryApplyStatus(input: {
  resist: number;
  id: StatusId;
  nowMs: number;
  sourceId: string;
  existing: StatusInstance[];
}): { applied: boolean; statuses: StatusInstance[] } {
  if (input.resist > statusDifficulty(input.id)) {
    return { applied: false, statuses: input.existing };
  }

  const expiresAtMs = input.nowMs + statusDurationMs(input.id);
  const current = input.existing.find((status) => status.id === input.id);
  if (current !== undefined && current.expiresAtMs >= expiresAtMs) {
    return { applied: true, statuses: input.existing };
  }

  const next: StatusInstance = {
    id: input.id,
    expiresAtMs,
    sourceId: input.sourceId,
  };
  if (current === undefined) {
    return { applied: true, statuses: [...input.existing, next] };
  }

  return {
    applied: true,
    statuses: input.existing.map((status) => (status.id === input.id ? next : status)),
  };
}

/**
 * `hpLoss` is damage over `seconds` of real time.
 * Stun and speed are flags of statuses still active at `nowMs`.
 */
export function tickStatuses(
  statuses: StatusInstance[],
  nowMs: number,
  seconds: number,
): {
  active: StatusInstance[];
  hpLoss: number;
  accuracyPenalty: number;
  speedMultiplier: number;
  stunned: boolean;
} {
  const active = statuses.filter((status) => status.expiresAtMs > nowMs);
  let hpPerSecond = 0;
  let accuracyPenalty = 0;
  let speedMultiplier = 1;
  let stunned = false;

  for (const status of active) {
    hpPerSecond += HP_LOSS_PER_SECOND[status.id];
    if (status.id === 'poison') {
      accuracyPenalty = 1;
    } else if (status.id === 'slow') {
      speedMultiplier = 0.5;
    } else if (status.id === 'stun') {
      stunned = true;
    }
  }

  return {
    active,
    hpLoss: hpPerSecond * seconds,
    accuracyPenalty,
    speedMultiplier,
    stunned,
  };
}
