import { neuroshockScale } from '@rift/domain/build';
import type { LootEntry } from '@rift/domain/loot';
import type { QuestProgress } from '@rift/domain/quests';
import type { MonsterKind, Progress } from '@rift/domain/progression';
import { resolveBossPhase, rolledLoot, type BossPhase } from './bestiary';
import { onKill } from './progress';
import { combatWeather, type WeatherMods } from './weather';
import {
  limbMax,
  orderByInitiative,
  resolveAttack,
  type Combatant,
  type LimbId,
} from '@rift/domain/combat';
import {
  fallDown,
  respawn,
  warRespawnNode,
  warRespawnReady,
  warRespawnRole,
  revive,
  takeFromCorpse,
  type LootStack as CorpseStack,
} from '@rift/domain/death';
import { cellsFor, chebyshev, move, step, type Cell, type Dir } from '@rift/domain/movement';
import { edgeLength, edgeStep, neighborStep, type Geography } from './travel';
import { combatZone } from './zones';
import type { Rng } from '@rift/domain/rng';
import { derive, emptyPoints } from '@rift/domain/stats';
import { tickStatuses, tryApplyStatus, type StatusInstance } from '@rift/domain/status';
import { REAL_SECOND_MS, SIM_TICK_MS } from '@rift/domain/time';
import { manualClock } from '../shared/clock';

/**
 * Logout grace from task 013. Death services are not part of this simulator.
 * Tests pass an already-accumulated `logoutLeftMs` instead of stepping 10 minutes.
 */
export const LOGOUT_GRACE_MS = 600_000;

/** Dead monsters return after this delay. The death tick only writes the corpse. */
export const MONSTER_RESPAWN_MS = 30_000;

const LAG_HISTORY = 6;
const MAX_LAG_MS = 500;
const TICKS_PER_SECOND = REAL_SECOND_MS / SIM_TICK_MS;
const OD_SCALE = 10_000;

export interface SimEntity {
  id: string;
  reaction: number;
  accuracyStat: number;
  accuracyScore: number;
  evasion: number;
  armor: number;
  will: number;
  od: number;
  /** Whole OD pool, integer part included. Spending subtracts integers and keeps the fraction. */
  odFrac: number;
  hp: number;
  maxHp: number;
  cell: Cell;
  inCombat: boolean;
  stunned: boolean;
  statuses: StatusInstance[];
  phase: 'online' | 'offline' | 'downed';
  isBot: boolean;
  logoutRequested?: boolean;
  /** Remaining grace. Unset until a logout outside combat starts the countdown. */
  logoutLeftMs?: number | null;
  carrierOffline?: boolean;
  frozen?: boolean;
  cover?: boolean;
  overloaded?: boolean;
  legsDestroyed?: 0 | 1 | 2;
  limbs?: Record<LimbId, number>;
  monsterId?: string;
  level?: number;
  /** Unmodified weapon damage. Phase multipliers apply on top. */
  baseDamage?: number;
  damage?: number;
  eliteId?: string | null;
  phaseCount?: number;
  bossPhase?: number;
  phases?: readonly BossPhase[];
  speedMultiplier?: number;
  rank?: 'basic' | 'boss';
  bindNodeId?: string;
  bindCell?: Cell;
  inventory?: CorpseStack[];
  progress?: Progress;
  quests?: QuestProgress[];
  monsterKind?: MonsterKind;
  /** Occupied neural load. Combat treats `nn > nnLimit` as neuroshock. */
  nn?: number;
  nnLimit?: number;
  /** Fractional steps saved while `speedMultiplier` is below 1. */
  moveFrac?: number;
  /** Last combatant whose hit committed. Kill credit uses this id. */
  lastAttackerId?: string;
  /** Seasonal pack tag copied from the live event snapshot. */
  seasonTag?: string;
  dungeonId?: string;
  roomId?: number;
  dungeonRooms?: { id: number; x: number; y: number }[];
  dungeonEdges?: [number, number][];
  /** Geography site the story beat placed this character on. */
  nodeId?: string;
  /** Flat prototype combat. Graph steps ignore this entity until it is false. */
  inEncounter?: boolean;
  /** Prototype pack this monster belongs to. Pursuit stays inside that pack. */
  instanceId?: string;
  /** Personal reputation with each NPC, 0–100. */
  reputation?: Record<string, number>;
  /** Guild this character holds a flag for. */
  guildId?: string;
  /** Sim time of the war death. `applyRespawn` waits `WAR_RESPAWN_DELAY_MS`. */
  downedAtMs?: number;
  /** City whose neutral-capture guard this monster is. */
  cityGuard?: string;
  /** Cells still left on the current world edge. */
  travel?: { nodeId: string; cell: Cell; remaining: number; running: boolean };
}

export interface MonsterRespawn {
  atMs: number;
  entity: SimEntity;
}

export interface SimCorpse {
  victimId: string;
  createdAtMs?: number;
  stacks?: { itemId: string; qty: number; questItem?: boolean; questOwnerId?: string }[];
  looted?: boolean;
  bindNodeId?: string;
  killerId?: string;
}

export interface SimRejection {
  entityId: string;
  code: string;
}

export interface MoveCommand {
  type: 'move';
  entityId: string;
  dir: Dir;
  running: boolean;
  issuedAtMs: number;
  /** Direct neighbor. When set, the direction does not pick the edge. */
  to?: string;
}

export interface AttackCommand {
  type: 'attack';
  attackerId: string;
  targetId: string;
  weaponDamage: number;
  odCost: number;
  range: number;
  los: boolean;
  aim: LimbId | null;
  melee: boolean;
  friendlyFire: boolean;
  sameGroup: boolean;
  pvpOpen: boolean;
  safeZone: boolean;
  issuedAtMs: number;
  distance?: number;
}

export interface ReviveCommand {
  type: 'revive';
  entityId: string;
  victimId: string;
  issuedAtMs: number;
}

