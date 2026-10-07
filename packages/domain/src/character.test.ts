import { expect, test } from 'vitest';
import {
  RACES,
  createCharacter,
  finalStat,
  sideOf,
  type Appearance,
  type CharacterDraft,
  type Controller,
  type CreateError,
  type RaceId,
  type SideId,
} from './character';
import type { Result } from './result';
import { CREATION_STAT_POINTS, STAT_BASE, STAT_IDS, emptyPoints, type StatBlock } from './stats';

const appearance: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: true,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

function points(partial: Partial<StatBlock> = {}): StatBlock {
  return { ...emptyPoints(), ...partial };
}

function create(input: {
  raceId: RaceId;
  controller: Controller;
  clean?: boolean;
  name?: string;
  appearance?: Appearance;
  points: StatBlock;
}): Result<CharacterDraft, CreateError> {
  return createCharacter({
    raceId: input.raceId,
    controller: input.controller,
    clean: input.clean ?? false,
    name: input.name ?? 'Лиа',
    appearance: input.appearance ?? appearance,
    points: input.points,
  });
}

function expectError(result: Result<CharacterDraft, CreateError>, code: CreateError): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

test('side follows the controller and is not an input', () => {
  expect(sideOf('player')).toBe('light');
  expect(sideOf('bot')).toBe('dark');
});

test('every race sums to +6 and matches the artifact 2 table', () => {
  const expected: Record<RaceId, { side: SideId; modifiers: StatBlock }> = {
    human: {
      side: 'light',
      modifiers: points({
        body: 1,
        reaction: 1,
        accuracy: 1,
        will: 1,
        perception: 1,
        technique: 1,
      }),
    },
    demon: {
      side: 'dark',
      modifiers: points({
        body: 1,
        reaction: 1,
        accuracy: 1,
        will: 1,
        perception: 1,
        technique: 1,
      }),
    },
    elf: {
      side: 'light',
      modifiers: points({
        body: -2,
        reaction: 3,
        accuracy: 1,
        will: 2,
        perception: 2,
        technique: 0,
      }),
    },
    dark_elf: {
      side: 'dark',
      modifiers: points({
        body: 2,
        reaction: 3,
        accuracy: 1,
        will: -2,
        perception: 2,
        technique: 0,
      }),
    },
    dwarf: {
      side: 'light',
      modifiers: points({
        body: 3,
        reaction: -2,
        accuracy: 0,
        will: 1,
        perception: 2,
        technique: 2,
      }),
    },
    goblin: {
      side: 'dark',
      modifiers: points({
        body: -2,
        reaction: 2,
        accuracy: 1,
        will: 0,
        perception: 2,
        technique: 3,
      }),
    },
    troll: {
      side: 'light',
      modifiers: points({
        body: 3,
        reaction: 1,
        accuracy: -2,
        will: 2,
        perception: 0,
        technique: 2,
      }),
    },
    ogre: {
      side: 'dark',
      modifiers: points({
        body: 3,
        reaction: -2,
        accuracy: 0,
        will: 2,
        perception: 1,
        technique: 2,
      }),
    },
  };

  expect(RACES.map((race) => race.id)).toEqual([
    'human',
    'demon',
    'elf',
    'dark_elf',
    'dwarf',
    'goblin',
    'troll',
    'ogre',
  ]);

  for (const race of RACES) {
    const row = expected[race.id];
    expect(race.side).toBe(row.side);
    expect(race.modifiers).toEqual(row.modifiers);
    const sum = STAT_IDS.reduce((total, id) => total + (race.modifiers[id] ?? 0), 0);
    expect(sum).toBe(6);
  }
});

test('human example: 10/5/5 points become 16/11/11/6/6/6', () => {
  const result = create({
    raceId: 'human',
    controller: 'player',
    points: points({ body: 10, reaction: 5, accuracy: 5 }),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value).toEqual({
    raceId: 'human',
    controller: 'player',
    side: 'light',
    clean: false,
    name: 'Лиа',
    appearance,
    points: points({ body: 10, reaction: 5, accuracy: 5 }),
    unspent: 0,
    stats: points({ body: 16, reaction: 11, accuracy: 11, will: 6, perception: 6, technique: 6 }),
    languages: { common_light: 100, common_dark: 0, ancient: 0 },
    level: 1,
    experience: 0,
  });
});

test('dwarf example: 10 body, 5 technique, 5 will', () => {
  const result = create({
    raceId: 'dwarf',
    controller: 'player',
    points: points({ body: 10, technique: 5, will: 5 }),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.stats).toEqual(
    points({ body: 18, reaction: 3, accuracy: 5, will: 11, perception: 7, technique: 12 }),
  );
  expect(result.value.points).toEqual(points({ body: 10, technique: 5, will: 5 }));
  expect(result.value.unspent).toBe(0);
  expect(result.value.side).toBe('light');
});

test('a race of the other side is rejected and a matching dark race is accepted', () => {
  expectError(
    create({ raceId: 'demon', controller: 'player', points: points({ body: 10, reaction: 10 }) }),
    'race_side',
  );
  expectError(
    create({ raceId: 'human', controller: 'bot', points: points({ body: 10, reaction: 10 }) }),
    'race_side',
  );

  const goblin = create({
    raceId: 'goblin',
    controller: 'bot',
    points: points({ body: 10, reaction: 10 }),
  });
  expect(goblin.ok).toBe(true);
  if (goblin.ok) {
    expect(goblin.value.side).toBe('dark');
    expect(goblin.value.languages).toEqual({ common_light: 0, common_dark: 100, ancient: 0 });
    expect(goblin.value.level).toBe(1);
    expect(goblin.value.experience).toBe(0);
  }
});

test('creation accepts every race whose side matches the controller', () => {
  for (const race of RACES) {
    const controller: Controller = race.side === 'light' ? 'player' : 'bot';
    const created = create({
      raceId: race.id,
      controller,
      points: points({ body: 10, reaction: 5, accuracy: 5 }),
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.side).toBe(race.side);
      expect(created.value.stats.body).toBe(finalStat(10, race.modifiers.body ?? 0, false));
    }

    const crossed = create({
      raceId: race.id,
      controller: controller === 'player' ? 'bot' : 'player',
      points: points({ body: 10, reaction: 5, accuracy: 5 }),
    });
    expectError(crossed, 'race_side');
  }
});

test('the point budget must be exactly 20 and no stat may take more than 10', () => {
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      points: points({ body: 10, reaction: 6, accuracy: 5 }),
    }),
    'points_total',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      points: points({ body: 10, reaction: 4, accuracy: 5 }),
    }),
    'points_total',
  );
  expectError(
    create({ raceId: 'human', controller: 'player', points: points({ body: 11, reaction: 9 }) }),
    'points_stat',
  );
  expect(
    points({ body: 10, reaction: 10 }).body + points({ body: 10, reaction: 10 }).reaction,
  ).toBe(CREATION_STAT_POINTS);
  const atCap = create({
    raceId: 'human',
    controller: 'player',
    points: points({ body: 10, reaction: 10 }),
  });
  expect(atCap.ok).toBe(true);
});

