import type { LanguageId } from '@rift/domain/language';
import type { Sanction } from '@rift/domain/moderation';
import type { Party } from '@rift/domain/social';
import type { HeardMessage, SocialCharacterInput } from './types';

export interface CharacterState {
  id: string;
  nodeId: string;
  language: LanguageId;
  upy: number;
  sanction: Sanction;
  sanctionUntilMs: number | null;
  automuteAtMs: number[];
  recentTexts: string[];
  recentMs: number[];
  guildId?: string;
  titles: string[];
}

export interface SocialRepository {
  register(input: SocialCharacterInput): void;
  /** Drops a character from the node presence map. */
  forget(id: string): void;
  character(id: string): CharacterState | null;
  charactersAt(nodeId: string): CharacterState[];
  applySanction(id: string, sanction: Sanction, untilMs: number | null, nowMs: number): void;
  /** Writes a sanction without counting it as an automute. */
  setSanction(id: string, sanction: Sanction, untilMs: number | null): boolean;
  remember(id: string, text: string, nowMs: number): void;
  partyByMember(id: string): Party | null;
  saveParty(party: Party): void;
  deleteParty(leaderId: string): void;
  addDelivery(listenerId: string, message: HeardMessage): void;
  inbox(listenerId: string): readonly HeardMessage[];
  saveMail(mail: { id: string; fromId: string; toId: string; subject: string; body: string }): void;
  grantTitle(characterId: string, titleId: string): { ok: true; value: { titleId: string } } | { ok: false; code: 'missing' | 'duplicate' };
  titlesOf(characterId: string): readonly string[];
  mailbox(toId: string): readonly { id: string; fromId: string; toId: string; subject: string; body: string }[];
  /** Reloads presence and mail written by a previous process. Memory mode omits it. */
  loadPersisted?(): Promise<void>;
}

function copyParty(party: Party): Party {
  return {
    leaderId: party.leaderId,
    members: party.members.map((member) => ({ id: member.id, role: member.role })),
  };
}

function copyCharacter(character: CharacterState): CharacterState {
  return {
    id: character.id,
    nodeId: character.nodeId,
    language: character.language,
    upy: character.upy,
    sanction: character.sanction,
    sanctionUntilMs: character.sanctionUntilMs,
    automuteAtMs: [...character.automuteAtMs],
    recentTexts: [...character.recentTexts],
    recentMs: [...character.recentMs],
    ...(character.guildId !== undefined ? { guildId: character.guildId } : {}),
    titles: [...character.titles],
  };
}

/** In-memory characters, parties, and inboxes. No timers and no sibling modules. */
export function createSocialRepository(): SocialRepository {
  const characters = new Map<string, CharacterState>();
  const parties: Party[] = [];
  const heard = new Map<string, HeardMessage[]>();
  const mail: { id: string; fromId: string; toId: string; subject: string; body: string }[] = [];
  let mailSeq = 0;

  return {
    register(input) {
      const existing = characters.get(input.id);
      if (existing === undefined) {
        characters.set(input.id, {
          id: input.id,
          nodeId: input.nodeId,
          language: input.language,
          upy: input.upy ?? 0,
          sanction: 'none',
          sanctionUntilMs: null,
          automuteAtMs: [],
          recentTexts: [],
          recentMs: [],
          ...(input.guildId !== undefined ? { guildId: input.guildId } : {}),
          titles: [],
        });
        return;
      }
      existing.nodeId = input.nodeId;
      existing.language = input.language;
      if (input.upy !== undefined) {
        existing.upy = input.upy;
      }
      if (input.guildId !== undefined) {
        existing.guildId = input.guildId;
      }
    },

    forget(id) {
      characters.delete(id);
    },

    character(id) {
      const found = characters.get(id);
      return found === undefined ? null : copyCharacter(found);
    },

    charactersAt(nodeId) {
      const atNode: CharacterState[] = [];
      for (const character of characters.values()) {
        if (character.nodeId === nodeId) {
          atNode.push(copyCharacter(character));
        }
      }
      return atNode;
    },

    applySanction(id, sanction, untilMs, nowMs) {
      const character = characters.get(id);
      if (character === undefined) {
        return;
      }
      character.sanction = sanction;
      character.sanctionUntilMs = untilMs;
      character.automuteAtMs.push(nowMs);
    },

    setSanction(id, sanction, untilMs) {
      const character = characters.get(id);
      if (character === undefined) {
        return false;
      }
      character.sanction = sanction;
      character.sanctionUntilMs = untilMs;
      return true;
    },

    remember(id, text, nowMs) {
      const character = characters.get(id);
      if (character === undefined) {
        return;
      }
      character.recentTexts.push(text);
      character.recentMs.push(nowMs);
    },

    partyByMember(id) {
      const found = parties.find((party) => party.members.some((member) => member.id === id));
      return found === undefined ? null : copyParty(found);
    },

    saveParty(party) {
      const memberIds = new Set(party.members.map((member) => member.id));
      for (let index = parties.length - 1; index >= 0; index -= 1) {
        const existing = parties[index];
        if (existing === undefined) {
          continue;
        }
        const overlaps =
          existing.leaderId === party.leaderId ||
          existing.members.some((member) => memberIds.has(member.id));
        if (overlaps) {
          parties.splice(index, 1);
        }
      }
      parties.push(copyParty(party));
    },

    deleteParty(leaderId) {
      const index = parties.findIndex((party) => party.leaderId === leaderId);
      if (index >= 0) {
        parties.splice(index, 1);
      }
    },

    addDelivery(listenerId, message) {
      const list = heard.get(listenerId) ?? [];
      list.push({
        channel: message.channel,
        senderId: message.senderId,
        text: message.text,
        mode: message.mode,
      });
      heard.set(listenerId, list);
    },

    inbox(listenerId) {
      const list = heard.get(listenerId) ?? [];
      return list.map((message) => ({
        channel: message.channel,
        senderId: message.senderId,
        text: message.text,
        mode: message.mode,
      }));
    },

    saveMail(entry) {
      mailSeq += 1;
      mail.push({
        id: entry.id.length > 0 ? entry.id : `mail-${mailSeq}`,
        fromId: entry.fromId,
        toId: entry.toId,
        subject: entry.subject,
        body: entry.body,
      });
    },

    grantTitle(characterId, titleId) {
      const character = characters.get(characterId);
      if (character === undefined) {
        return { ok: false, code: 'missing' };
      }
      if (character.titles.includes(titleId)) {
        return { ok: false, code: 'duplicate' };
      }
      character.titles.push(titleId);
      return { ok: true, value: { titleId } };
    },

    titlesOf(characterId) {
      const character = characters.get(characterId);
      return character === undefined ? [] : [...character.titles];
    },

    mailbox(toId) {
      return mail
        .filter((entry) => entry.toId === toId)
        .map((entry) => ({
          id: entry.id,
          fromId: entry.fromId,
          toId: entry.toId,
          subject: entry.subject,
          body: entry.body,
        }));
    },
  };
}
