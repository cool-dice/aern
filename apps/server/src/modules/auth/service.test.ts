import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createAuthModule } from './index';
import { MemoryAuthRepository } from './repository';
import {
  ACCESS_TTL_MS,
  PRODUCTION_BCRYPT_COST,
  REFRESH_TTL_MS,
  SESSION_TTL_MS,
  createAuthService,
} from './service';
import type { AuthService } from './types';

const JWT_SECRET = 'test-jwt-secret';
const PASSWORD = 'hunter2-secret';

function setup(startMs = 1_700_000_000_000): {
  clock: ReturnType<typeof manualClock>;
  repository: MemoryAuthRepository;
  service: AuthService;
} {
  const clock = manualClock(startMs);
  const repository = new MemoryAuthRepository();
  const service = createAuthService({
    repository,
    jwtSecret: JWT_SECRET,
    cost: 4,
    now: () => clock.now(),
  });
  return { clock, repository, service };
}

test('PRODUCTION_BCRYPT_COST is 12', () => {
  expect(PRODUCTION_BCRYPT_COST).toBe(12);
});

test('register, login, and verifyAccess succeed', async () => {
  const { clock, repository, service } = setup();
  const createdAt = clock.now();
  const registered = await service.register('  User@Example.com  ', PASSWORD);
  expect(registered.ok).toBe(true);
  if (!registered.ok) {
    return;
  }

  const loggedIn = await service.login('user@example.com', PASSWORD);
  expect(loggedIn.ok).toBe(true);
  if (!loggedIn.ok) {
    return;
  }

  expect(loggedIn.value.sessionKey).toMatch(/^[0-9a-f]{64}$/);
  expect(loggedIn.value.accessToken.split('.')).toHaveLength(3);
  expect(loggedIn.value.refreshToken.split('.')).toHaveLength(3);

  const verified = service.verifyAccess(loggedIn.value.accessToken);
  expect(verified).toEqual({
    ok: true,
    value: { accountId: registered.value.accountId, role: 'player' },
  });

  const account = await repository.findAccountById(registered.value.accountId);
  expect(account?.email).toBe('user@example.com');
  expect(account?.role).toBe('player');
  expect(account?.createdAtMs).toBe(createdAt);
  expect(account?.lastLoginAtMs).toBe(clock.now());
  expect(account?.banned).toBe(false);

  const session = await repository.getSession(registered.value.accountId, clock.now());
  expect(session).toEqual({
    accountId: registered.value.accountId,
    sessionKey: loggedIn.value.sessionKey,
    expiresAtMs: clock.now() + SESSION_TTL_MS,
  });

  const access = decodePayload(loggedIn.value.accessToken);
  const refresh = decodePayload(loggedIn.value.refreshToken);
  expect(access.typ).toBe('access');
  expect(refresh.typ).toBe('refresh');
  expect(access.exp - access.iat).toBe(ACCESS_TTL_MS / 1000);
  expect(refresh.exp - refresh.iat).toBe(REFRESH_TTL_MS / 1000);
  expect(service.verifyAccess(loggedIn.value.refreshToken)).toEqual({ ok: false, code: 'token' });
});

test('password shorter than 8 characters is rejected and stores nothing', async () => {
  const { repository, service } = setup();
  const result = await service.register('a@b.c', 'short');
  expect(result).toEqual({ ok: false, code: 'password' });
  expect(repository.dump().accounts).toEqual([]);
});

test('email without @ is rejected', async () => {
  const { repository, service } = setup();
  const result = await service.register('not-an-email', PASSWORD);
  expect(result).toEqual({ ok: false, code: 'email' });
  expect(repository.dump().accounts).toEqual([]);
});

test('registering the same email again returns email', async () => {
  const { repository, service } = setup();
  const first = await service.register('a@b.c', PASSWORD);
  expect(first.ok).toBe(true);
  const second = await service.register('A@B.C', PASSWORD);
  expect(second).toEqual({ ok: false, code: 'email' });
  expect(repository.dump().accounts).toHaveLength(1);
});

test('wrong password returns credentials and does not create a session', async () => {
  const { repository, service } = setup();
  const registered = await service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);
  const loggedIn = await service.login('a@b.c', 'wrong-password');
  expect(loggedIn).toEqual({ ok: false, code: 'credentials' });
  expect(repository.dump().sessions).toEqual([]);
});

test('unknown email returns credentials', async () => {
  const { service } = setup();
  const loggedIn = await service.login('missing@b.c', PASSWORD);
  expect(loggedIn).toEqual({ ok: false, code: 'credentials' });
});

