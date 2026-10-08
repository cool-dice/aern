import { CHAT_BAN_MS, MUTE_1H_MS, classifyMessage, type Sanction } from '@rift/domain/moderation';
import {
  deliverChat,
  invite as addPartyMember,
  leave as leaveParty,
  sendMail,
  type Party,
  type PartyRole,
} from '@rift/domain/social';
import type { Bus } from '../../shared/bus';
import { err, ok } from '../../../../../packages/domain/src/result';
import { hashSeed, mulberry32 } from '../../../../../packages/domain/src/rng';
import { createSocialRepository, type CharacterState, type SocialRepository } from './repository';
import type { DeliveredChannel, HeardMessage, SocialService } from './types';

const AUTOMUTE_WINDOW_MS = 86_400_000;
const PARTY_ROLES: readonly PartyRole[] = ['tank', 'damage', 'support', 'flex'];

function isPartyRole(role: string): role is PartyRole {
  return (PARTY_ROLES as readonly string[]).includes(role);
}

function automutesIn24h(character: CharacterState, nowMs: number): number {
  let count = 0;
  for (const atMs of character.automuteAtMs) {
    const ageMs = nowMs - atMs;
    if (ageMs >= 0 && ageMs <= AUTOMUTE_WINDOW_MS) {
      count += 1;
    }
  }
  return count;
}

function sanctionUntil(sanction: Sanction, nowMs: number): number | null {
  switch (sanction) {
    case 'none':
      return null;
    case 'mute_1h':
      return nowMs + MUTE_1H_MS;
    case 'mute_24h':
      return nowMs + 24 * MUTE_1H_MS;
    case 'chat_ban_7d':
    case 'account_ban_7d':
      return nowMs + CHAT_BAN_MS;
    case 'permanent':
      return null;
    default: {
      const neverSanction: never = sanction;
      return neverSanction;
    }
  }
}

/** Prior sanction still in force. A sanction applied to the current line is not included. */
function senderMuted(character: CharacterState, nowMs: number): boolean {
  if (character.sanction === 'none') {
    return false;
  }
  if (character.sanction === 'permanent') {
    return true;
  }
  if (character.sanctionUntilMs === null) {
    return false;
  }
  return nowMs < character.sanctionUntilMs;
}

function sharesParty(repository: SocialRepository, leftId: string, rightId: string): boolean {
  const party = repository.partyByMember(leftId);
  if (party === null) {
    return false;
  }
  return party.members.some((member) => member.id === rightId);
}

