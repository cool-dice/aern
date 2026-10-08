import {
  LOCKOUT_MS,
  guess,
  hackDifficulty,
  newHack,
  type KeeperKind,
} from '@rift/domain/hack';
import type { Rng } from '@rift/domain/rng';
import { err, ok, type Result } from '@rift/domain/result';
import type { Bus } from '../../shared/bus';

interface Session {
  password: string;
  attemptsLeft: number;
  lockoutUntilMs: number;
  kind: KeeperKind;
}

export interface HackView {
  password: string;
  attemptsLeft: number;
  lockoutUntilMs: number;
}

export interface HackService {
  /** Server password for the 4×4 grid. Null when this character has no session. */
  view(characterId: string): HackView | null;
  start(input: {
    characterId: string;
    kind: KeeperKind;
    technique: number;
    hasDeck: boolean;
    nowMs: number;
  }): Result<{ attemptsLeft: number; difficulty: number }, 'deck' | 'lockout'>;
  guess(input: {
    characterId: string;
    attempt: string;
    nowMs: number;
  }): Result<{ correct: boolean; bulls: number; attemptsLeft: number }, string>;
}

export function createHackService(rng: Rng, bus: Bus): HackService {
  const sessions = new Map<string, Session>();

  return {
    view(characterId) {
      const session = sessions.get(characterId);
      if (session === undefined) {
        return null;
      }
      return {
        password: session.password,
        attemptsLeft: session.attemptsLeft,
        lockoutUntilMs: session.lockoutUntilMs,
      };
    },
    start(input) {
      if (!input.hasDeck) {
        return err('deck');
      }
      const current = sessions.get(input.characterId);
      if (current !== undefined && input.nowMs < current.lockoutUntilMs) {
        return err('lockout');
      }
      const opened = newHack(input.kind, rng);
      sessions.set(input.characterId, {
        password: opened.password,
        attemptsLeft: opened.attemptsLeft,
        lockoutUntilMs: 0,
        kind: input.kind,
      });
      return ok({
        attemptsLeft: opened.attemptsLeft,
        difficulty: hackDifficulty(input.kind, input.technique),
      });
    },
    guess(input) {
      const session = sessions.get(input.characterId);
      if (session === undefined) {
        return err('missing');
      }
      if (input.nowMs < session.lockoutUntilMs) {
        return err('lockout');
      }
      const result = guess(session.password, input.attempt, session.attemptsLeft);
      if (!result.ok) {
        return err(result.code);
      }
      session.attemptsLeft = result.value.attemptsLeft;
      if (result.value.correct) {
        bus.emit('hack.opened', { characterId: input.characterId, kind: session.kind });
        sessions.delete(input.characterId);
        return ok(result.value);
      }
      if (result.value.attemptsLeft <= 0) {
        session.lockoutUntilMs = input.nowMs + LOCKOUT_MS;
        return err('lockout');
      }
      return ok(result.value);
    },
  };
}
