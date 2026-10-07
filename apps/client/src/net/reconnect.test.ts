import { expect, test } from 'vitest';
import { createReconnectAttempts, nextDelay } from './reconnect';

test('reconnect delays are 200, 400, 800, 1600, then 3000', () => {
  expect(nextDelay(1)).toBe(200);
  expect(nextDelay(2)).toBe(400);
  expect(nextDelay(3)).toBe(800);
  expect(nextDelay(4)).toBe(1600);
  expect(nextDelay(5)).toBe(3000);
  expect(nextDelay(6)).toBe(3000);
  expect(nextDelay(7)).toBe(3000);
});

test('a successful connect resets the attempt counter', () => {
  const reconnect = createReconnectAttempts();
  expect(reconnect.attempt).toBe(0);
  expect(reconnect.fail()).toBe(200);
  expect(reconnect.fail()).toBe(400);
  expect(reconnect.attempt).toBe(2);
  reconnect.succeed();
  expect(reconnect.attempt).toBe(0);
  expect(reconnect.fail()).toBe(200);
});