export function createSocialService(
  repository: SocialRepository = createSocialRepository(),
  getBus: () => Bus | null = () => null,
): SocialService {
  function partyAudience(senderId: string): CharacterState[] | null {
    const party = repository.partyByMember(senderId);
    if (party === null) {
      return null;
    }
    const members: CharacterState[] = [];
    for (const member of party.members) {
      const character = repository.character(member.id);
      if (character !== null) {
        members.push(character);
      }
    }
    return members;
  }

  return {
    register(input) {
      repository.register(input);
    },

    inbox(listenerId) {
      return repository.inbox(listenerId);
    },

    partyOf(characterId) {
      return repository.partyByMember(characterId);
    },

    sanctionOf(characterId) {
      return repository.character(characterId)?.sanction ?? 'none';
    },

    grantTitle(input) {
      const granted = repository.grantTitle(input.characterId, input.titleId);
      if (!granted.ok) {
        return err(granted.code);
      }
      return ok(granted.value);
    },

    titlesOf(characterId) {
      return repository.titlesOf(characterId);
    },

    mailbox(characterId) {
      return repository.mailbox(characterId);
    },

    async say(input) {
      const sender = repository.character(input.senderId);
      if (sender === null) {
        return err('missing');
      }
      const bus = getBus();
      if (bus === null) {
        throw new Error('social module is not started');
      }

      let mailLetter: { subject: string; body: string } | null = null;
      if (input.channel === 'mail') {
        const mailed = sendMail({
          subject: input.subject ?? input.text.slice(0, 80),
          body: input.text,
        });
        if (!mailed.ok) {
          return err(mailed.code);
        }
        if (input.recipientId === undefined || repository.character(input.recipientId) === null) {
          return err('missing');
        }
        mailLetter = mailed.value;
      }

      const sanction = classifyMessage({
        text: input.text,
        recentTexts: sender.recentTexts,
        recentMs: sender.recentMs,
        nowMs: input.nowMs,
        blacklist: [],
        automutesIn24h: automutesIn24h(sender, input.nowMs),
      });
      if (sanction !== 'none') {
        repository.applySanction(
          sender.id,
          sanction,
          sanctionUntil(sanction, input.nowMs),
          input.nowMs,
        );
        return ok({ delivered: 0 });
      }

      const channel: DeliveredChannel = input.channel;
      let audience: CharacterState[] | null;
      if (channel === 'party') {
        audience = partyAudience(sender.id);
      } else if (channel === 'guild') {
        if (sender.guildId === undefined) {
          return err('no_guild');
        }
        const guildId = sender.guildId;
        audience = repository.charactersAt(sender.nodeId).filter((listener) => listener.guildId === guildId);
      } else if (channel === 'mail') {
        const recipient = repository.character(input.recipientId ?? '');
        audience = recipient === null ? null : [recipient];
      } else {
        audience = repository.charactersAt(sender.nodeId);
      }
      if (audience === null) {
        return err(channel === 'party' ? 'no_party' : 'missing');
      }

      const muted = senderMuted(sender, input.nowMs);
      let delivered = 0;
      let failure: string | null = null;
      for (const listener of audience) {
        const presented = deliverChat({
          channel,
          text: input.text,
          language: sender.language,
          listenerUpy: listener.upy,
          translated: input.text,
          sameLocation: listener.nodeId === sender.nodeId,
          sameParty: sharesParty(repository, sender.id, listener.id),
          sameGuild: sender.guildId !== undefined && listener.guildId === sender.guildId,
          muted,
          rng: mulberry32(hashSeed(`${sender.id}|${listener.id}|${input.nowMs}|${input.text}`)),
        });
        if (!presented.ok) {
          failure = presented.code;
          continue;
        }
        const message: HeardMessage = {
          channel,
          senderId: sender.id,
          text: presented.value.text,
          mode: presented.value.mode,
        };
        repository.addDelivery(listener.id, message);
        delivered += 1;
      }

      if (delivered === 0) {
        return err(failure ?? 'empty');
      }

      if (mailLetter !== null && input.recipientId !== undefined) {
        repository.saveMail({
          id: `mail-${input.nowMs}-${sender.id}-${input.recipientId}`,
          fromId: sender.id,
          toId: input.recipientId,
          subject: mailLetter.subject,
          body: mailLetter.body,
        });
      }

      repository.remember(sender.id, input.text, input.nowMs);
      bus.emit('chat.message', {
        channel: input.channel,
        senderId: sender.id,
        ...(input.npcId !== undefined && input.npcId.length > 0 ? { subject: input.npcId } : {}),
      });
      return ok({ delivered });
    },

    async invite(partyLeaderId, targetId, role) {
      if (!isPartyRole(role)) {
        return err('role');
      }
      if (repository.character(partyLeaderId) === null || repository.character(targetId) === null) {
        return err('missing');
      }

      const current = repository.partyByMember(partyLeaderId);
      if (current !== null && current.leaderId !== partyLeaderId) {
        return err('not_leader');
      }

      const targetParty = repository.partyByMember(targetId);
      if (targetParty !== null && targetParty.leaderId !== partyLeaderId) {
        return err('in_party');
      }

      const base: Party = current ?? {
        leaderId: partyLeaderId,
        members: [{ id: partyLeaderId, role: 'flex' }],
      };
      const joined = addPartyMember(base, targetId, role);
      if (!joined.ok) {
        return err(joined.code);
      }
      repository.saveParty(joined.value);
      return ok(undefined);
    },

    async leave(characterId) {
      const party = repository.partyByMember(characterId);
      if (party === null) {
        return err('missing');
      }
      const next = leaveParty(party, characterId);
      repository.deleteParty(party.leaderId);
      if (next !== null) {
        repository.saveParty(next);
      }
      return ok(undefined);
    },
  };
}
