import { createStore, type StoreApi } from 'zustand/vanilla';

const LOG_LIMIT = 20;

export interface CellPoint {
  x: number;
  y: number;
}

/** Server view of the local character. `phase` is copied from the snapshot. */
export interface SelfState {
  id: string;
  hp: number;
  maxHp: number;
  od: number;
  odLimit: number;
  cell: CellPoint;
  facing: string;
  phase: string;
  level: number;
  gold: number;
}

export interface EntityState {
  id: string;
  cell: CellPoint;
}

/** One inventory row as sent on the state channel. Extra keys are preserved. */
export type InventoryEntry = Record<string, unknown>;

/** A local step that has not been confirmed. It never writes `self.hp`. */
export interface PredictedStep {
  seq: number;
  dir: string;
  atMs: number;
  cell: CellPoint;
}

export interface SessionQuest {
  id: string;
  story?: boolean;
  difficulty?: string;
  objectives: { id: string; target: number; current?: number; scene?: string }[];
}

export interface CaptureView {
  cityId: string;
  guildId: string | null;
  heldMs: number;
  won: boolean;
}

export interface ResourceNodeView {
  nodeId: string;
  guildId: string | null;
  plantMs: number;
  absentMs: number;
  chest: number;
  taxPercent: number;
  access: string;
}

export interface SessionNode {
  id: string;
  kind: string;
  x?: number;
  y?: number;
}

export interface ClientState {
  self: SelfState | null;
  entities: Record<string, EntityState>;
  inventory: InventoryEntry[];
  log: string[];
  connected: boolean;
  /** Server hack password. Null until a hack session exists. */
  hackPassword: string | null;
  quests: SessionQuest[];
  mapNodes: SessionNode[];
  recipes: { id: string }[];
  /** Last `/craft/start` body. Null until the play session posts one. */
  craftJob: Record<string, unknown> | null;
  /** Last trade offer and accept bodies. Null until the play session posts them. */
  tradeResult: Record<string, unknown> | null;
  /** Last `/portal` body. Null until the play session posts one. */
  portalResult: Record<string, unknown> | null;
  /** Last `/dungeon` body. Null until the play session posts one. */
  dungeonResult: Record<string, unknown> | null;
  /** Last city-service, node, war, storage, or contract response. */
  serviceResult: Record<string, unknown> | null;
  /** City flags from the world snapshot. */
  captures: CaptureView[];
  /** Resource-node flags from the world snapshot. */
  resourceNodes: ResourceNodeView[];
  /** NPC reputation for the focused character, keyed by NPC id. */
  reputation: Record<string, number>;
  /** Local movement only. `applySnapshot` does not replace this. */
  predictedCell: CellPoint | null;
  predictedSteps: PredictedStep[];
  applySnapshot(snapshot: unknown): void;
  setConnected(v: boolean): void;
  pushLog(line: string): void;
  setCraftJob(job: Record<string, unknown> | null): void;
  setTradeResult(result: Record<string, unknown> | null): void;
  setPortalResult(result: Record<string, unknown> | null): void;
  setDungeonResult(result: Record<string, unknown> | null): void;
  setServiceResult(result: Record<string, unknown> | null): void;
  setPredicted(input: { cell: CellPoint | null; steps: PredictedStep[] }): void;
}

export type ClientStore = StoreApi<ClientState>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readCell(value: unknown): CellPoint | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const x = readNumber(value.x);
  const y = readNumber(value.y);
  if (x === null || y === null) {
    return null;
  }
  return { x, y };
}

function readSelf(value: unknown): SelfState | null {
  if (!isPlainObject(value)) {
    return null;
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    return null;
  }
  if (typeof value.facing !== 'string' || typeof value.phase !== 'string') {
    return null;
  }
  const hp = readNumber(value.hp);
  const maxHp = readNumber(value.maxHp);
  const od = readNumber(value.od);
  const level = readNumber(value.level);
  const gold = readNumber(value.gold);
  const cell = readCell(value.cell);
  if (
    hp === null ||
    maxHp === null ||
    od === null ||
    level === null ||
    gold === null ||
    cell === null
  ) {
    return null;
  }
  let odLimit = 0;
  if (value.odLimit !== undefined) {
    const parsed = readNumber(value.odLimit);
    if (parsed === null) {
      return null;
    }
    odLimit = parsed;
  }
  return {
    id: value.id,
    hp,
    maxHp,
    od,
    odLimit,
    cell,
    facing: value.facing,
    phase: value.phase,
    level,
    gold,
  };
}