export interface RespawnCommand {
  type: 'respawn';
  entityId: string;
  issuedAtMs: number;
}

export interface LootCommand {
  type: 'loot';
  entityId: string;
  victimId: string;
  itemId: string;
  issuedAtMs: number;
}

export type SimCommand = MoveCommand | AttackCommand | ReviveCommand | RespawnCommand | LootCommand;

export interface SimWorld {
  tick: number;
  nowMs: number;
  entities: SimEntity[];
  corpses: SimCorpse[];
  rejections: SimRejection[];
  obstacles: Cell[];
  /** Last 6 states, oldest first. Each entry has an empty `history`. */
  history: SimWorld[];
  /** Loot rows keyed by monster template id. Absent tables drop nothing. */
  lootTables?: Record<string, readonly LootEntry[]>;
  weatherId?: string | null;
  safeZone?: boolean;
  respawns?: MonsterRespawn[];
  /** Copied from `combatWeather` so vision and gathering read the same tick. */
  vision?: number;
  gatherSpeed?: number;
  seasonSpawn?: number;
  holidayCraft?: number;
  holidayKeeper?: number;
  invasion?: string | null;
  seasonResource?: string;
  /** World-layer story flags. Personal quest text does not set these. */
  barrierDown?: boolean;
  primordialOpened?: boolean;
  /** Racial cities, regional nodes, and primordial rings. Absent in grid-only tests. */
  geography?: Geography;
  /** Cities whose war has started. PvP in a safe city follows this list. */
  warCities?: readonly string[];
  /** Open city wars. `respawn` reads defender and attacker branches from these. */
  warFronts?: readonly WarFront[];
}

export interface WarFront {
  cityId: string;
  attackerGuildIds: readonly string[];
  defenderGuildIds: readonly string[];
  captured: boolean;
  musterNodeId: string;
}

interface StatusMods {
  accuracyPenalty: number;
  speedMultiplier: number;
  damageMultiplier: number;
}

interface OrderedCommand {
  command: SimCommand;
  reaction: number;
  issuedAtMs: number;
}

export function stepTick(world: SimWorld, commands: readonly SimCommand[], rng: Rng): SimWorld {
  const clock = manualClock(world.nowMs);
  clock.advance(SIM_TICK_MS);
  const nowMs = clock.now();
  const tick = world.tick + 1;

  const entities = world.entities
    .filter((entity) => !(entity.isBot && entity.carrierOffline === true))
    .map(cloneEntity);
  const respawns: MonsterRespawn[] = [];
  for (const row of world.respawns ?? []) {
    if (row.atMs <= nowMs) {
      if (!entities.some((entity) => entity.id === row.entity.id)) {
        entities.push(cloneEntity({ ...row.entity, hp: row.entity.maxHp, phase: 'online' }));
      }
      continue;
    }
    respawns.push({ atMs: row.atMs, entity: cloneEntity(row.entity) });
  }
  const rejections: SimRejection[] = [];
  const mods = new Map<string, StatusMods>();
  const weather = combatWeather(world.weatherId, world.safeZone === true);

  for (const entity of entities) {
    if (entity.phase === 'offline' || entity.frozen === true) {
      continue;
    }
    const localWeather = shelteredFromWeather(world, entity) ? combatWeather(world.weatherId, true) : weather;
    regenOd(entity);
    const seconds = tick % TICKS_PER_SECOND === 0 ? 1 : 0;
    const status = tickStatuses(entity.statuses, nowMs, seconds);
    entity.statuses = status.active;
    entity.stunned = status.stunned;
    if (seconds === 1) {
      entity.hp -= status.hpLoss;
      entity.hp -= localWeather.hpPerSecond;
    }
    if (localWeather.mutationChance > 0 && rng.nextUnit() < localWeather.mutationChance) {
      const rolled = tryApplyStatus({
        resist: 0,
        id: 'mutation',
        nowMs,
        sourceId: 'weather',
        existing: entity.statuses,
        rng,
      });
      entity.statuses = rolled.statuses;
    }
    mods.set(entity.id, {
      accuracyPenalty: status.accuracyPenalty,
      speedMultiplier: status.speedMultiplier,
      damageMultiplier: status.damageMultiplier,
    });
  }

  const obstacles = world.obstacles.map((cell) => ({ x: cell.x, y: cell.y }));
  const graphStepped = new Set<string>();
  const ordered = orderCommands(entities, commands, rng);
  for (const command of ordered) {
    if (command.type === 'move') {
      applyMove(entities, command, rejections, mods, obstacles, weather, {
        geography: world.geography,
        barrierDown: world.barrierDown === true,
      }, graphStepped);
    } else if (command.type === 'attack') {
      applyAttack(entities, command, rejections, mods, nowMs, weather, rng, zoneOf(world));
    }
  }

  for (const entity of entities) {
    if (entity.travel !== undefined && !graphStepped.has(entity.id)) {
      walkEdge(entity, mods, weather);
    }
    applyLogout(entity);
  }

  pursuePlayers(entities, rejections, mods, obstacles, nowMs, weather, rng, zoneOf(world));

  const settled = settleMonsters(entities, world.corpses, rng, nowMs, world.lootTables, weather, respawns);
  settlePlayers(settled.entities, settled.corpses, nowMs);
  for (const command of ordered) {
    if (command.type === 'revive') {
      applyRevive(settled.entities, settled.corpses, command, rejections, nowMs);
    } else if (command.type === 'respawn') {
      applyRespawn(settled.entities, command, rejections, world, nowMs);
    } else if (command.type === 'loot') {
      applyLoot(settled.entities, settled.corpses, command, rejections, nowMs);
    }
  }

  const next: SimWorld = {
    tick,
    nowMs,
    entities: settled.entities,
    corpses: settled.corpses,
    rejections,
    obstacles,
    history: [],
    ...(world.lootTables !== undefined ? { lootTables: world.lootTables } : {}),
    ...(world.weatherId !== undefined ? { weatherId: world.weatherId } : {}),
    ...(world.safeZone !== undefined ? { safeZone: world.safeZone } : {}),
    respawns,
    vision: weather.vision,
    gatherSpeed: weather.speed,
    ...(world.seasonSpawn !== undefined ? { seasonSpawn: world.seasonSpawn } : {}),
    ...(world.barrierDown !== undefined ? { barrierDown: world.barrierDown } : {}),
    ...(world.primordialOpened !== undefined ? { primordialOpened: world.primordialOpened } : {}),
    ...(world.geography !== undefined ? { geography: world.geography } : {}),
    ...(world.warCities !== undefined ? { warCities: world.warCities } : {}),
    ...(world.warFronts !== undefined ? { warFronts: world.warFronts } : {}),
    ...(world.invasion !== undefined ? { invasion: world.invasion } : {}),
  };
  const prior = world.history.map(cloneWorld);
  return { ...next, history: [...prior, cloneWorld(next)].slice(-LAG_HISTORY) };
}

