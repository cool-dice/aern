import type { Result } from '../../../../../packages/domain/src/result';

export type Role = 'player' | 'moderator' | 'admin';

/** Account row. Passwords are stored only as a bcrypt hash. */
export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAtMs: number;
  lastLoginAtMs: number | null;
  banned: boolean;
  banReason: string | null;
  banUntilMs: number | null;
  role: Role;
}

/** In-memory stand-in for Redis `session:{accountId}` (TTL 24h). */
export interface SessionRecord {
  accountId: string;
  sessionKey: string;
  expiresAtMs: number;
}

export interface AuthService {
  register(email: string, password: string): Promise<Result<{ accountId: string }, 'email' | 'password'>>;
  login(
    email: string,
    password: string,
  ): Promise<
    Result<{ accessToken: string; refreshToken: string; sessionKey: string }, 'credentials' | 'banned'>
  >;
  verifyAccess(token: string): Result<{ accountId: string; role: string }, 'token'>;
}
