import type { Appearance } from '@rift/domain/character';
import type { StatBlock } from '@rift/domain/stats';
import type { CharacterRecord } from './types';

export interface CharacterRepository {
  findById(id: string): Promise<CharacterRecord | null>;
  findByName(name: string): Promise<CharacterRecord | null>;
  listByAccount(accountId: string): Promise<CharacterRecord[]>;
  insert(record: CharacterRecord): Promise<void>;
  update(record: CharacterRecord): Promise<void>;
}

function copyStats(stats: StatBlock): StatBlock {
  return { ...stats };
}

function copyAppearance(appearance: Appearance): Appearance {
  return { ...appearance };
}

function copyRecord(record: CharacterRecord): CharacterRecord {
  return {
    id: record.id,
    accountId: record.accountId,
    name: record.name,
    raceId: record.raceId,
    controller: record.controller,
    level: record.level,
    experience: record.experience,
    clean: record.clean,
    createdAtMs: record.createdAtMs,
    bindNodeId: record.bindNodeId,
    hp: record.hp,
    od: record.od,
    appearance: copyAppearance(record.appearance),
    points: copyStats(record.points),
    unspent: record.unspent,
    stats: copyStats(record.stats),
    languages: { ...record.languages },
    phase: record.phase,
    ...(record.build !== undefined
      ? {
          build:
            record.build === null
              ? null
              : {
                  programs: record.build.programs.map((program) => ({ ...program })),
                  cores: record.build.cores.map((core) => ({ ...core })),
                  relicSocketFree: record.build.relicSocketFree,
                  relicGrade: record.build.relicGrade,
                  purifyingUntilMs: record.build.purifyingUntilMs,
                  echoIds: [...record.build.echoIds],
                },
        }
      : {}),
  };
}

export class MemoryCharacterRepository implements CharacterRepository {
  private readonly byId = new Map<string, CharacterRecord>();
  private readonly byName = new Map<string, string>();

  async findById(id: string): Promise<CharacterRecord | null> {
    const record = this.byId.get(id);
    return record === undefined ? null : copyRecord(record);
  }

  async findByName(name: string): Promise<CharacterRecord | null> {
    const id = this.byName.get(name);
    if (id === undefined) {
      return null;
    }
    return this.findById(id);
  }

  async listByAccount(accountId: string): Promise<CharacterRecord[]> {
    const rows: CharacterRecord[] = [];
    for (const record of this.byId.values()) {
      if (record.accountId === accountId) {
        rows.push(copyRecord(record));
      }
    }
    return rows;
  }

  async insert(record: CharacterRecord): Promise<void> {
    if (this.byId.has(record.id) || this.byName.has(record.name)) {
      throw new Error('character already exists');
    }
    this.byId.set(record.id, copyRecord(record));
    this.byName.set(record.name, record.id);
  }

  async update(record: CharacterRecord): Promise<void> {
    const existing = this.byId.get(record.id);
    if (existing === undefined) {
      throw new Error(`character not found: ${record.id}`);
    }
    if (existing.name !== record.name) {
      if (this.byName.has(record.name)) {
        throw new Error('character already exists');
      }
      this.byName.delete(existing.name);
      this.byName.set(record.name, record.id);
    }
    this.byId.set(record.id, copyRecord(record));
  }
}
