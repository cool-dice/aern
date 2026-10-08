import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACES, type RaceId } from '../../domain/src/character';
import { QUEST_OBJECTIVE_KINDS } from '../../domain/src/quests';
import { assertCatalogId } from '../../domain/src/ids';
import { type StatId } from '../../domain/src/stats';
import { PROTOTYPE_NODE_IDS, prototypeWorld } from '../../domain/src/world';

export type { RaceId, StatId };

export const PROTOTYPE_RECIPE_IDS = [
  'rusty_sword',
  'bow',
  'leather_hood',
  'leather_jacket',
  'spore_relic',
  'plate_relic',
  'healing_draught',
  'antidote',
] as const;

export const PROTOTYPE_MONSTER_IDS = [
  'spore_rat',
  'bandit',
  'cyborg_dog',
  'scout_drone',
  'keeper_patrol',
] as const;

const ECHO_POOLS = new Set(['echo_grade_1', 'echo_grade_2', 'echo_grade_3', 'echo_unique']);
const PATH_POOLS = new Set(['path_grade_1', 'path_grade_2', 'path_grade_3', 'path_unique']);
const GEAR_POOLS = new Set(['weapon', 'armor']);

const NODE_XY: Record<string, readonly [number, number]> = {
  fort_humans: [0, 0],
  edge_light: [10, 0],
  cross_light: [20, 0],
  light_dungeon: [30, 0],
  plains_mine: [0, 10],
  plains_grove: [0, -10],
  barrier_gate: [40, 0],
  obsidian_tower: [0, 100],
  cross_dark: [20, 100],
  dark_dungeon: [30, 100],
  lava_mine: [0, 110],
  lava_fungus: [0, 90],
  primordial_city: [50, 0],
};

export interface ItemBonus {
  stat: StatId;
  amount: number;
}

export interface ItemRequirement {
  stat: StatId;
  min: number;
}

export interface UniqueProfile {
  statCount: number;
  statMin: number;
  statMax: number;
  active: number;
  passiveMin: number;
  passiveMax: number;
}

export type ItemKind =
  | 'weapon'
  | 'armor'
  | 'core'
  | 'resource'
  | 'consumable'
  | 'relic'
  | 'component'
  | 'ammo';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  grade?: 'common' | 'rare' | 'epic' | 'unique';
  damage?: number;
  armor?: number;
  weightKg?: number;
  weightKgMin?: number;
  weightKgMax?: number;
  range?: number | null;
  ammo?: 'light' | 'heavy' | 'cell' | 'special' | null;
  requirements?: ItemRequirement[];
  bonuses?: ItemBonus[];
  slot?: string | null;
  twoHanded?: boolean;
  uniqueProfile?: UniqueProfile;
  healHp?: number;
  apCost?: number;
  effect?: string;
  duration?: string;
  subtype?: string;
  implant?: boolean;
  coreGrade?: number;
  nn?: number;
  requirementsText?: string;
  skills?: string;
  bossId?: string;
  countsAs?: string;
  domainTemplateId?: string;
}

export interface CoreDef {
  id: string;
  implant: boolean;
  coreGrade: number;
  nn: number;
  requirementsText: string;
  skills: string;
  slot: 'core';
  domainTemplateId?: string;
}

export interface RecipeDef {
  id: string;
  skill: 'weaponsmith' | 'armorer' | 'biotech' | 'mechanic' | 'alchemist';
  station: 'forge' | 'bench' | 'lab' | 'workshop' | 'alchemy';
  itemId: string;
  minLevel: number;
  maxLevel: number;
  materials: Record<string, number>;
  unique: boolean;
  kind: 'item' | 'consumable' | 'relic';
  prototype: boolean;
  qty?: number;
}

export interface MonsterPhase {
  index: number;
  hpFrom?: number;
  hpBelow?: number;
  damageMultiplier?: number;
}

export interface MonsterAbility {
  id: string;
  effect: string;
  cooldownSec: number;
}

export interface MonsterDef {
  id: string;
  levelMin: number;
  levelMax: number;
  type: string;
  hp: number;
  damage: number;
  armor: number;
  accuracy?: number;
  evasion?: number;
  side: 'light' | 'dark' | 'center';
  prototype: boolean;
  rank: string;
  attacks: string[];
  ai?: string;
  regionId?: string;
  phaseCount?: number;
  phases?: MonsterPhase[];
  bossGrade?: string;
  abilities?: MonsterAbility[];
}

