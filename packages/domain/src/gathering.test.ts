import { expect, test } from 'vitest';
import { mulberry32, type Rng } from './rng';
import { SIM_TICK_MS } from './time';
import {
  NODE_IDS,
  NODES,
  advanceRespawn,
  gatherSeconds,
  refine,
  respawnDurationMs,
  rollGather,
  wearTool,
  type NodeId,
  type Quality,
  type ToolId,
  type ToolKind,
} from './gathering';

function scripted(ints: number[], units: number[] = []): Rng & { unitCalls: number } {
  let intIndex = 0;
  let unitIndex = 0;
  let unitCalls = 0;
  const rng: Rng & { unitCalls: number } = {
    get unitCalls() {
      return unitCalls;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError(`maxExclusive must be an integer >= 1, got ${String(maxExclusive)}`);
      }
      const value = ints[intIndex];
      intIndex += 1;
      if (value === undefined) {
        throw new Error('nextInt starved');
      }
      return value;
    },
    nextUnit(): number {
      unitCalls += 1;
      const value = units[unitIndex];
      unitIndex += 1;
      if (value === undefined) {
        throw new Error('nextUnit starved');
      }
      return value;
    },
  };
  return rng;
}

function gather(partial: {
  nodeId?: string;
  technique?: number;
  tool?: ToolId;
  toolKind?: ToolKind;
  overloaded?: boolean;
  inCombat?: boolean;
  interrupted?: boolean;
  occupiedByOther?: boolean;
  taxRate?: number;
  seasonBonus?: boolean;
  rng?: Rng;
}) {
  return rollGather({
    nodeId: partial.nodeId ?? 'mine_metal',
    technique: partial.technique ?? 0,
    tool: partial.tool ?? 'basic',
    toolKind: partial.toolKind ?? 'pick',
    overloaded: partial.overloaded ?? false,
    inCombat: partial.inCombat ?? false,
    interrupted: partial.interrupted ?? false,
    occupiedByOther: partial.occupiedByOther ?? false,
    taxRate: partial.taxRate ?? 0,
    seasonBonus: partial.seasonBonus ?? false,
    rng: partial.rng ?? scripted([0], [0.5]),
  });
}

