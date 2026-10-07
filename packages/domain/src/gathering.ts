import { err, ok, type Result } from './result';
import type { Rng } from './rng';

export type ToolId = 'none' | 'basic' | 'advanced' | 'master';
export type ToolKind = 'pick' | 'axe' | 'knife' | 'scalpel' | 'manipulator' | 'flask';
export type Quality = 'normal' | 'cleaned' | 'pure' | 'none';

export const NODE_IDS = [
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
] as const;

export type NodeId = (typeof NODE_IDS)[number];

export interface GatherNode {
  id: NodeId;
  /** `null` on `dungeon_small`: the placed node chooses the resource. */
  resource: string | null;
  baseSeconds: number;
  respawnMinutes: number;
  qtyMin: number;
  qtyMax: number;
  /** `null` accepts any tool kind. A mismatched kind counts as no tool. */
  toolKind: ToolKind | null;
  hasQuality: boolean;
}

const MIN_GATHER_SECONDS = 5;
const ADVANCED_TECHNIQUE = 6;
const MASTER_TECHNIQUE = 10;
const MAX_TAX_PERCENT = 30;
const REFINE_NORMAL_PER_BATCH = 3;
const REFINE_GOLD_PER_BATCH = 10;
const MS_PER_MINUTE = 60_000;

function defineNodes<const T extends { [K in NodeId]: GatherNode & { id: K } }>(nodes: T): T {
  return nodes;
}

export const NODES = defineNodes({
  mine_metal: {
    id: 'mine_metal',
    resource: 'metal',
    baseSeconds: 30,
    respawnMinutes: 30,
    qtyMin: 3,
    qtyMax: 5,
    toolKind: 'pick',
    hasQuality: true,
  },
  mine_stone: {
    id: 'mine_stone',
    resource: 'stone',
    baseSeconds: 20,
    respawnMinutes: 30,
    qtyMin: 3,
    qtyMax: 5,
    toolKind: 'pick',
    hasQuality: true,
  },
  deep_mine: {
    id: 'deep_mine',
    resource: 'titanium',
    baseSeconds: 90,
    respawnMinutes: 60,
    qtyMin: 1,
    qtyMax: 2,
    toolKind: 'pick',
    hasQuality: true,
  },
  shaft_crystal: {
    id: 'shaft_crystal',
    resource: 'crystals',
    baseSeconds: 60,
    respawnMinutes: 45,
    qtyMin: 2,
    qtyMax: 3,
    toolKind: 'pick',
    hasQuality: true,
  },
  shaft_alloy: {
    id: 'shaft_alloy',
    resource: 'alloys',
    baseSeconds: 120,
    respawnMinutes: 60,
    qtyMin: 1,
    qtyMax: 2,
    toolKind: 'pick',
    hasQuality: true,
  },
  grove: {
    id: 'grove',
    resource: 'wood',
    baseSeconds: 20,
    respawnMinutes: 30,
    qtyMin: 4,
    qtyMax: 6,
    toolKind: 'axe',
    hasQuality: true,
  },
  hunt_leather: {
    id: 'hunt_leather',
    resource: 'leather',
    baseSeconds: 30,
    respawnMinutes: 30,
    qtyMin: 2,
    qtyMax: 4,
    toolKind: 'knife',
    hasQuality: true,
  },
  hunt_bone: {
    id: 'hunt_bone',
    resource: 'bone',
    baseSeconds: 30,
    respawnMinutes: 30,
    qtyMin: 2,
    qtyMax: 4,
    toolKind: 'knife',
    hasQuality: true,
  },
  fungus: {
    id: 'fungus',
    resource: 'spores',
    baseSeconds: 45,
    respawnMinutes: 45,
    qtyMin: 3,
    qtyMax: 5,
    toolKind: 'scalpel',
    hasQuality: true,
  },
  bioreactor_amino: {
    id: 'bioreactor_amino',
    resource: 'amino',
    baseSeconds: 60,
    respawnMinutes: 60,
    qtyMin: 2,
    qtyMax: 3,
    toolKind: 'scalpel',
    hasQuality: true,
  },
  bioreactor_matrix: {
    id: 'bioreactor_matrix',
    resource: 'organic_matrix',
    baseSeconds: 180,
    respawnMinutes: 120,
    qtyMin: 1,
    qtyMax: 1,
    toolKind: 'scalpel',
    hasQuality: true,
  },
  scrap_shard: {
    id: 'scrap_shard',
    resource: 'relic_shard',
    baseSeconds: 90,
    respawnMinutes: 60,
    qtyMin: 1,
    qtyMax: 2,
    toolKind: 'manipulator',
    hasQuality: true,
  },
  scrap_cell: {
    id: 'scrap_cell',
    resource: 'energy_cell',
    baseSeconds: 60,
    respawnMinutes: 45,
    qtyMin: 1,
    qtyMax: 2,
    toolKind: 'manipulator',
    hasQuality: true,
  },
  spring: {
    id: 'spring',
    resource: 'water',
    baseSeconds: 15,
    respawnMinutes: 20,
    qtyMin: 5,
    qtyMax: 10,
    toolKind: 'flask',
    hasQuality: false,
  },
  dungeon_small: {
    id: 'dungeon_small',
    resource: null,
    baseSeconds: 10,
    respawnMinutes: 15,
    qtyMin: 1,
    qtyMax: 2,
    toolKind: null,
    hasQuality: true,
  },
});

