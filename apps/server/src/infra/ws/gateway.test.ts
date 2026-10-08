import { createHmac } from 'node:crypto';
import { canonicalCommand, type ClientCommand, type ServerMessage } from '@rift/protocol';
import { expect, test } from 'vitest';
import { manualClock } from '../../shared/clock';
import { MemoryAuthRepository } from '../../modules/auth/repository';
import { createAuthService } from '../../modules/auth/service';
import type { ValidateInput } from '../../sim/validate';
import {
  COMMAND_FUTURE_SKEW_MS,
  RESUME_LIMIT,
  bindSocket,
  broadcastState,
  createResumeLog,
  handleMessage,
  type GatewayCtx,
  type GatewaySocket,
  type HandleResult,
} from './gateway';
import { signCommand } from './hmac';

const PASSWORD = 'hunter2-secret';
const JWT_SECRET = 'test-jwt-secret';
const NOW = 1_700_000_000_000;

function command(
  n: number,
  issuedAtMs: number,
  overrides: Partial<ClientCommand> = {},
): ClientCommand {
  return {
    commandId: `cmd-${n}`,
    seq: n,
    issuedAtMs,
    action: 'wait',
    params: {},
    ...overrides,
  };
}

function permissive(seen: Set<string>): Omit<ValidateInput, 'action' | 'commandId'> {
  return {
    seen,
    od: 5,
    odCost: 1,
    distance: 1,
    range: 10,
    los: true,
    cooldownReady: true,
    hasResource: true,
    targetAlive: true,
    safeZone: false,
    pvpOpen: false,
    stunned: false,
    downed: false,
    running: false,
    overloaded: false,
    neuroshock: false,
    recentRejects: 0,
  };
}

function frame(
  cmd: ClientCommand,
  accessToken: string,
  sessionKey: string,
  signature = signCommand(cmd, sessionKey),
): string {
  return JSON.stringify({
    channel: 'command',
    accessToken,
    command: cmd,
    signature,
  });
}

interface Session {
  clock: ReturnType<typeof manualClock>;
  ctx: GatewayCtx;
  accessToken: string;
  sessionKey: string;
  queue: ClientCommand[];
}

async function openSession(nowMs = NOW): Promise<Session> {
  const clock = manualClock(nowMs);
  const service = createAuthService({
    repository: new MemoryAuthRepository(),
    jwtSecret: JWT_SECRET,
    cost: 4,
    now: () => clock.now(),
  });
  const registered = await service.register('player@rift.test', PASSWORD);
  if (!registered.ok) {
    throw new Error('register failed');
  }
  const loggedIn = await service.login('player@rift.test', PASSWORD);
  if (!loggedIn.ok) {
    throw new Error('login failed');
  }
  const queue: ClientCommand[] = [];
  const seen = new Set<string>();
  const ctx: GatewayCtx = {
    nowMs: clock.now(),
    verifyAccess: (token) => service.verifyAccess(token),
    sessionKey: (accountId) =>
      accountId === registered.value.accountId ? loggedIn.value.sessionKey : null,
    seen,
    rateTimestamps: [],
    enqueue: (next) => {
      queue.push(next);
    },
    rules: permissive(seen),
  };
  return {
    clock,
    ctx,
    accessToken: loggedIn.value.accessToken,
    sessionKey: loggedIn.value.sessionKey,
    queue,
  };
}

function submit(session: Session, cmd: ClientCommand, raw?: string): HandleResult {
  session.ctx.nowMs = session.clock.now();
  return handleMessage(raw ?? frame(cmd, session.accessToken, session.sessionKey), session.ctx);
}

function createFakeSocket(): {
  socket: GatewaySocket;
  sent: string[];
  receive(raw: string): void;
} {
  const sent: string[] = [];
  let listener: ((raw: string) => void) | undefined;
  return {
    sent,
    socket: {
      on(_event, next) {
        listener = next;
      },
      send(data) {
        sent.push(data);
      },
    },
    receive(raw) {
      if (listener === undefined) {
        throw new Error('socket has no message listener');
      }
      listener(raw);
    },
  };
}

test('future skew is 2000 ms and the resume log keeps 50 messages', () => {
  expect(COMMAND_FUTURE_SKEW_MS).toBe(2000);
  expect(RESUME_LIMIT).toBe(50);
});

test('signCommand is HMAC-SHA256 of the canonical command with raw key bytes', async () => {
  const session = await openSession();
  const cmd = command(1, NOW, { action: 'talk', targetId: 'npc-1', params: { b: 1, a: 2 } });
  const signature = signCommand(cmd, session.sessionKey);
  const expected = createHmac('sha256', Buffer.from(session.sessionKey, 'hex'))
    .update(canonicalCommand(cmd), 'utf8')
    .digest('hex');
  const utf8Key = createHmac('sha256', session.sessionKey)
    .update(canonicalCommand(cmd), 'utf8')
    .digest('hex');

  expect(signature).toBe(expected);
  expect(signature).toMatch(/^[0-9a-f]{64}$/);
  expect(signature).not.toBe(utf8Key);
});

test('a command signed by signCommand is accepted and enqueued', async () => {
  const session = await openSession();
  const cmd = command(1, NOW, { action: 'talk', targetId: 'npc-1', params: { b: 1, a: 2 } });
  const result = submit(session, cmd);

  expect(result).toEqual({ ok: true, command: cmd });
  expect(session.queue).toEqual([cmd]);
  expect(session.ctx.seen.has(cmd.commandId)).toBe(true);
});