test('node catalog ids, tools, times, respawn, and quantities are stable', () => {
  expect(NODE_IDS).toEqual([
    'mine_metal',
    'mine_stone',
    'deep_mine',
    'shaft_crystal',
    'shaft_alloy',
    'grove',
    'hunt_leather',
    'hunt_bone',
    'fungus',
    'bioreactor_amino',
    'bioreactor_matrix',
    'scrap_shard',
    'scrap_cell',
    'spring',
    'dungeon_small',
  ]);

  const rows: Array<{
    id: NodeId;
    resource: string | null;
    baseSeconds: number;
    respawnMinutes: number;
    qtyMin: number;
    qtyMax: number;
    toolKind: ToolKind | null;
    hasQuality: boolean;
  }> = [
    {
      id: 'mine_metal',
      resource: 'metal',
      baseSeconds: 30,
      respawnMinutes: 30,
      qtyMin: 3,
      qtyMax: 5,
      toolKind: 'pick',
      hasQuality: true,
    },
    {
      id: 'mine_stone',
      resource: 'stone',
      baseSeconds: 20,
      respawnMinutes: 30,
      qtyMin: 3,
      qtyMax: 5,
      toolKind: 'pick',
      hasQuality: true,
    },
    {
      id: 'deep_mine',
      resource: 'titanium',
      baseSeconds: 90,
      respawnMinutes: 60,
      qtyMin: 1,
      qtyMax: 2,
      toolKind: 'pick',
      hasQuality: true,
    },
    {
      id: 'shaft_crystal',
      resource: 'crystals',
      baseSeconds: 60,
      respawnMinutes: 45,
      qtyMin: 2,
      qtyMax: 3,
      toolKind: 'pick',
      hasQuality: true,
    },
    {
      id: 'shaft_alloy',
      resource: 'alloys',
      baseSeconds: 120,
      respawnMinutes: 60,
      qtyMin: 1,
      qtyMax: 2,
      toolKind: 'pick',
      hasQuality: true,
    },
    {
      id: 'grove',
      resource: 'wood',
      baseSeconds: 20,
      respawnMinutes: 30,
      qtyMin: 4,
      qtyMax: 6,
      toolKind: 'axe',
      hasQuality: true,
    },
    {
      id: 'hunt_leather',
      resource: 'leather',
      baseSeconds: 30,
      respawnMinutes: 30,
      qtyMin: 2,
      qtyMax: 4,
      toolKind: 'knife',
      hasQuality: true,
    },
    {
      id: 'hunt_bone',
      resource: 'bone',
      baseSeconds: 30,
      respawnMinutes: 30,
      qtyMin: 2,
      qtyMax: 4,
      toolKind: 'knife',
      hasQuality: true,
    },
    {
      id: 'fungus',
      resource: 'spores',
      baseSeconds: 45,
      respawnMinutes: 45,
      qtyMin: 3,
      qtyMax: 5,
      toolKind: 'scalpel',
      hasQuality: true,
    },
    {
      id: 'bioreactor_amino',
      resource: 'amino',
      baseSeconds: 60,
      respawnMinutes: 60,
      qtyMin: 2,
      qtyMax: 3,
      toolKind: 'scalpel',
      hasQuality: true,
    },
    {
      id: 'bioreactor_matrix',
      resource: 'organic_matrix',
      baseSeconds: 180,
      respawnMinutes: 120,
      qtyMin: 1,
      qtyMax: 1,
      toolKind: 'scalpel',
      hasQuality: true,
    },
    {
      id: 'scrap_shard',
      resource: 'relic_shard',
      baseSeconds: 90,
      respawnMinutes: 60,
      qtyMin: 1,
      qtyMax: 2,
      toolKind: 'manipulator',
      hasQuality: true,
    },
    {
      id: 'scrap_cell',
      resource: 'energy_cell',
      baseSeconds: 60,
      respawnMinutes: 45,
      qtyMin: 1,
      qtyMax: 2,
      toolKind: 'manipulator',
      hasQuality: true,
    },
    {
      id: 'spring',
      resource: 'water',
      baseSeconds: 15,
      respawnMinutes: 20,
      qtyMin: 5,
      qtyMax: 10,
      toolKind: 'flask',
      hasQuality: false,
    },
    {
      id: 'dungeon_small',
      resource: null,
      baseSeconds: 10,
      respawnMinutes: 15,
      qtyMin: 1,
      qtyMax: 2,
      toolKind: null,
      hasQuality: true,
    },
  ];

  expect(rows).toHaveLength(NODE_IDS.length);
  for (const row of rows) {
    expect(NODES[row.id]).toEqual(row);
    expect(respawnDurationMs(row.id)).toBe(row.respawnMinutes * 60_000);
  }
});

test('metal at technique 10 with a basic tool takes 20 seconds', () => {
  expect(gatherSeconds(30, 10, 'basic', true)).toBe(20);
  const result = gather({ technique: 10, tool: 'basic', toolKind: 'pick' });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.seconds).toBe(20);
  }
});

test('gather time floors at 5 seconds', () => {
  expect(gatherSeconds(10, 20, 'master', true)).toBe(5);
});

test('no tool halves speed and a closed technique gate counts as no tool', () => {
  expect(gatherSeconds(30, 0, 'none', true)).toBe(60);
  expect(gatherSeconds(30, 0, 'basic', true)).toBe(30);
  expect(gatherSeconds(30, 5, 'advanced', false)).toBe(gatherSeconds(30, 5, 'none', true));
  expect(gatherSeconds(10, 20, 'master', false)).toBe(10);
});

test('combat and overload refuse before a roll', () => {
  const rng = scripted([], []);
  expect(gather({ inCombat: true, overloaded: true, rng })).toEqual({ ok: false, code: 'combat' });
  expect(gather({ overloaded: true, rng })).toEqual({ ok: false, code: 'overweight' });
  expect(() => rng.nextInt(1)).toThrow(/starved/);
  expect(() => rng.nextUnit()).toThrow(/starved/);
});

