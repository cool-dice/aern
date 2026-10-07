import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createClientStore, type SelfState } from './store';

function self(overrides: Partial<SelfState> = {}): SelfState {
  return {
    id: 'char-1',
    hp: 20,
    maxHp: 20,
    od: 4,
    odLimit: 6,
    cell: { x: 2, y: 3 },
    facing: 'n',
    phase: 'online',
    level: 1,
    gold: 100,
    ...overrides,
  };
}

test('snapshot replaces gold and cell', () => {
  const store = createClientStore();
  store.getState().applySnapshot({ self: self() });
  expect(store.getState().self?.gold).toBe(100);
  expect(store.getState().self?.cell).toEqual({ x: 2, y: 3 });

  store.getState().applySnapshot({
    self: self({ gold: 40, cell: { x: 8, y: 1 } }),
  });
  expect(store.getState().self?.gold).toBe(40);
  expect(store.getState().self?.cell).toEqual({ x: 8, y: 1 });
  expect(store.getState().self?.hp).toBe(20);
});

test('pushLog keeps the last 20 lines', () => {
  const store = createClientStore();
  for (let i = 1; i <= 25; i += 1) {
    store.getState().pushLog(`line-${i}`);
  }
  const log = store.getState().log;
  expect(log).toHaveLength(20);
  expect(log[0]).toBe('line-6');
  expect(log[log.length - 1]).toBe('line-25');
});

test('setConnected false clears the flag', () => {
  const store = createClientStore();
  expect(store.getState().connected).toBe(false);
  store.getState().setConnected(true);
  expect(store.getState().connected).toBe(true);
  store.getState().setConnected(false);
  expect(store.getState().connected).toBe(false);
});

test('snapshot without self leaves self null and does not throw', () => {
  const store = createClientStore();
  store.getState().applySnapshot({ self: self({ gold: 7 }) });
  expect(() => store.getState().applySnapshot({ entities: [] })).not.toThrow();
  expect(store.getState().self).toBeNull();
  expect(() => store.getState().applySnapshot(null)).not.toThrow();
  expect(() => store.getState().applySnapshot('nope')).not.toThrow();
  expect(() => store.getState().applySnapshot(3)).not.toThrow();
  expect(store.getState().self).toBeNull();
});

test('hp 0 keeps the snapshot phase', () => {
  const store = createClientStore();
  store.getState().applySnapshot({
    self: self({ hp: 0, phase: 'online' }),
  });
  expect(store.getState().self?.hp).toBe(0);
  expect(store.getState().self?.phase).toBe('online');
});

test('predicted steps do not overwrite hp and survive a snapshot', () => {
  const store = createClientStore();
  store.getState().applySnapshot({ self: self({ hp: 12, cell: { x: 1, y: 1 } }) });
  store.getState().setConnected(true);
  store.getState().pushLog('kept');
  store.getState().setPredicted({
    cell: { x: 4, y: 1 },
    steps: [{ seq: 1, dir: 'e', atMs: 50, cell: { x: 4, y: 1 } }],
  });

  expect(store.getState().self?.hp).toBe(12);
  expect(store.getState().self?.cell).toEqual({ x: 1, y: 1 });
  expect(store.getState().predictedCell).toEqual({ x: 4, y: 1 });
  expect(store.getState().predictedSteps).toEqual([
    { seq: 1, dir: 'e', atMs: 50, cell: { x: 4, y: 1 } },
  ]);

  store.getState().applySnapshot({
    self: self({ hp: 0, phase: 'downed', cell: { x: 1, y: 1 } }),
    entities: [{ id: 'mob-1', cell: { x: 3, y: 3 } }],
    inventory: [{ id: 'rusty_sword', equipped: true }],
  });

  expect(store.getState().self?.hp).toBe(0);
  expect(store.getState().self?.phase).toBe('downed');
  expect(store.getState().self?.cell).toEqual({ x: 1, y: 1 });
  expect(store.getState().predictedCell).toEqual({ x: 4, y: 1 });
  expect(store.getState().predictedSteps).toHaveLength(1);
  expect(store.getState().entities['mob-1']?.cell).toEqual({ x: 3, y: 3 });
  expect(store.getState().inventory).toEqual([{ id: 'rusty_sword', equipped: true }]);
  expect(store.getState().connected).toBe(true);
  expect(store.getState().log).toEqual(['kept']);
});

test('a later snapshot replaces entities', () => {
  const store = createClientStore();
  store.getState().applySnapshot({
    self: self(),
    entities: {
      a: { id: 'a', cell: { x: 0, y: 0 } },
    },
  });
  store.getState().applySnapshot({
    self: self(),
    entities: [{ id: 'b', cell: { x: 1, y: 0 } }],
  });
  expect(store.getState().entities['a']).toBeUndefined();
  expect(store.getState().entities['b']?.cell).toEqual({ x: 1, y: 0 });
});

test('state module does not import pixi or react-dom', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'store.ts'), 'utf8');
  expect(source).not.toMatch(/pixi/i);
  expect(source).not.toMatch(/react-dom/);
});