/** Closest snapshot at or before `newest.nowMs - delayMs`. Delay above 500 ms clamps to the oldest. */
export function snapshotLag(history: readonly SimWorld[], delayMs: number): SimWorld {
  const newest = newestSnapshot(history);
  const oldest = oldestSnapshot(history);
  if (newest === undefined || oldest === undefined) {
    throw new RangeError('snapshot history is empty');
  }
  if (delayMs <= 0) {
    return newest;
  }
  if (delayMs > MAX_LAG_MS) {
    return oldest;
  }

  const requested = newest.nowMs - delayMs;
  let best: SimWorld | undefined;
  for (const snap of history) {
    if (snap.nowMs <= requested && (best === undefined || snap.nowMs >= best.nowMs)) {
      best = snap;
    }
  }
  return best ?? oldest;
}

function dirToward(from: Cell, to: Cell): Dir {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy <= 0) {
    return 'n';
  }
  if (dx > 0 && dy < 0) {
    return 'ne';
  }
  if (dx > 0 && dy === 0) {
    return 'e';
  }
  if (dx > 0 && dy > 0) {
    return 'se';
  }
  if (dx === 0 && dy > 0) {
    return 's';
  }
  if (dx < 0 && dy > 0) {
    return 'sw';
  }
  if (dx < 0 && dy === 0) {
    return 'w';
  }
  return 'nw';
}

/** A safe city or hub drops weather damage. The world flag still shelters everyone. */
function shelteredFromWeather(world: SimWorld, entity: SimEntity): boolean {
  if (world.safeZone === true) {
    return true;
  }
  if (entity.nodeId === undefined || world.geography === undefined) {
    return false;
  }
  const node = world.geography.nodes.find((row) => row.id === entity.nodeId);
  return node?.safe === true;
}

function zoneOf(world: SimWorld): {
  geography?: Geography;
  warCities?: readonly string[];
  invasion?: string | null;
} {
  return {
    ...(world.geography !== undefined ? { geography: world.geography } : {}),
    ...(world.warCities !== undefined ? { warCities: world.warCities } : {}),
    ...(world.invasion !== undefined ? { invasion: world.invasion } : {}),
  };
}

function pursuePlayers(
  entities: SimEntity[],
  rejections: SimRejection[],
  mods: ReadonlyMap<string, StatusMods>,
  obstacles: readonly Cell[],
  nowMs: number,
  weather: WeatherMods,
  rng: Rng,
  zone: { geography?: Geography; warCities?: readonly string[]; invasion?: string | null },
): void {
  const players = entities.filter(
    (entity) =>
      entity.monsterId === undefined &&
      entity.phase === 'online' &&
      entity.hp > 0 &&
      entity.inEncounter === true,
  );
  if (players.length === 0) {
    return;
  }
  for (const monster of entities) {
    if (monster.monsterId === undefined || monster.hp <= 0 || monster.phase !== 'online') {
      continue;
    }
    const quarry = players.filter(
      (player) => monster.instanceId === undefined || monster.instanceId === player.id,
    );
    const nearestStart = quarry[0];
    if (nearestStart === undefined) {
      continue;
    }
    let nearest = nearestStart;
    let best = chebyshev(monster.cell, nearest.cell);
    for (const player of quarry) {
      const distance = chebyshev(monster.cell, player.cell);
      if (distance < best) {
        nearest = player;
        best = distance;
      }
    }
    const sight = Math.max(1, Math.floor(8 * weather.vision));
    if (best > sight) {
      continue;
    }
    if (best <= 1) {
      applyAttack(
        entities,
        {
          type: 'attack',
          attackerId: monster.id,
          targetId: nearest.id,
          weaponDamage: monster.damage ?? monster.baseDamage ?? 2,
          odCost: 1,
          range: 1,
          los: true,
          aim: null,
          melee: true,
          friendlyFire: false,
          sameGroup: false,
          pvpOpen: true,
          safeZone: false,
          issuedAtMs: nowMs,
        },
        rejections,
        mods,
        nowMs,
        weather,
        rng,
        zone,
      );
      continue;
    }
    const speed =
      (monster.speedMultiplier ?? 1) *
      (mods.get(monster.id)?.speedMultiplier ?? 1) *
      weather.speed;
    let steps = Math.floor(speed);
    monster.moveFrac = (monster.moveFrac ?? 0) + (speed - steps);
    if (monster.moveFrac >= 1) {
      steps += 1;
      monster.moveFrac -= 1;
    }
    let cell = monster.cell;
    for (let index = 0; index < steps; index += 1) {
      const dir = dirToward(cell, nearest.cell);
      const next = step(cell, dir);
      const occupied = entities.some(
        (entity) => entity.id !== monster.id && entity.cell.x === next.x && entity.cell.y === next.y,
      );
      const blocked = obstacles.some((obstacle) => obstacle.x === next.x && obstacle.y === next.y);
      if (occupied || blocked) {
        break;
      }
      cell = next;
    }
    monster.cell = cell;
  }
}

