import type { GuildRepository, StoredGuild, StoredWar } from './types';

function copyGuild(guild: StoredGuild): StoredGuild {
  return {
    id: guild.id,
    name: guild.name,
    tag: guild.tag,
    leaderId: guild.leaderId,
    memberIds: [...guild.memberIds],
    bank: guild.bank,
  };
}

function copyWar(war: StoredWar): StoredWar {
  return { ...war };
}

export class MemoryGuildRepository implements GuildRepository {
  private readonly guilds = new Map<string, StoredGuild>();
  private readonly wars: StoredWar[] = [];

  async saveGuild(guild: StoredGuild): Promise<void> {
    this.guilds.set(guild.id, copyGuild(guild));
  }

  async findGuild(id: string): Promise<StoredGuild | null> {
    const guild = this.guilds.get(id);
    return guild ? copyGuild(guild) : null;
  }

  async listGuilds(): Promise<StoredGuild[]> {
    return [...this.guilds.values()].map(copyGuild);
  }

  async saveWar(war: StoredWar): Promise<void> {
    this.wars.push(copyWar(war));
  }

  async listWars(): Promise<StoredWar[]> {
    return this.wars.map(copyWar);
  }
}
