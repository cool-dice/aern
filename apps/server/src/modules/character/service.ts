import { randomUUID } from 'node:crypto';
import {
  RACES,
  createCharacter,
  finalStat,
  sideOf,
  type Controller,
  type RaceId,
} from '@rift/domain/character';
import { grantXp, spendPoint } from '@rift/domain/progression';
import { err, ok } from '@rift/domain/result';
import { STAT_IDS, derive, type StatBlock } from '@rift/domain/stats';
import type { Bus } from '../../shared/bus';
import type { CharacterRepository } from './repository';
import type { CharacterRecord, CharacterService, PrototypeFeatures, StarterGranter } from './types';

const RACE_BY_CONTROLLER = {
  player: 'human',
  bot: 'demon',
} as const satisfies Record<Controller, RaceId>;

const BIND_BY_SIDE = {
  light: 'fort_humans',
  dark: 'obsidian_tower',
} as const;

export interface CharacterServiceOptions {
  repository: CharacterRepository;
  granter: StarterGranter;
  features: PrototypeFeatures;
  bus: Bus;
  now: () => number;
}

export function createCharacterService(options: CharacterServiceOptions): CharacterService {
  return {
    async create(input) {
      const raceId = RACE_BY_CONTROLLER[input.controller];
      if (!options.features.playableRaces.includes(raceId)) {
        return err('race');
      }

      const created = createCharacter({
        raceId,
        controller: input.controller,
        clean: input.clean,
        name: input.name,
        appearance: input.appearance,
        points: input.points,
      });
      if (!created.ok) {
        return err(created.code);
      }

      const taken = await options.repository.findByName(created.value.name);
      if (taken !== null) {
        return err('name_taken');
      }

      const draft = created.value;
      const side = sideOf(draft.controller);
      const record: CharacterRecord = {
        id: randomUUID(),
        accountId: input.accountId,
        name: draft.name,
        raceId: draft.raceId,
        controller: draft.controller,
        level: draft.level,
        experience: draft.experience,
        clean: draft.clean,
        createdAtMs: options.now(),
        bindNodeId: BIND_BY_SIDE[side],
        hp: 0,
        od: 0,
        appearance: { ...draft.appearance },
        points: { ...draft.points },
        unspent: draft.unspent,
        stats: { ...draft.stats },
        languages: { ...draft.languages },
        phase: 'online',
      };
      refreshVitals(record);
      await options.repository.insert(record);
      await options.granter.grant(record.id);
      options.bus.emit('character.created', { characterId: record.id });
      return ok({ characterId: record.id });
    },

    async grantXp(characterId, amount) {
      const record = await requireCharacter(options.repository, characterId);
      const next = grantXp(
        {
          level: record.level,
          xp: record.experience,
          unspent: record.unspent,
          points: record.points,
        },
        amount,
      );
      record.level = next.level;
      record.experience = next.xp;
      record.unspent = next.unspent;
      record.points = next.points;
      refreshVitals(record);
      await options.repository.update(record);
    },

    async spend(characterId, stat) {
      const record = await options.repository.findById(characterId);
      if (record === null) {
        return err('missing');
      }
      const spent = spendPoint(
        {
          level: record.level,
          xp: record.experience,
          unspent: record.unspent,
          points: record.points,
        },
        stat,
      );
      if (!spent.ok) {
        return err(spent.code);
      }
      record.level = spent.value.level;
      record.experience = spent.value.xp;
      record.unspent = spent.value.unspent;
      record.points = spent.value.points;
      refreshVitals(record);
      await options.repository.update(record);
      return ok(undefined);
    },
  };
}

async function requireCharacter(
  repository: CharacterRepository,
  characterId: string,
): Promise<CharacterRecord> {
  const record = await repository.findById(characterId);
  if (record === null) {
    throw new Error(`character not found: ${characterId}`);
  }
  return record;
}

function refreshVitals(record: CharacterRecord): void {
  const race = RACES.find((candidate) => candidate.id === record.raceId);
  if (race === undefined) {
    throw new Error(`unknown race ${record.raceId}`);
  }
  const stats: StatBlock = { ...record.stats };
  for (const statId of STAT_IDS) {
    const points = record.points[statId];
    const racial = race.modifiers[statId];
    if (points === undefined || racial === undefined) {
      throw new Error(`missing stat ${statId}`);
    }
    stats[statId] = finalStat(points, racial, record.clean);
  }
  record.stats = stats;
  const derived = derive({
    stats,
    level: record.level,
    totalWeightKg: 0,
  });
  record.hp = derived.hp;
  record.od = derived.odLimit;
}
