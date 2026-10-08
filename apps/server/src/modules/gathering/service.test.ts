import { mulberry32 } from '@rift/domain/rng';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { createGatheringService } from './service';

test('gather rolls a stack, then the node waits out its respawn', () => {
  const bus = createBus();
  const events: string[] = [];
  bus.on('gather.completed', (payload) => {
    events.push(payload.nodeId);
  });
  const service = createGatheringService(mulberry32(3), bus);
  const first = service.gather({
    characterId: 'lia',
    nodeId: 'mine_metal',
    nowMs: 1_000,
    technique: 5,
    tool: 'basic',
    toolKind: 'pick',
    durability: 10,
  });
  expect(first.ok).toBe(true);
  if (first.ok) {
    expect(first.value.playerQty).toBeGreaterThan(0);
    expect(first.value.durability).toBe(9);
    expect(first.value.respawnAtMs).toBeGreaterThan(1_000);
  }
  const early = service.gather({
    characterId: 'lia',
    nodeId: 'mine_metal',
    nowMs: 1_001,
    technique: 5,
    tool: 'basic',
    toolKind: 'pick',
    durability: 9,
  });
  expect(early).toEqual({ ok: false, code: 'respawn' });
  expect(events).toEqual(['mine_metal']);
});
