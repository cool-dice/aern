import type { GuildRank } from '@rift/domain/guild';

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; code: E };

export type GuildMode = 'stub' | 'live';

/** Character wallet. The guild module never reads gold storage itself. */
export interface GoldPort {
  deduct(characterId: string, amount: number): Promise<Result<{ gold: number }, 'gold'>>;
}

export interface GuildMemberInput {
  id: string;
  level: number;
  inGuild?: boolean;
}

export interface CreateGuildInput {
  name: string;
  tag: string;
  members: GuildMemberInput[];
  gold: number;
  initiatorId?: string;
  leaderId?: string;
  lastOfficeMs?: number | null;
}

export interface DeclareWarInput {
  attackerGuildId: string;
  cityId: string;
  /** Treasury offered for the war. Defaults to the stored guild bank. */
  gold?: number;
  resources?: number;
  leaderAbsent?: boolean;
  leaderConsent?: boolean;
  councilConsents?: number;
  cityCapturedAtMs?: number | null;
  drawEndedAtMs?: number | null;
  lastDeclaredAtMs?: number | null;
}

export interface WithdrawInput {
  guildId: string;
  rank: GuildRank;
  amount: number;
  leaderConfirm?: boolean;
  councilConfirms?: number;
  councilVote?: boolean;
}

export interface GuildService {
  previewCreate(
    members: { id: string; level: number }[],
    gold: number,
  ): Promise<Result<{ leaderReady: boolean }, string>>;
  create(input: unknown): Promise<Result<{ guildId: string }, string>>;
  /** Auction tax for the city owner from captures. A null owner sinks the tax. */
  creditTax(input: { amount: number; guildId: string | null }): Promise<'guild' | 'void'>;
  declareWar(input: DeclareWarInput): Promise<Result<{ warId: string }, string>>;
  withdraw(input: WithdrawInput): Promise<Result<{ bank: number; amount: number }, string>>;
}

export interface StoredGuild {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  memberIds: string[];
  bank: number;
}

export interface StoredWar {
  id: string;
  attackerGuildId: string;
  cityId: string;
  startsAtMs: number;
  gold: number;
  resources: number;
}

export interface GuildRepository {
  saveGuild(guild: StoredGuild): Promise<void>;
  findGuild(id: string): Promise<StoredGuild | null>;
  listGuilds(): Promise<StoredGuild[]>;
  saveWar(war: StoredWar): Promise<void>;
  listWars(): Promise<StoredWar[]>;
}