test('a changed seq breaks the signature and does not enqueue', async () => {
  const session = await openSession();
  const cmd = command(1, NOW);
  const signature = signCommand(cmd, session.sessionKey);
  const tampered = { ...cmd, seq: cmd.seq + 1 };
  const result = submit(
    session,
    tampered,
    frame(tampered, session.accessToken, session.sessionKey, signature),
  );

  expect(result).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: tampered.commandId, code: 'bad_signature' },
  });
  expect(session.queue).toEqual([]);
  expect(session.ctx.seen.size).toBe(0);
  expect(session.ctx.rateTimestamps).toEqual([]);
});

test('a repeated commandId is duplicate and the queue does not grow', async () => {
  const session = await openSession();
  const first = command(1, NOW);
  expect(submit(session, first).ok).toBe(true);
  const again = command(2, NOW, { commandId: first.commandId });
  const result = submit(session, again);

  expect(result).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: first.commandId, code: 'duplicate' },
  });
  expect(session.queue).toEqual([first]);
});

test('issuedAt older than 5000 ms or newer than now+2000 ms is stale', async () => {
  const session = await openSession();
  const tooOld = command(1, NOW - 5001);
  const tooNew = command(2, NOW + COMMAND_FUTURE_SKEW_MS + 1);
  const oldEdge = command(3, NOW - 5000);
  const newEdge = command(4, NOW + COMMAND_FUTURE_SKEW_MS);

  expect(submit(session, tooOld)).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: tooOld.commandId, code: 'stale' },
  });
  expect(submit(session, tooNew)).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: tooNew.commandId, code: 'stale' },
  });
  expect(submit(session, oldEdge).ok).toBe(true);
  expect(submit(session, newEdge).ok).toBe(true);
  expect(session.queue.map((entry) => entry.commandId)).toEqual([
    oldEdge.commandId,
    newEdge.commandId,
  ]);
});

test('the 31st command in 1000 ms is rate limited and a later window accepts it', async () => {
  const session = await openSession();
  for (let n = 1; n <= 30; n += 1) {
    const result = submit(session, command(n, NOW));
    expect(result.ok).toBe(true);
  }
  const blocked = command(31, NOW);
  expect(submit(session, blocked)).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: blocked.commandId, code: 'rate_limited' },
  });
  expect(session.queue).toHaveLength(30);
  expect(session.ctx.seen.has(blocked.commandId)).toBe(false);

  session.clock.advance(1000);
  const retried = submit(session, blocked);
  expect(retried.ok).toBe(true);
  expect(session.queue).toHaveLength(31);
});

test('broken JSON is invalid on an injected socket and does not enqueue', async () => {
  const session = await openSession();
  const fake = createFakeSocket();
  bindSocket(fake.socket, session.ctx);
  fake.receive('{');

  expect(fake.sent).toEqual([
    JSON.stringify({ channel: 'system', commandId: '', code: 'invalid' }),
  ]);
  expect(session.queue).toEqual([]);
  expect(handleMessage('null', session.ctx)).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: '', code: 'invalid' },
  });
});

test('an expired access token is rejected and the queue stays empty', async () => {
  const session = await openSession();
  session.clock.advance(16 * 60 * 1000);
  const cmd = command(1, session.clock.now());
  const result = submit(session, cmd);

  expect(result).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: cmd.commandId, code: 'invalid' },
  });
  expect(session.queue).toEqual([]);
});

test('resume returns recorded state messages in order and the 51st drops the first', () => {
  const log = createResumeLog();
  const recorded: ServerMessage[] = [];
  for (let tick = 1; tick <= 51; tick += 1) {
    const message = broadcastState(tick, { n: tick }, NOW + tick);
    recorded.push(message);
    log.record('sess-1', message);
  }

  const resumed = log.resume('sess-1');
  expect(resumed.ok).toBe(true);
  if (!resumed.ok) {
    return;
  }
  expect(resumed.messages).toHaveLength(50);
  expect(resumed.messages[0]).toEqual(recorded[1]);
  expect(resumed.messages[49]).toEqual(recorded[50]);
  expect(resumed.messages.map((message) => message.serverTick)).toEqual(
    recorded.slice(1).map((message) => message.serverTick),
  );
  expect(log.resume('missing')).toEqual({ ok: false, code: 'session' });
  expect(broadcastState(1, { n: 1 }, NOW)).toEqual({
    channel: 'state',
    serverTick: 1,
    sentAtMs: NOW,
    payload: { n: 1 },
  });
});

test('gameplay rejection does not enqueue and reports the validate code', async () => {
  const session = await openSession();
  session.ctx.rules = { ...permissive(session.ctx.seen), od: 0, odCost: 1, recentRejects: 4 };
  const cmd = command(1, NOW);
  const result = submit(session, cmd);

  expect(result).toEqual({
    ok: false,
    reject: { channel: 'system', commandId: cmd.commandId, code: 'invalid' },
    rule: 'no_od',
    cheatStrike: true,
  });
  expect(session.queue).toEqual([]);
  expect(session.ctx.seen.has(cmd.commandId)).toBe(false);
});
