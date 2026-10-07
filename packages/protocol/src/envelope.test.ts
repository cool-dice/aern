import { expect, test } from 'vitest';
import {
  CHANNELS,
  COMMAND_RATE_LIMIT,
  COMMAND_RATE_WINDOW_MS,
  COMMAND_STALE_WINDOW_MS,
  REJECT_CODES,
  canonicalCommand,
  isChannel,
  parseClientCommand,
  type ClientCommand,
} from './index';

const commandId = '11111111-1111-4111-8111-111111111111';

function minimal(overrides: Partial<ClientCommand> = {}): ClientCommand {
  return {
    commandId,
    seq: 1,
    issuedAtMs: 1_700_000_000_000,
    action: 'step_n',
    params: {},
    ...overrides,
  };
}

test('CHANNELS lists the six JSON channels', () => {
  expect(CHANNELS).toEqual(['state', 'command', 'chat', 'market', 'social', 'system']);
  expect(isChannel('command')).toBe(true);
  expect(isChannel('inventory')).toBe(false);
});

test('rate and stale windows are the gateway constants', () => {
  expect(COMMAND_RATE_LIMIT).toBe(30);
  expect(COMMAND_RATE_WINDOW_MS).toBe(1000);
  expect(COMMAND_STALE_WINDOW_MS).toBe(5000);
  expect(REJECT_CODES).toEqual([
    'bad_signature',
    'duplicate',
    'stale',
    'rate_limited',
    'invalid',
    'feature_stub',
  ]);
});

test('canonicalCommand is stable when input key order differs', () => {
  const reversed = {
    params: { z: false, b: 1, a: 'x' },
    targetId: 'mob-1',
    action: 'attack_melee',
    issuedAtMs: 1_700_000_000_000,
    seq: 4,
    commandId,
  };
  const ordered = minimal({
    seq: 4,
    action: 'attack_melee',
    targetId: 'mob-1',
    params: { a: 'x', b: 1, z: false },
  });

  const canonical = canonicalCommand(reversed);
  expect(canonical).toBe(canonicalCommand(ordered));
  expect(canonical).toBe(
    '{"commandId":"11111111-1111-4111-8111-111111111111","seq":4,"issuedAtMs":1700000000000,"action":"attack_melee","targetId":"mob-1","params":{"a":"x","b":1,"z":false}}',
  );
  expect(canonical.includes(' ')).toBe(false);
});

test('params keys are sorted lexicographically', () => {
  const canonical = canonicalCommand(minimal({ params: { b: 1, a: 2 } }));
  expect(canonical).toContain('"params":{"a":2,"b":1}');
  expect(canonical.indexOf('"a"')).toBeLessThan(canonical.indexOf('"b"'));
});

test('canonicalCommand omits targetId when the field is absent', () => {
  const canonical = canonicalCommand(minimal());
  expect(canonical).toBe(
    '{"commandId":"11111111-1111-4111-8111-111111111111","seq":1,"issuedAtMs":1700000000000,"action":"step_n","params":{}}',
  );
  expect(canonical.includes('targetId')).toBe(false);
});

test('parseClientCommand accepts a minimal command without targetId', () => {
  const parsed = parseClientCommand({
    action: 'step_n',
    params: { flag: true, note: null, n: 0 },
    issuedAtMs: 50,
    seq: 1,
    commandId: 'abc',
  });
  expect(parsed).toEqual({
    commandId: 'abc',
    seq: 1,
    issuedAtMs: 50,
    action: 'step_n',
    params: { flag: true, note: null, n: 0 },
  });
  expect(parsed && Object.hasOwn(parsed, 'targetId')).toBe(false);
});

test('parseClientCommand keeps targetId and drops unknown fields', () => {
  const parsed = parseClientCommand({
    commandId: 'abc',
    seq: 2,
    issuedAtMs: 10,
    action: 'use_item',
    targetId: 'item-1',
    extra: 1,
    params: { b: 1, a: 2 },
  });
  expect(parsed).toEqual({
    commandId: 'abc',
    seq: 2,
    issuedAtMs: 10,
    action: 'use_item',
    targetId: 'item-1',
    params: { b: 1, a: 2 },
  });
  expect(canonicalCommand(parsed!)).toBe(
    '{"commandId":"abc","seq":2,"issuedAtMs":10,"action":"use_item","targetId":"item-1","params":{"a":2,"b":1}}',
  );
});

test('parseClientCommand rejects a nested object in params', () => {
  expect(
    parseClientCommand({
      commandId: 'abc',
      seq: 1,
      issuedAtMs: 10,
      action: 'step_n',
      params: { nested: { a: 1 } },
    }),
  ).toBeNull();
});

test('parseClientCommand rejects a fractional seq', () => {
  expect(
    parseClientCommand({
      commandId: 'abc',
      seq: 1.5,
      issuedAtMs: 10,
      action: 'step_n',
      params: {},
    }),
  ).toBeNull();
});

test('parseClientCommand rejects an empty action', () => {
  expect(
    parseClientCommand({
      commandId: 'abc',
      seq: 1,
      issuedAtMs: 10,
      action: '',
      params: {},
    }),
  ).toBeNull();
});

test('parseClientCommand rejects missing ids, bad actions, and non-flat params', () => {
  const base = {
    commandId: 'abc',
    seq: 1,
    issuedAtMs: 10,
    action: 'step_n',
    params: {},
  };
  expect(parseClientCommand(null)).toBeNull();
  expect(parseClientCommand({ ...base, commandId: '' })).toBeNull();
  expect(parseClientCommand({ ...base, commandId: 1 })).toBeNull();
  expect(parseClientCommand({ ...base, seq: 0 })).toBeNull();
  expect(parseClientCommand({ ...base, seq: '1' })).toBeNull();
  expect(parseClientCommand({ ...base, issuedAtMs: '10' })).toBeNull();
  expect(parseClientCommand({ ...base, action: 'Step' })).toBeNull();
  expect(parseClientCommand({ ...base, action: 'a'.repeat(65) })).toBeNull();
  expect(parseClientCommand({ ...base, params: [] })).toBeNull();
  expect(parseClientCommand({ ...base, params: { list: [1] } })).toBeNull();
  expect(parseClientCommand({ ...base, targetId: '' })).toBeNull();
  expect(parseClientCommand({ ...base, action: 'a'.repeat(64) })?.action).toBe('a'.repeat(64));
});
