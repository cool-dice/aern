import type { Bus } from '../../shared/bus';
import type { GameModule } from '../../shared/module';
import { createSocialRepository, type SocialRepository } from './repository';
import { createSocialService } from './service';
import type { SocialService } from './types';

export interface SocialModule extends GameModule {
  readonly service: SocialService;
}

export function createSocialModule(
  repository: SocialRepository = createSocialRepository(),
): SocialModule {
  let bus: Bus | null = null;
  const service = createSocialService(repository, () => bus);
  return {
    name: 'social',
    service,
    start(ctx) {
      bus = ctx.bus;
    },
  };
}

export { createSocialRepository, type SocialRepository } from './repository';
export { createSocialService } from './service';
export type {
  DeliveredChannel,
  HeardMessage,
  SocialChannel,
  SocialCharacterInput,
  SocialService,
} from './types';
