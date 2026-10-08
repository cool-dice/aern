import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPermutation, decodeAncient, encodeAncient } from '../../domain/src/ancient';
import { prototypeWorld, PROTOTYPE_NODE_IDS } from '../../domain/src/world';
import { loadCatalog as loadFromIndex } from './index';
import {
  PROTOTYPE_MONSTER_IDS,
  PROTOTYPE_RECIPE_IDS,
  assertRefs,
  loadCatalog,
  type Catalog,
} from './load';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');
const localeDir = join(dirname(fileURLToPath(import.meta.url)), '../locales');

function localeKeys(catalog: Catalog): string[] {
  const keys = ['ui.brand'];
  for (const item of catalog.items) keys.push(`item.${item.id}.name`);
  for (const race of catalog.races) keys.push(`item.${race.id}.name`);
  for (const monster of catalog.monsters) {
    keys.push(`monster.${monster.id}.name`);
    for (const ability of monster.abilities ?? []) keys.push(`ability.${ability.id}.name`);
  }
  for (const echo of catalog.echoes) keys.push(`echo.${echo.id}.name`);
  for (const path of catalog.paths) keys.push(`path.${path.id}.name`);
  for (const quest of catalog.quests) keys.push(`quest.${quest.id}.name`);
  for (const node of catalog.world.nodes) keys.push(`node.${node.id}.name`);
  for (const region of catalog.world.regions) keys.push(`region.${region.id}.name`);
  for (const recipe of catalog.recipes) {
    if (recipe.id !== recipe.itemId) keys.push(`recipe.${recipe.id}.name`);
  }
  for (const fragment of catalog.fragments) keys.push(`fragment.${fragment.id}.name`);
  for (const modifier of catalog.modifiers) keys.push(`modifier.${modifier.id}.name`);
  return keys;
}

