import { expect, test } from 'vitest';
import { encodeRequest, spawnMockSidecar } from './sidecar';

test('the mock sidecar speaks the JSON ping protocol', () => {
  const sidecar = spawnMockSidecar();
  expect(sidecar.command).toContain('cargo run');
  expect(sidecar.ping).toBe('{"type":"ping"}');
  expect(JSON.parse(sidecar.pong)).toEqual({ type: 'pong' });
  const request = JSON.parse(encodeRequest([0.25, 2])) as { type: string; observation: number[] };
  expect(request.type).toBe('encode');
  expect(request.observation).toEqual([0.25, 2]);
});