/** Gold rows with `goldFormula` use min/max as the 1..3 multiplier, not the gold total. */
export interface LootEntry {
  itemId: string;
  chance: number;
  min: number;
  max: number;
  kind: 'resource' | 'gold' | 'gear' | 'echo' | 'path' | 'component';
  grade?: number | 'unique' | 'common' | 'rare' | 'epic';
  pool?: boolean;
  goldFormula?: 'boss' | 'type';
  coefficient?: number;
  bonus?: boolean;
  grades?: string[];
}

export interface LootCatalog {
  base: LootEntry[];
  rare: LootEntry[];
  byType: Record<string, LootEntry[]>;
  byRegion: { regionId: string; entries: LootEntry[] }[];
  elite: LootEntry[];
  bosses: Record<string, LootEntry[]>;
  chests: Record<string, unknown>;
  programSources: { kind: string; grade: number | string; source: string; chance: number }[];
}

export interface WorldNodeDef {
  id: string;
  kind: string;
  safe: boolean;
  side: 'light' | 'dark' | 'center';
  regionId: string;
  x: number;
  y: number;
  unlocked?: boolean;
}

export interface WorldEdgeDef {
  id: string;
  a: string;
  b: string;
  length: number;
}

export interface RegionDef {
  id: string;
  levelMin: number;
  levelMax: number;
  side: 'light' | 'dark' | 'center';
}

export interface GeographySite extends WorldNodeDef {
  role: 'racial_city' | 'neutral_city' | 'ring' | 'region_node';
}

export interface WorldCatalog {
  nodes: WorldNodeDef[];
  edges: WorldEdgeDef[];
  regions: RegionDef[];
  /** Racial cities, neutral cities, regional nodes, and primordial rings from artifact 20.2. */
  sites?: GeographySite[];
  siteEdges?: WorldEdgeDef[];
}

export interface QuestObjective {
  id: string;
  kind: string;
  target: number;
  monsterId?: string;
  itemId?: string;
  side?: 'light' | 'dark';
  hub?: string;
  /** Geography node the player must walk into. Rings use this, not a visit count. */
  place?: string;
  /** NPC this talk or learn objective names. */
  npcId?: string;
  /** Named beat. Story acts require it; errands omit it. */
  scene?: string;
}

export interface QuestDef {
  id: string;
  prototype: boolean;
  story: boolean;
  daily: boolean;
  repeatable: boolean;
  difficulty: 'easy' | 'normal' | 'hard' | 'epic';
  objectives: QuestObjective[];
  /** Story acts name a level band. Prototype errands omit it. */
  levelMin?: number;
  levelMax?: number;
  hub?: string;
  /** NPC whose personal reputation this quest changes. */
  npcId?: string;
}

export interface Features {
  playableRaces: string[];
  auction: 'live' | 'stub';
  mail: 'live' | 'stub';
  guild: 'live' | 'stub';
  titles: 'live' | 'stub';
  languages: string[];
}

export interface FragmentDef {
  id: string;
  lore: string;
  x: number;
  y: number;
  recipeId: string;
  password: string;
}

export interface StarterStack {
  itemId: string;
  qty?: number;
  level?: number;
  slot?: string;
}

export interface StarterKit {
  weapon: StarterStack;
  armor: StarterStack;
  items: StarterStack[];
}

export interface ProgramTemplate {
  id: string;
  kind: 'echo' | 'path';
  grade: 1 | 2 | 3;
  type: 'combat' | 'defense' | 'utility';
  nn: number;
  effect: string;
  source: string;
  unique: boolean;
  prototype: boolean;
  cooldownSec?: number;
  radius?: string;
}

export interface ModifierDef {
  id: string;
  damageMultiplier?: number;
  hpMultiplier?: number;
  armorBonus?: number;
  speedMultiplier?: number;
  evasionMultiplier?: number;
  armorIgnore?: number;
  status?: string;
  visual: string;
  loot: { itemId: string; chanceBonus: number };
}

export interface RaceCatalogEntry {
  id: RaceId;
  side: 'light' | 'dark';
  modifiers: Record<StatId, number>;
}

export interface Catalog {
  races: RaceCatalogEntry[];
  items: ItemDef[];
  cores: CoreDef[];
  recipes: RecipeDef[];
  monsters: MonsterDef[];
  loot: LootCatalog;
  world: WorldCatalog;
  quests: QuestDef[];
  features: Features;
  fragments: FragmentDef[];
  starter: StarterKit;
  echoes: ProgramTemplate[];
  paths: ProgramTemplate[];
  modifiers: ModifierDef[];
}

