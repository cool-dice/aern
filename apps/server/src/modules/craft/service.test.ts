import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOTYPE_RECIPE_IDS } from '@rift/content';
import { expect, test } from 'vitest';
import { createBus } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { MemoryCrafterStore, MemoryItemSink, MemoryMaterialBank } from './repository';
import { createCraftModule, loadCraftCatalog, type CraftModule } from './service';
import type { CraftRng, CrafterState } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));

function scripted(value: number): CraftRng {
  return {
    nextInt(maxExclusive: number): number {
      if (value >= maxExclusive) {
        throw new Error(`scripted roll ${String(value)} is outside [0, ${String(maxExclusive)})`);
      }
      return value;
    },
    nextUnit(): number {
      return 0;
    },
  };
}

function harness(options: { seed?: number; rng?: CraftRng; fullRecipes?: boolean } = {}): {
  craft: CraftModule;
  bank: MemoryMaterialBank;
  sink: MemoryItemSink;
  crafters: MemoryCrafterStore;
  clock: ReturnType<typeof manualClock>;
  events: { characterId: string; itemId: string }[];
} {
  const bank = new MemoryMaterialBank();
  const sink = new MemoryItemSink();
  const crafters = new MemoryCrafterStore();
  const clock = manualClock(1_000_000);
  const bus = createBus();
  const events: { characterId: string; itemId: string }[] = [];
  bus.on('item.crafted', (payload) => {
    events.push(payload);
  });
  const craft = createCraftModule({
    bank,
    sink,
    crafters,
    seed: options.seed,
    rng: options.rng,
    fullRecipes: options.fullRecipes,
  });
  const ctx = { bus, now: () => clock.now() };
  expect(Object.keys(ctx).sort()).toEqual(['bus', 'now']);
  craft.start(ctx);
  return { craft, bank, sink, crafters, clock, events };
}

async function place(
  crafters: MemoryCrafterStore,
  characterId: string,
  overrides: Partial<CrafterState> = {},
): Promise<void> {
  await crafters.save(characterId, {
    nodeId: 'fort_humans',
    inCombat: false,
    languageUpy: 100,
    gold: 100,
    skills: { weaponsmith: { level: 1, xp: 0 } },
    ...overrides,
  });
}

test('loads 139 catalog recipes and the eight prototype ids', () => {
  const catalog = loadCraftCatalog();
  const marked = catalog.recipes.filter((recipe) => recipe.prototype).map((recipe) => recipe.id);
  expect(catalog.recipes).toHaveLength(139);
  expect(marked.slice().sort()).toEqual([...PROTOTYPE_RECIPE_IDS].sort());
  expect(catalog.nodeKinds.get('fort_humans')).toBe('city');
  expect(catalog.nodeKinds.get('cross_light')).toBe('hub');
});

test('prototype rusty_sword starts in the fort', async () => {
  const { craft, bank, crafters, clock } = harness({ rng: scripted(0) });
  await place(crafters, 'c1');
  await bank.seed('c1', { metal: 5, wood: 1 });

  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(started).toEqual({
    ok: true,
    value: { readyAtMs: clock.now() + 600_000, jobId: started.ok ? started.value.jobId : '' },
  });
  expect(await bank.read('c1')).toEqual({ wood: 1 });
  const crafter = await crafters.get('c1');
  expect(crafter?.gold).toBe(100);
  expect(crafter?.skills.weaponsmith).toEqual({ level: 1, xp: 1 });
});

test('rift_blade is not in the prototype while an unknown recipe is missing', async () => {
  const { craft, bank, crafters, clock } = harness();
  await place(crafters, 'c1');
  await bank.seed('c1', { titanium: 25, crystals: 6, unique_component: 1 });

  const hidden = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rift_blade',
    itemLevel: 30,
    accelerate: false,
    nowMs: clock.now(),
  });
  const unknown = await craft.service().start({
    characterId: 'c1',
    recipeId: 'not_a_recipe',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(hidden).toEqual({ ok: false, code: 'not_in_prototype' });
  expect(unknown).toEqual({ ok: false, code: 'missing' });
  expect(await bank.read('c1')).toEqual({ titanium: 25, crystals: 6, unique_component: 1 });
  expect((await crafters.get('c1'))?.gold).toBe(100);
});

