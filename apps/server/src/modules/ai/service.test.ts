import { expect, test } from 'vitest';
import { ACTION_IDS, MEMORY_CAP, WORKING_MEMORY } from '@rift/domain/ai';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import type { ModuleContext } from '../../shared/module';
import { createAiModule, SIDECAR_TIMEOUT_MS } from './index';
import {
  ADAPTER_TRAIN_PERIOD_MS,
  POLICY_TRAIN_PERIOD_MS,
  type AiRejection,
  type SubmitInput,
  type Validator,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

function command(overrides: Partial<SubmitInput> = {}): SubmitInput {
  const nowMs = overrides.nowMs ?? 1_000;
  const sidecarAtMs = overrides.sidecarAtMs ?? nowMs;
  return {
    characterId: 'bot-1',
    action: 'wait',
    legal: ['wait'],
    hp: 100,
    maxHp: 100,
    od: 1,
    nearestEnemy: null,
    weaponRange: 4,
    ...overrides,
    nowMs,
    sidecarAtMs,
  };
}

function startAi(validate?: Validator['validate']) {
  const rejected: { characterId: string; code: string }[] = [];
  const validateCalls: { characterId: string; action: string }[] = [];
  const removed: string[] = [];
  const corpses: string[] = [];
  const bus = createBus();
  const clock = manualClock(0);
  bus.on('ai.rejected', (payload) => {
    rejected.push(payload);
  });

  const ai = createAiModule({
    validator: {
      async validate(commandInput) {
        validateCalls.push(commandInput);
        if (validate !== undefined) {
          return validate(commandInput);
        }
        return { ok: true, value: true };
      },
    },
    presence: {
      remove(characterId) {
        removed.push(characterId);
      },
    },
    corpse: {
      create(characterId) {
        corpses.push(characterId);
      },
    },
  });

  const ctx: ModuleContext = { bus, now: () => clock.now() };
  expect(Object.keys(ctx).sort()).toEqual(['bus', 'now']);
  ai.start(ctx);

  return { ai, service: ai.service, bus, clock, rejected, validateCalls, removed, corpses };
}

test('domain action anchors are the ids this module validates', () => {
  expect(ACTION_IDS).toHaveLength(64);
  expect(ACTION_IDS[0]).toBe('step_n');
  expect(ACTION_IDS[16]).toBe('wait');
  expect(ACTION_IDS[ACTION_IDS.length - 1]).toBe('scan');
  expect(MEMORY_CAP).toBe(10_000);
  expect(WORKING_MEMORY).toBe(10);
  expect(SIDECAR_TIMEOUT_MS).toBe(200);
  expect(POLICY_TRAIN_PERIOD_MS).toBe(24 * HOUR_MS);
  expect(ADAPTER_TRAIN_PERIOD_MS).toBe(6 * HOUR_MS);
});

test('fresh sidecar action is policy when the validator accepts it', async () => {
  const { ai, service, validateCalls, rejected } = startAi();
  expect(ai.name).toBe('ai');

  const result = await service.submit(
    command({
      action: 'wait',
      legal: ['attack_melee', 'use_item', 'wait'],
      nearestEnemy: 1,
      hp: 10,
      maxHp: 100,
    }),
  );

  expect(result).toEqual({ ok: true, value: { action: 'wait', source: 'policy' } });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'wait' }]);
  expect(rejected).toEqual([]);
  expect(service.rejections()).toEqual([]);
});

test('sidecar silent for 201 ms selects utility attack_melee and still validates it', async () => {
  const { service, validateCalls, clock } = startAi();
  clock.advance(10_000);
  const nowMs = clock.now();

  const result = await service.submit(
    command({
      action: 'scan',
      legal: ['step_n', 'attack_melee', 'attack_ranged'],
      sidecarAtMs: nowMs - (SIDECAR_TIMEOUT_MS + 1),
      nowMs,
      hp: 100,
      maxHp: 100,
      od: 1,
      nearestEnemy: 1,
      weaponRange: 4,
    }),
  );

  expect(result).toEqual({ ok: true, value: { action: 'attack_melee', source: 'utility' } });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'attack_melee' }]);
});

test('low hp on a late sidecar delegates to domain utility and uses use_item', async () => {
  const { service, validateCalls } = startAi();
  const nowMs = 5_000;

  const result = await service.submit(
    command({
      action: 'attack_melee',
      legal: ['attack_melee', 'use_item', 'step_n'],
      sidecarAtMs: nowMs - 500,
      nowMs,
      hp: 10,
      maxHp: 100,
      od: 1,
      nearestEnemy: 1,
      weaponRange: 4,
    }),
  );

  expect(result).toEqual({ ok: true, value: { action: 'use_item', source: 'utility' } });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'use_item' }]);
});

