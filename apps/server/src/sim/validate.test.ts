import { move } from '@rift/domain/movement';
import { parseClientCommand } from '@rift/protocol';
import { expect, test } from 'vitest';
import { manualClock } from '../shared/clock';
import {
  COMMAND_ACTIONS,
  LAG_COMPENSATION_MS,
  combatRunOdCost,
  combatStepOdCost,
  distanceAtIssue,
  rememberCommand,
  seenCommand,
  validateClientCommand,
  validateCommand,
  validateCommandAtIssue,
  type CommandDecision,
  type ValidateCode,
  type ValidateInput,
} from './validate';

type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E };

function valid(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    action: 'wait',
    commandId: 'cmd-1',
    seen: new Set<string>(),
    od: 5,
    odCost: 1,
    distance: 1,
    range: 10,
    los: true,
    cooldownReady: true,
    hasResource: true,
    targetAlive: true,
    safeZone: false,
    pvpOpen: false,
    stunned: false,
    downed: false,
    running: false,
    overloaded: false,
    neuroshock: false,
    recentRejects: 0,
    ...overrides,
  };
}

function codeOf(input: ValidateInput): ValidateCode | 'ok' {
  const decision = validateCommand(input);
  return decision.ok ? 'ok' : decision.code;
}

test('catalog actions are the 64 ids and do not alias move', () => {
  expect(COMMAND_ACTIONS).toHaveLength(64);
  expect(new Set(COMMAND_ACTIONS).size).toBe(64);
  expect(COMMAND_ACTIONS[0]).toBe('step_n');
  expect(COMMAND_ACTIONS[16]).toBe('wait');
  expect(COMMAND_ACTIONS[COMMAND_ACTIONS.length - 1]).toBe('scan');
  expect(COMMAND_ACTIONS.includes('move')).toBe(false);
  expect(COMMAND_ACTIONS.includes('step_nw')).toBe(true);
  expect(COMMAND_ACTIONS.includes('run_nw')).toBe(true);
});

test.each([
  ['duplicate', { seen: new Set(['cmd-1']), commandId: 'cmd-1' }, 'duplicate'],
  ['unknown_action', { action: 'move' }, 'unknown_action'],
  ['status stunned', { stunned: true }, 'status'],
  ['status downed', { downed: true }, 'status'],
  [
    'safe',
    { action: 'attack_ranged', safeZone: true, pvpOpen: false, distance: 4, range: 10 },
    'safe',
  ],
  ['nn', { action: 'ability_1', neuroshock: true }, 'nn'],
  ['weight', { action: 'run_n', running: true, overloaded: true }, 'weight'],
  ['cooldown', { cooldownReady: false }, 'cooldown'],
  ['resources', { hasResource: false }, 'resources'],
  ['target', { targetAlive: false }, 'target'],
  ['los', { action: 'attack_ranged', los: false, distance: 4, range: 10 }, 'los'],
  ['range', { distance: 11, range: 10 }, 'range'],
  ['no_od', { od: 0, odCost: 1 }, 'no_od'],
] as const)('%s rejects with the other fields valid', (_name, patch, code) => {
  const decision = validateCommand(valid(patch));
  expect(decision.ok).toBe(false);
  if (!decision.ok) {
    expect(decision.code).toBe(code);
    expect(decision.cheatStrike).toBe(false);
  }
});

test('fifth reject (recentRejects 4) sets cheatStrike with the error', () => {
  const decision = validateCommand(valid({ od: 0, odCost: 1, recentRejects: 4 }));
  expect(decision).toEqual({ ok: false, code: 'no_od', cheatStrike: true });
});

test('a successful command has cheatStrike false even after prior rejects', () => {
  const decision = validateCommand(valid({ recentRejects: 4 }));
  const asResult: Result<{ cheatStrike: boolean }, string> = decision;
  expect(asResult).toEqual({ ok: true, value: { cheatStrike: false } });
});

test('validateCommand does not grow the input seen set', () => {
  const seen = new Set(['kept']);
  const before = seen.size;
  expect(codeOf(valid({ seen, commandId: 'fresh' }))).toBe('ok');
  expect(codeOf(valid({ seen, commandId: 'kept', action: 'fly', od: 0 }))).toBe('duplicate');
  expect(seen.size).toBe(before);
  expect(seen.has('kept')).toBe(true);
  expect(seen.has('fresh')).toBe(false);
});

test('rememberCommand returns a copy and seenCommand reads membership', () => {
  const seen = new Set(['kept']);
  expect(seenCommand(seen, 'kept')).toBe(true);
  expect(seenCommand(seen, 'fresh')).toBe(false);
  const next = rememberCommand(seen, 'fresh');
  expect(next).toEqual(new Set(['kept', 'fresh']));
  expect(next).not.toBe(seen);
  expect(seen.size).toBe(1);
  expect(seen.has('fresh')).toBe(false);
  next.add('later');
  expect(seen.has('later')).toBe(false);
});

