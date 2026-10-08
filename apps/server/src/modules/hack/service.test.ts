import { LOCKOUT_MS } from '@rift/domain/hack';
import { mulberry32 } from '@rift/domain/rng';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { createHackService } from './service';

test('a deck is required and three misses lock the door', () => {
  const bus = createBus();
  const opened: string[] = [];
  bus.on('hack.opened', (payload) => {
    opened.push(payload.characterId);
  });
  const service = createHackService(mulberry32(1), bus);
  expect(
    service.start({ characterId: 'lia', kind: 'guard', technique: 0, hasDeck: false, nowMs: 0 }),
  ).toEqual({ ok: false, code: 'deck' });

  const started = service.start({
    characterId: 'lia',
    kind: 'guard',
    technique: 10,
    hasDeck: true,
    nowMs: 0,
  });
  expect(started).toEqual({ ok: true, value: { attemptsLeft: 3, difficulty: 15 } });

  const probe = createHackService(mulberry32(1), bus);
  probe.start({ characterId: 'lia', kind: 'patrol', technique: 0, hasDeck: true, nowMs: 0 });
  const password = passwordOf(mulberry32(1));
  expect(probe.guess({ characterId: 'lia', attempt: password, nowMs: 1 })).toMatchObject({
    ok: true,
    value: { correct: true, bulls: 4 },
  });
  expect(opened).toEqual(['lia']);

  const locked = createHackService(mulberry32(2), bus);
  locked.start({ characterId: 'lia', kind: 'patrol', technique: 0, hasDeck: true, nowMs: 0 });
  expect(locked.guess({ characterId: 'lia', attempt: 'ZZZZ', nowMs: 1 }).ok).toBe(true);
  expect(locked.guess({ characterId: 'lia', attempt: 'YYYY', nowMs: 2 }).ok).toBe(true);
  expect(locked.guess({ characterId: 'lia', attempt: 'XXXX', nowMs: 3 })).toEqual({
    ok: false,
    code: 'lockout',
  });
  expect(
    locked.start({ characterId: 'lia', kind: 'patrol', technique: 0, hasDeck: true, nowMs: 4 }),
  ).toEqual({ ok: false, code: 'lockout' });
  const later = locked.start({
    characterId: 'lia',
    kind: 'patrol',
    technique: 0,
    hasDeck: true,
    nowMs: 3 + LOCKOUT_MS,
  });
  expect(later.ok).toBe(true);
});

function passwordOf(rng: { nextInt(max: number): number }): string {
  const alphabet = 'ABCDEFGH';
  let password = '';
  for (let i = 0; i < 4; i += 1) {
    password += alphabet[rng.nextInt(8)] ?? '';
  }
  return password;
}
