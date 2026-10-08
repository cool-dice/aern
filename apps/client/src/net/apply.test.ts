import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SelfState } from '../state/store';
import { createClientStore } from '../state/store';
import { expect, test } from 'vitest';
import { createClientNet } from './apply';
import { createMemorySocket, sign } from './queue';

const sessionKeyHex = '00112233445566778899aabbccddeeff';

function self(overrides: Partial<SelfState> = {}): SelfState {
  return {
    id: 'char-1',
    hp: 12,
    maxHp: 20,
    od: 4,
    odLimit: 6,
    cell: { x: 0, y: 0 },
    facing: 'n',
    phase: 'online',
    level: 1,
    gold: 100,
    ...overrides,
  };
}

function online(
  movement: { reaction: number; inCombat: boolean } = { reaction: 10, inCombat: true },
) {
  const store = createClientStore();
  const socket = createMemorySocket();
  let id = 0;
  const net = createClientNet({
    store,
    sessionKeyHex,
    socket,
    movement,
    commandId: () => {
      id += 1;
      return `cmd-${id}`;
    },
  });
  return { store, socket, net, movement };
}

test('a local step predicts through setPredicted and leaves server hp and cell', () => {
  const { store, socket, net } = online();
  net.ingest(
    {
      self: self(),
      entities: [{ id: 'mob-1', cell: { x: 3, y: 3 } }],
      inventory: [{ id: 'rusty_sword' }],
    },
    0,
  );
  const envelope = net.send('step_n', 10);

  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().self?.cell).toEqual({ x: 0, y: 0 });
  expect(store.getState().predictedCell).toEqual({ x: 0, y: -1 });
  expect(store.getState().predictedSteps).toEqual([
    { seq: 1, dir: 'n', atMs: 10, cell: { x: 0, y: -1 } },
  ]);
  expect(envelope.command.seq).toBe(1);
  expect(envelope.signature).toHaveLength(64);
  expect(socket.sent).toHaveLength(1);
  const raw = socket.sent[0] ?? '';
  const parsed = JSON.parse(raw) as { signature: string; command: typeof envelope.command };
  expect(parsed.signature).toBe(sign(parsed.command, sessionKeyHex));
  expect(parsed.signature).toMatch(/^[0-9a-f]{64}$/);
});

test('an attack does not change hp or the prediction buffer', () => {
  const { store, net } = online();
  net.ingest({ self: self({ hp: 12 }) }, 0);
  net.send('step_n', 10);
  net.send('attack_melee', 20, { targetId: 'mob-1' });

  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().self?.cell).toEqual({ x: 0, y: 0 });
  expect(store.getState().predictedSteps).toEqual([
    { seq: 1, dir: 'n', atMs: 10, cell: { x: 0, y: -1 } },
  ]);
  expect(net.queue.lastSeq).toBe(2);
});

test('a snapshot replaces self, entities, and inventory, then reconciles fresh steps', () => {
  const { store, net } = online();
  net.ingest({ self: self({ gold: 100, hp: 12 }) }, 0);
  net.send('step_n', 10);

  net.ingest(
    {
      self: self({ gold: 40, hp: 12, cell: { x: 0, y: 0 } }),
      entities: [{ id: 'mob-2', cell: { x: 4, y: 1 } }],
      inventory: [{ id: 'bandage', qty: 2 }],
    },
    40,
  );

  expect(store.getState().self?.gold).toBe(40);
  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().self?.cell).toEqual({ x: 0, y: 0 });
  expect(store.getState().predictedCell).toEqual({ x: 0, y: -1 });
  expect(store.getState().entities['mob-2']?.cell).toEqual({ x: 4, y: 1 });
  expect(store.getState().inventory).toEqual([{ id: 'bandage', qty: 2 }]);

  net.ingest({ self: self({ hp: 9, od: 3, cell: { x: 0, y: -1 } }) }, 50);
  expect(store.getState().self?.hp).toBe(9);
  expect(store.getState().self?.cell).toEqual({ x: 0, y: -1 });
  expect(store.getState().predictedCell).toBeNull();
  expect(store.getState().predictedSteps).toEqual([]);
});

test('a server cell that matches an earlier step keeps the later ones', () => {
  const { store, net } = online();
  net.ingest({ self: self({ od: 4 }) }, 0);
  net.send('step_n', 10);
  net.send('step_e', 20);
  expect(store.getState().predictedCell).toEqual({ x: 1, y: -1 });

  net.ingest({ self: self({ od: 3, cell: { x: 0, y: -1 } }) }, 30);
  expect(store.getState().self?.cell).toEqual({ x: 0, y: -1 });
  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().predictedCell).toEqual({ x: 1, y: -1 });
  expect(store.getState().predictedSteps.map((step) => step.seq)).toEqual([2]);
});

test('a round trip that returns to the server cell stays pending until the cell changes', () => {
  const { store, net } = online();
  net.ingest({ self: self({ od: 4 }) }, 0);
  net.send('step_n', 10);
  net.send('step_s', 20);
  expect(store.getState().predictedCell).toEqual({ x: 0, y: 0 });

  net.ingest({ self: self({ od: 4, cell: { x: 0, y: 0 } }) }, 30);
  expect(store.getState().predictedSteps.map((step) => step.seq)).toEqual([1, 2]);
  expect(store.getState().predictedCell).toEqual({ x: 0, y: 0 });
  expect(store.getState().self?.cell).toEqual({ x: 0, y: 0 });
});

test('a divergent server cell is the base for fresh steps, and stale steps are dropped', () => {
  const { store, net } = online();
  net.ingest({ self: self() }, 0);
  net.send('step_n', 10);
  net.ingest({ self: self({ cell: { x: 5, y: 5 }, hp: 12 }) }, 20);
  expect(store.getState().self?.cell).toEqual({ x: 5, y: 5 });
  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().predictedCell).toEqual({ x: 5, y: 4 });

  net.ingest({ self: self({ cell: { x: 5, y: 5 } }) }, 10 + 501);
  expect(store.getState().predictedCell).toBeNull();
  expect(store.getState().predictedSteps).toEqual([]);
});

test('two stores do not share prediction', () => {
  const first = online();
  const second = online();
  first.net.ingest({ self: self() }, 0);
  first.net.send('step_e', 5);
  expect(first.store.getState().predictedCell).toEqual({ x: 1, y: 0 });
  expect(second.store.getState().self).toBeNull();
  expect(second.store.getState().predictedCell).toBeNull();
});

test('the snapshot payload is the state body, not a server envelope', () => {
  const { store, net } = online();
  net.ingest(
    {
      channel: 'state',
      serverTick: 1,
      sentAtMs: 1,
      payload: { self: self({ hp: 3 }) },
    },
    0,
  );
  expect(store.getState().self).toBeNull();
});

test('close marks the socket closed and the store disconnected', () => {
  const { store, socket, net } = online();
  store.getState().setConnected(true);
  net.close();
  expect(socket.closed).toBe(true);
  expect(store.getState().connected).toBe(false);
});

test('net sources do not open a websocket', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  );
  expect(files.length).toBeGreaterThan(0);
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8');
    expect(source).not.toMatch(/new WebSocket/);
    expect(source).not.toMatch(/\.listen\(/);
    expect(source).not.toMatch(/from 'ws'/);
  }
});
