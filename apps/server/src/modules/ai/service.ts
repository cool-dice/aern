import { ACTION_IDS, utilityAction } from '@rift/domain/ai';
import type { AiRepository } from './repository';
import {
  SIDECAR_TIMEOUT_MS,
  type AiPorts,
  type AiRuntime,
  type AiService,
  type Decision,
  type Result,
  type SubmitInput,
} from './types';

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(ACTION_IDS);

function isKnownAction(action: string): boolean {
  return KNOWN_ACTIONS.has(action);
}

/**
 * Pick the action for this tick.
 * A silent sidecar drops the original action and asks the domain utility policy.
 * An id outside `ACTION_IDS` fails here, before the validator port is called.
 */
function chooseAction(input: SubmitInput): Result<Decision, 'invalid' | 'none'> {
  const silentForMs = input.nowMs - input.sidecarAtMs;
  if (silentForMs > SIDECAR_TIMEOUT_MS) {
    const picked = utilityAction({
      legal: input.legal,
      hp: input.hp,
      maxHp: input.maxHp,
      od: input.od,
      nearestEnemy: input.nearestEnemy,
      weaponRange: input.weaponRange,
    });
    if (!picked.ok) {
      return { ok: false, code: 'none' };
    }
    if (!isKnownAction(picked.value)) {
      return { ok: false, code: 'invalid' };
    }
    return { ok: true, value: { action: picked.value, source: 'utility' } };
  }

  if (!isKnownAction(input.action)) {
    return { ok: false, code: 'invalid' };
  }
  return { ok: true, value: { action: input.action, source: 'policy' } };
}

export function createAiService(
  ports: AiPorts,
  repository: AiRepository,
  runtime: AiRuntime,
): AiService {
  function reject(characterId: string, code: string): void {
    const bus = runtime.bus;
    const now = runtime.now;
    if (bus === null || now === null) {
      throw new Error('AI module has not been started');
    }
    const payload = { characterId, code, atMs: now() };
    repository.recordRejection(payload);
    bus.emit('ai.rejected', { characterId, code });
  }

  return {
    async submit(input) {
      if (runtime.bus === null || runtime.now === null) {
        throw new Error('AI module has not been started');
      }

      const chosen = chooseAction(input);
      if (!chosen.ok) {
        reject(input.characterId, chosen.code);
        return chosen;
      }

      const verdict = await ports.validator.validate({
        characterId: input.characterId,
        action: chosen.value.action,
      });
      if (!verdict.ok) {
        reject(input.characterId, verdict.code);
        return { ok: false, code: verdict.code };
      }

      return { ok: true, value: chosen.value };
    },

    remember(characterId, entry) {
      repository.remember(characterId, entry);
    },

    memory(characterId) {
      return repository.memory(characterId);
    },

    requestTrain(kind, nowMs) {
      return repository.requestTrain(kind, nowMs);
    },

    onCarrierOffline(characterId) {
      // Carrier offline removes the bot. It must not spawn a corpse.
      ports.presence.remove(characterId);
    },

    rejections() {
      return repository.rejections();
    },
  };
}
