import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOTYPE_RECIPE_IDS, loadCatalog } from '@rift/content';
import { expect, test } from 'vitest';
import {
  CHAT_CHANNELS,
  COLORBLIND_MODES,
  NOTIFICATION_TTL_MS,
  PROTOTYPE_CRAFT_IDS,
  RESOLUTION_BOUNDS,
  UI_LOCALES,
  chatModel,
  craftModel,
  creationPreview,
  creationRaceIds,
  expire,
  hackModel,
  hudModel,
  inventoryModel,
  mapModel,
  menuModel,
  notificationPush,
  palette,
  programModel,
  questModel,
  settingsModel,
  tradeModel,
  uiScale,
  type Appearance,
  type InventoryItem,
  type StatBlock,
} from './models';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/content/data');
const localeDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/content/locales',
);
const catalog = loadCatalog(dataDir);

const appearance: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

const examplePoints: StatBlock = {
  body: 10,
  reaction: 5,
  accuracy: 5,
  will: 0,
  perception: 0,
  technique: 0,
};

test('menu is play, profile, settings, exit and has no equipment hotkey', () => {
  const menu = menuModel();
  expect(menu.brandKey).toBe('ui.brand');
  expect(menu.actions.map((action) => action.id)).toEqual(['play', 'profile', 'settings', 'exit']);
});

test('player creation offers only human while the catalog keeps eight races', () => {
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
  expect(catalog.features.playableRaces).toEqual(['human', 'demon']);
  expect(
    creationRaceIds({
      races: catalog.races,
      playableRaces: catalog.features.playableRaces,
      controller: 'player',
    }),
  ).toEqual(['human']);
  expect(
    creationRaceIds({
      races: catalog.races,
      playableRaces: catalog.features.playableRaces,
      controller: 'bot',
    }),
  ).toEqual(['demon']);
});

test('human preview with 20 points returns body 16', () => {
  const preview = creationPreview({
    raceId: 'human',
    controller: 'player',
    clean: false,
    name: 'Лиа',
    appearance,
    points: examplePoints,
  });
  expect(preview.ok).toBe(true);
  if (!preview.ok) {
    return;
  }
  expect(preview.stats.body).toBe(16);
  expect(preview.stats).toEqual({
    body: 16,
    reaction: 11,
    accuracy: 11,
    will: 6,
    perception: 6,
    technique: 6,
  });
});

test('invalid creation returns the domain error code as text', () => {
  const preview = creationPreview({
    raceId: 'human',
    controller: 'player',
    clean: false,
    name: 'Лиа',
    appearance,
    points: { ...examplePoints, body: 11 },
  });
  expect(preview).toEqual({ ok: false, error: 'points_total' });
  const locked = creationPreview({
    raceId: 'elf',
    controller: 'player',
    clean: false,
    name: 'Лиа',
    appearance,
    points: examplePoints,
  });
  expect(locked).toEqual({ ok: false, error: 'race_not_playable' });
});

test('hud lists world actions and hides the retreat control in combat', () => {
  const hud = hudModel({
    hp: 80,
    maxHp: 100,
    od: 5,
    odLimit: 10,
    nn: 2,
    nnLimit: 12,
    gold: 100,
    level: 1,
    hint: 'ui.hint.talk',
    inCombat: true,
    statuses: ['burn'],
    allies: [],
    enemies: [{ id: 'rat', hp: 10, maxHp: 10, statuses: [], distance: 1 }],
  });
  expect(hud.actions.map((action) => action.id)).toEqual([
    'inventory',
    'quests',
    'map',
    'chat',
    'menu',
  ]);
  expect(hud.combat?.retreat).toBe(false);
  expect(hud.combat?.limbs).toEqual(['head', 'torso', 'hands', 'legs']);
});