function readJson(rootDir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(rootDir, file), 'utf8')) as unknown;
}

function asArray(value: unknown, file: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${file} must be an array`);
  }
  return value;
}

function asObject(value: unknown, file: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file} must be an object`);
  }
  return value as Record<string, unknown>;
}

function idOf(row: unknown, file: string, index: number): string {
  if (row === null || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string') {
    throw new Error(`${file}[${index}] missing id`);
  }
  return assertCatalogId(row.id);
}

function assertUnique(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`duplicate id: ${id}`);
    }
    seen.add(id);
  }
}

function readRows<T>(rootDir: string, file: string): T[] {
  const rows = asArray(readJson(rootDir, file), file);
  assertUnique(rows.map((row, index) => idOf(row, file, index)));
  return rows as T[];
}

function lootEntries(loot: LootCatalog): LootEntry[] {
  const rows = [...loot.base, ...loot.rare, ...loot.elite];
  for (const list of Object.values(loot.byType)) {
    rows.push(...list);
  }
  for (const region of loot.byRegion) {
    rows.push(...region.entries);
  }
  for (const list of Object.values(loot.bosses)) {
    rows.push(...list);
  }
  return rows;
}

function edgeKey(edge: { a: string; b: string; length: number }): string {
  const left = edge.a < edge.b ? edge.a : edge.b;
  const right = edge.a < edge.b ? edge.b : edge.a;
  return `${left}|${right}|${edge.length}`;
}