test('another player on the node is busy and damage interrupts', () => {
  expect(gather({ occupiedByOther: true })).toEqual({ ok: false, code: 'busy' });
  expect(gather({ interrupted: true })).toEqual({ ok: false, code: 'interrupted' });
  expect(gather({ occupiedByOther: true, interrupted: true })).toEqual({ ok: false, code: 'busy' });
});

test('tax is 30 percent of 5 and zero tax leaves the stack', () => {
  const taxed = gather({ taxRate: 30, rng: scripted([2], [0.5]) });
  expect(taxed).toEqual({
    ok: true,
    value: { qty: 5, tax: 1, playerQty: 4, quality: 'normal', seconds: 30 },
  });

  const free = gather({ taxRate: 0, rng: scripted([2], [0.5]) });
  expect(free).toEqual({
    ok: true,
    value: { qty: 5, tax: 0, playerQty: 5, quality: 'normal', seconds: 30 },
  });
});

test('tax rate outside 0..30 throws RangeError', () => {
  expect(() => gather({ taxRate: -1 })).toThrow(RangeError);
  expect(() => gather({ taxRate: 31 })).toThrow(RangeError);
  expect(() => gather({ taxRate: Number.NaN })).toThrow(RangeError);
});

test('season bonus adds 1 before tax', () => {
  const result = gather({ seasonBonus: true, taxRate: 30, rng: scripted([0], [0.5]) });
  expect(result).toEqual({
    ok: true,
    value: { qty: 4, tax: 1, playerQty: 3, quality: 'normal', seconds: 30 },
  });
});

test('water has no quality even with a master flask', () => {
  const rng = scripted([0], []);
  const result = gather({
    nodeId: 'spring',
    technique: 20,
    tool: 'master',
    toolKind: 'flask',
    rng,
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.quality).toBe('none');
    expect(result.value.qty).toBe(5);
    expect(result.value.seconds).toBe(5);
  }
  expect(() => rng.nextUnit()).toThrow(/starved/);
});