test('silence of exactly 200 ms still submits the policy action', async () => {
  const { service, validateCalls } = startAi();
  const nowMs = 2_000;

  const result = await service.submit(
    command({
      action: 'wait',
      legal: ['attack_melee', 'wait'],
      sidecarAtMs: nowMs - SIDECAR_TIMEOUT_MS,
      nowMs,
      nearestEnemy: 1,
      od: 1,
    }),
  );

  expect(result).toEqual({ ok: true, value: { action: 'wait', source: 'policy' } });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'wait' }]);
});

test('unknown action is invalid and does not call the validator', async () => {
  const { service, validateCalls, rejected, clock } = startAi(async () => {
    throw new Error('validator must not be called');
  });
  clock.advance(4_200);

  const result = await service.submit(
    command({
      action: 'fly',
      legal: ['use_item', 'attack_melee'],
      nowMs: clock.now(),
      hp: 10,
      maxHp: 100,
    }),
  );

  expect(result).toEqual({ ok: false, code: 'invalid' });
  expect(validateCalls).toEqual([]);
  expect(rejected).toEqual([{ characterId: 'bot-1', code: 'invalid' }]);
  expect(service.rejections()).toEqual([{ characterId: 'bot-1', code: 'invalid', atMs: 4_200 }]);
});

test('a late sidecar ignores an unknown original action and validates utility', async () => {
  const { service, validateCalls } = startAi();
  const nowMs = 8_000;

  const result = await service.submit(
    command({
      action: 'fly',
      legal: ['step_n', 'attack_melee'],
      sidecarAtMs: nowMs - 201,
      nowMs,
      nearestEnemy: 1,
      od: 1,
      hp: 100,
      maxHp: 100,
    }),
  );

  expect(result).toEqual({ ok: true, value: { action: 'attack_melee', source: 'utility' } });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'attack_melee' }]);
});

test('a validator rejection is not replaced by utility', async () => {
  const { service, validateCalls, rejected, clock } = startAi(async () => {
    return { ok: false, code: 'no_od' };
  });
  clock.advance(50);

  const result = await service.submit(
    command({
      action: 'wait',
      legal: ['use_item', 'wait', 'attack_melee'],
      nowMs: clock.now(),
      hp: 10,
      maxHp: 100,
      nearestEnemy: 1,
      od: 1,
    }),
  );

  expect(result).toEqual({ ok: false, code: 'no_od' });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'wait' }]);
  expect(rejected).toEqual([{ characterId: 'bot-1', code: 'no_od' }]);
});

test('a validator rejection of the utility action is returned as that error', async () => {
  const { service, validateCalls, rejected } = startAi(async () => {
    return { ok: false, code: 'range' };
  });
  const nowMs = 9_000;

  const result = await service.submit(
    command({
      action: 'scan',
      legal: ['attack_melee', 'step_n'],
      sidecarAtMs: nowMs - 201,
      nowMs,
      nearestEnemy: 1,
      od: 1,
      hp: 100,
      maxHp: 100,
    }),
  );

  expect(result).toEqual({ ok: false, code: 'range' });
  expect(validateCalls).toEqual([{ characterId: 'bot-1', action: 'attack_melee' }]);
  expect(rejected).toEqual([{ characterId: 'bot-1', code: 'range' }]);
});

test('late sidecar with an empty legal list returns none and does not validate', async () => {
  const { service, validateCalls, rejected } = startAi(async () => {
    throw new Error('validator must not be called');
  });

  const result = await service.submit(
    command({
      action: 'wait',
      legal: [],
      sidecarAtMs: 0,
      nowMs: SIDECAR_TIMEOUT_MS + 1,
    }),
  );

  expect(result).toEqual({ ok: false, code: 'none' });
  expect(validateCalls).toEqual([]);
  expect(rejected).toEqual([{ characterId: 'bot-1', code: 'none' }]);
});