const QUALITY_BELOW: Record<ToolId, { pure: number; cleaned: number }> = {
  none: { pure: 0.01, cleaned: 0.1 },
  basic: { pure: 0.01, cleaned: 0.1 },
  advanced: { pure: 0.05, cleaned: 0.3 },
  master: { pure: 0.15, cleaned: 0.5 },
};

export function isNodeId(value: string): value is NodeId {
  return Object.prototype.hasOwnProperty.call(NODES, value);
}

export function respawnDurationMs(nodeId: NodeId): number {
  return NODES[nodeId].respawnMinutes * MS_PER_MINUTE;
}

function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${String(value)}`);
  }
}

function multiplierRatio(tool: ToolId, techniqueGateOk: boolean): { num: number; den: number } {
  const blocked = (tool === 'advanced' || tool === 'master') && !techniqueGateOk;
  const effective: ToolId = blocked ? 'none' : tool;
  switch (effective) {
    case 'none':
      return { num: 1, den: 2 };
    case 'basic':
      return { num: 1, den: 1 };
    case 'advanced':
      return { num: 3, den: 2 };
    case 'master':
      return { num: 2, den: 1 };
  }
}

export function gatherSeconds(
  baseSeconds: number,
  technique: number,
  tool: ToolId,
  techniqueGateOk: boolean,
): number {
  if (!Number.isFinite(baseSeconds) || baseSeconds < 0) {
    throw new RangeError(`baseSeconds must be >= 0, got ${String(baseSeconds)}`);
  }
  if (!Number.isFinite(technique) || technique < -19) {
    throw new RangeError(`technique must be finite and > -20, got ${String(technique)}`);
  }
  const { num, den } = multiplierRatio(tool, techniqueGateOk);
  const scaled = (baseSeconds * 20 * den) / ((20 + technique) * num);
  return Math.max(MIN_GATHER_SECONDS, Math.floor(scaled));
}

function techniqueGateOk(tool: ToolId, technique: number): boolean {
  if (tool === 'advanced') {
    return technique >= ADVANCED_TECHNIQUE;
  }
  if (tool === 'master') {
    return technique >= MASTER_TECHNIQUE;
  }
  return true;
}

function resolveTool(
  node: GatherNode,
  tool: ToolId,
  toolKind: ToolKind,
  technique: number,
): ToolId {
  if (tool === 'none') {
    return 'none';
  }
  if (node.toolKind !== null && node.toolKind !== toolKind) {
    return 'none';
  }
  if (!techniqueGateOk(tool, technique)) {
    return 'none';
  }
  return tool;
}

function rollQuality(tool: ToolId, rng: Rng): Quality {
  const below = QUALITY_BELOW[tool];
  const roll = rng.nextUnit();
  if (roll < below.pure) {
    return 'pure';
  }
  if (roll < below.cleaned) {
    return 'cleaned';
  }
  return 'normal';
}

export function rollGather(input: {
  nodeId: string;
  technique: number;
  tool: ToolId;
  toolKind: ToolKind;
  overloaded: boolean;
  inCombat: boolean;
  interrupted: boolean;
  occupiedByOther: boolean;
  taxRate: number;
  seasonBonus: boolean;
  rng: Rng;
}): Result<
  { qty: number; tax: number; playerQty: number; quality: Quality; seconds: number },
  'combat' | 'overweight' | 'busy' | 'interrupted'
> {
  if (!isNodeId(input.nodeId)) {
    throw new RangeError(`unknown gather node: ${input.nodeId}`);
  }
  if (!Number.isFinite(input.taxRate) || input.taxRate < 0 || input.taxRate > MAX_TAX_PERCENT) {
    throw new RangeError(
      `taxRate must be in [0, ${MAX_TAX_PERCENT}], got ${String(input.taxRate)}`,
    );
  }
  if (!Number.isFinite(input.technique)) {
    throw new RangeError(`technique must be finite, got ${String(input.technique)}`);
  }

  if (input.inCombat) {
    return err('combat');
  }
  if (input.overloaded) {
    return err('overweight');
  }
  if (input.occupiedByOther) {
    return err('busy');
  }
  if (input.interrupted) {
    return err('interrupted');
  }

  const node = NODES[input.nodeId];
  const tool = resolveTool(node, input.tool, input.toolKind, input.technique);
  const span = node.qtyMax - node.qtyMin + 1;
  const rolled = node.qtyMin + input.rng.nextInt(span);
  const qty = rolled + (input.seasonBonus ? 1 : 0);
  const tax = Math.max(0, Math.floor((qty * input.taxRate) / 100));
  const playerQty = qty - tax;
  const quality = node.hasQuality ? rollQuality(tool, input.rng) : 'none';
  const seconds = gatherSeconds(node.baseSeconds, input.technique, tool, true);

  return ok({ qty, tax, playerQty, quality, seconds });
}

export function refine(
  normalQty: number,
  gold: number,
): Result<{ normalLeft: number; cleanedGained: number; gold: number }, 'qty' | 'gold'> {
  assertNonNegativeInt(normalQty, 'normalQty');
  assertNonNegativeInt(gold, 'gold');
  const byQty = Math.floor(normalQty / REFINE_NORMAL_PER_BATCH);
  const byGold = Math.floor(gold / REFINE_GOLD_PER_BATCH);
  if (byQty < 1) {
    return err('qty');
  }
  if (byGold < 1) {
    return err('gold');
  }
  const batches = Math.min(byQty, byGold);
  return ok({
    normalLeft: normalQty - batches * REFINE_NORMAL_PER_BATCH,
    cleanedGained: batches,
    gold: gold - batches * REFINE_GOLD_PER_BATCH,
  });
}

/**
 * Remaining respawn time in milliseconds. Offline worlds leave it unchanged.
 * While players are online, `delta` milliseconds elapse and the timer cannot pass 0.
 */
export function advanceRespawn(respawnAt: number, online: boolean, delta: number): number {
  assertNonNegativeInt(respawnAt, 'respawnAt');
  assertNonNegativeInt(delta, 'delta');
  if (!online) {
    return respawnAt;
  }
  const next = respawnAt - delta;
  return next > 0 ? next : 0;
}

/** One successful gather removes 1 durability point. The tool is destroyed at <= 0. */
export function wearTool(durability: number): { durability: number; destroyed: boolean } {
  if (!Number.isFinite(durability) || durability < 0 || durability > 100) {
    throw new RangeError(`durability must be in [0, 100], got ${String(durability)}`);
  }
  const next = Math.round((durability - 1) * 100) / 100;
  if (next <= 0) {
    return { durability: 0, destroyed: true };
  }
  return { durability: next, destroyed: false };
}
