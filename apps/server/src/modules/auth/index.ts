import type { GameModule } from '../../shared/module';
import { MemoryAuthRepository, type AuthRepository } from './repository';
import { createAuthService, PRODUCTION_BCRYPT_COST, type AuthServiceOptions } from './service';
import type { AuthService } from './types';

export interface AuthModule extends GameModule {
  service: AuthService;
}

export interface CreateAuthModuleOptions {
  jwtSecret: string;
  repository?: AuthRepository;
  /** bcrypt cost. Defaults to {@link PRODUCTION_BCRYPT_COST}. */
  cost?: number;
  /**
   * Clock used before `start`. `start` replaces it with `ModuleContext.now`.
   */
  now?: () => number;
}

export function createAuthModule(options: CreateAuthModuleOptions): AuthModule {
  let now = options.now ?? ((): number => 0);
  const repository = options.repository ?? new MemoryAuthRepository();
  const serviceOptions: AuthServiceOptions = {
    repository,
    jwtSecret: options.jwtSecret,
    cost: options.cost ?? PRODUCTION_BCRYPT_COST,
    now: () => now(),
  };

  return {
    name: 'auth',
    service: createAuthService(serviceOptions),
    start(ctx) {
      now = ctx.now;
    },
  };
}

export { MemoryAuthRepository } from './repository';
export type { AuthMemoryDump, AuthRepository } from './repository';
export {
  ACCESS_TTL_MS,
  PRODUCTION_BCRYPT_COST,
  REFRESH_TTL_MS,
  SESSION_TTL_MS,
  createAuthService,
} from './service';
export type { AuthServiceOptions } from './service';
export type { AccountRecord, AuthService, Role, SessionRecord } from './types';