function settleMonsters(
  entities: SimEntity[],
  corpses: readonly SimCorpse[],
  rng: Rng,
  nowMs: number,
  lootTables: SimWorld['lootTables'],
  weather: WeatherMods,
  respawns: MonsterRespawn[],
): { entities: SimEntity[]; corpses: SimCorpse[] } {
  const alive: SimEntity[] = [];
  const nextCorpses = corpses.map((corpse) => ({ ...corpse, stacks: corpse.stacks?.map((stack) => ({ ...stack })) }));
  for (const entity of entities) {
    if (entity.monsterId !== undefined && entity.phases !== undefined && entity.maxHp > 0) {
      const phase = resolveBossPhase(Math.max(0, entity.hp), entity.maxHp, entity.phases);
      entity.bossPhase = phase.phase;
      if (entity.baseDamage !== undefined) {
        entity.damage = entity.baseDamage * phase.damageMultiplier;
      }
    }
    if (entity.monsterId !== undefined && entity.hp <= 0) {
      const table = lootTables?.[entity.monsterId] ?? [];
      const stacks = rolledLoot({
        entries: table,
        rng,
        elite: entity.eliteId != null && entity.eliteId !== '',
        monsterLevel: entity.level ?? 1,
        lootMultiplier: weather.loot,
      });
      grantKill(entities, entity);
      nextCorpses.push({
        victimId: entity.id,
        createdAtMs: nowMs,
        stacks: stacks.map((stack) => ({ itemId: stack.itemId, qty: stack.qty })),
        looted: false,
        bindNodeId: '',
        ...(entity.lastAttackerId !== undefined ? { killerId: entity.lastAttackerId } : {}),
      });
      if (entity.cityGuard === undefined) {
        respawns.push({
          atMs: nowMs + MONSTER_RESPAWN_MS,
          entity: cloneEntity({ ...entity, hp: entity.maxHp, phase: 'online' }),
        });
      }
      continue;
    }
    alive.push(entity);
  }
  return { entities: alive, corpses: nextCorpses };
}

const DIR_INDEX: Record<string, number> = {
  n: 0,
  ne: 1,
  e: 2,
  se: 3,
  s: 4,
  sw: 5,
  w: 6,
  nw: 7,
};

function stepDungeon(entity: SimEntity, command: MoveCommand, rejections: SimRejection[]): void {
  const edges = entity.dungeonEdges ?? [];
  const neighbors: number[] = [];
  for (const [a, b] of edges) {
    if (a === entity.roomId) {
      neighbors.push(b);
    } else if (b === entity.roomId) {
      neighbors.push(a);
    }
  }
  if (neighbors.length === 0 || entity.od < 1) {
    rejections.push({ entityId: entity.id, code: neighbors.length === 0 ? 'blocked' : 'od' });
    return;
  }
  const index = DIR_INDEX[command.dir] ?? 0;
  const next = neighbors[index % neighbors.length];
  if (next === undefined) {
    rejections.push({ entityId: entity.id, code: 'blocked' });
    return;
  }
  entity.roomId = next;
  const room = entity.dungeonRooms?.find((candidate) => candidate.id === next);
  if (room !== undefined) {
    entity.cell = { x: room.x, y: room.y };
  }
  entity.od -= 1;
  entity.odFrac = Math.max(0, entity.odFrac - 1);
}

function regenOd(entity: SimEntity): void {
  const derived = derive({
    stats: { ...emptyPoints(), reaction: entity.reaction, will: entity.will },
    level: 1,
    totalWeightKg: 0,
  });
  const summed = entity.odFrac + derived.odRegenPerSecond / TICKS_PER_SECOND;
  const limited = summed > derived.odLimit ? derived.odLimit : summed;
  entity.odFrac = roundOd(limited);
  const whole = Math.floor(entity.odFrac);
  entity.od = Math.max(0, whole > derived.odLimit ? derived.odLimit : whole);
}

function applyLogout(entity: SimEntity): void {
  if (
    entity.isBot ||
    entity.logoutRequested !== true ||
    entity.inCombat ||
    entity.phase === 'offline'
  ) {
    return;
  }
  const starting =
    entity.logoutLeftMs === undefined || entity.logoutLeftMs === null
      ? LOGOUT_GRACE_MS
      : entity.logoutLeftMs;
  const left = starting - SIM_TICK_MS;
  if (left <= 0) {
    entity.logoutLeftMs = 0;
    entity.phase = 'offline';
    entity.frozen = true;
    return;
  }
  entity.logoutLeftMs = left;
}

function orderCommands(
  entities: readonly SimEntity[],
  commands: readonly SimCommand[],
  rng: Rng,
): SimCommand[] {
  const decorated: OrderedCommand[] = commands.map((command) => ({
    command,
    reaction: reactionOf(entities, command),
    issuedAtMs: command.issuedAtMs,
  }));
  return orderByInitiative(decorated, rng).map((entry) => entry.command);
}

function reactionOf(entities: readonly SimEntity[], command: SimCommand): number {
  const id = command.type === 'attack' ? command.attackerId : command.entityId;
  return findEntity(entities, id)?.reaction ?? 0;
}

