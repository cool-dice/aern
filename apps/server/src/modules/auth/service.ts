import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { err, ok } from '../../../../../packages/domain/src/result';
import type { AuthRepository } from './repository';
import type { AccountRecord, AuthService, Role } from './types';

/** Production bcrypt cost. Compose (task 045) must pass this value. */
export const PRODUCTION_BCRYPT_COST = 12;

/** Access JWT lifetime: 15 minutes (review decision; GDD called the token "short"). */
export const ACCESS_TTL_MS = 15 * 60 * 1000;

/** Refresh JWT lifetime: 24 hours. */
export const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

/** Session key TTL, same window as Redis `session:{accountId}`. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const SESSION_KEY_BYTES = 32;
const MIN_PASSWORD_LENGTH = 8;

export interface AuthServiceOptions {
  repository: AuthRepository;
  jwtSecret: string;
  now: () => number;
  /** bcrypt cost. Defaults to {@link PRODUCTION_BCRYPT_COST}. Tests pass 4. */
  cost?: number;
}

interface TokenClaims {
  sub?: string;
  role?: string;
  typ?: string;
  iat?: number;
  exp?: number;
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const cost = options.cost ?? PRODUCTION_BCRYPT_COST;
  const { repository, jwtSecret } = options;
  const now = (): number => options.now();

  return {
    async register(email, password) {
      const normalized = normalizeEmail(email);
      if (normalized === null) {
        return err('email');
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return err('password');
      }
      const existing = await repository.findAccountByEmail(normalized);
      if (existing !== null) {
        return err('email');
      }

      const account: AccountRecord = {
        id: randomUUID(),
        email: normalized,
        passwordHash: await bcrypt.hash(password, cost),
        createdAtMs: now(),
        lastLoginAtMs: null,
        banned: false,
        banReason: null,
        banUntilMs: null,
        role: 'player',
      };
      await repository.insertAccount(account);
      return ok({ accountId: account.id });
    },

    async login(email, password) {
      const normalized = normalizeEmail(email);
      if (normalized === null) {
        return err('credentials');
      }
      const account = await repository.findAccountByEmail(normalized);
      if (account === null) {
        return err('credentials');
      }
      const matches = await bcrypt.compare(password, account.passwordHash);
      if (!matches) {
        return err('credentials');
      }
      if (isBanned(account, now())) {
        return err('banned');
      }

      const nowMs = now();
      const sessionKey = randomBytes(SESSION_KEY_BYTES).toString('hex');
      await repository.updateAccount({ ...account, lastLoginAtMs: nowMs });
      await repository.saveSession({
        accountId: account.id,
        sessionKey,
        expiresAtMs: nowMs + SESSION_TTL_MS,
      });

      return ok({
        accessToken: signToken(
          { sub: account.id, role: account.role, typ: 'access' },
          jwtSecret,
          ACCESS_TTL_MS,
          nowMs,
        ),
        refreshToken: signToken(
          { sub: account.id, typ: 'refresh' },
          jwtSecret,
          REFRESH_TTL_MS,
          nowMs,
        ),
        sessionKey,
      });
    },

    verifyAccess(token) {
      const claims = verifyToken(token, jwtSecret, now());
      if (claims === null || claims.typ !== 'access') {
        return err('token');
      }
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        return err('token');
      }
      if (!isRole(claims.role)) {
        return err('token');
      }
      return ok({ accountId: claims.sub, role: claims.role });
    },
  };
}

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    return null;
  }
  return normalized;
}

/**
 * `banUntilMs > now` is a ban. A null deadline with `banned` is permanent.
 * A deadline that has passed is not a ban, even if the flag is still set.
 */
function isBanned(account: AccountRecord, nowMs: number): boolean {
  if (account.banUntilMs !== null) {
    return account.banUntilMs > nowMs;
  }
  return account.banned;
}

function isRole(value: unknown): value is Role {
  return value === 'player' || value === 'moderator' || value === 'admin';
}

/**
 * HS256 JWT. `iat` and `exp` come from the injected clock, never `Date.now`.
 * Signed with node:crypto so expiry stays on that clock.
 */
function signToken(
  claims: { sub: string; typ: 'access' | 'refresh'; role?: Role },
  secret: string,
  ttlMs: number,
  nowMs: number,
): string {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.floor(ttlMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...claims, iat, exp }));
  const data = `${header}.${body}`;
  return `${data}.${hmacSha256(data, secret)}`;
}

function verifyToken(token: string, secret: string, nowMs: number): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const headerPart = parts[0];
  const bodyPart = parts[1];
  const signaturePart = parts[2];
  if (headerPart === undefined || bodyPart === undefined || signaturePart === undefined) {
    return null;
  }
  if (headerPart.length === 0 || bodyPart.length === 0 || signaturePart.length === 0) {
    return null;
  }

  const expected = hmacSha256(`${headerPart}.${bodyPart}`, secret);
  if (!safeEqual(signaturePart, expected)) {
    return null;
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64urlDecode(headerPart));
    payload = JSON.parse(base64urlDecode(bodyPart));
  } catch {
    return null;
  }
  if (!isHeaderHs256(header) || !isTokenClaims(payload)) {
    return null;
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null;
  }
  if (Math.floor(nowMs / 1000) >= payload.exp) {
    return null;
  }
  return payload;
}

function isHeaderHs256(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const alg = (value as { alg?: unknown }).alg;
  return alg === 'HS256';
}

function isTokenClaims(value: unknown): value is TokenClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as TokenClaims;
  if (record.typ !== undefined && typeof record.typ !== 'string') {
    return false;
  }
  if (record.sub !== undefined && typeof record.sub !== 'string') {
    return false;
  }
  if (record.role !== undefined && typeof record.role !== 'string') {
    return false;
  }
  return true;
}

function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}