describe('loadCatalog', () => {
  const catalog = loadCatalog(dataDir);

  it('loads the repository fixtures', () => {
    expect(loadFromIndex).toBeTypeOf('function');
    expect(catalog.races).toHaveLength(8);
    expect(catalog.features.auction).toBe('live');
    expect(catalog.features.mail).toBe('live');
    expect(catalog.features.guild).toBe('live');
    expect(catalog.features.titles).toBe('live');
    expect(catalog.features.languages).toEqual(['ru', 'en']);
    expect(catalog.features.playableRaces).toEqual(['human', 'demon']);
  });

  it('keeps all eight races while prototype creation is human and demon', () => {
    expect(catalog.races.map((race) => race.id)).toEqual([
      'human',
      'demon',
      'elf',
      'dark_elf',
      'dwarf',
      'goblin',
      'troll',
      'ogre',
    ]);
    for (const raceId of catalog.features.playableRaces) {
      expect(catalog.races.some((race) => race.id === raceId)).toBe(true);
    }
  });

  it('marks the eight artifact-30 prototype recipes', () => {
    const marked = catalog.recipes.filter((recipe) => recipe.prototype).map((recipe) => recipe.id);
    expect(marked.slice().sort()).toEqual([...PROTOTYPE_RECIPE_IDS].sort());
    for (const recipe of catalog.recipes) {
      expect(catalog.items.some((item) => item.id === recipe.itemId)).toBe(true);
      if (recipe.prototype) expect(recipe.prototype).toBe(true);
    }
    expect(catalog.recipes.find((recipe) => recipe.id === 'spore_relic')?.kind).toBe('relic');
    expect(catalog.recipes.find((recipe) => recipe.id === 'healing_draught')?.kind).toBe(
      'consumable',
    );
    expect(catalog.recipes.some((recipe) => recipe.itemId === 'relic_shard')).toBe(false);
    const echoIds = new Set(catalog.echoes.map((echo) => echo.id));
    const pathIds = new Set(catalog.paths.map((path) => path.id));
    expect(
      catalog.recipes.some((recipe) => echoIds.has(recipe.itemId) || pathIds.has(recipe.itemId)),
    ).toBe(false);
  });

  it('marks five prototype monsters plus the level-20 keeper', () => {
    const prototype = catalog.monsters.filter(
      (monster) => monster.prototype && monster.id !== 'keeper_enhanced_prototype',
    );
    expect(prototype.map((monster) => monster.id).sort()).toEqual(
      [...PROTOTYPE_MONSTER_IDS].sort(),
    );
    const full = catalog.monsters.find((monster) => monster.id === 'keeper_enhanced');
    const slim = catalog.monsters.find((monster) => monster.id === 'keeper_enhanced_prototype');
    expect(full).toMatchObject({
      levelMin: 50,
      levelMax: 50,
      hp: 1000,
      damage: 35,
      armor: 18,
      phaseCount: 3,
      prototype: false,
    });
    expect(slim).toMatchObject({
      levelMin: 20,
      levelMax: 20,
      hp: 400,
      damage: 18,
      armor: 8,
      phaseCount: 2,
      prototype: true,
    });
    expect(slim?.phases?.find((phase) => phase.index === 2)).toMatchObject({
      hpBelow: 0.5,
      damageMultiplier: 1.5,
    });
    for (const monster of catalog.monsters) {
      expect(monster.hp).toBeGreaterThan(0);
    }
  });

  it('drops boss components and echo templates, not finished unique gear', () => {
    const uniqueGear = new Set(
      catalog.items
        .filter(
          (item) =>
            item.grade === 'unique' &&
            (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'relic'),
        )
        .map((item) => item.id),
    );
    for (const rows of Object.values(catalog.loot.bosses)) {
      for (const row of rows) {
        expect(uniqueGear.has(row.itemId)).toBe(false);
      }
    }
    const proto = catalog.loot.bosses.keeper_enhanced_prototype;
    expect(proto?.map((row) => row.itemId)).toEqual([
      'gold',
      'metal',
      'relic_shard',
      'echo_grade_1',
    ]);
    expect(proto?.find((row) => row.itemId === 'gold')).toMatchObject({
      goldFormula: 'boss',
      coefficient: 10,
    });
    expect(proto?.find((row) => row.itemId === 'metal')).toMatchObject({
      chance: 1,
      min: 3,
      max: 5,
    });
    expect(proto?.find((row) => row.itemId === 'relic_shard')).toMatchObject({
      chance: 0.5,
      min: 1,
      max: 1,
    });
    expect(proto?.find((row) => row.itemId === 'echo_grade_1')).toMatchObject({
      chance: 0.3,
      kind: 'echo',
      grade: 1,
    });
    expect(catalog.loot.bosses.keeper_enhanced?.some((row) => row.itemId === 'keeper_core')).toBe(
      true,
    );
  });

  it('contains the task 021 world and the stated coordinates', () => {
    const ids = catalog.world.nodes.map((node) => node.id);
    for (const id of PROTOTYPE_NODE_IDS) expect(ids).toContain(id);
    expect(ids).toHaveLength(prototypeWorld().nodes.length);
    expect(catalog.world.nodes.find((node) => node.id === 'fort_humans')).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'edge_light')).toMatchObject({
      x: 10,
      y: 0,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'cross_light')).toMatchObject({
      x: 20,
      y: 0,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'light_dungeon')).toMatchObject({
      x: 30,
      y: 0,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'plains_mine')).toMatchObject({
      x: 0,
      y: 10,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'plains_grove')).toMatchObject({
      x: 0,
      y: -10,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'barrier_gate')).toMatchObject({
      x: 40,
      y: 0,
    });
    expect(catalog.world.nodes.find((node) => node.id === 'obsidian_tower')).toMatchObject({
      x: 0,
      y: 100,
    });
    expect(catalog.world.regions.find((region) => region.id === 'plains')).toMatchObject({
      levelMin: 1,
      levelMax: 5,
      side: 'light',
    });
    expect(catalog.world.regions.find((region) => region.id === 'lava')).toMatchObject({
      levelMin: 1,
      levelMax: 5,
      side: 'dark',
    });
  });

  it('gives every racial city a hall the guild registrar can stand in', () => {
    const racial = [
      'fort_humans',
      'obsidian_tower',
      'forest_city',
      'dwarf_fortress',
      'troll_refuge',
      'ogre_camp',
      'ash_spire',
      'goblin_workshop',
    ];
    const nodes = [...catalog.world.nodes, ...(catalog.world.sites ?? [])];
    const edges = [...catalog.world.edges, ...(catalog.world.siteEdges ?? [])];
    for (const id of racial) {
      const city = nodes.find((node) => node.id === id);
      expect(city?.place === 'hall' || city?.place === 'registrar').toBe(true);
      const hallId = `${id}_hall`;
      expect(nodes.find((node) => node.id === hallId)).toMatchObject({
        kind: 'hub',
        place: 'hall',
      });
      expect(
        edges.some(
          (edge) =>
            (edge.a === id && edge.b === hallId) || (edge.a === hallId && edge.b === id),
        ),
      ).toBe(true);
    }
    expect(nodes.find((node) => node.id === 'plains_market')).toMatchObject({ kind: 'city' });
    expect(nodes.find((node) => node.id === 'plains_market')?.place).toBeUndefined();
  });

  it('ships the prototype quests, fragment, and starter kit', () => {
    expect(catalog.quests.map((quest) => quest.id)).toEqual([
      'tutorial',
      'kill_rats',
      'gather_metal',
      'gather_spores',
      'first_craft',
      'visit_hub',
      'act1_light',
      'act1_dark',
      'act2_light',
      'act2_dark',
      'act3_light',
      'act3_dark',
    ]);
    const storyKinds = new Set(
      catalog.quests.flatMap((quest) => quest.objectives.map((objective) => objective.kind)),
    );
    for (const kind of [
      'escort',
      'defend',
      'capture',
      'investigate',
      'rescue',
      'sabotage',
      'discover',
      'learn',
      'trade',
      'pvp',
      'lore',
    ]) {
      expect(storyKinds.has(kind)).toBe(true);
    }
    expect(catalog.quests.find((quest) => quest.id === 'act1_light')).toMatchObject({
      story: true,
      levelMin: 1,
      levelMax: 20,
      hub: 'fort_humans',
    });
    expect(catalog.quests.find((quest) => quest.id === 'act3_dark')).toMatchObject({
      story: true,
      levelMin: 40,
      levelMax: 50,
      hub: 'obsidian_tower',
    });
    const rings = catalog.quests
      .find((quest) => quest.id === 'act3_light')
      ?.objectives.filter((objective) => objective.kind === 'visit');
    expect(rings?.map((objective) => [objective.id, objective.place, objective.target])).toEqual([
      ['enter_city', 'primordial_city', 1],
      ['outer_ring', 'primordial_outer', 1],
      ['middle_ring', 'primordial_middle', 1],
      ['inner_ring', 'primordial_inner', 1],
    ]);
    const scenes = catalog.quests.flatMap((quest) => quest.objectives.map((objective) => objective.scene ?? ''));
    for (const phrase of [
      'Barrier',
      'outer ring',
      'middle ring',
      'inner ring',
      'Archive',
      'Shutdown',
      'other side',
      'council',
      'Koval',
      'Archivists',
    ]) {
      expect(scenes.some((scene) => scene.includes(phrase))).toBe(true);
    }
    expect(catalog.quests.every((quest) => quest.prototype)).toBe(true);
    const tutorial = catalog.quests.find((quest) => quest.id === 'tutorial');
    expect(tutorial?.story).toBe(true);
    expect(tutorial?.difficulty).toBe('easy');
    expect(tutorial?.objectives.map((objective) => objective.id)).toEqual([
      'wake',
      'look',
      'steps',
      'talk',
      'equip',
      'kill_rat',
      'loot',
      'inventory',
      'craft',
      'bind',
    ]);
    expect(tutorial?.objectives.find((objective) => objective.id === 'steps')?.target).toBe(10);
    expect(catalog.quests.find((quest) => quest.id === 'kill_rats')).toMatchObject({
      difficulty: 'normal',
      daily: false,
      repeatable: true,
    });
    expect(catalog.fragments[0]).toEqual({
      id: 'fragment_rift_01',
      lore: 'предтечи открыли разлом в изначальном городе',
      x: 40,
      y: 0,
      recipeId: 'energy_blade',
      password: 'X7#9@!',
    });
    const riftLore = catalog.fragments[0]?.lore ?? '';
    const permutation = buildPermutation('test-secret');
    expect(riftLore.includes('.')).toBe(false);
    expect(decodeAncient(encodeAncient(riftLore, permutation), permutation)).toBe(riftLore);
    expect(catalog.starter.weapon).toEqual({ itemId: 'rusty_sword', level: 1 });
    expect(catalog.starter.armor).toEqual({ itemId: 'leather_jacket', level: 1, slot: 'torso' });
    expect(catalog.items.find((item) => item.id === 'bandage')).toMatchObject({
      healHp: 15,
      weightKg: 0.1,
      apCost: 1,
    });
    expect(catalog.echoes.filter((echo) => echo.prototype)).toHaveLength(2);
    expect(catalog.paths.filter((path) => path.prototype)).toHaveLength(2);
  });

  it('names every catalog id in ru and en', () => {
    const ru = JSON.parse(readFileSync(join(localeDir, 'ru.json'), 'utf8')) as Record<
      string,
      string
    >;
    const en = JSON.parse(readFileSync(join(localeDir, 'en.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect(ru['ui.brand']).toBe('Разлом');
    expect(en['ui.brand']).toBe('Rift');
    for (const key of localeKeys(catalog)) {
      expect(ru[key]?.length).toBeGreaterThan(0);
      expect(en[key]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ru).length).toBeLessThan(500);
  });

  it('rejects an unknown recipe itemId from assertRefs', () => {
    const broken = structuredClone(catalog);
    const recipe = broken.recipes[0];
    if (!recipe) throw new Error('expected a recipe');
    recipe.itemId = 'missing_item_id';
    expect(() => assertRefs(broken)).toThrow(Error);
    expect(() => assertRefs(broken)).toThrow(/unknown itemId: missing_item_id/);
  });

  it('throws when a file repeats an id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rift-catalog-'));
    try {
      cpSync(dataDir, dir, { recursive: true });
      const races = JSON.parse(readFileSync(join(dir, 'races.json'), 'utf8')) as unknown[];
      const first = races[0];
      if (!first || typeof first !== 'object') throw new Error('expected a race');
      races.push({ ...first });
      writeFileSync(join(dir, 'races.json'), JSON.stringify(races));
      expect(() => loadCatalog(dir)).toThrow(/duplicate id: human/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