function settlePlayers(entities: SimEntity[], corpses: SimCorpse[], nowMs: number): void {
  for (const entity of entities) {
    if (entity.monsterId !== undefined || entity.phase !== 'online' || entity.hp > 0) {
      continue;
    }
    const fell = fallDown({
      victimId: entity.id,
      life: {
        phase: 'online',
        hp: entity.hp,
        bindNodeId: entity.bindNodeId ?? 'fort_humans',
        inventory: entity.inventory ?? [],
      },
      nowMs,
      maxHp: entity.maxHp,
    });
    entity.phase = 'downed';
    entity.hp = fell.life.hp;
    entity.inventory = [];
    entity.downedAtMs = nowMs;
    corpses.push({
      victimId: fell.corpse.victimId,
      createdAtMs: fell.corpse.createdAtMs,
      stacks: fell.corpse.stacks.map((stack) => ({
        itemId: stack.itemId,
        qty: 1,
        questItem: stack.questItem,
        ...(stack.questOwnerId !== undefined ? { questOwnerId: stack.questOwnerId } : {}),
      })),
      looted: fell.corpse.looted,
      bindNodeId: fell.corpse.bindNodeId,
    });
  }
}

function applyRevive(
  entities: SimEntity[],
  corpses: SimCorpse[],
  command: ReviveCommand,
  rejections: SimRejection[],
  nowMs: number,
): void {
  const entity = findEntity(entities, command.victimId);
  const index = corpses.findIndex((corpse) => corpse.victimId === command.victimId);
  const corpse = index >= 0 ? corpses[index] : undefined;
  if (entity === undefined || corpse === undefined || corpse.createdAtMs === undefined) {
    rejections.push({ entityId: command.entityId, code: 'missing' });
    return;
  }
  const revived = revive(toDomainCorpse(corpse), entity.maxHp, nowMs);
  if (!revived.ok) {
    rejections.push({ entityId: command.entityId, code: revived.code });
    return;
  }
  entity.phase = 'online';
  entity.hp = revived.value.life.hp;
  entity.inventory = revived.value.inventory;
  entity.inCombat = false;
  corpses.splice(index, 1);
}

function applyRespawn(
  entities: SimEntity[],
  command: RespawnCommand,
  rejections: SimRejection[],
  world: SimWorld,
  nowMs: number,
): void {
  const entity = findEntity(entities, command.entityId);
  if (entity === undefined || entity.phase !== 'downed') {
    rejections.push({ entityId: command.entityId, code: 'missing' });
    return;
  }
  const front = warFrontFor(entity, world.warFronts ?? []);
  if (front !== undefined && (entity.downedAtMs === undefined || !warRespawnReady(entity.downedAtMs, nowMs))) {
    rejections.push({ entityId: command.entityId, code: 'early' });
    return;
  }
  const role =
    front === undefined
      ? 'civilian'
      : warRespawnRole({
          guildId: entity.guildId ?? null,
          attackerGuildIds: front.attackerGuildIds,
          defenderGuildIds: front.defenderGuildIds,
        });
  const branch = warRespawnNode({
    role,
    cityNodeId: front?.cityId ?? entity.bindNodeId ?? 'fort_humans',
    musterNodeId: front?.musterNodeId ?? 'cross_light',
    captured: front?.captured === true,
    bindNodeId: entity.bindNodeId ?? 'fort_humans',
  });
  const spawned = respawn({
    life: {
      phase: 'downed',
      hp: entity.hp,
      bindNodeId: entity.bindNodeId ?? 'fort_humans',
      inventory: entity.inventory ?? [],
    },
    maxHp: entity.maxHp,
    odLimit: Math.max(1, entity.od),
    nodeId: branch.nodeId,
    moveBind: branch.moveBind,
  });
  entity.phase = 'online';
  entity.hp = spawned.life.hp;
  entity.inventory = [];
  entity.inCombat = false;
  entity.inEncounter = false;
  entity.nodeId = spawned.nodeId;
  entity.bindNodeId = spawned.life.bindNodeId;
  const site = world.geography?.nodes.find((node) => node.id === spawned.nodeId);
  entity.cell = site !== undefined ? { x: site.x, y: site.y } : (entity.bindCell ?? { x: 0, y: 0 });
  entity.od = spawned.od;
  entity.odFrac = spawned.od;
  delete entity.downedAtMs;
}

function warFrontFor(entity: SimEntity, fronts: readonly WarFront[]): WarFront | undefined {
  const here = fronts.find((front) => front.cityId === entity.nodeId);
  if (here !== undefined) {
    return here;
  }
  if (entity.guildId === undefined) {
    return undefined;
  }
  return fronts.find(
    (front) =>
      front.attackerGuildIds.includes(entity.guildId ?? '') ||
      front.defenderGuildIds.includes(entity.guildId ?? ''),
  );
}

function applyLoot(
  entities: SimEntity[],
  corpses: SimCorpse[],
  command: LootCommand,
  rejections: SimRejection[],
  nowMs: number,
): void {
  const index = corpses.findIndex((corpse) => corpse.victimId === command.victimId);
  const corpse = index >= 0 ? corpses[index] : undefined;
  if (corpse === undefined || corpse.createdAtMs === undefined) {
    rejections.push({ entityId: command.entityId, code: 'missing' });
    return;
  }
  const taken = takeFromCorpse(toDomainCorpse(corpse), command.itemId, command.entityId, nowMs);
  if (!taken.ok) {
    rejections.push({ entityId: command.entityId, code: taken.code });
    return;
  }
  const looter = findEntity(entities, command.entityId);
  if (looter !== undefined) {
    looter.inventory = [...(looter.inventory ?? []), taken.value.stack];
  }
  corpses[index] = {
    victimId: taken.value.corpse.victimId,
    createdAtMs: taken.value.corpse.createdAtMs,
    stacks: taken.value.corpse.stacks.map((stack) => ({
      itemId: stack.itemId,
      qty: 1,
      questItem: stack.questItem,
      ...(stack.questOwnerId !== undefined ? { questOwnerId: stack.questOwnerId } : {}),
    })),
    looted: taken.value.corpse.looted,
    bindNodeId: taken.value.corpse.bindNodeId,
  };
}