test('prototype inventory hides advanced body slots and keeps torso and hand implants', () => {
  const items: InventoryItem[] = [
    { id: 'armor', itemId: 'leather_jacket', qty: 1, slot: 'torso' },
    { id: 'weapon', itemId: 'rusty_sword', qty: 1, slot: 'main_hand' },
    { id: 'gloves', itemId: 'leather_gloves', qty: 1, slot: 'hands' },
    { id: 'stack', itemId: 'bandage', qty: 3, slot: null },
  ];
  const prototype = inventoryModel(items, true);
  expect(prototype.tabs).toEqual(['bag', 'equipment']);
  expect(prototype.equipmentHotkey).toBeNull();
  expect(prototype.slots.filter((slot) => slot.visible).map((slot) => slot.id)).toEqual([
    'head',
    'torso',
    'main_hand',
    'core',
    'implant_torso',
    'implant_hands',
  ]);
  const hands = prototype.slots.find((slot) => slot.id === 'hands');
  expect(hands).toMatchObject({
    advanced: true,
    visible: false,
    item: { itemId: 'leather_gloves' },
  });
  expect(prototype.slots.find((slot) => slot.id === 'torso')?.advanced).toBe(false);
  expect(prototype.bag.map((item) => item.itemId)).toEqual(['bandage']);
  expect(inventoryModel(items, false).slots.every((slot) => slot.visible)).toBe(true);
});

test('prototype craft keeps the eight recipe ids and drops a unique blade', () => {
  expect(catalog.recipes.some((recipe) => recipe.id === 'rift_blade')).toBe(true);
  const crafted = craftModel(catalog.recipes, true);
  expect(crafted).toHaveLength(8);
  expect(crafted.map((recipe) => recipe.id)).toEqual([...PROTOTYPE_RECIPE_IDS]);
  expect(crafted.map((recipe) => recipe.id)).toEqual([...PROTOTYPE_CRAFT_IDS]);
  expect(crafted.some((recipe) => recipe.id === 'rusty_sword')).toBe(true);
  expect(crafted.some((recipe) => recipe.id === 'rift_blade')).toBe(false);
  expect(craftModel(catalog.recipes, false).some((recipe) => recipe.id === 'rift_blade')).toBe(
    true,
  );
});

test('quest model lists the prototype quests', () => {
  const model = questModel(
    catalog.quests.map((quest) => ({
      id: quest.id,
      story: quest.story,
      difficulty: quest.difficulty,
      objectives: quest.objectives.map((objective) => ({
        id: objective.id,
        target: objective.target,
      })),
    })),
  );
  expect(model.quests.map((quest) => quest.id)).toEqual([
    'tutorial',
    'kill_rats',
    'gather_metal',
    'gather_spores',
    'first_craft',
    'visit_hub',
  ]);
  expect(model.quests.find((quest) => quest.id === 'tutorial')?.countsTowardLimit).toBe(false);
  expect(model.activeLimit).toBe(20);
});

test('fog hides an unvisited dungeon and keeps only an unknown edge to a visited neighbor', () => {
  const links = new Map<string, string[]>();
  for (const edge of catalog.world.edges) {
    const from = links.get(edge.a) ?? [];
    from.push(edge.b);
    links.set(edge.a, from);
    const to = links.get(edge.b) ?? [];
    to.push(edge.a);
    links.set(edge.b, to);
  }
  const nodes = catalog.world.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    links: links.get(node.id) ?? [],
  }));
  const map = mapModel(nodes, ['fort_humans']);
  expect(map.visible.map((node) => node.id)).toEqual(['fort_humans']);
  expect(map.visible.some((node) => node.id === 'light_dungeon')).toBe(false);
  expect(map.edges.some((edge) => edge.a === 'light_dungeon' || edge.b === 'light_dungeon')).toBe(
    false,
  );
  expect(map.edges).toContainEqual({ a: 'edge_light', b: 'fort_humans', unknown: true });
  expect(map.visible.find((node) => node.id === 'edge_light')).toBeUndefined();
});

test('mail and guild chat channels accept a line', () => {
  const channels = chatModel([...CHAT_CHANNELS]);
  expect(channels).toHaveLength(6);
  expect(channels.find((channel) => channel.id === 'mail')).toMatchObject({
    stub: false,
    input: true,
  });
  expect(channels.find((channel) => channel.id === 'guild')).toMatchObject({
    stub: false,
    input: true,
  });
  expect(channels.find((channel) => channel.id === 'local')).toMatchObject({
    stub: false,
    input: true,
  });
  expect(channels.find((channel) => channel.id === 'system')).toMatchObject({
    stub: false,
    input: false,
  });
});