test('negative allocated points are rejected when the budget is otherwise 20', () => {
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      points: points({ body: -1, reaction: 10, accuracy: 10, will: 1 }),
    }),
    'points_negative',
  );
});

test('clean raises the cap to 25 and does not change a stat that is already under it', () => {
  const clean = create({
    raceId: 'human',
    controller: 'player',
    clean: true,
    points: points({ body: 10, reaction: 5, accuracy: 5 }),
  });
  expect(clean.ok).toBe(true);
  if (clean.ok) {
    expect(clean.value.clean).toBe(true);
    expect(clean.value.stats.body).toBe(16);
  }

  expect(finalStat(10, 12, false)).toBe(20);
  expect(finalStat(10, 12, true)).toBe(25);
  expect(finalStat(0, 0, false)).toBe(STAT_BASE);
  expect(emptyPoints()).toEqual(points());
});

test('names are 3–16 unicode letters, digits, or single spaces', () => {
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      name: 'Ab',
      points: points({ body: 10, reaction: 10 }),
    }),
    'name',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      name: '  Имя',
      points: points({ body: 10, reaction: 10 }),
    }),
    'name',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      name: 'Ли  А',
      points: points({ body: 10, reaction: 10 }),
    }),
    'name',
  );

  const accepted = create({
    raceId: 'human',
    controller: 'player',
    name: 'Лиа',
    points: points({ body: 10, reaction: 10 }),
  });
  expect(accepted.ok).toBe(true);
  if (accepted.ok) {
    expect(accepted.value.name).toBe('Лиа');
  }

  const cased = create({
    raceId: 'human',
    controller: 'player',
    name: 'ЛиА',
    points: points({ body: 10, reaction: 10 }),
  });
  expect(cased.ok).toBe(true);
  if (cased.ok) {
    expect(cased.value.name).toBe('ЛиА');
  }

  const sixteen = 'Абвгдеёжзийклмно';
  expect([...sixteen].length).toBe(16);
  expect(
    create({
      raceId: 'human',
      controller: 'player',
      name: sixteen,
      points: points({ body: 10, reaction: 10 }),
    }).ok,
  ).toBe(true);
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      name: `${sixteen}п`,
      points: points({ body: 10, reaction: 10 }),
    }),
    'name',
  );
});

test('appearance is cosmetic and height is 120..250', () => {
  const tall = {
    ...appearance,
    heightCm: 250,
    skin: 'a'.repeat(32),
  };
  const created = create({
    raceId: 'human',
    controller: 'player',
    appearance: tall,
    points: points({ body: 10, reaction: 5, accuracy: 5 }),
  });
  expect(created.ok).toBe(true);
  if (created.ok) {
    expect(created.value.appearance).toEqual(tall);
    expect(created.value.stats).toEqual(
      points({ body: 16, reaction: 11, accuracy: 11, will: 6, perception: 6, technique: 6 }),
    );
  }

  expect(
    create({
      raceId: 'human',
      controller: 'player',
      appearance: { ...appearance, heightCm: 120 },
      points: points({ body: 10, reaction: 10 }),
    }).ok,
  ).toBe(true);

  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      appearance: { ...appearance, heightCm: 119 },
      points: points({ body: 10, reaction: 10 }),
    }),
    'appearance',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      appearance: { ...appearance, heightCm: 251 },
      points: points({ body: 10, reaction: 10 }),
    }),
    'appearance',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      appearance: { ...appearance, skin: '' },
      points: points({ body: 10, reaction: 10 }),
    }),
    'appearance',
  );
  expectError(
    create({
      raceId: 'human',
      controller: 'player',
      appearance: { ...appearance, scars: 'a'.repeat(33) },
      points: points({ body: 10, reaction: 10 }),
    }),
    'appearance',
  );
});