export function assertRefs(catalog: Catalog): void {
  const itemIds = new Set(catalog.items.map((item) => item.id));
  const echoIds = new Set(catalog.echoes.map((echo) => echo.id));
  const pathIds = new Set(catalog.paths.map((path) => path.id));
  const monsterIds = new Set(catalog.monsters.map((monster) => monster.id));
  const raceIds = new Set(catalog.races.map((race) => race.id));
  const recipeIds = new Set(catalog.recipes.map((recipe) => recipe.id));
  const regionIds = new Set(catalog.world.regions.map((region) => region.id));
  const nodeIds = new Set(catalog.world.nodes.map((node) => node.id));
  const siteIds = new Set((catalog.world.sites ?? []).map((site) => site.id));

  if (catalog.races.length !== RACES.length) {
    throw new Error('race count');
  }
  for (const domain of RACES) {
    const race = catalog.races.find((row) => row.id === domain.id);
    if (!race) {
      throw new Error(`unknown race: ${domain.id}`);
    }
    if (race.side !== domain.side) {
      throw new Error(`race side: ${race.id}`);
    }
    for (const stat of Object.keys(domain.modifiers) as StatId[]) {
      if (race.modifiers[stat] !== domain.modifiers[stat]) {
        throw new Error(`race modifier: ${race.id}.${stat}`);
      }
    }
  }

  for (const raceId of catalog.features.playableRaces) {
    if (!raceIds.has(raceId as RaceId)) {
      throw new Error(`unknown race: ${raceId}`);
    }
  }

  const finishedUnique = new Set(
    catalog.items
      .filter(
        (item) =>
          item.grade === 'unique' &&
          (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'relic'),
      )
      .map((item) => item.id),
  );

  for (const recipe of catalog.recipes) {
    if (!itemIds.has(recipe.itemId)) {
      throw new Error(`unknown itemId: ${recipe.itemId}`);
    }
    if (
      echoIds.has(recipe.itemId) ||
      pathIds.has(recipe.itemId) ||
      recipe.itemId === 'relic_shard'
    ) {
      throw new Error(`uncraftable output: ${recipe.itemId}`);
    }
    for (const materialId of Object.keys(recipe.materials)) {
      if (!itemIds.has(materialId)) {
        throw new Error(`unknown itemId: ${materialId}`);
      }
    }
  }

  for (const id of PROTOTYPE_RECIPE_IDS) {
    const recipe = catalog.recipes.find((row) => row.id === id);
    if (!recipe?.prototype) {
      throw new Error(`prototype recipe unmarked: ${id}`);
    }
  }
  const markedRecipes = catalog.recipes.filter((recipe) => recipe.prototype);
  if (markedRecipes.length !== PROTOTYPE_RECIPE_IDS.length) {
    throw new Error('prototype recipe count');
  }

  for (const entry of lootEntries(catalog.loot)) {
    if (typeof entry.itemId !== 'string') {
      throw new Error('unknown itemId: ');
    }
    if (finishedUnique.has(entry.itemId)) {
      throw new Error(`unique gear drop: ${entry.itemId}`);
    }
    if (entry.kind === 'gold') {
      if (entry.itemId !== 'gold' || !itemIds.has('gold')) {
        throw new Error(`unknown itemId: ${entry.itemId}`);
      }
      continue;
    }
    if (entry.kind === 'echo') {
      if (!echoIds.has(entry.itemId) && !ECHO_POOLS.has(entry.itemId)) {
        throw new Error(`unknown itemId: ${entry.itemId}`);
      }
      continue;
    }
    if (entry.kind === 'path') {
      if (!pathIds.has(entry.itemId) && !PATH_POOLS.has(entry.itemId)) {
        throw new Error(`unknown itemId: ${entry.itemId}`);
      }
      continue;
    }
    if (entry.kind === 'gear') {
      if (!entry.pool || !GEAR_POOLS.has(entry.itemId)) {
        throw new Error(`unknown itemId: ${entry.itemId}`);
      }
      continue;
    }
    if (!itemIds.has(entry.itemId)) {
      throw new Error(`unknown itemId: ${entry.itemId}`);
    }
  }

  const prototypeMonsters = catalog.monsters
    .filter((monster) => monster.prototype)
    .map((monster) => monster.id);
  const expectedMonsters = [...PROTOTYPE_MONSTER_IDS, 'keeper_enhanced_prototype'].sort();
  if (prototypeMonsters.slice().sort().join() !== expectedMonsters.join()) {
    throw new Error(`prototype monsters: ${prototypeMonsters.join(',')}`);
  }

  for (const monster of catalog.monsters) {
    if (!(monster.hp > 0)) {
      throw new Error(`monster hp: ${monster.id}`);
    }
    if (monster.regionId !== undefined && !regionIds.has(monster.regionId)) {
      throw new Error(`unknown region: ${monster.regionId}`);
    }
  }

  const keeper = catalog.monsters.find((monster) => monster.id === 'keeper_enhanced');
  const keeperPrototype = catalog.monsters.find(
    (monster) => monster.id === 'keeper_enhanced_prototype',
  );
  if (
    !keeper ||
    keeper.levelMin !== 50 ||
    keeper.levelMax !== 50 ||
    keeper.hp !== 1000 ||
    keeper.phaseCount !== 3
  ) {
    throw new Error('keeper_enhanced');
  }
  if (keeper.prototype) {
    throw new Error('keeper_enhanced prototype');
  }
  if (
    !keeperPrototype ||
    keeperPrototype.levelMin !== 20 ||
    keeperPrototype.hp !== 400 ||
    keeperPrototype.phaseCount !== 2
  ) {
    throw new Error('keeper_enhanced_prototype');
  }
  const secondPhase = keeperPrototype.phases?.find((phase) => phase.index === 2);
  if (!secondPhase || secondPhase.hpBelow !== 0.5 || secondPhase.damageMultiplier !== 1.5) {
    throw new Error('keeper_enhanced_prototype phases');
  }

  const domainWorld = prototypeWorld();
  if (catalog.world.nodes.length !== PROTOTYPE_NODE_IDS.length) {
    throw new Error('world node count');
  }
  for (const node of domainWorld.nodes) {
    const found = catalog.world.nodes.find((row) => row.id === node.id);
    if (!found) {
      throw new Error(`missing world node: ${node.id}`);
    }
    if (
      found.kind !== node.kind ||
      found.safe !== node.safe ||
      found.side !== node.side ||
      found.regionId !== node.regionId
    ) {
      throw new Error(`world node mismatch: ${node.id}`);
    }
    const xy = NODE_XY[node.id];
    if (!xy || found.x !== xy[0] || found.y !== xy[1]) {
      throw new Error(`world coordinates: ${node.id}`);
    }
  }
  const domainEdges = new Set(domainWorld.edges.map((edge) => edgeKey(edge)));
  const catalogEdges = new Set(catalog.world.edges.map((edge) => edgeKey(edge)));
  if (domainEdges.size !== catalogEdges.size) {
    throw new Error('world edge count');
  }
  for (const edge of domainEdges) {
    if (!catalogEdges.has(edge)) {
      throw new Error(`world edge mismatch: ${edge}`);
    }
  }
  for (const edge of catalog.world.edges) {
    if (!nodeIds.has(edge.a) || !nodeIds.has(edge.b)) {
      throw new Error(`world edge endpoint: ${edge.id}`);
    }
  }

  const plains = catalog.world.regions.find((region) => region.id === 'plains');
  const lava = catalog.world.regions.find((region) => region.id === 'lava');
  if (!plains || plains.levelMin !== 1 || plains.levelMax !== 5 || plains.side !== 'light') {
    throw new Error('region plains');
  }
  if (!lava || lava.levelMin !== 1 || lava.levelMax !== 5 || lava.side !== 'dark') {
    throw new Error('region lava');
  }

  for (const quest of catalog.quests) {
    if (!quest.prototype) {
      throw new Error(`quest prototype: ${quest.id}`);
    }
    const objectiveIds = new Set<string>();
    const storyAct = quest.story && quest.id.startsWith('act');
    for (const objective of quest.objectives) {
      if (objectiveIds.has(objective.id)) {
        throw new Error(`duplicate id: ${objective.id}`);
      }
      objectiveIds.add(objective.id);
      if (!(QUEST_OBJECTIVE_KINDS as readonly string[]).includes(objective.kind)) {
        throw new Error(`quest kind: ${quest.id}.${objective.id}`);
      }
      if (storyAct && (objective.scene === undefined || objective.scene.length < 8)) {
        throw new Error(`quest scene: ${quest.id}.${objective.id}`);
      }
      if (objective.monsterId !== undefined && !monsterIds.has(objective.monsterId)) {
        throw new Error(`unknown monster: ${objective.monsterId}`);
      }
      if (objective.itemId !== undefined && !itemIds.has(objective.itemId)) {
        throw new Error(`unknown itemId: ${objective.itemId}`);
      }
      if (objective.place !== undefined && !nodeIds.has(objective.place) && !siteIds.has(objective.place)) {
        throw new Error(`unknown place: ${objective.place}`);
      }
    }
  }

  for (const fragment of catalog.fragments) {
    if (!recipeIds.has(fragment.recipeId)) {
      throw new Error(`unknown itemId: ${fragment.recipeId}`);
    }
  }

  for (const stack of [catalog.starter.weapon, catalog.starter.armor, ...catalog.starter.items]) {
    if (!itemIds.has(stack.itemId)) {
      throw new Error(`unknown itemId: ${stack.itemId}`);
    }
  }

  for (const core of catalog.cores) {
    if (!itemIds.has(core.id)) {
      throw new Error(`unknown itemId: ${core.id}`);
    }
  }

  if (catalog.echoes.filter((echo) => echo.prototype).length !== 2) {
    throw new Error('prototype echo count');
  }
  if (catalog.paths.filter((path) => path.prototype).length !== 2) {
    throw new Error('prototype path count');
  }
}

