import { err, ok, type Result } from './result';
import type { Rng } from './rng';
import { SIM_TICK_MS } from './time';

/** Password alphabet. The GDD never names the glyphs; this set is the task decision. */
export const HACK_ALPHABET = 'ABCDEFGH';

/** Door stays shut for 10 minutes after the third miss. */
export const LOCKOUT_MS = 6_000 * SIM_TICK_MS;

const PASSWORD_LENGTH = 4;
const START_ATTEMPTS = 3 as const;

export type KeeperKind = 'patrol' | 'guard' | 'destroyer' | 'unique';

type KeeperRules = {
  base: number;
  silenceMs: number;
};

function keeperRules(kind: KeeperKind): KeeperRules {
  switch (kind) {
    case 'patrol':
      return { base: 10, silenceMs: 600 * SIM_TICK_MS };
    case 'guard':
      return { base: 20, silenceMs: 300 * SIM_TICK_MS };
    case 'destroyer':
      return { base: 30, silenceMs: 150 * SIM_TICK_MS };
    case 'unique':
      return { base: 40, silenceMs: 100 * SIM_TICK_MS };
    default: {
      const unexpected: never = kind;
      throw new Error(`unknown keeper kind: ${String(unexpected)}`);
    }
  }
}

export function hackDifficulty(kind: KeeperKind, technique: number): number {
  return Math.max(1, keeperRules(kind).base - Math.floor(technique / 2));
}

export function silenceMs(kind: KeeperKind): number {
  return keeperRules(kind).silenceMs;
}

export function newHack(kind: KeeperKind, rng: Rng): { password: string; attemptsLeft: 3 } {
  keeperRules(kind);

  let password = '';
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    const index = rng.nextInt(8);
    const symbol = HACK_ALPHABET[index];
    if (symbol === undefined) {
      throw new Error(`alphabet index out of range: ${index}`);
    }
    password += symbol;
  }

  return { password, attemptsLeft: START_ATTEMPTS };
}

export function guess(
  password: string,
  attempt: string,
  attemptsLeft: number,
): Result<{ correct: boolean; bulls: number; attemptsLeft: number }, 'format' | 'exhausted'> {
  if (attemptsLeft <= 0) {
    return err('exhausted');
  }
  // Length is the format gate. Glyphs outside HACK_ALPHABET are ordinary misses,
  // so an attempt such as "ABXX" still reports bulls.
  if (attempt.length !== PASSWORD_LENGTH) {
    return err('format');
  }

  let bulls = 0;
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    if (password[i] === attempt[i]) {
      bulls += 1;
    }
  }

  const correct = attempt === password;
  return ok({
    correct,
    bulls,
    attemptsLeft: Math.max(0, attemptsLeft - 1),
  });
}
