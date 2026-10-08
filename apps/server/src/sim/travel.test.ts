import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { edgeStep, edgeTravel, neighborStep, type Geography } from './travel';

const geography: Geography = {
  barrierDown: false,
  nodes: [
    { id: 'fort_humans', x: 0, y: 0, kind: 'city', safe: true, side: 'light', regionId: 'plains' },
    { id: 'edge_light', x: 10, y: 0, kind: 'dungeon', safe: false, side: 'light', regionId: 'plains' },
    { id: 'plains_mine', x: 0, y: 10, kind: 'resource', safe: false, side: 'light', regionId: 'plains' },
    { id: 'plains_grove', x: 0, y: -10, kind: 'resource', safe: false, side: 'light', regionId: 'plains' },
    { id: 'primordial_outer', x: 60, y: 0, kind: 'primordial', safe: false, side: 'center', regionId: 'primordial' },
    { id: 'approach_light', x: 40, y: 20, kind: 'dungeon', safe: false, side: 'light', regionId: 'primordial' },
  ],
  edges: [
    { id: 'a', a: 'fort_humans', b: 'edge_light', length: 10 },
    { id: 'b', a: 'fort_humans', b: 'plains_mine', length: 10 },
    { id: 'c', a: 'fort_humans', b: 'plains_grove', length: 10 },
    { id: 'd', a: 'approach_light', b: 'primordial_outer', length: 20 },
  ],
};

test('stepTick calls neighborStep and edgeStep so a graph step uses edge length', () => {
  const source = readFileSync(new URL('./tick.ts', import.meta.url), 'utf8');
  expect(source.includes('neighborStep(')).toBe(true);
  expect(source.includes('edgeLength(')).toBe(true);
  expect(source.includes('edgeStep(')).toBe(true);
});

test('edge length spends one step of OD per action and takes that many ticks', () => {
  expect(edgeTravel({ length: 10, cellsPerAction: 1, running: false })).toEqual({ od: 10, travelMs: 1_000 });
  expect(edgeTravel({ length: 10, cellsPerAction: 4, running: true })).toEqual({ od: 9, travelMs: 300 });
  expect(edgeStep({ remaining: 10, cellsPerAction: 1, running: false, od: 10 })).toEqual({
    ok: true,
    remaining: 9,
    od: 9,
    spent: 1,
  });
  expect(edgeStep({ remaining: 10, cellsPerAction: 1, running: false, od: 0 })).toEqual({ ok: false, code: 'od' });
});

test('a step follows the edge in that direction and refuses a missing path', () => {
  expect(neighborStep({ geography, fromId: 'fort_humans', dir: 'e' })).toEqual({
    ok: true,
    value: { nodeId: 'edge_light', cell: { x: 10, y: 0 } },
  });
  expect(neighborStep({ geography, fromId: 'fort_humans', dir: 'n' })).toEqual({
    ok: true,
    value: { nodeId: 'plains_grove', cell: { x: 0, y: -10 } },
  });
  expect(neighborStep({ geography, fromId: 'fort_humans', dir: 'nw' })).toEqual({
    ok: false,
    code: 'no_edge',
  });
});

test('an explicit neighbor is the path, and a ring stays shut until the barrier falls', () => {
  expect(neighborStep({ geography, fromId: 'fort_humans', dir: 's', to: 'plains_mine' })).toEqual({
    ok: true,
    value: { nodeId: 'plains_mine', cell: { x: 0, y: 10 } },
  });
  expect(neighborStep({ geography, fromId: 'fort_humans', dir: 'e', to: 'primordial_outer' })).toEqual({
    ok: false,
    code: 'no_edge',
  });
  expect(neighborStep({ geography, fromId: 'approach_light', dir: 'e', to: 'primordial_outer' })).toEqual({
    ok: false,
    code: 'barrier',
  });
  expect(
    neighborStep({
      geography: { ...geography, barrierDown: true },
      fromId: 'approach_light',
      dir: 'e',
      to: 'primordial_outer',
    }),
  ).toEqual({ ok: true, value: { nodeId: 'primordial_outer', cell: { x: 60, y: 0 } } });
});
