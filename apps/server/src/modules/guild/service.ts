import { createGuild, declareWar, withdraw, GUILD_CREATE_GOLD } from '@rift/domain/guild';
import type {
  CreateGuildInput,
  DeclareWarInput,
  GoldPort,
  GuildMode,
  GuildRepository,
  GuildService as GuildServiceApi,
  Result,
  WithdrawInput,
} from './types';

const PREVIEW_NAME = 'Preview Guild';
const PREVIEW_TAG = 'PRE';

export interface GuildServiceOptions {
  mode: GuildMode;
  repository: GuildRepository;
  now: () => number;
  gold?: GoldPort;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCreate(input: unknown): CreateGuildInput | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  if (typeof input.name !== 'string' || typeof input.tag !== 'string') {
    return undefined;
  }
  if (typeof input.gold !== 'number' || !Array.isArray(input.members)) {
    return undefined;
  }
  const members: CreateGuildInput['members'] = [];
  for (const member of input.members) {
    if (!isRecord(member) || typeof member.id !== 'string' || typeof member.level !== 'number') {
      return undefined;
    }
    if (member.inGuild !== undefined && typeof member.inGuild !== 'boolean') {
      return undefined;
    }
    members.push({
      id: member.id,
      level: member.level,
      inGuild: member.inGuild,
    });
  }
  const first = members[0];
  const initiatorId = typeof input.initiatorId === 'string' ? input.initiatorId : (first?.id ?? '');
  const leaderId = typeof input.leaderId === 'string' ? input.leaderId : initiatorId;
  if (
    input.lastOfficeMs !== undefined &&
    input.lastOfficeMs !== null &&
    typeof input.lastOfficeMs !== 'number'
  ) {
    return undefined;
  }
  const lastOfficeMs =
    input.lastOfficeMs === null || typeof input.lastOfficeMs === 'number'
      ? input.lastOfficeMs
      : null;
  return {
    name: input.name,
    tag: input.tag,
    members,
    gold: input.gold,
    initiatorId,
    leaderId,
    lastOfficeMs,
  };
}

export class GuildService implements GuildServiceApi {
  private seq = 0;

  constructor(private readonly options: GuildServiceOptions) {}

  /**
   * Domain check only. `mode` is ignored and nothing is stored.
   * A passing check means the leader is eligible for the charter.
   */
  async previewCreate(
    members: { id: string; level: number }[],
    gold: number,
  ): Promise<Result<{ leaderReady: boolean }, string>> {
    const initiatorId = members[0]?.id ?? '';
    const drafted = createGuild({
      name: PREVIEW_NAME,
      tag: PREVIEW_TAG,
      initiatorId,
      leaderId: initiatorId,
      founders: members.map((member) => ({
        id: member.id,
        level: member.level,
        inGuild: false,
      })),
      gold,
      nowMs: this.options.now(),
      lastOfficeMs: null,
    });
    if (!drafted.ok) {
      return { ok: false, code: drafted.code };
    }
    return { ok: true, value: { leaderReady: true } };
  }

  async create(input: unknown): Promise<Result<{ guildId: string }, string>> {
    const parsed = parseCreate(input);
    if (!parsed) {
      return { ok: false, code: 'member' };
    }
    const drafted = createGuild({
      name: parsed.name,
      tag: parsed.tag,
      initiatorId: parsed.initiatorId ?? '',
      leaderId: parsed.leaderId ?? parsed.initiatorId ?? '',
      founders: parsed.members.map((member) => ({
        id: member.id,
        level: member.level,
        inGuild: member.inGuild ?? false,
      })),
      gold: parsed.gold,
      nowMs: this.options.now(),
      lastOfficeMs: parsed.lastOfficeMs ?? null,
    });
    if (!drafted.ok) {
      return { ok: false, code: drafted.code };
    }
    const paid = await this.chargeInitiator(parsed.initiatorId ?? '', GUILD_CREATE_GOLD);
    if (!paid.ok) {
      return paid;
    }
    const guildId = this.nextId('guild');
    await this.options.repository.saveGuild({
      id: guildId,
      name: drafted.value.name,
      tag: drafted.value.tag,
      leaderId: drafted.value.leaderId,
      memberIds: drafted.value.memberIds,
      bank: drafted.value.gold,
    });
    return { ok: true, value: { guildId } };
  }

  async creditTax(amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      return;
    }
    const guilds = await this.options.repository.listGuilds();
    if (guilds.length === 0) {
      return;
    }
    const share = Math.floor(amount / guilds.length);
    let remainder = amount - share * guilds.length;
    for (const guild of guilds) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      await this.options.repository.saveGuild({ ...guild, bank: guild.bank + share + extra });
    }
  }

  async declareWar(input: DeclareWarInput): Promise<Result<{ warId: string }, string>> {
    const stored = await this.options.repository.findGuild(input.attackerGuildId);
    const gold = input.gold ?? stored?.bank ?? 0;
    const resources = input.resources ?? 0;
    const declared = declareWar({
      attackerGuildId: input.attackerGuildId,
      cityId: input.cityId,
      gold,
      resources,
      nowMs: this.options.now(),
      leaderAbsent: input.leaderAbsent ?? false,
      leaderConsent: input.leaderConsent ?? false,
      councilConsents: input.councilConsents ?? 0,
      cityCapturedAtMs: input.cityCapturedAtMs ?? null,
      drawEndedAtMs: input.drawEndedAtMs ?? null,
      lastDeclaredAtMs: input.lastDeclaredAtMs ?? null,
    });
    if (!declared.ok) {
      return { ok: false, code: declared.code };
    }
    const warId = this.nextId('war');
    await this.options.repository.saveWar({
      id: warId,
      attackerGuildId: declared.value.attackerGuildId,
      cityId: declared.value.cityId,
      startsAtMs: declared.value.startsAtMs,
      gold: declared.value.gold,
      resources: declared.value.resources,
    });
    if (stored && input.gold === undefined) {
      await this.options.repository.saveGuild({ ...stored, bank: declared.value.gold });
    }
    return { ok: true, value: { warId } };
  }

  async withdraw(input: WithdrawInput): Promise<Result<{ bank: number; amount: number }, string>> {
    const guild = await this.options.repository.findGuild(input.guildId);
    if (!guild) {
      return { ok: false, code: 'member' };
    }
    const taken = withdraw({
      rank: input.rank,
      bank: guild.bank,
      amount: input.amount,
      leaderConfirm: input.leaderConfirm ?? false,
      councilConfirms: input.councilConfirms ?? 0,
      councilVote: input.councilVote ?? false,
    });
    if (!taken.ok) {
      return { ok: false, code: taken.code };
    }
    await this.options.repository.saveGuild({ ...guild, bank: taken.value.bank });
    return { ok: true, value: { bank: taken.value.bank, amount: taken.value.amount } };
  }

  private async chargeInitiator(
    characterId: string,
    amount: number,
  ): Promise<Result<{ gold: number }, 'gold'>> {
    const port = this.options.gold;
    if (!port) {
      return { ok: false, code: 'gold' };
    }
    return port.deduct(characterId, amount);
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq)}`;
  }
}