function readEntity(value: unknown, fallbackId?: string): EntityState | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : fallbackId;
  if (!id) {
    return null;
  }
  const cell = readCell(value.cell);
  if (!cell) {
    return null;
  }
  return { id, cell };
}

function readEntities(value: unknown): Record<string, EntityState> {
  const entities: Record<string, EntityState> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const entity = readEntity(item);
      if (entity) {
        entities[entity.id] = entity;
      }
    }
    return entities;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const entity = readEntity(item, key);
      if (entity) {
        entities[entity.id] = entity;
      }
    }
  }
  return entities;
}

function readInventory(value: unknown): InventoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: InventoryEntry[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      continue;
    }
    items.push({ ...item });
  }
  return items;
}

function readSnapshot(snapshot: unknown): {
  self: SelfState | null;
  entities: Record<string, EntityState>;
  inventory: InventoryEntry[];
} {
  if (!isPlainObject(snapshot)) {
    return { self: null, entities: {}, inventory: [] };
  }
  return {
    self: readSelf(snapshot.self),
    entities: readEntities(snapshot.entities),
    inventory: readInventory(snapshot.inventory),
  };
}

function readSessionExtras(snapshot: unknown): {
  hackPassword?: string | null;
  quests?: SessionQuest[];
  mapNodes?: SessionNode[];
  recipes?: { id: string }[];
  captures?: CaptureView[];
  resourceNodes?: ResourceNodeView[];
  reputation?: Record<string, number>;
} {
  if (!isPlainObject(snapshot)) {
    return {};
  }
  const extra: {
    hackPassword?: string | null;
    quests?: SessionQuest[];
    mapNodes?: SessionNode[];
    recipes?: { id: string }[];
    captures?: CaptureView[];
    resourceNodes?: ResourceNodeView[];
    reputation?: Record<string, number>;
  } = {};
  if ('hackPassword' in snapshot) {
    extra.hackPassword = typeof snapshot.hackPassword === 'string' ? snapshot.hackPassword : null;
  }
  if (Array.isArray(snapshot.quests)) {
    extra.quests = snapshot.quests.flatMap((quest) => {
      if (!isPlainObject(quest) || typeof quest.id !== 'string') {
        return [];
      }
      const objectives = Array.isArray(quest.objectives)
        ? quest.objectives.flatMap((objective) => {
            if (!isPlainObject(objective) || typeof objective.id !== 'string') {
              return [];
            }
            const target = readNumber(objective.target) ?? 1;
            const current = readNumber(objective.current) ?? undefined;
            const scene = typeof objective.scene === 'string' ? objective.scene : undefined;
            return [
              {
                id: objective.id,
                target,
                ...(current === undefined ? {} : { current }),
                ...(scene === undefined ? {} : { scene }),
              },
            ];
          })
        : [];
      return [
        {
          id: quest.id,
          ...(quest.story === true ? { story: true } : {}),
          ...(typeof quest.difficulty === 'string' ? { difficulty: quest.difficulty } : {}),
          objectives,
        },
      ];
    });
  }
  if (Array.isArray(snapshot.mapNodes)) {
    extra.mapNodes = snapshot.mapNodes.flatMap((node) => {
      if (!isPlainObject(node) || typeof node.id !== 'string' || typeof node.kind !== 'string') {
        return [];
      }
      const x = readNumber(node.x);
      const y = readNumber(node.y);
      return [{ id: node.id, kind: node.kind, ...(x === null ? {} : { x }), ...(y === null ? {} : { y }) }];
    });
  }
  if (Array.isArray(snapshot.recipes)) {
    extra.recipes = snapshot.recipes.flatMap((recipe) => {
      if (!isPlainObject(recipe) || typeof recipe.id !== 'string') {
        return [];
      }
      return [{ id: recipe.id }];
    });
  }
  if (Array.isArray(snapshot.captures)) {
    extra.captures = snapshot.captures.flatMap((row) => {
      if (!isPlainObject(row) || typeof row.cityId !== 'string') {
        return [];
      }
      const heldMs = readNumber(row.heldMs) ?? 0;
      const guildId = typeof row.guildId === 'string' ? row.guildId : null;
      return [{ cityId: row.cityId, guildId, heldMs, won: row.won === true }];
    });
  }
  if (Array.isArray(snapshot.resourceNodes)) {
    extra.resourceNodes = snapshot.resourceNodes.flatMap((row) => {
      if (!isPlainObject(row) || typeof row.nodeId !== 'string') {
        return [];
      }
      return [
        {
          nodeId: row.nodeId,
          guildId: typeof row.guildId === 'string' ? row.guildId : null,
          plantMs: readNumber(row.plantMs) ?? 0,
          absentMs: readNumber(row.absentMs) ?? 0,
          chest: readNumber(row.chest) ?? 0,
          taxPercent: readNumber(row.taxPercent) ?? 0,
          access: typeof row.access === 'string' ? row.access : 'open',
        },
      ];
    });
  }
  if (isPlainObject(snapshot.reputation)) {
    const reputation: Record<string, number> = {};
    for (const [npcId, value] of Object.entries(snapshot.reputation)) {
      const stored = readNumber(value);
      if (stored !== null) {
        reputation[npcId] = stored;
      }
    }
    extra.reputation = reputation;
  }
  return extra;
}

