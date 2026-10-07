import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type RecipeDef } from '@rift/content';
import {
  buySkillLevel,
  craftDurationMs,
  gradeWeights,
  rollGrade,
  salvage as salvageCraft,
  startCraft,
  trainSkill,
  type CraftSkill,
  type SkillState,
} from '@rift/domain/craft';
import type { Bus } from '../../shared/bus';
import type { GameModule, ModuleContext } from '../../shared/module';
import type {
  CraftGrade,
  CrafterState,
  CrafterStore,
  CraftRng,
  CraftService,
  ItemSink,
  MaterialBank,
  Result,
} from './types';

const CITY_OR_HUB = new Set(['city', 'hub']);
const DEFAULT_UNIT_PRICE = 1;

export interface CraftCatalog {
  recipes: RecipeDef[];
  nodeKinds: ReadonlyMap<string, string>;
  echoIds: ReadonlySet<string>;
  pathIds: ReadonlySet<string>;
  componentIds: ReadonlySet<string>;
}

export interface CraftServiceDeps {
  bus: Bus;
  bank: MaterialBank;
  sink: ItemSink;
  crafters: CrafterStore;
  /** Two services built with the same seed roll the same grade on their first craft. */
  seed?: number;
  /** When set, used instead of `seed`. */
  rng?: CraftRng;
  /** Prototype default. Recipes without `prototype: true` return `not_in_prototype`. */
  fullRecipes?: boolean;
  /**
   * Gold per material unit. Ids omitted here count as 1, so `materialCostGold`
   * is the material sum. Rush fee `floor(materialCostGold * 0.5)` stays inside `startCraft`.
   */
  unitPrices?: Readonly<Record<string, number>>;
  dataDir?: string;
  catalog?: CraftCatalog;
}

interface CraftJob {
  id: string;
  characterId: string;
  recipeId: string;
  templateId: string;
  grade: CraftGrade;
  itemLevel: number;
  readyAtMs: number;
  status: 'active' | 'done';
}

export interface CraftModule extends GameModule {
  service(): CraftService;
}

function fail<E extends string>(code: E): Result<never, E> {
  return { ok: false, code };
}

function pass<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function contentDataDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/content/data');
}

export function loadCraftCatalog(dataDir: string = contentDataDir()): CraftCatalog {
  const catalog = loadCatalog(dataDir);
  return {
    recipes: catalog.recipes,
    nodeKinds: new Map(catalog.world.nodes.map((node) => [node.id, node.kind])),
    echoIds: new Set(catalog.echoes.map((echo) => echo.id)),
    pathIds: new Set(catalog.paths.map((path) => path.id)),
    componentIds: new Set(
      catalog.items.filter((item) => item.kind === 'component').map((item) => item.id),
    ),
  };
}

/** Sum of unit price × quantity. Missing prices contribute the quantity itself. */
export function materialCostGold(
  need: Record<string, number>,
  unitPrices: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (const [id, qty] of Object.entries(need)) {
    const unit = unitPrices[id] ?? DEFAULT_UNIT_PRICE;
    if (!Number.isInteger(unit) || unit < 0) {
      throw new RangeError(`unit price must be an integer >= 0, got ${String(unit)}`);
    }
    total += unit * qty;
  }
  return total;
}

function seededRng(seed: number): CraftRng {
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextUnit(): number {
      return nextUint32() / 2 ** 32;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32) {
        throw new RangeError(
          `maxExclusive must be an integer in [1, 4294967296], got ${String(maxExclusive)}`,
        );
      }
      const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
      let sample = nextUint32();
      while (sample >= limit) {
        sample = nextUint32();
      }
      return sample % maxExclusive;
    },
  };
}

/**
 * `startCraft` rolls the grade itself. Sample once here so `rollGrade` is the
 * service's roll, then replay that sample into the domain call.
 */
