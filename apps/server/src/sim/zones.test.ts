import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { combatZone } from './zones';
import type { Geography } from './travel';

const geography: Geography = {
  barrierDown: false,
  nodes: [
    { id: 'fort_humans', x: 0, y: 0, kind: 'city', safe: true, side: 'light', regionId: 'plains' },
    { id: 'edge_light', x: 10, y: 0, kind: 'dungeon', safe: false, side: 'light', regionId: 'plains' },
  ],
  edges: [],
};

test('cities stay safe until a war or an invasion wave, and the encounter is open', () => {
  expect(combatZone({ geography, nodeId: 'fort_humans' })).toEqual({ safeZone: true, pvpOpen: false });
  expect(combatZone({ geography, nodeId: 'fort_humans', warCities: ['fort_humans'] })).toEqual({
    safeZone: true,
    pvpOpen: true,
  });
  expect(combatZone({ geography, nodeId: 'fort_humans', invasion: 'prepare' })).toEqual({
    safeZone: true,
    pvpOpen: false,
  });
  expect(combatZone({ geography, nodeId: 'fort_humans', invasion: 'wave1' })).toEqual({
    safeZone: true,
    pvpOpen: true,
  });
  expect(combatZone({ geography, nodeId: 'edge_light' })).toEqual({ safeZone: false, pvpOpen: true });
  expect(combatZone({ geography, nodeId: 'fort_humans', inEncounter: true })).toEqual({
    safeZone: false,
    pvpOpen: true,
  });
  expect(combatZone({})).toBeNull();
});

test('the tick calls combatZone and compose calls presence removal and corpse creation', () => {
  const tick = readFileSync(new URL('./tick.ts', import.meta.url), 'utf8');
  const compose = readFileSync(new URL('../compose.ts', import.meta.url), 'utf8');
  expect(tick.includes('combatZone(')).toBe(true);
  expect(compose.includes('createCorpse(')).toBe(true);
  const closeAt = compose.indexOf("socket.on('close'");
  expect(closeAt).toBeGreaterThan(0);
  expect(compose.slice(closeAt, closeAt + 400).includes('onCarrierOffline(')).toBe(true);
});