test('master quality thresholds use nextUnit', () => {
  const cases: Array<[number, Quality]> = [
    [0, 'pure'],
    [0.1, 'cleaned'],
    [0.149, 'pure'],
    [0.15, 'cleaned'],
    [0.49, 'cleaned'],
    [0.5, 'normal'],
    [0.9, 'normal'],
  ];
  for (const [unit, quality] of cases) {
    const result = gather({
      technique: 10,
      tool: 'master',
      toolKind: 'pick',
      rng: scripted([0], [unit]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quality).toBe(quality);
    }
  }
});

test('basic and no-tool quality thresholds', () => {
  const cases: Array<[number, Quality]> = [
    [0, 'pure'],
    [0.009, 'pure'],
    [0.01, 'cleaned'],
    [0.09, 'cleaned'],
    [0.1, 'normal'],
    [0.9, 'normal'],
  ];
  for (const tool of ['basic', 'none'] as const) {
    for (const [unit, quality] of cases) {
      const result = gather({
        technique: 0,
        tool,
        toolKind: 'pick',
        rng: scripted([0], [unit]),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.quality).toBe(quality);
      }
    }
  }
});

test('advanced tool at technique 5 uses the no-tool band and multiplier', () => {
  const closed = gather({
    technique: 5,
    tool: 'advanced',
    toolKind: 'pick',
    rng: scripted([0], [0.02]),
  });
  expect(closed.ok).toBe(true);
  if (closed.ok) {
    expect(closed.value.quality).toBe('cleaned');
    expect(closed.value.seconds).toBe(gatherSeconds(30, 5, 'none', true));
  }

  const open = gather({
    technique: 6,
    tool: 'advanced',
    toolKind: 'pick',
    rng: scripted([0], [0.02]),
  });
  expect(open.ok).toBe(true);
  if (open.ok) {
    expect(open.value.quality).toBe('pure');
    expect(open.value.seconds).toBe(gatherSeconds(30, 6, 'advanced', true));
  }
});

test('advanced quality bands are 5 percent pure and 25 percent cleaned', () => {
  const cases: Array<[number, Quality]> = [
    [0.049, 'pure'],
    [0.05, 'cleaned'],
    [0.29, 'cleaned'],
    [0.3, 'normal'],
  ];
  for (const [unit, quality] of cases) {
    const result = gather({
      technique: 6,
      tool: 'advanced',
      toolKind: 'pick',
      rng: scripted([0], [unit]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quality).toBe(quality);
    }
  }
});

test('the wrong tool kind counts as no tool', () => {
  const result = gather({
    technique: 10,
    tool: 'master',
    toolKind: 'axe',
    rng: scripted([0], [0.05]),
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.quality).toBe('cleaned');
    expect(result.value.seconds).toBe(40);
  }
});

test('a small dungeon node accepts any tool and rolls 1..2', () => {
  const result = gather({
    nodeId: 'dungeon_small',
    technique: 10,
    tool: 'master',
    toolKind: 'flask',
    rng: scripted([1], [0]),
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.qty).toBe(2);
    expect(result.value.quality).toBe('pure');
    expect(result.value.seconds).toBe(5);
  }
  expect(NODES.dungeon_small.resource).toBeNull();
});

test('unknown node throws RangeError', () => {
  expect(() => gather({ nodeId: 'toString' })).toThrow(RangeError);
  expect(() => gather({ nodeId: 'unique_core' })).toThrow(RangeError);
});

test('a domain rng can roll a gather without a second generator', () => {
  const result = gather({ technique: 10, tool: 'basic', toolKind: 'pick', rng: mulberry32(1) });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.seconds).toBe(20);
    expect(result.value.qty).toBeGreaterThanOrEqual(3);
    expect(result.value.qty).toBeLessThanOrEqual(5);
    expect(['normal', 'cleaned', 'pure']).toContain(result.value.quality);
  }
});

test('refine spends every batch qty and gold can pay', () => {
  // floor(7/3) and floor(25/10) are both 2, so two batches: 6 items and 20 gold.
  expect(refine(7, 25)).toEqual({
    ok: true,
    value: { normalLeft: 1, cleanedGained: 2, gold: 5 },
  });
  expect(refine(4, 25)).toEqual({
    ok: true,
    value: { normalLeft: 1, cleanedGained: 1, gold: 15 },
  });
  expect(refine(7, 15)).toEqual({
    ok: true,
    value: { normalLeft: 4, cleanedGained: 1, gold: 5 },
  });
});

test('refine fails when a batch cannot start', () => {
  expect(refine(2, 100)).toEqual({ ok: false, code: 'qty' });
  expect(refine(2, 0)).toEqual({ ok: false, code: 'qty' });
  expect(refine(6, 9)).toEqual({ ok: false, code: 'gold' });
  expect(() => refine(-1, 10)).toThrow(RangeError);
  expect(() => refine(3, -1)).toThrow(RangeError);
});

test('respawn stays put with nobody online and moves by the sim tick otherwise', () => {
  expect(SIM_TICK_MS).toBe(100);
  const full = respawnDurationMs('mine_metal');
  expect(full).toBe(1_800_000);
  expect(advanceRespawn(full, false, SIM_TICK_MS)).toBe(full);
  expect(advanceRespawn(full, true, SIM_TICK_MS)).toBe(full - SIM_TICK_MS);
  expect(advanceRespawn(50, true, SIM_TICK_MS)).toBe(0);
  expect(advanceRespawn(0, true, 0)).toBe(0);
});

test('a successful gather wears the tool by 1 and destroys it at 0', () => {
  expect(wearTool(100)).toEqual({ durability: 99, destroyed: false });
  expect(wearTool(1)).toEqual({ durability: 0, destroyed: true });
  expect(wearTool(0.4)).toEqual({ durability: 0, destroyed: true });
  expect(wearTool(0)).toEqual({ durability: 0, destroyed: true });
  expect(() => wearTool(101)).toThrow(RangeError);
});