function rollAndReplay(
  rng: CraftRng,
  level: SkillState['level'],
): { grade: CraftGrade; replay: CraftRng } {
  let captured: { max: number; value: number } | undefined;
  const grade = rollGrade(gradeWeights(level, 'normal'), {
    nextInt(maxExclusive: number): number {
      const value = rng.nextInt(maxExclusive);
      captured = { max: maxExclusive, value };
      return value;
    },
    nextUnit(): number {
      return rng.nextUnit();
    },
  });
  return {
    grade,
    replay: {
      nextInt(maxExclusive: number): number {
        if (!captured || captured.max !== maxExclusive) {
          throw new Error('startCraft rng did not replay the grade roll');
        }
        const value = captured.value;
        captured = undefined;
        return value;
      },
      nextUnit(): number {
        return 0;
      },
    },
  };
}

function componentIdOf(recipe: RecipeDef, componentIds: ReadonlySet<string>): string | undefined {
  if (!recipe.unique) {
    return undefined;
  }
  for (const id of Object.keys(recipe.materials)) {
    if (componentIds.has(id)) {
      return id;
    }
  }
  return undefined;
}

function forbiddenOutput(
  recipe: RecipeDef,
  echoIds: ReadonlySet<string>,
  pathIds: ReadonlySet<string>,
): boolean {
  return (
    recipe.itemId === 'echo' ||
    recipe.itemId === 'path' ||
    recipe.itemId === 'relic_shard' ||
    echoIds.has(recipe.itemId) ||
    pathIds.has(recipe.itemId)
  );
}

function inCityOrHub(nodeId: string, nodeKinds: ReadonlyMap<string, string>): boolean {
  const kind = nodeKinds.get(nodeId);
  return kind !== undefined && CITY_OR_HUB.has(kind);
}