function toDomainCorpse(corpse: SimCorpse) {
  return {
    victimId: corpse.victimId,
    createdAtMs: corpse.createdAtMs ?? 0,
    stacks: (corpse.stacks ?? []).map((stack) => ({
      itemId: stack.itemId,
      questItem: stack.questItem === true,
      ...(stack.questOwnerId !== undefined ? { questOwnerId: stack.questOwnerId } : {}),
      durability: 100,
      equipped: false,
    })),
    looted: corpse.looted === true,
    bindNodeId: corpse.bindNodeId ?? 'fort_humans',
  };
}

function grantKill(entities: readonly SimEntity[], victim: SimEntity): void {
  const hero = entities.find((entity) => entity.id === victim.lastAttackerId);
  if (
    hero === undefined ||
    hero.monsterId !== undefined ||
    hero.progress === undefined ||
    hero.quests === undefined
  ) {
    return;
  }
  const next = onKill(
    { progress: hero.progress, quests: hero.quests },
    victim.level ?? 1,
    victim.monsterKind ?? (victim.eliteId != null && victim.eliteId !== '' ? 'elite' : 'normal'),
    victim.monsterId,
  );
  hero.progress = next.progress;
  hero.quests = next.quests;
}

function applyMove(
  entities: SimEntity[],
  command: MoveCommand,
  rejections: SimRejection[],
  mods: ReadonlyMap<string, StatusMods>,
  obstacles: readonly Cell[],
  weather: WeatherMods,
  travel: { geography?: Geography; barrierDown: boolean },
  graphStepped: Set<string>,
): void {
  const entity = findEntity(entities, command.entityId);
  if (entity === undefined) {
    rejections.push({ entityId: command.entityId, code: 'missing' });
    return;
  }
  if (entity.phase === 'offline' || entity.frozen === true) {
    rejections.push({ entityId: entity.id, code: 'offline' });
    return;
  }
  if (entity.stunned) {
    rejections.push({ entityId: entity.id, code: 'stun_blocked' });
    return;
  }
  if (entity.roomId !== undefined && entity.dungeonEdges !== undefined) {
    stepDungeon(entity, command, rejections);
    return;
  }
  if (travel.geography !== undefined && entity.inEncounter !== true && entity.nodeId !== undefined) {
    stepNode(entity, command, rejections, mods, weather, {
      geography: travel.geography,
      barrierDown: travel.barrierDown,
    }, graphStepped);
    return;
  }

  const speed =
    (mods.get(entity.id)?.speedMultiplier ?? 1) *
    neuroshockScale(1, neuralOverload(entity)) *
    weather.speed *
    (entity.speedMultiplier ?? 1);
  const downed = entity.phase === 'downed';
  const pace = cellsFor({
    reaction: entity.reaction,
    running: command.running,
    overloaded: entity.overloaded === true,
    legsDestroyed: entity.legsDestroyed ?? 0,
    downed,
  });
  const allowed = Math.floor(pace * speed);
  const blocked = (cell: Cell): boolean => obstacles.some((obstacle) => sameCell(obstacle, cell));
  const result = move({
    from: entity.cell,
    dir: command.dir,
    inCombat: entity.inCombat,
    od: entity.od,
    reaction: entity.reaction,
    running: command.running,
    overloaded: entity.overloaded === true,
    legsDestroyed: entity.legsDestroyed ?? 0,
    downed,
    blocked,
  });
  if (!result.ok) {
    rejections.push({ entityId: entity.id, code: result.code });
    return;
  }
  if (speed !== 1 && allowed < 1) {
    rejections.push({ entityId: entity.id, code: 'slow' });
    return;
  }

  let cell = result.value.cell;
  if (speed !== 1 && allowed < result.value.cells) {
    cell = { x: entity.cell.x, y: entity.cell.y };
    const steps = Math.min(allowed, result.value.cells);
    for (let i = 0; i < steps; i += 1) {
      const next = step(cell, command.dir);
      if (blocked(next)) {
        break;
      }
      cell = next;
    }
  }
  spendOd(entity, result.value.od);
  entity.cell = cell;
}

function stepNode(
  entity: SimEntity,
  command: MoveCommand,
  rejections: SimRejection[],
  mods: ReadonlyMap<string, StatusMods>,
  weather: WeatherMods,
  travel: { geography: Geography; barrierDown: boolean },
  graphStepped: Set<string>,
): void {
  const nodeId = entity.nodeId;
  if (nodeId === undefined) {
    rejections.push({ entityId: entity.id, code: 'no_edge' });
    return;
  }
  const downed = entity.phase === 'downed';
  if (command.running && entity.overloaded === true) {
    rejections.push({ entityId: entity.id, code: 'overload_run' });
    return;
  }
  if (command.running && downed) {
    rejections.push({ entityId: entity.id, code: 'downed' });
    return;
  }
  if ((entity.legsDestroyed ?? 0) === 2) {
    rejections.push({ entityId: entity.id, code: 'legs' });
    return;
  }
  const speed =
    (mods.get(entity.id)?.speedMultiplier ?? 1) *
    neuroshockScale(1, neuralOverload(entity)) *
    weather.speed *
    (entity.speedMultiplier ?? 1);
  const pace = cellsFor({
    reaction: entity.reaction,
    running: command.running,
    overloaded: entity.overloaded === true,
    legsDestroyed: entity.legsDestroyed ?? 0,
    downed,
  });
  if (pace < 1 || (speed !== 1 && Math.floor(pace * speed) < 1)) {
    rejections.push({ entityId: entity.id, code: pace < 1 ? 'legs' : 'slow' });
    return;
  }
  const stepped = neighborStep({
    geography: { ...travel.geography, barrierDown: travel.barrierDown || travel.geography.barrierDown },
    fromId: nodeId,
    dir: command.dir,
    ...(command.to !== undefined ? { to: command.to } : {}),
  });
  if (!stepped.ok) {
    rejections.push({ entityId: entity.id, code: stepped.code });
    return;
  }
  const length = edgeLength(travel.geography, nodeId, stepped.value.nodeId);
  if (length === undefined) {
    rejections.push({ entityId: entity.id, code: 'no_edge' });
    return;
  }
  if (entity.travel?.nodeId !== stepped.value.nodeId) {
    entity.travel = {
      nodeId: stepped.value.nodeId,
      cell: stepped.value.cell,
      remaining: length,
      running: command.running,
    };
  } else {
    entity.travel = { ...entity.travel, running: command.running };
  }
  graphStepped.add(entity.id);
  walkEdge(entity, mods, weather);
}