export function loadCatalog(rootDir: string): Catalog {
  const races = readRows<RaceCatalogEntry>(rootDir, 'races.json');
  const items = readRows<ItemDef>(rootDir, 'items.json');
  const cores = readRows<CoreDef>(rootDir, 'cores.json');
  const recipes = readRows<RecipeDef>(rootDir, 'recipes.json');
  const monsters = readRows<MonsterDef>(rootDir, 'monsters.json');
  const echoes = readRows<ProgramTemplate>(rootDir, 'echoes.json');
  const paths = readRows<ProgramTemplate>(rootDir, 'paths.json');
  const quests = readRows<QuestDef>(rootDir, 'quests.json');
  const fragments = readRows<FragmentDef>(rootDir, 'fragments.json');
  const modifiers = readRows<ModifierDef>(rootDir, 'modifiers.json');
  const world = asObject(readJson(rootDir, 'world.json'), 'world.json') as unknown as WorldCatalog;
  const loot = asObject(readJson(rootDir, 'loot.json'), 'loot.json') as unknown as LootCatalog;
  const features = asObject(
    readJson(rootDir, 'features.json'),
    'features.json',
  ) as unknown as Features;
  const starter = asObject(
    readJson(rootDir, 'starter.json'),
    'starter.json',
  ) as unknown as StarterKit;

  assertUnique(world.nodes.map((node, index) => idOf(node, 'world.nodes', index)));
  assertUnique(world.edges.map((edge, index) => idOf(edge, 'world.edges', index)));
  assertUnique(world.regions.map((region, index) => idOf(region, 'world.regions', index)));
  const abilityIds = monsters.flatMap(
    (monster) => monster.abilities?.map((ability) => ability.id) ?? [],
  );
  assertUnique(abilityIds.map((id) => assertCatalogId(id)));

  const catalog: Catalog = {
    races,
    items,
    cores,
    recipes,
    monsters,
    loot,
    world,
    quests,
    features,
    fragments,
    starter,
    echoes,
    paths,
    modifiers,
  };
  assertRefs(catalog);
  return catalog;
}