function readPredicted(input: { cell: CellPoint | null; steps: PredictedStep[] }): {
  cell: CellPoint | null;
  steps: PredictedStep[];
} {
  const cell = input.cell === null ? null : readCell(input.cell);
  const steps: PredictedStep[] = [];
  for (const step of input.steps) {
    const stepCell = readCell(step.cell);
    if (!stepCell || typeof step.dir !== 'string') {
      continue;
    }
    const seq = readNumber(step.seq);
    const atMs = readNumber(step.atMs);
    if (seq === null || atMs === null) {
      continue;
    }
    steps.push({ seq, dir: step.dir, atMs, cell: stepCell });
  }
  return { cell, steps };
}

/**
 * Isolated session store. No sockets and no React hooks.
 * Callers read and update through `getState()`.
 */
export function createClientStore(): ClientStore {
  return createStore<ClientState>()((set) => ({
    self: null,
    entities: {},
    inventory: [],
    log: [],
    connected: false,
    hackPassword: null,
    quests: [],
    mapNodes: [],
    recipes: [],
    craftJob: null,
    tradeResult: null,
    portalResult: null,
    dungeonResult: null,
    serviceResult: null,
    captures: [],
    resourceNodes: [],
    reputation: {},
    predictedCell: null,
    predictedSteps: [],
    applySnapshot: (snapshot) => {
      const next = readSnapshot(snapshot);
      const extra = readSessionExtras(snapshot);
      set((state) => ({
        self: next.self,
        entities: next.entities,
        inventory: next.inventory,
        hackPassword: extra.hackPassword === undefined ? state.hackPassword : extra.hackPassword,
        quests: extra.quests === undefined ? state.quests : extra.quests,
        mapNodes: extra.mapNodes === undefined ? state.mapNodes : extra.mapNodes,
        recipes: extra.recipes === undefined ? state.recipes : extra.recipes,
        captures: extra.captures === undefined ? state.captures : extra.captures,
        resourceNodes: extra.resourceNodes === undefined ? state.resourceNodes : extra.resourceNodes,
        reputation: extra.reputation === undefined ? state.reputation : extra.reputation,
      }));
    },
    setConnected: (connected) => {
      set({ connected });
    },
    pushLog: (line) => {
      set((state) => ({ log: [...state.log, line].slice(-LOG_LIMIT) }));
    },
    setCraftJob: (job) => {
      set({ craftJob: job });
    },
    setTradeResult: (result) => {
      set({ tradeResult: result });
    },
    setPortalResult: (result) => {
      set({ portalResult: result });
    },
    setDungeonResult: (result) => {
      set({ dungeonResult: result });
    },
    setServiceResult: (result) => {
      set({ serviceResult: result });
    },
    setPredicted: (input) => {
      const predicted = readPredicted(input);
      set({
        predictedCell: predicted.cell,
        predictedSteps: predicted.steps,
      });
    },
  }));
}