test('ability under neuroshock is nn and a non-ability is not', () => {
  expect(codeOf(valid({ action: 'ability_2', neuroshock: true }))).toBe('nn');
  expect(codeOf(valid({ action: 'ability_1', neuroshock: false }))).toBe('ok');
  expect(codeOf(valid({ action: 'wait', neuroshock: true }))).toBe('ok');
});

test('run while overloaded is weight', () => {
  expect(codeOf(valid({ action: 'run_e', running: true, overloaded: true, od: 10 }))).toBe(
    'weight',
  );
  expect(codeOf(valid({ action: 'run_n', running: false, overloaded: true }))).toBe('weight');
  expect(codeOf(valid({ action: 'step_n', running: false, overloaded: true }))).toBe('ok');
});

test('distance 11 range 10 is range and the boundary is still legal', () => {
  expect(codeOf(valid({ distance: 11, range: 10 }))).toBe('range');
  expect(codeOf(valid({ action: 'attack_ranged', distance: 10, range: 10 }))).toBe('ok');
  expect(codeOf(valid({ action: 'attack_melee', distance: 2, range: 10 }))).toBe('range');
  expect(codeOf(valid({ action: 'attack_melee', distance: 1, range: 10 }))).toBe('ok');
});

test('OD 0 cost 1 is no_od and portal does not spend OD', () => {
  expect(codeOf(valid({ od: 0, odCost: 1 }))).toBe('no_od');
  expect(codeOf(valid({ od: 1, odCost: 1 }))).toBe('ok');
  expect(codeOf(valid({ action: 'portal', od: 0, odCost: 3 }))).toBe('ok');
});

test('melee does not require LOS and ranged does', () => {
  expect(codeOf(valid({ action: 'attack_melee', los: false, distance: 1 }))).toBe('ok');
  expect(codeOf(valid({ action: 'attack_ranged', los: false, distance: 4, range: 10 }))).toBe(
    'los',
  );
});

test('attack in a safe zone needs pvpOpen; a step does not', () => {
  expect(
    codeOf(valid({ action: 'attack_melee', safeZone: true, pvpOpen: false, distance: 1 })),
  ).toBe('safe');
  expect(
    codeOf(valid({ action: 'attack_melee', safeZone: true, pvpOpen: true, distance: 1 })),
  ).toBe('ok');
  expect(codeOf(valid({ action: 'step_n', safeZone: true, pvpOpen: false }))).toBe('ok');
});

test('first failure in the fixed order wins', () => {
  const seen = new Set(['dup']);
  const messy: ValidateInput = valid({
    seen,
    commandId: 'dup',
    action: 'fly',
    stunned: true,
    downed: true,
    safeZone: true,
    pvpOpen: false,
    neuroshock: true,
    running: true,
    overloaded: true,
    cooldownReady: false,
    hasResource: false,
    targetAlive: false,
    los: false,
    distance: 11,
    range: 10,
    od: 0,
    odCost: 1,
    recentRejects: 4,
  });
  expect(validateCommand(messy)).toEqual({
    ok: false,
    code: 'duplicate',
    cheatStrike: true,
  });
  expect(codeOf({ ...messy, commandId: 'fresh' })).toBe('unknown_action');
  expect(codeOf({ ...messy, commandId: 'fresh', action: 'attack_ranged' })).toBe('status');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'attack_ranged',
      stunned: false,
      downed: false,
    }),
  ).toBe('safe');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'ability_3',
      stunned: false,
      downed: false,
      safeZone: false,
    }),
  ).toBe('nn');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'run_s',
      stunned: false,
      downed: false,
      safeZone: false,
      neuroshock: false,
    }),
  ).toBe('weight');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'wait',
      stunned: false,
      downed: false,
      safeZone: false,
      neuroshock: false,
      running: false,
      overloaded: false,
    }),
  ).toBe('cooldown');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'wait',
      stunned: false,
      downed: false,
      running: false,
      overloaded: false,
      neuroshock: false,
      cooldownReady: true,
    }),
  ).toBe('resources');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'wait',
      stunned: false,
      downed: false,
      running: false,
      overloaded: false,
      neuroshock: false,
      cooldownReady: true,
      hasResource: true,
    }),
  ).toBe('target');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'attack_ranged',
      stunned: false,
      downed: false,
      safeZone: false,
      neuroshock: false,
      running: false,
      overloaded: false,
      cooldownReady: true,
      hasResource: true,
      targetAlive: true,
    }),
  ).toBe('los');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'wait',
      stunned: false,
      downed: false,
      running: false,
      overloaded: false,
      neuroshock: false,
      cooldownReady: true,
      hasResource: true,
      targetAlive: true,
      los: true,
    }),
  ).toBe('range');
  expect(
    codeOf({
      ...messy,
      commandId: 'fresh',
      action: 'wait',
      stunned: false,
      downed: false,
      running: false,
      overloaded: false,
      neuroshock: false,
      cooldownReady: true,
      hasResource: true,
      targetAlive: true,
      los: true,
      distance: 1,
      range: 10,
    }),
  ).toBe('no_od');
});