test('acceleration halves readyAt for the same rng seed and charges the rush fee', async () => {
  const nowMs = 1_000_000;
  const plain = harness({ seed: 17 });
  const rushed = harness({ seed: 17 });
  await place(plain.crafters, 'c1');
  await place(rushed.crafters, 'c1');
  await plain.bank.seed('c1', { metal: 5 });
  await rushed.bank.seed('c1', { metal: 5 });

  const slow = await plain.craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs,
  });
  const fast = await rushed.craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: true,
    nowMs,
  });

  expect(slow.ok).toBe(true);
  expect(fast.ok).toBe(true);
  if (!slow.ok || !fast.ok) {
    return;
  }
  expect((fast.value.readyAtMs - nowMs) * 2).toBe(slow.value.readyAtMs - nowMs);
  expect(await plain.crafters.get('c1')).toMatchObject({ gold: 100 });
  expect(await rushed.crafters.get('c1')).toMatchObject({ gold: 98 });
});

test('complete early creates nothing; complete on time puts one item and one event', async () => {
  const { craft, bank, sink, crafters, clock, events } = harness({ rng: scripted(0) });
  await place(crafters, 'c1');
  await bank.seed('c1', { metal: 5 });
  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });
  expect(started.ok).toBe(true);
  if (!started.ok) {
    return;
  }

  const early = await craft.service().complete('c1', started.value.jobId, clock.now());
  expect(early).toEqual({ ok: false, code: 'early' });
  expect(sink.placed).toHaveLength(0);
  expect(events).toHaveLength(0);

  clock.advance(started.value.readyAtMs - clock.now());
  const done = await craft.service().complete('c1', started.value.jobId, clock.now());
  expect(done.ok).toBe(true);
  if (!done.ok) {
    return;
  }
  expect(sink.placed).toEqual([
    {
      characterId: 'c1',
      templateId: 'rusty_sword',
      grade: 'common',
      itemLevel: 1,
      recipeId: 'rusty_sword',
      itemId: done.value.itemId,
    },
  ]);
  expect(events).toEqual([{ characterId: 'c1', itemId: done.value.itemId }]);

  const again = await craft.service().complete('c1', started.value.jobId, clock.now());
  expect(again).toEqual({ ok: false, code: 'missing' });
  expect(sink.placed).toHaveLength(1);
  expect(events).toHaveLength(1);
});

test('a material shortage leaves the bank unchanged', async () => {
  const { craft, bank, crafters, clock } = harness({ rng: scripted(0) });
  await place(crafters, 'c1');
  await bank.seed('c1', { metal: 4 });

  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(started).toEqual({ ok: false, code: 'materials' });
  expect(await bank.read('c1')).toEqual({ metal: 4 });
});

test('crafting outside a city or hub returns zone and does not spend materials', async () => {
  const { craft, bank, crafters, clock } = harness({ rng: scripted(0) });
  await place(crafters, 'c1', { nodeId: 'plains_mine' });
  await bank.seed('c1', { metal: 5 });

  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(started).toEqual({ ok: false, code: 'zone' });
  expect(await bank.read('c1')).toEqual({ metal: 5 });
});

test('a hub is a legal craft zone', async () => {
  const { craft, bank, crafters, clock } = harness({ rng: scripted(0) });
  await place(crafters, 'c1', { nodeId: 'cross_light' });
  await bank.seed('c1', { metal: 5 });

  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(started.ok).toBe(true);
});

