import type { LanguageId } from '@rift/domain/language';
import type { Sanction } from '@rift/domain/moderation';
import type { ChatMode, Party } from '@rift/domain/social';
import type { Result } from '../../../../../packages/domain/src/result';

/** Channels `say` accepts. `system` is not a player entry. */
export type SocialChannel = 'local' | 'party' | 'guild' | 'trade' | 'mail';

/** Channels that deliver a line. Guild bypasses language garble. */
export type DeliveredChannel = 'local' | 'party' | 'trade' | 'mail' | 'guild';

export interface SocialCharacterInput {
  id: string;
  nodeId: string;
  /** Language this character speaks. Listeners hear it through `deliverChat`. */
  language: LanguageId;
  /**
   * Proficiency passed as `listenerUpy` when this character hears a line.
   * Omitted on a later register leaves the stored value unchanged. Default 0.
   */
  upy?: number;
  guildId?: string;
}

/** One rendered line in a character's in-memory inbox. */
export interface HeardMessage {
  channel: DeliveredChannel;
  senderId: string;
  text: string;
  mode: ChatMode;
}

export interface SocialService {
  say(input: {
    senderId: string;
    channel: SocialChannel;
    text: string;
    nowMs: number;
    subject?: string;
    recipientId?: string;
  }): Promise<Result<{ delivered: number }, string>>;
  invite(partyLeaderId: string, targetId: string, role: string): Promise<Result<void, string>>;
  /**
   * Drop a member. The leader leaving hands leadership to the first remaining
   * member. The last member dissolves the party.
   */
  leave(characterId: string): Promise<Result<void, string>>;
  grantTitle(input: { characterId: string; titleId: string }): Result<{ titleId: string }, string>;
  titlesOf(characterId: string): readonly string[];
  mailbox(characterId: string): readonly { id: string; fromId: string; toId: string; subject: string; body: string }[];
  /** Upsert the in-memory character projection this module owns. */
  register(input: SocialCharacterInput): void;
  /** Lines this listener has actually received, oldest first. */
  inbox(listenerId: string): readonly HeardMessage[];
  partyOf(characterId: string): Party | null;
  /** Last sanction written on the character. `none` when they were never sanctioned. */
  sanctionOf(characterId: string): Sanction;
}