test('combat step spends 1 OD and a run spends 3', () => {
  expect(combatStepOdCost()).toBe(1);
  expect(combatRunOdCost(10)).toBe(3);
  expect(combatRunOdCost(25)).toBe(3);
  const step = move({
    from: { x: 0, y: 0 },
    dir: 'n',
    inCombat: true,
    od: 5,
    reaction: 10,
    running: false,
    overloaded: false,
    legsDestroyed: 0,
    downed: false,
    blocked: () => false,
  });
  expect(step).toEqual({ ok: true, value: { cell: { x: 0, y: -1 }, od: 4, cells: 1 } });
  const run = move({
    from: { x: 0, y: 0 },
    dir: 'n',
    inCombat: true,
    od: 5,
    reaction: 10,
    running: true,
    overloaded: false,
    legsDestroyed: 0,
    downed: false,
    blocked: () => false,
  });
  expect(run.ok).toBe(true);
  if (run.ok) {
    expect(5 - run.value.od).toBe(3);
  }
});

test('lag distance uses a snapshot no older than 500ms and otherwise the current cells', () => {
  const clock = manualClock(2_000);
  expect(LAG_COMPENSATION_MS).toBe(500);

  const fresh = distanceAtIssue({
    nowMs: clock.now(),
    issuedAtMs: 1_600,
    currentAttacker: { x: 0, y: 0 },
    currentTarget: { x: 1, y: 0 },
    samples: [
      { atMs: 1_500, attacker: { x: 0, y: 0 }, target: { x: 2, y: 2 } },
      { atMs: 1_600, attacker: { x: 0, y: 0 }, target: { x: 11, y: 0 } },
      { atMs: 1_900, attacker: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
    ],
  });
  expect(fresh).toBe(11);

  const ranged = validateCommandAtIssue(
    valid({ action: 'attack_ranged', range: 10, distance: 1 }),
    {
      nowMs: clock.now(),
      issuedAtMs: 1_600,
      currentAttacker: { x: 0, y: 0 },
      currentTarget: { x: 1, y: 0 },
      samples: [{ atMs: 1_600, attacker: { x: 0, y: 0 }, target: { x: 11, y: 0 } }],
    },
  );
  expect(ranged).toEqual({ ok: false, code: 'range', cheatStrike: false });

  const later = manualClock(10_000);
  const staleSnapshot = validateCommandAtIssue(
    valid({ action: 'attack_ranged', range: 10, distance: 99 }),
    {
      nowMs: later.now(),
      issuedAtMs: 1_000,
      currentAttacker: { x: 0, y: 0 },
      currentTarget: { x: 2, y: 3 },
      samples: [{ atMs: 1_000, attacker: { x: 0, y: 0 }, target: { x: 11, y: 0 } }],
    },
  );
  expect(staleSnapshot).toEqual({ ok: true, value: { cheatStrike: false } });

  const edge = distanceAtIssue({
    nowMs: 1_000,
    issuedAtMs: 500,
    currentAttacker: { x: 0, y: 0 },
    currentTarget: { x: 9, y: 0 },
    samples: [{ atMs: 500, attacker: { x: 0, y: 0 }, target: { x: 4, y: 0 } }],
  });
  expect(edge).toBe(4);
});

test('future issuedAt and a burst of commands are not gateway rejects', () => {
  const clock = manualClock(5_000);
  for (let i = 0; i < 31; i += 1) {
    expect(codeOf(valid({ commandId: `burst-${String(i)}` }))).toBe('ok');
  }
  const ahead = parseClientCommand({
    commandId: 'ahead',
    seq: 1,
    issuedAtMs: clock.now() + 2_001,
    action: 'wait',
    params: { b: 1, a: 2 },
  });
  expect(ahead).not.toBeNull();
  if (ahead === null) {
    throw new Error('expected a parsed command');
  }
  const decision: CommandDecision = validateClientCommand(ahead, valid());
  expect(decision).toEqual({ ok: true, value: { cheatStrike: false } });
});

test('client command supplies action and commandId', () => {
  const clock = manualClock(1_700_000_000_000);
  const command = parseClientCommand({
    commandId: 'cmd-9',
    seq: 2,
    issuedAtMs: clock.now(),
    action: 'ability_3',
    targetId: 'mob-1',
    params: { z: false, a: 1 },
  });
  expect(command).not.toBeNull();
  if (command === null) {
    throw new Error('expected a parsed command');
  }
  expect(validateClientCommand(command, valid({ neuroshock: true }))).toEqual({
    ok: false,
    code: 'nn',
    cheatStrike: false,
  });
});
