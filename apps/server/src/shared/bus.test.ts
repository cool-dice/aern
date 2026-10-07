import { expect, test } from 'vitest';
import { createBus, type DomainEventMap } from './bus';
import { manualClock } from './clock';
import type { GameModule } from './module';

test('subscriber receives the payload and unsubscribe stops delivery', () => {
  const bus = createBus();
  const seen: DomainEventMap['character.created'][] = [];
  const unsubscribe = bus.on('character.created', (payload) => {
    seen.push(payload);
  });

  bus.emit('character.created', { characterId: 'c1' });
  unsubscribe();
  unsubscribe();
  bus.emit('character.created', { characterId: 'c2' });

  expect(seen).toEqual([{ characterId: 'c1' }]);
});

test('two modules registered through start exchange only an event', () => {
  const bus = createBus();
  const clock = manualClock(0);
  let hits = 0;

  const listener: GameModule = {
    name: 'listener',
    start(ctx) {
      expect(Object.keys(ctx).sort()).toEqual(['bus', 'now']);
      ctx.bus.on('combat.hit', () => {
        hits += 1;
      });
    },
  };

  const emitter: GameModule = {
    name: 'emitter',
    start(ctx) {
      expect(Object.keys(ctx).sort()).toEqual(['bus', 'now']);
      ctx.bus.emit('combat.hit', {
        attackerId: 'attacker',
        targetId: 'target',
        damage: 4,
      });
    },
  };

  listener.start({ bus, now: () => clock.now() });
  emitter.start({ bus, now: () => clock.now() });

  expect(hits).toBe(1);
});

test('manual clock starts at 1000 and advance 100 yields 1100', () => {
  const clock = manualClock(1000);
  expect(clock.now()).toBe(1000);
  clock.advance(100);
  expect(clock.now()).toBe(1100);
});

test('emit calls subscribers in subscription order and does not swallow errors', () => {
  const bus = createBus();
  const order: string[] = [];
  bus.on('item.crafted', () => {
    order.push('first');
  });
  bus.on('item.crafted', () => {
    order.push('second');
    throw new Error('handler failed');
  });
  bus.on('item.crafted', () => {
    order.push('third');
  });

  expect(() => bus.emit('item.crafted', { characterId: 'c', itemId: 'sword' })).toThrow(
    'handler failed',
  );
  expect(order).toEqual(['first', 'second']);
});

test('manual clock does not read Date.now after creation', () => {
  const clock = manualClock(1000);
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  try {
    clock.advance(100);
    expect(clock.now()).toBe(1100);
  } finally {
    Date.now = realNow;
  }
});

test('one unsubscribe removes a single registration of the same handler', () => {
  const bus = createBus();
  let count = 0;
  const handler = () => {
    count += 1;
  };
  const unsubscribe = bus.on('character.downed', handler);
  bus.on('character.downed', handler);

  bus.emit('character.downed', { characterId: 'c' });
  expect(count).toBe(2);

  unsubscribe();
  bus.emit('character.downed', { characterId: 'c' });
  expect(count).toBe(3);
});