test('combat blocks the craft and leaves the bank unchanged', async () => {
  const { craft, bank, crafters, clock } = harness({ rng: scripted(0) });
  await place(crafters, 'c1', { inCombat: true });
  await bank.seed('c1', { metal: 5 });

  const started = await craft.service().start({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    itemLevel: 1,
    accelerate: false,
    nowMs: clock.now(),
  });

  expect(started).toEqual({ ok: false, code: 'combat' });
  expect(await bank.read('c1')).toEqual({ metal: 5 });
});

test('unique gear stays unique only when the boss component is spent', async () => {
  const withComponent = harness({ rng: scripted(99), fullRecipes: true });
  const withoutComponent = harness({ rng: scripted(99), fullRecipes: true });
  const skill = { weaponsmith: { level: 10 as const, xp: 0 } };
  await place(withComponent.crafters, 'c1', { skills: skill, gold: 500 });
  await place(withoutComponent.crafters, 'c1', { skills: skill, gold: 500 });
  await withComponent.bank.seed('c1', { titanium: 25, crystals: 6, unique_component: 1 });
  await withoutComponent.bank.seed('c1', { titanium: 25, crystals: 6 });

  const unique = await withComponent.craft.service().start({
    characterId: 'c1',
    recipeId: 'rift_blade',
    itemLevel: 30,
    accelerate: false,
    nowMs: 1_000_000,
  });
  const epic = await withoutComponent.craft.service().start({
    characterId: 'c1',
    recipeId: 'rift_blade',
    itemLevel: 30,
    accelerate: false,
    nowMs: 1_000_000,
  });

  expect(unique.ok && unique.value.readyAtMs - 1_000_000).toBe(7_200_000);
  expect(epic.ok && epic.value.readyAtMs - 1_000_000).toBe(3_600_000);
  expect(await withComponent.bank.read('c1')).toEqual({});
  expect(await withoutComponent.bank.read('c1')).toEqual({});
});

test('salvage returns thirty percent and refuses unique and the wild', async () => {
  const { craft, bank, crafters } = harness();
  await place(crafters, 'c1');

  const salvaged = await craft.service().salvage({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    grade: 'common',
  });
  expect(salvaged).toEqual({
    ok: true,
    value: { materials: { metal: 1 }, durationMs: 60_000 },
  });
  expect(await bank.read('c1')).toEqual({ metal: 1 });

  const unique = await craft.service().salvage({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    grade: 'unique',
  });
  expect(unique).toEqual({ ok: false, code: 'unique' });
  expect(await bank.read('c1')).toEqual({ metal: 1 });

  await place(crafters, 'c1', { nodeId: 'light_dungeon' });
  const wild = await craft.service().salvage({
    characterId: 'c1',
    recipeId: 'rusty_sword',
    grade: 'common',
  });
  expect(wild).toEqual({ ok: false, code: 'zone' });
  expect(await bank.read('c1')).toEqual({ metal: 1 });
});

test('buySkill opens a skill for 500 gold and does not charge without a teacher', async () => {
  const { craft, crafters } = harness();
  await place(crafters, 'c1', { skills: {}, gold: 500 });

  const refused = await craft.service().buySkill({
    characterId: 'c1',
    skill: 'alchemist',
    target: 1,
    teacher: false,
  });
  expect(refused).toEqual({ ok: false, code: 'teacher' });
  expect((await crafters.get('c1'))?.gold).toBe(500);

  const opened = await craft.service().buySkill({
    characterId: 'c1',
    skill: 'alchemist',
    target: 1,
    teacher: true,
  });
  expect(opened).toEqual({
    ok: true,
    value: { skill: { level: 1, xp: 0 }, gold: 0 },
  });
  expect((await crafters.get('c1'))?.skills.alchemist).toEqual({ level: 1, xp: 0 });
});

test('the craft module does not import inventory or economy', () => {
  const sources = readdirSync(HERE)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(join(HERE, name), 'utf8'));
  const { craft } = harness();
  expect(craft.name).toBe('craft');
  for (const source of sources) {
    expect(source).not.toMatch(/modules\/inventory/);
    expect(source).not.toMatch(/from\s+['"][^'"]*economy['"]/);
  }
});