export function createCraftService(deps: CraftServiceDeps): CraftService {
  const catalog = deps.catalog ?? loadCraftCatalog(deps.dataDir);
  const recipes = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
  const fullRecipes = deps.fullRecipes ?? false;
  const unitPrices = deps.unitPrices ?? {};
  const rng = deps.rng ?? seededRng(deps.seed ?? 1);
  const jobs = new Map<string, CraftJob>();

  function recipeOrMissing(recipeId: string): RecipeDef | undefined {
    return recipes.get(recipeId);
  }

  return {
    async start(input) {
      const crafter = await deps.crafters.get(input.characterId);
      if (!crafter) {
        return fail('missing');
      }
      const recipe = recipeOrMissing(input.recipeId);
      if (!recipe) {
        return fail('missing');
      }
      if (!fullRecipes && !recipe.prototype) {
        return fail('not_in_prototype');
      }
      if (!inCityOrHub(crafter.nodeId, catalog.nodeKinds)) {
        return fail('zone');
      }
      const skill = crafter.skills[recipe.skill];
      if (!skill) {
        return fail('level');
      }

      const stacks = await deps.bank.read(input.characterId);
      const componentId = componentIdOf(recipe, catalog.componentIds);
      const componentNeed = componentId ? (recipe.materials[componentId] ?? 0) : 0;
      const hasUniqueComponent =
        componentId !== undefined &&
        componentNeed > 0 &&
        (stacks[componentId] ?? 0) >= componentNeed;
      const rolled = rollAndReplay(rng, skill.level);
      const started = startCraft({
        skill,
        station: recipe.station,
        recipeSkill: recipe.skill,
        recipeStation: recipe.station,
        languageUpy: crafter.languageUpy,
        inCityOrHub: true,
        inCombat: crafter.inCombat,
        requestedItemLevel: input.itemLevel,
        recipeMin: recipe.minLevel,
        recipeMax: recipe.maxLevel,
        materials: { ...stacks },
        need: recipe.materials,
        uniqueComponent: recipe.unique,
        hasUniqueComponent,
        uniqueComponentId: componentId,
        forbidden: forbiddenOutput(recipe, catalog.echoIds, catalog.pathIds),
        outputId: recipe.itemId,
        materialCostGold: materialCostGold(recipe.materials, unitPrices),
        gold: crafter.gold,
        accelerate: input.accelerate,
        alreadyAccelerated: false,
        rng: rolled.replay,
        nowMs: input.nowMs,
        quality: 'normal',
        kind: recipe.kind,
      });
      if (!started.ok) {
        return fail(started.code);
      }
      if (
        started.value.grade !== rolled.grade &&
        !(rolled.grade === 'unique' && started.value.grade === 'epic')
      ) {
        throw new Error('grade roll diverged from startCraft');
      }
      const trained = trainSkill(skill, started.value.grade);
      if (trained.level !== started.value.skill.level || trained.xp !== started.value.skill.xp) {
        throw new Error('trainSkill diverged from startCraft');
      }
      const baseMs = craftDurationMs(started.value.grade, recipe.kind);
      const expectedReady = input.nowMs + (input.accelerate ? Math.floor(baseMs / 2) : baseMs);
      if (started.value.readyAtMs !== expectedReady) {
        throw new Error('craft duration diverged from startCraft');
      }

      const committed = await deps.bank.commit(input.characterId, stacks, started.value.materials);
      if (!committed) {
        return fail('materials');
      }
      const next: CrafterState = {
        ...crafter,
        gold: started.value.gold,
        skills: { ...crafter.skills, [recipe.skill]: trained },
      };
      await deps.crafters.save(input.characterId, next);

      const job: CraftJob = {
        id: randomUUID(),
        characterId: input.characterId,
        recipeId: recipe.id,
        templateId: recipe.itemId,
        grade: started.value.grade,
        itemLevel: started.value.itemLevel,
        readyAtMs: started.value.readyAtMs,
        status: 'active',
      };
      jobs.set(job.id, job);
      return pass({ readyAtMs: job.readyAtMs, jobId: job.id });
    },

    async complete(characterId, jobId, nowMs) {
      const job = jobs.get(jobId);
      if (!job || job.characterId !== characterId || job.status !== 'active') {
        return fail('missing');
      }
      if (nowMs < job.readyAtMs) {
        return fail('early');
      }
      const created = await deps.sink.put({
        characterId,
        templateId: job.templateId,
        grade: job.grade,
        itemLevel: job.itemLevel,
        recipeId: job.recipeId,
      });
      job.status = 'done';
      deps.bus.emit('item.crafted', { characterId, itemId: created.itemId });
      return pass({ itemId: created.itemId });
    },

    async salvage(input) {
      const crafter = await deps.crafters.get(input.characterId);
      if (!crafter) {
        return fail('missing');
      }
      const recipe = recipeOrMissing(input.recipeId);
      if (!recipe) {
        return fail('missing');
      }
      const craftMs = craftDurationMs(input.grade, recipe.kind);
      const salvaged = salvageCraft({
        grade: input.grade,
        need: recipe.materials,
        craftMs,
        inCityOrHub: inCityOrHub(crafter.nodeId, catalog.nodeKinds),
      });
      if (!salvaged.ok) {
        return fail(salvaged.code);
      }
      const current = await deps.bank.read(input.characterId);
      const next: Record<string, number> = { ...current };
      for (const [id, qty] of Object.entries(salvaged.value.materials)) {
        next[id] = (next[id] ?? 0) + qty;
      }
      const committed = await deps.bank.commit(input.characterId, current, next);
      if (!committed) {
        return fail('materials');
      }
      return pass({
        materials: salvaged.value.materials,
        durationMs: salvaged.value.durationMs,
      });
    },

    async buySkill(input) {
      const crafter = await deps.crafters.get(input.characterId);
      if (!crafter) {
        return fail('missing');
      }
      const current: SkillState | null = crafter.skills[input.skill] ?? null;
      const bought = buySkillLevel(current, crafter.gold, input.teacher, input.target);
      if (!bought.ok) {
        return fail(bought.code);
      }
      await deps.crafters.save(input.characterId, {
        ...crafter,
        gold: bought.value.gold,
        skills: { ...crafter.skills, [input.skill]: bought.value.skill },
      });
      return pass(bought.value);
    },
  };
}

export function createCraftModule(deps: Omit<CraftServiceDeps, 'bus'>): CraftModule {
  let service: CraftService | undefined;
  return {
    name: 'craft',
    start(ctx: ModuleContext) {
      service = createCraftService({ ...deps, bus: ctx.bus });
    },
    service() {
      if (!service) {
        throw new Error('craft module is not started');
      }
      return service;
    },
  };
}

export type { CraftSkill };