function walkEdge(
  entity: SimEntity,
  mods: ReadonlyMap<string, StatusMods>,
  weather: WeatherMods,
): void {
  const trip = entity.travel;
  if (trip === undefined || entity.phase === 'offline' || entity.frozen === true || entity.stunned) {
    return;
  }
  const downed = entity.phase === 'downed';
  const speed =
    (mods.get(entity.id)?.speedMultiplier ?? 1) *
    neuroshockScale(1, neuralOverload(entity)) *
    weather.speed *
    (entity.speedMultiplier ?? 1);
  const pace = cellsFor({
    reaction: entity.reaction,
    running: trip.running,
    overloaded: entity.overloaded === true,
    legsDestroyed: entity.legsDestroyed ?? 0,
    downed,
  });
  const cellsPerAction = speed === 1 ? pace : Math.floor(pace * speed);
  if (cellsPerAction < 1) {
    return;
  }
  const walked = edgeStep({
    remaining: trip.remaining,
    cellsPerAction,
    running: trip.running,
    od: entity.od,
  });
  if (!walked.ok) {
    return;
  }
  spendOd(entity, walked.od);
  if (walked.remaining > 0) {
    entity.travel = { ...trip, remaining: walked.remaining };
    return;
  }
  entity.nodeId = trip.nodeId;
  entity.cell = { ...trip.cell };
  delete entity.travel;
}

function neuralOverload(entity: SimEntity): boolean {
  if (entity.overloaded === true) {
    return true;
  }
  if (entity.nn === undefined || entity.nnLimit === undefined) {
    return false;
  }
  return entity.nn > entity.nnLimit;
}

function isMutagen(monsterId: string | undefined): boolean {
  if (monsterId === undefined) {
    return false;
  }
  return monsterId.includes('spore') || monsterId.includes('fungus') || monsterId.includes('matron');
}

function applyAttack(
  entities: SimEntity[],
  command: AttackCommand,
  rejections: SimRejection[],
  mods: ReadonlyMap<string, StatusMods>,
  nowMs: number,
  weather: WeatherMods,
  rng: Rng,
  zone: { geography?: Geography; warCities?: readonly string[]; invasion?: string | null },
): void {
  const attacker = findEntity(entities, command.attackerId);
  if (attacker === undefined) {
    rejections.push({ entityId: command.attackerId, code: 'missing' });
    return;
  }
  const target = findEntity(entities, command.targetId);
  if (target === undefined) {
    rejections.push({ entityId: command.attackerId, code: 'missing' });
    return;
  }
  if (attacker.phase === 'offline' || attacker.frozen === true) {
    rejections.push({ entityId: attacker.id, code: 'offline' });
    return;
  }

  const attackerDraft = cloneEntity(attacker);
  const targetDraft = cloneEntity(target);
  enterCombat(attackerDraft);
  enterCombat(targetDraft);

  let pvpOpen = command.pvpOpen;
  let safeZone = command.safeZone;
  if (attacker.monsterId === undefined) {
    const derived = combatZone({
      geography: zone.geography,
      nodeId: attacker.nodeId,
      inEncounter: attacker.inEncounter === true,
      inDungeon: attacker.dungeonId !== undefined,
      warCities: zone.warCities,
      invasion: zone.invasion,
    });
    if (derived !== null) {
      pvpOpen = derived.pvpOpen;
      safeZone = derived.safeZone;
    }
  }

  const perceptionPenalty = weather.perception < 0 ? -weather.perception : 0;
  const weatherPenalty =
    (command.melee ? 0 : -weather.rangedAccuracy) +
    (weather.accuracy < 0 ? -weather.accuracy : 0) +
    perceptionPenalty;
  const result = resolveAttack({
    attacker: toCombatant(
      attackerDraft,
      (mods.get(attacker.id)?.accuracyPenalty ?? 0) + weatherPenalty,
    ),
    target: toCombatant(targetDraft, mods.get(target.id)?.accuracyPenalty ?? 0),
    weaponDamage:
      neuroshockScale(command.weaponDamage, neuralOverload(attacker)) *
      (mods.get(attacker.id)?.damageMultiplier ?? 1) *
      (attacker.monsterId !== undefined ? weather.monsterDamage : 1),
    odCost: command.odCost,
    range: command.range,
    distance: command.distance ?? chebyshev(attackerDraft.cell, targetDraft.cell),
    los: command.los,
    aim: command.aim,
    melee: command.melee,
    friendlyFire: command.friendlyFire,
    sameGroup: command.sameGroup,
    pvpOpen,
    safeZone,
    issuedAtMs: command.issuedAtMs,
  });
  if (!result.ok) {
    rejections.push({ entityId: attacker.id, code: result.code });
    return;
  }

  commitCombatant(attackerDraft, result.value.attacker);
  commitCombatant(targetDraft, result.value.target);
  targetDraft.lastAttackerId = attacker.id;
  if (result.value.stunnedMs > 0) {
    const applied = tryApplyStatus({
      resist: 0,
      id: 'stun',
      nowMs,
      sourceId: attacker.id,
      existing: targetDraft.statuses,
    });
    targetDraft.statuses = applied.statuses;
    targetDraft.stunned = true;
  }
  if (isMutagen(attacker.monsterId)) {
    const mutated = tryApplyStatus({
      resist: 0,
      id: 'mutation',
      nowMs,
      sourceId: attacker.id,
      existing: targetDraft.statuses,
      rng,
    });
    targetDraft.statuses = mutated.statuses;
  }
  replaceEntity(entities, attackerDraft);
  replaceEntity(entities, targetDraft);
}