test('banUntil in the future returns banned and does not create a session', async () => {
  const { clock, repository, service } = setup();
  const registered = await service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);
  if (!registered.ok) {
    return;
  }
  const account = await repository.findAccountById(registered.value.accountId);
  expect(account).not.toBeNull();
  if (account === null) {
    return;
  }
  await repository.updateAccount({
    ...account,
    banned: true,
    banReason: 'cheat',
    banUntilMs: clock.now() + 60_000,
  });

  const loggedIn = await service.login('a@b.c', PASSWORD);
  expect(loggedIn).toEqual({ ok: false, code: 'banned' });
  expect(repository.dump().sessions).toEqual([]);
});

test('permanent ban and an expired ban follow the clock', async () => {
  const { clock, repository, service } = setup();
  const registered = await service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);
  if (!registered.ok) {
    return;
  }
  const account = await repository.findAccountById(registered.value.accountId);
  if (account === null) {
    throw new Error('account missing');
  }

  await repository.updateAccount({
    ...account,
    banned: true,
    banReason: 'permanent',
    banUntilMs: null,
  });
  expect(await service.login('a@b.c', PASSWORD)).toEqual({ ok: false, code: 'banned' });

  await repository.updateAccount({
    ...account,
    banned: true,
    banReason: 'served',
    banUntilMs: clock.now() - 1,
  });
  const loggedIn = await service.login('a@b.c', PASSWORD);
  expect(loggedIn.ok).toBe(true);
});

test('access token expires after the clock advances 16 minutes', async () => {
  const { clock, service } = setup();
  await service.register('a@b.c', PASSWORD);
  const loggedIn = await service.login('a@b.c', PASSWORD);
  expect(loggedIn.ok).toBe(true);
  if (!loggedIn.ok) {
    return;
  }

  clock.advance(14 * 60 * 1000);
  expect(service.verifyAccess(loggedIn.value.accessToken).ok).toBe(true);

  clock.advance(2 * 60 * 1000);
  expect(service.verifyAccess(loggedIn.value.accessToken)).toEqual({ ok: false, code: 'token' });
});

test('register stores a bcrypt hash and not the plaintext password', async () => {
  const { repository, service } = setup();
  const registered = await service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);

  const dump = repository.dump();
  const serialized = JSON.stringify(dump);
  expect(serialized).not.toContain(PASSWORD);
  expect(dump.accounts).toHaveLength(1);
  const account = dump.accounts[0];
  expect(account).toBeDefined();
  if (account === undefined) {
    return;
  }
  expect(Object.keys(account)).not.toContain('password');
  expect(account.passwordHash.startsWith('$2a$04$')).toBe(true);
  expect(account.passwordHash).not.toBe(PASSWORD);
});

test('session disappears 24 hours after login', async () => {
  const { clock, repository, service } = setup();
  const registered = await service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);
  if (!registered.ok) {
    return;
  }
  const loggedIn = await service.login('a@b.c', PASSWORD);
  expect(loggedIn.ok).toBe(true);

  expect(await repository.getSession(registered.value.accountId, clock.now())).not.toBeNull();
  clock.advance(SESSION_TTL_MS);
  expect(await repository.getSession(registered.value.accountId, clock.now())).toBeNull();
});

test('tampered and foreign tokens are rejected', () => {
  const { service } = setup();
  expect(service.verifyAccess('not-a-jwt')).toEqual({ ok: false, code: 'token' });
  expect(service.verifyAccess('a.b.c')).toEqual({ ok: false, code: 'token' });
});

test('auth module is named auth and start binds the module clock', async () => {
  const clock = manualClock(1_700_000_000_000);
  const repository = new MemoryAuthRepository();
  const auth = createAuthModule({
    jwtSecret: JWT_SECRET,
    cost: 4,
    repository,
  });
  expect(auth.name).toBe('auth');
  auth.start({ bus: createBus(), now: () => clock.now() });

  const registered = await auth.service.register('a@b.c', PASSWORD);
  expect(registered.ok).toBe(true);
  const loggedIn = await auth.service.login('a@b.c', PASSWORD);
  expect(loggedIn.ok).toBe(true);
  if (!loggedIn.ok) {
    return;
  }
  expect(auth.service.verifyAccess(loggedIn.value.accessToken).ok).toBe(true);
  clock.advance(16 * 60 * 1000);
  expect(auth.service.verifyAccess(loggedIn.value.accessToken)).toEqual({ ok: false, code: 'token' });
});

function decodePayload(token: string): { typ: string; iat: number; exp: number } {
  const body = token.split('.')[1];
  if (body === undefined) {
    throw new Error('missing jwt payload');
  }
  const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('jwt payload is not an object');
  }
  const record = parsed as { typ?: unknown; iat?: unknown; exp?: unknown };
  if (typeof record.typ !== 'string' || typeof record.iat !== 'number' || typeof record.exp !== 'number') {
    throw new Error('jwt payload missing claims');
  }
  return { typ: record.typ, iat: record.iat, exp: record.exp };
}
