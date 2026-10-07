import { chatPresentation, type LanguageId } from './language';
import type { Rng } from './rng';
import { err, ok, type Result } from './result';

export type ChatChannel = 'local' | 'party' | 'guild' | 'trade' | 'system' | 'mail';

/**
 * Каналы без проверки УПЯ. Система всё равно не принимает текст игрока.
 * local, trade и mail идут через chatPresentation.
 */
export const chatBypass: Readonly<Record<ChatChannel, boolean>> = {
  local: false,
  party: true,
  guild: true,
  trade: false,
  system: true,
  mail: false,
};

export const CHAT_TEXT_MAX = 500;
export const MAIL_SUBJECT_MAX = 80;
export const MAIL_BODY_MAX = 2000;
export const PARTY_MAX = 4;

export type ChatMode = 'raw' | 'garbled' | 'translated';

export interface ChatDelivery {
  text: string;
  mode: ChatMode;
}

export function deliverChat(input: {
  channel: ChatChannel;
  text: string;
  language: LanguageId;
  listenerUpy: number;
  translated: string;
  sameLocation: boolean;
  sameParty: boolean;
  sameGuild: boolean;
  muted: boolean;
  rng: Rng;
}): Result<ChatDelivery, 'muted' | 'empty' | 'system' | 'scope'> {
  if (input.muted) {
    return err('muted');
  }
  if (input.channel === 'system') {
    return err('system');
  }
  if (input.text.length < 1 || input.text.length > textMax(input.channel)) {
    return err('empty');
  }
  if (outOfScope(input)) {
    return err('scope');
  }
  if (chatBypass[input.channel]) {
    return ok({ text: input.text, mode: 'raw' });
  }
  return ok(chatPresentation(input.text, input.listenerUpy, input.translated, input.rng));
}

export function sendMail(input: {
  subject: string;
  body: string;
}): Result<{ subject: string; body: string }, 'subject' | 'body'> {
  if (input.subject.length > MAIL_SUBJECT_MAX) {
    return err('subject');
  }
  if (input.body.length < 1 || input.body.length > MAIL_BODY_MAX) {
    return err('body');
  }
  return ok({ subject: input.subject, body: input.body });
}

export type PartyRole = 'tank' | 'damage' | 'support' | 'flex';

export interface PartyMember {
  id: string;
  role: PartyRole;
}

export interface Party {
  leaderId: string;
  members: PartyMember[];
}

export function invite(
  party: Party,
  id: string,
  role: PartyRole,
): Result<Party, 'full' | 'duplicate'> {
  if (party.leaderId === id || party.members.some((member) => member.id === id)) {
    return err('duplicate');
  }
  if (party.members.length >= PARTY_MAX) {
    return err('full');
  }
  return ok({
    leaderId: party.leaderId,
    members: [...party.members, { id, role }],
  });
}

export function leave(party: Party, id: string): Party | null {
  const removingLeader = party.leaderId === id;
  const members = party.members.filter((member) => member.id !== id);
  if (members.length === 0) {
    return null;
  }
  if (!removingLeader && members.length === party.members.length) {
    return party;
  }
  const successor = members[0];
  if (successor === undefined) {
    return null;
  }
  return {
    leaderId: removingLeader ? successor.id : party.leaderId,
    members,
  };
}

export interface MatchCandidate {
  id: string;
  level: number;
  role: PartyRole;
}

export function matchmake(
  candidates: MatchCandidate[],
  wantLevel: number,
  wantRole: PartyRole | null,
  seats: number,
): string[] {
  const picked: string[] = [];
  if (seats <= 0) {
    return picked;
  }
  for (const candidate of candidates) {
    if (picked.length >= seats) {
      break;
    }
    if (Math.abs(candidate.level - wantLevel) > 5) {
      continue;
    }
    if (wantRole !== null && candidate.role !== wantRole) {
      continue;
    }
    picked.push(candidate.id);
  }
  return picked;
}

export type ReputationEvent = 'quest' | 'fail' | 'attack' | 'gift';

const REPUTATION_MIN = 0;
const REPUTATION_MAX = 100;

const REPUTATION_DELTA: Record<ReputationEvent, number> = {
  quest: 5,
  fail: -2,
  attack: -10,
  gift: 3,
};

export function bumpReputation(value: number, event: ReputationEvent): number {
  return clampReputation(value + REPUTATION_DELTA[event]);
}

export function reputationTier(value: number): {
  quests: 'none' | 'basic' | 'all' | 'rare' | 'unique';
  discount: number;
} {
  const reputation = clampReputation(value);
  if (reputation <= 20) {
    return { quests: 'none', discount: 0 };
  }
  if (reputation <= 40) {
    return { quests: 'basic', discount: 0 };
  }
  if (reputation <= 60) {
    return { quests: 'all', discount: 0.05 };
  }
  if (reputation <= 80) {
    return { quests: 'rare', discount: 0.1 };
  }
  return { quests: 'unique', discount: 0.15 };
}

function clampReputation(value: number): number {
  if (value < REPUTATION_MIN) {
    return REPUTATION_MIN;
  }
  if (value > REPUTATION_MAX) {
    return REPUTATION_MAX;
  }
  return value;
}

function textMax(channel: ChatChannel): number {
  return channel === 'mail' ? MAIL_BODY_MAX : CHAT_TEXT_MAX;
}

function outOfScope(input: {
  channel: ChatChannel;
  sameLocation: boolean;
  sameParty: boolean;
  sameGuild: boolean;
}): boolean {
  switch (input.channel) {
    case 'local':
    case 'trade':
      return !input.sameLocation;
    case 'party':
      return !input.sameParty;
    case 'guild':
      return !input.sameGuild;
    case 'mail':
    case 'system':
      return false;
    default: {
      const neverChannel: never = input.channel;
      return neverChannel;
    }
  }
}