function enterCombat(entity: SimEntity): void {
  if (entity.inCombat) {
    return;
  }
  entity.inCombat = true;
  entity.od = 1;
  entity.odFrac = 1;
}

function toCombatant(entity: SimEntity, accuracyPenalty: number): Combatant {
  return {
    id: entity.id,
    reaction: entity.reaction,
    accuracyStat: entity.accuracyStat,
    accuracyScore: entity.accuracyScore - accuracyPenalty,
    evasion: entity.evasion,
    armor: entity.armor,
    od: entity.od,
    hp: entity.hp,
    maxHp: entity.maxHp,
    limbs: limbsOf(entity),
    alive: entity.phase !== 'offline',
    downed: entity.phase === 'downed',
    cover: entity.cover === true,
    stunned: entity.stunned,
  };
}

function commitCombatant(entity: SimEntity, combatant: Combatant): void {
  entity.hp = combatant.hp;
  entity.limbs = { ...combatant.limbs };
  entity.stunned = combatant.stunned;
  const left = combatant.limbs.leg_left <= 0 ? 1 : 0;
  const right = combatant.limbs.leg_right <= 0 ? 1 : 0;
  entity.legsDestroyed = (left + right) as 0 | 1 | 2;
  spendOd(entity, combatant.od);
}

function spendOd(entity: SimEntity, nextOd: number): void {
  const spent = entity.od - nextOd;
  entity.od = nextOd;
  if (spent !== 0) {
    entity.odFrac = roundOd(Math.max(0, entity.odFrac - spent));
  }
}

function limbsOf(entity: SimEntity): Record<LimbId, number> {
  if (entity.limbs !== undefined) {
    return { ...entity.limbs };
  }
  return {
    head: limbMax(entity.maxHp, 'head'),
    torso: limbMax(entity.maxHp, 'torso'),
    arm_left: limbMax(entity.maxHp, 'arm_left'),
    arm_right: limbMax(entity.maxHp, 'arm_right'),
    leg_left: limbMax(entity.maxHp, 'leg_left'),
    leg_right: limbMax(entity.maxHp, 'leg_right'),
  };
}

function findEntity(entities: readonly SimEntity[], id: string): SimEntity | undefined {
  return entities.find((entity) => entity.id === id);
}

function replaceEntity(entities: SimEntity[], updated: SimEntity): void {
  const index = entities.findIndex((entity) => entity.id === updated.id);
  if (index >= 0) {
    entities[index] = updated;
  }
}

function cloneEntity(entity: SimEntity): SimEntity {
  return {
    ...entity,
    cell: { x: entity.cell.x, y: entity.cell.y },
    statuses: entity.statuses.map((status) => ({ ...status })),
    limbs: entity.limbs === undefined ? undefined : { ...entity.limbs },
    inventory: entity.inventory?.map((stack) => ({ ...stack })),
    bindCell: entity.bindCell === undefined ? undefined : { x: entity.bindCell.x, y: entity.bindCell.y },
    phases: entity.phases === undefined ? undefined : [...entity.phases],
  };
}

function cloneWorld(world: SimWorld): SimWorld {
  return {
    tick: world.tick,
    nowMs: world.nowMs,
    entities: world.entities.map(cloneEntity),
    corpses: world.corpses.map((corpse) => ({
      ...corpse,
      stacks: corpse.stacks?.map((stack) => ({ ...stack })),
    })),
    rejections: world.rejections.map((rejection) => ({ ...rejection })),
    obstacles: world.obstacles.map((cell) => ({ x: cell.x, y: cell.y })),
    history: [],
    ...(world.lootTables !== undefined ? { lootTables: world.lootTables } : {}),
    ...(world.weatherId !== undefined ? { weatherId: world.weatherId } : {}),
    ...(world.safeZone !== undefined ? { safeZone: world.safeZone } : {}),
    ...(world.respawns !== undefined ? { respawns: world.respawns.map((row) => ({ atMs: row.atMs, entity: cloneEntity(row.entity) })) } : {}),
    ...(world.vision !== undefined ? { vision: world.vision } : {}),
    ...(world.gatherSpeed !== undefined ? { gatherSpeed: world.gatherSpeed } : {}),
    ...(world.seasonSpawn !== undefined ? { seasonSpawn: world.seasonSpawn } : {}),
    ...(world.barrierDown !== undefined ? { barrierDown: world.barrierDown } : {}),
    ...(world.primordialOpened !== undefined ? { primordialOpened: world.primordialOpened } : {}),
    ...(world.geography !== undefined ? { geography: world.geography } : {}),
    ...(world.warCities !== undefined ? { warCities: world.warCities } : {}),
    ...(world.warFronts !== undefined ? { warFronts: world.warFronts } : {}),
    ...(world.invasion !== undefined ? { invasion: world.invasion } : {}),
  };
}

function newestSnapshot(history: readonly SimWorld[]): SimWorld | undefined {
  let chosen: SimWorld | undefined;
  for (const snap of history) {
    if (chosen === undefined || snap.nowMs >= chosen.nowMs) {
      chosen = snap;
    }
  }
  return chosen;
}

function oldestSnapshot(history: readonly SimWorld[]): SimWorld | undefined {
  let chosen: SimWorld | undefined;
  for (const snap of history) {
    if (chosen === undefined || snap.nowMs < chosen.nowMs) {
      chosen = snap;
    }
  }
  return chosen;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function roundOd(value: number): number {
  return Math.round(value * OD_SCALE) / OD_SCALE;
}
