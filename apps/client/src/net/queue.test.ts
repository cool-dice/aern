import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_STALE_WINDOW_MS, canonicalCommand, type ClientCommand } from '@rift/protocol';
import { expect, test } from 'vitest';
import {
  createMemorySocket,
  createOutboundQueue,
  createSeq,
  enqueue,
  isCommandStale,
  sendEnvelope,
  sign,
} from './queue';

const sessionKeyHex = '00112233445566778899aabbccddeeff';

function command(overrides: Partial<ClientCommand> = {}): ClientCommand {
  return {
    commandId: '11111111-1111-4111-8111-111111111111',
    seq: 1,
    issuedAtMs: 1_700_000_000_000,
    action: 'step_n',
    params: { z: false, a: 'x' },
    ...overrides,
  };
}

test('sign is HMAC-SHA256 of the protocol canonical command and enqueue is 64 hex chars', () => {
  const issued = command();
  const expected = createHmac('sha256', Buffer.from(sessionKeyHex, 'hex'))
    .update(canonicalCommand(issued), 'utf8')
    .digest('hex');

  expect(sign(issued, sessionKeyHex)).toBe(expected);
  expect(expected).toMatch(/^[0-9a-f]{64}$/);

  const reversed = command({ params: { a: 'x', z: false } });
  expect(sign(reversed, sessionKeyHex)).toBe(expected);
  expect(canonicalCommand(issued)).toBe(canonicalCommand(reversed));

  const envelope = enqueue(issued, sessionKeyHex);
  expect(envelope.channel).toBe('command');
  expect(envelope.signature).toBe(expected);
  expect(envelope.signature).toHaveLength(64);
  expect(envelope.command.action).toBe('step_n');
  expect(sign({ ...issued, seq: 2 }, sessionKeyHex)).not.toBe(expected);
});

test('seq starts at 1 and a duplicate is not accepted', () => {
  const seq = createSeq();
  expect(seq.next()).toBe(1);
  expect(seq.next()).toBe(2);

  const queue = createOutboundQueue(sessionKeyHex);
  const first = queue.issue(command({ seq: 99 }));
  const second = queue.issue(command({ seq: 99 }));
  expect(first.command.seq).toBe(1);
  expect(second.command.seq).toBe(2);
  expect(queue.accept(command({ seq: 2 }))).toBeNull();
  expect(queue.accept(command({ seq: 3 }))?.command.seq).toBe(3);
  expect(queue.lastSeq).toBe(3);
});

test('stale commands use the protocol 5000 ms window', () => {
  expect(COMMAND_STALE_WINDOW_MS).toBe(5000);
  expect(isCommandStale(1_000, 1_000 + COMMAND_STALE_WINDOW_MS)).toBe(false);
  expect(isCommandStale(1_000, 1_000 + COMMAND_STALE_WINDOW_MS + 1)).toBe(true);
});

test('a memory socket records one payload and does not listen', () => {
  const socket = createMemorySocket();
  const envelope = enqueue(command(), sessionKeyHex);
  sendEnvelope(socket, envelope);
  expect(socket.sent).toEqual([JSON.stringify(envelope)]);
  expect(socket.closed).toBe(false);
  socket.close();
  expect(socket.closed).toBe(true);
  sendEnvelope(socket, envelope);
  expect(socket.sent).toHaveLength(1);

  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'queue.ts'), 'utf8');
  expect(source).not.toMatch(/new WebSocket/);
  expect(source).not.toMatch(/\.listen\(/);
});
