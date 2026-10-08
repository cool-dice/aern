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
  respawnAtBind,
  revive,
  takeFromCorpse,
  type LootStack as CorpseStack,
} from '@rift/domain/death';
import { cellsFor, chebyshev, move, step, type Cell, type Dir } from '@rift/domain/movement';
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
}

export interface SimCorpse {
  victimId: string;
  createdAtMs?: number;
  stacks?: { itemId: string; qty: number; questItem?: boolean; questOwnerId?: string }[];
  looted?: boolean;
  bindNodeId?: string;
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
  const rejections: SimRejection[] = [];
  const mods = new Map<string, StatusMods>();
  const weather = combatWeather(world.weatherId, world.safeZone === true);

  for (const entity of entities) {
    if (entity.phase === 'offline' || entity.frozen === true) {
      continue;
    }
    regenOd(entity);
    const seconds = tick % TICKS_PER_SECOND === 0 ? 1 : 0;
    const status = tickStatuses(entity.statuses, nowMs, seconds);
    entity.statuses = status.active;
    entity.stunned = status.stunned;
    if (seconds === 1) {
      entity.hp -= status.hpLoss;
      entity.hp -= weather.hpPerSecond;
    }
    mods.set(entity.id, {
      accuracyPenalty: status.accuracyPenalty,
      speedMultiplier: status.speedMultiplier,
      damageMultiplier: status.damageMultiplier,
    });
  }

  const obstacles = world.obstacles.map((cell) => ({ x: cell.x, y: cell.y }));
  const ordered = orderCommands(entities, commands, rng);
  for (const command of ordered) {
    if (command.type === 'move') {
      applyMove(entities, command, rejections, mods, obstacles, weather);
    } else if (command.type === 'attack') {
      applyAttack(entities, command, rejections, mods, nowMs, weather);
    }
  }

  for (const entity of entities) {
    applyLogout(entity);
  }

  const settled = settleMonsters(entities, world.corpses, rng, nowMs, world.lootTables, weather);
  settlePlayers(settled.entities, settled.corpses, nowMs);
  for (const command of ordered) {
    if (command.type === 'revive') {
      applyRevive(settled.entities, settled.corpses, command, rejections, nowMs);
    } else if (command.type === 'respawn') {
      applyRespawn(settled.entities, command, rejections);
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

function settleMonsters(
  entities: SimEntity[],
  corpses: readonly SimCorpse[],
  rng: Rng,
  nowMs: number,
  lootTables: SimWorld['lootTables'],
  weather: WeatherMods,
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
      });
      continue;
    }
    alive.push(entity);
  }
  return { entities: alive, corpses: nextCorpses };
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
): void {
  const entity = findEntity(entities, command.entityId);
  if (entity === undefined || entity.phase !== 'downed') {
    rejections.push({ entityId: command.entityId, code: 'missing' });
    return;
  }
  const spawned = respawnAtBind(
    {
      phase: 'downed',
      hp: entity.hp,
      bindNodeId: entity.bindNodeId ?? 'fort_humans',
      inventory: entity.inventory ?? [],
    },
    entity.maxHp,
    Math.max(1, entity.od),
  );
  entity.phase = 'online';
  entity.hp = spawned.life.hp;
  entity.inventory = [];
  entity.inCombat = false;
  entity.cell = entity.bindCell ?? { x: 0, y: 0 };
  entity.od = spawned.od;
  entity.odFrac = spawned.od;
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
  const hero = entities.find(
    (entity) => entity.monsterId === undefined && entity.progress !== undefined && entity.quests !== undefined,
  );
  if (hero === undefined || hero.progress === undefined || hero.quests === undefined) {
    return;
  }
  const next = onKill(
    { progress: hero.progress, quests: hero.quests },
    victim.level ?? 1,
    victim.monsterKind ?? 'normal',
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

  const speed =
    (mods.get(entity.id)?.speedMultiplier ?? 1) *
    (entity.overloaded === true ? neuroshockScale(1, true) : 1) *
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

function applyAttack(
  entities: SimEntity[],
  command: AttackCommand,
  rejections: SimRejection[],
  mods: ReadonlyMap<string, StatusMods>,
  nowMs: number,
  weather: WeatherMods,
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

  const weatherPenalty =
    (command.melee ? 0 : -weather.rangedAccuracy) + (weather.accuracy < 0 ? -weather.accuracy : 0);
  const result = resolveAttack({
    attacker: toCombatant(
      attackerDraft,
      (mods.get(attacker.id)?.accuracyPenalty ?? 0) + weatherPenalty,
    ),
    target: toCombatant(targetDraft, mods.get(target.id)?.accuracyPenalty ?? 0),
    weaponDamage:
      neuroshockScale(command.weaponDamage, attacker.overloaded === true) *
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
    pvpOpen: command.pvpOpen,
    safeZone: command.safeZone,
    issuedAtMs: command.issuedAtMs,
  });
  if (!result.ok) {
    rejections.push({ entityId: attacker.id, code: result.code });
    return;
  }

  commitCombatant(attackerDraft, result.value.attacker);
  commitCombatant(targetDraft, result.value.target);
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
