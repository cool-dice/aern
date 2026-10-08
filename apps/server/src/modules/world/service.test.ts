import { PROTOTYPE_NODE_IDS } from '@rift/domain/world';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createWorldModule } from './index';
import { createWorldService } from './service';

test('graph is the prototype and zone side lives on the node', () => {
  const world = createWorldService();
  const { nodes, edges } = world.graph();

  expect(nodes.map((node) => node.id)).toEqual([...PROTOTYPE_NODE_IDS]);
  expect(edges.length).toBeGreaterThan(0);

  const fort = nodes.find((node) => node.id === 'fort_humans');
  const hub = nodes.find((node) => node.id === 'cross_light');
  expect(fort).toMatchObject({ kind: 'city', safe: true, side: 'light' });
  expect(hub).toMatchObject({ kind: 'hub', safe: false, side: 'light' });
  expect(nodes.some((node) => 'characterSide' in node)).toBe(false);
});

test('walk rejects a missing edge and a closed barrier', () => {
  const world = createWorldService();

  expect(world.walk('fort_humans', 'missing_node', false)).toEqual({ ok: false, code: 'no_edge' });
  expect(world.walk('fort_humans', 'barrier_gate', false)).toEqual({ ok: false, code: 'no_edge' });
  expect(world.walk('cross_light', 'barrier_gate', false)).toEqual({ ok: false, code: 'barrier' });
  expect(world.walk('barrier_gate', 'cross_light', false)).toEqual({ ok: false, code: 'barrier' });
  expect(world.walk('cross_light', 'barrier_gate', true)).toEqual({ ok: true, value: 'ok' });
  expect(world.walk('fort_humans', 'edge_light', false)).toEqual({ ok: true, value: 'ok' });
  expect(world.walk('edge_light', 'fort_humans', true)).toEqual({ ok: true, value: 'ok' });
});

test('world module starts from the bus clock and does not listen', () => {
  const bus = createBus();
  const clock = manualClock(1_000);
  const world = createWorldModule();

  world.start({ bus, now: () => clock.now() });

  expect(world.name).toBe('world');
  expect(world.service.walk('fort_humans', 'missing_node', false)).toEqual({
    ok: false,
    code: 'no_edge',
  });
  clock.advance(100);
  expect(clock.now()).toBe(1_100);
});
