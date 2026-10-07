import {
  createCharacter,
  type Appearance,
  type Controller,
  type RaceId,
} from '../../../../packages/domain/src/character';
import { derive, type StatBlock } from '../../../../packages/domain/src/stats';

export type { Appearance, Controller, RaceId, StatBlock };

/**
 * Screen view-models for the prototype. React screens only render these values.
 * Equipment is an inventory tab, not a world hotkey (overview point 21).
 */

export const SCREEN_IDS = [
  'menu',
  'creation',
  'hud',
  'inventory',
  'craft',
  'quests',
  'map',
  'chat',
  'trade',
  'hack',
  'notifications',
  'settings',
  'programs',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

export interface MenuAction {
  id: 'play' | 'profile' | 'settings' | 'exit';
  labelKey: string;
}

export interface MenuModel {
  brandKey: 'ui.brand';
  actions: readonly MenuAction[];
}

export function menuModel(): MenuModel {
  return {
    brandKey: 'ui.brand',
    actions: [
      { id: 'play', labelKey: 'ui.menu.play' },
      { id: 'profile', labelKey: 'ui.menu.profile' },
      { id: 'settings', labelKey: 'ui.menu.settings' },
      { id: 'exit', labelKey: 'ui.menu.exit' },
    ],
  };
}

export interface RaceRow {
  id: string;
  side: 'light' | 'dark';
}

/**
 * Player creation offers the light race from `features.playableRaces` (human).
 * Bot creation offers the dark one (demon). The catalog still contains all 8 races.
 */
export function creationRaceIds(input: {
  races: readonly RaceRow[];
  playableRaces: readonly string[];
  controller: Controller;
}): string[] {
  const side = input.controller === 'player' ? 'light' : 'dark';
  const playable = new Set(input.playableRaces);
  return input.races
    .filter((race) => playable.has(race.id) && race.side === side)
    .map((race) => race.id);
}

export interface CreationPreviewInput {
  raceId: RaceId;
  controller: Controller;
  clean: boolean;
  name: string;
  appearance: Appearance;
  points: StatBlock;
}

export interface CreationDerived {
  hp: number;
  odLimit: number;
  nnLimit: number;
}

export type CreationPreview =
  | { ok: true; stats: StatBlock; derived: CreationDerived }
  | { ok: false; error: string };

/**
 * Player drafts are human only. Valid drafts preview stats through domain
 * `createCharacter`; a refusal returns the error code as text.
 */
export function creationPreview(input: CreationPreviewInput): CreationPreview {
  if (input.controller === 'player' && input.raceId !== 'human') {
    return { ok: false, error: 'race_not_playable' };
  }
  const drafted = createCharacter(input);
  if (!drafted.ok) {
    return { ok: false, error: drafted.code };
  }
  const derived = derive({
    stats: drafted.value.stats,
    level: drafted.value.level,
    totalWeightKg: 0,
  });
  return {
    ok: true,
    stats: drafted.value.stats,
    derived: {
      hp: derived.hp,
      odLimit: derived.odLimit,
      nnLimit: derived.nnLimit,
    },
  };
}

export interface HudActor {
  id: string;
  hp: number;
  maxHp: number;
  statuses: readonly string[];
}

export interface HudEnemy extends HudActor {
  distance: number;
}

export interface HudInput {
  hp: number;
  maxHp: number;
  od: number;
  odLimit: number;
  nn: number;
  nnLimit: number;
  gold: number;
  level: number;
  hint: string | null;
  inCombat: boolean;
  statuses: readonly string[];
  allies: readonly HudActor[];
  enemies: readonly HudEnemy[];
}

export interface HudAction {
  id: 'inventory' | 'quests' | 'map' | 'chat' | 'menu';
  key: string;
}

export interface HudModel {
  hp: number;
  maxHp: number;
  od: number;
  odLimit: number;
  nn: number;
  nnLimit: number;
  gold: number;
  level: number;
  hint: string | null;
  crosshair: true;
  actions: readonly HudAction[];
  combat: {
    statuses: readonly string[];
    allies: readonly HudActor[];
    enemies: readonly HudEnemy[];
    retreat: false;
    limbs: readonly ['head', 'torso', 'hands', 'legs'];
    aimExtraOd: 1;
  } | null;
}

const HUD_ACTIONS: readonly HudAction[] = [
  { id: 'inventory', key: 'KeyI' },
  { id: 'quests', key: 'KeyQ' },
  { id: 'map', key: 'KeyM' },
  { id: 'chat', key: 'Enter' },
  { id: 'menu', key: 'Escape' },
];

export function hudModel(input: HudInput): HudModel {
  return {
    hp: input.hp,
    maxHp: input.maxHp,
    od: input.od,
    odLimit: input.odLimit,
    nn: input.nn,
    nnLimit: input.nnLimit,
    gold: input.gold,
    level: input.level,
    hint: input.hint,
    crosshair: true,
    actions: HUD_ACTIONS,
    combat: input.inCombat
      ? {
          statuses: [...input.statuses],
          allies: input.allies.map((actor) => ({ ...actor, statuses: [...actor.statuses] })),
          enemies: input.enemies.map((actor) => ({ ...actor, statuses: [...actor.statuses] })),
          retreat: false,
          limbs: ['head', 'torso', 'hands', 'legs'],
          aimExtraOd: 1,
        }
      : null,
  };
}

export const EQUIPMENT_SLOTS = [
  'head',
  'torso',
  'hands',
  'legs',
  'main_hand',
  'off_hand',
  'core',
  'implant_head',
  'implant_torso',
  'implant_hands',
  'implant_legs',
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

const ALWAYS_VISIBLE = new Set<EquipmentSlot>(['head', 'torso', 'main_hand', 'core']);
/** Hidden while `prototypeSlots` is set. Torso and hand implants stay visible. */
const PROTOTYPE_HIDDEN = new Set<EquipmentSlot>([
  'hands',
  'legs',
  'off_hand',
  'implant_head',
  'implant_legs',
]);

export interface InventoryItem {
  id: string;
  itemId: string;
  qty: number;
  slot: string | null;
}

export interface EquipmentSlotModel {
  id: EquipmentSlot;
  advanced: boolean;
  visible: boolean;
  item: InventoryItem | null;
}

export interface InventoryModel {
  tabs: readonly ['bag', 'equipment'];
  equipmentHotkey: null;
  bag: InventoryItem[];
  slots: EquipmentSlotModel[];
}

function copyItem(item: InventoryItem): InventoryItem {
  return { id: item.id, itemId: item.itemId, qty: item.qty, slot: item.slot };
}

export function inventoryModel(
  items: readonly InventoryItem[],
  prototypeSlots: boolean,
): InventoryModel {
  const equipped = new Map<string, InventoryItem>();
  const bag: InventoryItem[] = [];
  const known = new Set<string>(EQUIPMENT_SLOTS);
  for (const item of items) {
    if (item.slot !== null && known.has(item.slot) && !equipped.has(item.slot)) {
      equipped.set(item.slot, copyItem(item));
    } else {
      bag.push(copyItem(item));
    }
  }
  return {
    tabs: ['bag', 'equipment'],
    equipmentHotkey: null,
    bag,
    slots: EQUIPMENT_SLOTS.map((id) => ({
      id,
      advanced: !ALWAYS_VISIBLE.has(id),
      visible: prototypeSlots ? !PROTOTYPE_HIDDEN.has(id) : true,
      item: equipped.get(id) ?? null,
    })),
  };
}

/** Eight prototype recipe ids from task 029. Full catalog recipes stay behind the flag. */
export const PROTOTYPE_CRAFT_IDS = [
  'rusty_sword',
  'bow',
  'leather_hood',
  'leather_jacket',
  'spore_relic',
  'plate_relic',
  'healing_draught',
  'antidote',
] as const;

export function craftModel<T extends { id: string }>(
  recipes: readonly T[],
  prototypeOnly: boolean,
): T[] {
  if (!prototypeOnly) {
    return [...recipes];
  }
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const selected: T[] = [];
  for (const id of PROTOTYPE_CRAFT_IDS) {
    const recipe = byId.get(id);
    if (recipe) {
      selected.push(recipe);
    }
  }
  return selected;
}

export interface QuestObjectiveView {
  id: string;
  current: number;
  target: number;
  complete: boolean;
}

export interface QuestInput {
  id: string;
  story?: boolean;
  difficulty?: string;
  objectives: readonly { id: string; target: number; current?: number }[];
}

export interface QuestModel {
  activeLimit: 20;
  quests: {
    id: string;
    story: boolean;
    countsTowardLimit: boolean;
    difficulty: string | null;
    objectives: QuestObjectiveView[];
  }[];
}

export function questModel(quests: readonly QuestInput[]): QuestModel {
  return {
    activeLimit: 20,
    quests: quests.map((quest) => {
      const story = quest.story === true;
      return {
        id: quest.id,
        story,
        countsTowardLimit: !story,
        difficulty: quest.difficulty ?? null,
        objectives: quest.objectives.map((objective) => {
          const current = objective.current ?? 0;
          return {
            id: objective.id,
            current,
            target: objective.target,
            complete: current >= objective.target,
          };
        }),
      };
    }),
  };
}

export interface MapNodeInput {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  /** Undirected neighbor ids. A visited node reveals an unknown edge, not the far node. */
  links?: readonly string[];
}

export interface MapNodeView {
  id: string;
  kind: string;
  x: number | null;
  y: number | null;
}

export interface MapEdgeView {
  a: string;
  b: string;
  unknown: boolean;
}

export interface MapModel {
  visible: MapNodeView[];
  edges: MapEdgeView[];
}

export function mapModel(nodes: readonly MapNodeInput[], visited: readonly string[]): MapModel {
  const visitedSet = new Set(visited);
  const visible = nodes
    .filter((node) => visitedSet.has(node.id))
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      x: node.x ?? null,
      y: node.y ?? null,
    }));

  const edges = new Map<string, MapEdgeView>();
  for (const node of nodes) {
    for (const link of node.links ?? []) {
      if (link === node.id) {
        continue;
      }
      const a = node.id < link ? node.id : link;
      const b = node.id < link ? link : node.id;
      const key = `${a}|${b}`;
      if (edges.has(key)) {
        continue;
      }
      const aVisited = visitedSet.has(a);
      const bVisited = visitedSet.has(b);
      if (!aVisited && !bVisited) {
        continue;
      }
      edges.set(key, { a, b, unknown: !(aVisited && bVisited) });
    }
  }

  return {
    visible,
    edges: [...edges.values()].sort((left, right) =>
      left.a === right.a ? left.b.localeCompare(right.b) : left.a.localeCompare(right.a),
    ),
  };
}

