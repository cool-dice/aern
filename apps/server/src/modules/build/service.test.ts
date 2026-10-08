import type { BuildState, Program } from '@rift/domain/build';
import type { RelicState } from '@rift/domain/relics';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { createBuildService } from './service';

function state(overrides: Partial<BuildState> = {}): BuildState {
  return {
    clean: false,
    purifyingUntilMs: null,
    level: 20,
    will: 2,
    programs: [],
    cores: [{ templateId: 'heart', grade: 5, implant: true }],
    relicSocketFree: 2,
    inCityOrHub: true,
    inCombat: false,
    ...overrides,
  };
}

function echo(): Program {
  return { templateId: 'memory', grade: 3, kind: 'echo', forgetting: 0, idleMs: 0 };
}

function spore(): RelicState {
  return {
    subtype: 'spore',
    grade: 'common',
    durability: 100,
    fed: true,
    onlineWornMs: 0,
    silencedUntilMs: 0,
    echoIds: [],
  };
}

test('a spore installs immediately and an overloaded echo reports neuroshock', () => {
  const service = createBuildService(createBus());
  const installed = service.installRelic({
    characterId: 'lia',
    clean: false,
    inCombat: false,
    inCityOrHub: true,
    gold: 0,
    subtype: 'spore',
    nowMs: 1_000,
    relic: spore(),
  });
  expect(installed.ok).toBe(true);
  if (installed.ok) {
    expect(installed.value.gold).toBe(0);
    expect(installed.value.readyAtMs).toBe(1_000);
  }

  expect(
    service.installRelic({
      characterId: 'lia',
      clean: false,
      inCombat: false,
      inCityOrHub: true,
      gold: 0,
      subtype: 'culture',
      nowMs: 1_000,
      relic: { ...spore(), subtype: 'culture' },
    }),
  ).toEqual({ ok: false, code: 'gold' });

  expect(
    service.installRelic({
      characterId: 'lia',
      clean: false,
      inCombat: true,
      inCityOrHub: true,
      gold: 100,
      subtype: 'culture',
      nowMs: 1_000,
      relic: { ...spore(), subtype: 'culture' },
    }),
  ).toEqual({ ok: false, code: 'combat' });

  const shocked = service.installEcho({ characterId: 'lia', state: state(), program: echo() });
  expect(shocked.ok).toBe(true);
  if (shocked.ok) {
    expect(shocked.value.neuroshock).toBe(true);
  }
});
