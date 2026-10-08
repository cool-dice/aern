import { expect, test } from 'vitest';
import { encodeRequest, spawnMockSidecar } from './sidecar';

test('the mock sidecar speaks the JSON ping protocol', () => {
  const sidecar = spawnMockSidecar();
  expect(sidecar.command).toContain('cargo run');
  expect(sidecar.ping).toBe('{"type":"ping"}');
  expect(JSON.parse(sidecar.pong)).toEqual({ type: 'pong' });
  expect(sidecar.started).toBe(false);
  const request = JSON.parse(encodeRequest([0.25, 2])) as { type: string; observation: number[] };
  expect(request.type).toBe('encode');
  expect(request.observation).toEqual([0.25, 2]);
});

test('the mock sidecar answers an observation with an action', async () => {
  let action = '';
  const sidecar = spawnMockSidecar({
    start: true,
    onAction(next) {
      action = next;
    },
  });
  try {
    expect(sidecar.error).toBeNull();
    const observation = new Array<number>(896).fill(0);
    observation[0] = 1;
    sidecar.observe(observation);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(action).toBe('step_n');
  } finally {
    sidecar.stop();
  }
});

test('spawnMockSidecar starts the in-repo mock when the script exists', async () => {
  let pong = false;
  const sidecar = spawnMockSidecar({
    start: true,
    onPong() {
      pong = true;
    },
  });
  try {
    expect(sidecar.error).toBeNull();
    expect(sidecar.started).toBe(true);
    expect(sidecar.pid).toBeTypeOf('number');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pong).toBe(true);
  } finally {
    sidecar.stop();
  }
});