export const CHAT_CHANNELS = ['local', 'party', 'guild', 'trade', 'system', 'mail'] as const;
export type ChatChannelId = (typeof CHAT_CHANNELS)[number];

export interface ChatChannelModel {
  id: ChatChannelId;
  stub: boolean;
  input: boolean;
  upy: boolean;
  partyLimit: number | null;
}

const CHAT_STUB = new Set<ChatChannelId>(['mail', 'guild']);
const CHAT_NO_INPUT = new Set<ChatChannelId>(['mail', 'guild', 'system']);
const CHAT_UPY = new Set<ChatChannelId>(['local', 'trade', 'mail']);

function oneChannel(id: ChatChannelId): ChatChannelModel {
  return {
    id,
    stub: CHAT_STUB.has(id),
    input: !CHAT_NO_INPUT.has(id),
    upy: CHAT_UPY.has(id),
    partyLimit: id === 'party' ? 4 : null,
  };
}

const KNOWN_CHANNELS = new Set<string>(CHAT_CHANNELS);

/** Six channels. Mail and guild are prototype stubs and have no composer. System accepts no player text. */
export function chatModel(channels: readonly string[] = CHAT_CHANNELS): ChatChannelModel[] {
  const seen = new Set<string>();
  const models: ChatChannelModel[] = [];
  for (const id of channels) {
    if (!KNOWN_CHANNELS.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push(oneChannel(id as ChatChannelId));
  }
  return models;
}

export interface TradeStack {
  id: string;
  itemId: string;
  qty: number;
}

export interface TradeSide {
  items: readonly TradeStack[];
  gold: number;
}

export interface TradeModel {
  mode: 'direct';
  auction: 'stub';
  self: { items: TradeStack[]; gold: number };
  partner: { items: TradeStack[]; gold: number };
  actions: readonly ['exchange', 'cancel'];
}

export function tradeModel(self: TradeSide, partner: TradeSide): TradeModel {
  const copySide = (side: TradeSide): { items: TradeStack[]; gold: number } => ({
    gold: side.gold,
    items: side.items.map((item) => ({ id: item.id, itemId: item.itemId, qty: item.qty })),
  });
  return {
    mode: 'direct',
    auction: 'stub',
    self: copySide(self),
    partner: copySide(partner),
    actions: ['exchange', 'cancel'],
  };
}

export const HACK_ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const HACK_SIZE = 4;

const HACK_BASE = { patrol: 10, guard: 20, destroyer: 30, unique: 40 } as const;
export type KeeperKind = keyof typeof HACK_BASE;

export interface HackInput {
  kind: KeeperKind;
  technique: number;
  attemptsLeft: number;
  bulls: number | null;
  hasDeck: boolean;
}

export interface HackModel {
  rows: 4;
  cols: 4;
  alphabet: readonly string[];
  attemptsLeft: number;
  maxAttempts: 3;
  difficulty: number;
  bulls: number | null;
  blocked: boolean;
  kind: KeeperKind;
}

/** Display difficulty from artifact 19. The password session itself stays in the domain. */
export function hackModel(input: HackInput): HackModel {
  return {
    rows: HACK_SIZE,
    cols: HACK_SIZE,
    alphabet: HACK_ALPHABET,
    attemptsLeft: input.attemptsLeft,
    maxAttempts: 3,
    difficulty: Math.max(1, HACK_BASE[input.kind] - Math.floor(input.technique / 2)),
    bulls: input.bulls,
    blocked: !input.hasDeck,
    kind: input.kind,
  };
}

export const NOTIFICATION_KINDS = [
  'system',
  'quest',
  'combat',
  'economy',
  'social',
  'world',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_TTL_MS: Record<NotificationKind, number> = {
  system: 5_000,
  quest: 5_000,
  combat: 2_000,
  economy: 5_000,
  social: 5_000,
  world: 10_000,
};

export interface Notification {
  id: string;
  kind: NotificationKind;
  text: string;
  createdAt: number;
  expiresAt: number;
}

export function notificationPush(
  list: readonly Notification[],
  input: { id: string; kind: NotificationKind; text: string; now: number },
): Notification[] {
  const ttl = NOTIFICATION_TTL_MS[input.kind];
  return [
    ...list,
    {
      id: input.id,
      kind: input.kind,
      text: input.text,
      createdAt: input.now,
      expiresAt: input.now + ttl,
    },
  ];
}

/** Drops a notice when `now` is at or past `expiresAt`. */
export function expire(list: readonly Notification[], now: number): Notification[] {
  return list.filter((notice) => notice.expiresAt > now);
}

export const COLORBLIND_MODES = ['none', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
export type ColorblindMode = (typeof COLORBLIND_MODES)[number];

export interface Palette {
  enemy: string;
  ally: string;
  neutral: string;
  keeper: string;
}

const PALETTES: Record<ColorblindMode, Palette> = {
  none: {
    enemy: '#c0392b',
    ally: '#27ae60',
    neutral: '#7f8c8d',
    keeper: '#f1c40f',
  },
  protanopia: {
    enemy: '#0072b2',
    ally: '#e69f00',
    neutral: '#999999',
    keeper: '#cc79a7',
  },
  deuteranopia: {
    enemy: '#d55e00',
    ally: '#0072b2',
    neutral: '#999999',
    keeper: '#f0e442',
  },
  tritanopia: {
    enemy: '#e6194b',
    ally: '#3cb44b',
    neutral: '#7f8c8d',
    keeper: '#f032e6',
  },
};

export function palette(mode: ColorblindMode): Palette {
  return PALETTES[mode];
}

export const UI_SCALES = [1, 1.25, 1.5] as const;
export type UiScale = (typeof UI_SCALES)[number];

export type UiScaleResult = { ok: true; scale: UiScale } | { ok: false; error: 'scale' };

export function uiScale(value: number): UiScaleResult {
  if (value === 1 || value === 1.25 || value === 1.5) {
    return { ok: true, scale: value };
  }
  return { ok: false, error: 'scale' };
}

export const UI_LOCALES = ['ru', 'en'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Supported bounds only. Nothing here reads a monitor. */
export const RESOLUTION_BOUNDS = {
  min: { width: 1280, height: 720 },
  max: { width: 3840, height: 2160 },
} as const;

export type SettingsModel =
  | {
      ok: true;
      scale: UiScale;
      colorblind: ColorblindMode;
      palette: Palette;
      locale: UiLocale;
      resolutions: typeof RESOLUTION_BOUNDS;
    }
  | { ok: false; error: 'scale' | 'colorblind' | 'locale' };

const COLORBLIND_SET = new Set<string>(COLORBLIND_MODES);
const LOCALE_SET = new Set<string>(UI_LOCALES);

export function settingsModel(input: {
  scale: number;
  colorblind: string;
  locale: string;
}): SettingsModel {
  const scale = uiScale(input.scale);
  if (!scale.ok) {
    return scale;
  }
  if (!COLORBLIND_SET.has(input.colorblind)) {
    return { ok: false, error: 'colorblind' };
  }
  if (!LOCALE_SET.has(input.locale)) {
    return { ok: false, error: 'locale' };
  }
  const colorblind = input.colorblind as ColorblindMode;
  const locale = input.locale as UiLocale;
  return {
    ok: true,
    scale: scale.scale,
    colorblind,
    palette: palette(colorblind),
    locale,
    resolutions: RESOLUTION_BOUNDS,
  };
}

export interface ProgramInput {
  id: string;
  kind: 'echo' | 'path';
  prototype: boolean;
  nn: number;
}

export interface ProgramModel {
  echoes: ProgramInput[];
  paths: ProgramInput[];
}

/** Prototype keeps the two echoes and two paths flagged in the catalog. Full tables stay larger. */
export function programModel(
  programs: readonly ProgramInput[],
  prototypeOnly: boolean,
): ProgramModel {
  const selected = prototypeOnly ? programs.filter((program) => program.prototype) : [...programs];
  return {
    echoes: selected.filter((program) => program.kind === 'echo'),
    paths: selected.filter((program) => program.kind === 'path'),
  };
}