test('direct trade runs beside a live auction', () => {
  const trade = tradeModel(
    { items: [{ id: 'a', itemId: 'bandage', qty: 1 }], gold: 10 },
    { items: [], gold: 0 },
  );
  expect(trade.mode).toBe('direct');
  expect(trade.auction).toBe('live');
  expect(catalog.features.auction).toBe('live');
});

test('hack screen is a 4 by 4 grid and stays blocked without a deck', () => {
  const open = hackModel({
    kind: 'guard',
    technique: 10,
    attemptsLeft: 3,
    bulls: 2,
    hasDeck: true,
  });
  expect(open.rows).toBe(4);
  expect(open.cols).toBe(4);
  expect(open.difficulty).toBe(15);
  expect(open.blocked).toBe(false);
  expect(
    hackModel({ kind: 'patrol', technique: 0, attemptsLeft: 3, bulls: null, hasDeck: false })
      .blocked,
  ).toBe(true);
});

test('combat notices last 2000 ms, world notices 10000, and expire drops the boundary', () => {
  expect(NOTIFICATION_TTL_MS.combat).toBe(2_000);
  expect(NOTIFICATION_TTL_MS.world).toBe(10_000);
  const list = notificationPush(
    notificationPush([], { id: 'c', kind: 'combat', text: 'hit', now: 0 }),
    { id: 'w', kind: 'world', text: 'storm', now: 0 },
  );
  expect(list.find((notice) => notice.id === 'c')?.expiresAt).toBe(2_000);
  expect(list.find((notice) => notice.id === 'w')?.expiresAt).toBe(10_000);
  expect(expire(list, 1_999).map((notice) => notice.id)).toEqual(['c', 'w']);
  expect(expire(list, 2_000).map((notice) => notice.id)).toEqual(['w']);
  expect(expire(list, 10_000)).toEqual([]);
});

test('each colorblind palette has four distinct hex colors', () => {
  expect(palette('none')).toEqual({
    enemy: '#c0392b',
    ally: '#27ae60',
    neutral: '#7f8c8d',
    keeper: '#f1c40f',
  });
  for (const mode of COLORBLIND_MODES) {
    const colors = Object.values(palette(mode));
    expect(new Set(colors).size).toBe(4);
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  }
});

test('ui scale rejects 2 and accepts 1.25', () => {
  expect(uiScale(2)).toEqual({ ok: false, error: 'scale' });
  expect(uiScale(1.25)).toEqual({ ok: true, scale: 1.25 });
  expect(RESOLUTION_BOUNDS.min).toEqual({ width: 1280, height: 720 });
  expect(RESOLUTION_BOUNDS.max).toEqual({ width: 3840, height: 2160 });
  const settings = settingsModel({ scale: 1.25, colorblind: 'none', locale: 'ru' });
  expect(settings.ok).toBe(true);
  if (settings.ok) {
    expect(settings.resolutions).toBe(RESOLUTION_BOUNDS);
  }
});

test('prototype programs are two echoes and two paths', () => {
  const programs = programModel(
    [...catalog.echoes, ...catalog.paths].map((program) => ({
      id: program.id,
      kind: program.kind,
      prototype: program.prototype,
      nn: program.nn,
    })),
    true,
  );
  expect(programs.echoes.map((echo) => echo.id)).toEqual(['shard_strength', 'echo_impulse']);
  expect(programs.paths.map((path) => path.id)).toEqual(['path_stone_breath', 'path_wind_dash']);
  expect(catalog.echoes.length).toBeGreaterThan(programs.echoes.length);
  expect(catalog.paths.length).toBeGreaterThan(programs.paths.length);
});

test('locales ru and en exist and settings reject zh', () => {
  const ru = JSON.parse(readFileSync(join(localeDir, 'ru.json'), 'utf8')) as Record<string, string>;
  const en = JSON.parse(readFileSync(join(localeDir, 'en.json'), 'utf8')) as Record<string, string>;
  expect(UI_LOCALES).toEqual(['ru', 'en']);
  expect(ru['ui.brand']).toBe('Разлом');
  expect(en['ui.brand']).toBe('Rift');
  expect(settingsModel({ scale: 1, colorblind: 'none', locale: 'zh' })).toEqual({
    ok: false,
    error: 'locale',
  });
});