test('rejections accumulate in order and each one is emitted', async () => {
  const { service, rejected } = startAi(async (commandInput) => {
    if (commandInput.action === 'scan') {
      return { ok: false, code: 'cooldown' };
    }
    return { ok: true, value: true };
  });

  await service.submit(command({ action: 'fly', characterId: 'bot-a' }));
  await service.submit(command({ action: 'scan', characterId: 'bot-b' }));
  await service.submit(command({ action: 'wait', characterId: 'bot-c' }));

  const expected: AiRejection[] = [
    { characterId: 'bot-a', code: 'invalid', atMs: 0 },
    { characterId: 'bot-b', code: 'cooldown', atMs: 0 },
  ];
  expect(service.rejections()).toEqual(expected);
  expect(rejected).toEqual([
    { characterId: 'bot-a', code: 'invalid' },
    { characterId: 'bot-b', code: 'cooldown' },
  ]);
});

test('working memory is the last 10 active rows and does not archive early', () => {
  const { service } = startAi();

  for (let index = 0; index < WORKING_MEMORY + 2; index += 1) {
    service.remember('bot-1', { atMs: index, text: `w-${index}` });
  }

  const stored = service.memory('bot-1');
  expect(stored.active).toHaveLength(WORKING_MEMORY + 2);
  expect(stored.archive).toEqual([]);
  expect(stored.working).toHaveLength(WORKING_MEMORY);
  expect(stored.working[0]).toEqual({ atMs: 2, text: 'w-2' });
  expect(stored.working[WORKING_MEMORY - 1]).toEqual({
    atMs: WORKING_MEMORY + 1,
    text: `w-${WORKING_MEMORY + 1}`,
  });
  expect(service.memory('other')).toEqual({ active: [], archive: [], working: [] });
});

test('the 10001st memory keeps 10000 active rows and archives the oldest one', () => {
  const { service } = startAi();
  const total = MEMORY_CAP + 1;

  for (let index = 0; index < total; index += 1) {
    service.remember('bot-1', { atMs: index, text: `m-${index}` });
  }
  service.remember('bot-2', { atMs: 1, text: 'other' });

  const stored = service.memory('bot-1');
  expect(stored.active).toHaveLength(10_000);
  expect(stored.archive).toHaveLength(1);
  expect(stored.archive[0]).toEqual({ atMs: 0, text: 'm-0' });
  expect(stored.active[0]).toEqual({ atMs: 1, text: 'm-1' });
  expect(stored.active[stored.active.length - 1]).toEqual({
    atMs: MEMORY_CAP,
    text: `m-${MEMORY_CAP}`,
  });
  expect(stored.working).toHaveLength(10);
  expect(service.memory('bot-2')).toEqual({
    active: [{ atMs: 1, text: 'other' }],
    archive: [],
    working: [{ atMs: 1, text: 'other' }],
  });
});

test('policy train is early until 24 hours and adapter until 6 hours', () => {
  const { service, clock } = startAi();
  clock.advance(1_000);
  const start = clock.now();

  expect(service.requestTrain('policy', start)).toEqual({ ok: true, value: { atMs: start } });
  expect(service.requestTrain('policy', clock.now())).toEqual({ ok: false, code: 'early' });

  clock.advance(POLICY_TRAIN_PERIOD_MS - 1);
  expect(service.requestTrain('policy', clock.now())).toEqual({ ok: false, code: 'early' });

  clock.advance(1);
  const policyAgain = clock.now();
  expect(service.requestTrain('policy', policyAgain)).toEqual({
    ok: true,
    value: { atMs: policyAgain },
  });

  const adapterAt = 5_000;
  expect(service.requestTrain('adapter', adapterAt)).toEqual({
    ok: true,
    value: { atMs: adapterAt },
  });
  expect(service.requestTrain('adapter', adapterAt + 5 * HOUR_MS)).toEqual({
    ok: false,
    code: 'early',
  });
  expect(service.requestTrain('adapter', adapterAt + ADAPTER_TRAIN_PERIOD_MS)).toEqual({
    ok: true,
    value: { atMs: adapterAt + ADAPTER_TRAIN_PERIOD_MS },
  });
  expect(service.requestTrain('policy', policyAgain)).toEqual({ ok: false, code: 'early' });
});

test('carrier offline removes the bot once and does not create a corpse', () => {
  const { service, removed, corpses } = startAi();

  service.onCarrierOffline('bot-9');

  expect(removed).toEqual(['bot-9']);
  expect(corpses).toEqual([]);
});

test('submit before start throws and does not call the validator', async () => {
  const calls: string[] = [];
  const ai = createAiModule({
    validator: {
      async validate() {
        calls.push('validate');
        return { ok: true, value: true };
      },
    },
    presence: { remove() {} },
    corpse: { create() {} },
  });

  await expect(ai.service.submit(command())).rejects.toThrow('AI module has not been started');
  expect(calls).toEqual([]);
});
