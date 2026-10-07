# Граф мира и зоны PvP

- id: `021`
- title: Граф мира и зоны PvP
- status: `pending`
- depends_on: `002`

## Цель

Описать узлы, рёбра и правила перехода: пешком, портал, барьер, сейф-зона.

## Контекст

GDD v1 раздел карты и артефакты 5, 13, 20.2. Типы узлов: `city`, `hub`, `dungeon`, `resource`, `primordial`, `barrier`.

PvP закрыт в городе и в узлах, помеченных `safe: true` (города). Хаб — не сейф, бои возможны. Рёбра, данжи, ресурсы, Изначальный город — PvP открыт. Война города открывает PvP флагом.

Барьер непроходим, пока флаг мира `barrierDown` ложен. Переход через ребро, чей узел `barrier`, отказывает.

Портал: только между посещёнными городами, формула цены в экономике. Здесь проверка `visited` и типа узла `city`.

Пеший переход возможен по ребру графа в любую сторону (рёбра ненаправленные). Длина ребра в клетках хранится, но не тратит ОД вне боя.

Стартовый набор id для прототипа (контент продублирует в JSON, домен хранит константы id, чтобы сервер и тесты не разошлись):

Свет: `fort_humans` город, `cross_light` хаб, `plains_mine` ресурс металл, `plains_grove` ресурс дерево, `light_dungeon` данж, `edge_light` ребро-узел миниданжа.

Тьма: `obsidian_tower`, `cross_dark`, `lava_mine` камень, `lava_fungus` споры, `dark_dungeon`.

Центр: `barrier_gate`, `primordial_city` (недостижим в прототипе, `unlocked: false`).

Рёбра прототипа: fort—edge—cross_light—light_dungeon, fort—plains_mine, fort—plains_grove, cross_light—barrier_gate. Зеркало тьмы до barrier_gate. Барьер соединяет `cross_light` и `cross_dark` только когда открыт; до этого ребро есть, но проход закрыт.

Привязка: первый заход в город записывает bind, если bind пуст. Смена bind в другом посещённом городе без боя.

## Решение противоречий

«Сейф-зон нет» в одном абзаце v1 и «города — сейф» в следующем. Канон v2: города и явно помеченные узлы вокруг — сейф. Хаб не сейф. Прототип не рисует отдельные деревни вокруг города: только сам город `safe: true`.

## Файлы

- `packages/domain/src/world.ts`
- `packages/domain/src/world.test.ts`

## Интерфейсы

```ts
export type NodeKind = 'city' | 'hub' | 'dungeon' | 'resource' | 'primordial' | 'barrier';
export interface WorldNode { id: string; kind: NodeKind; safe: boolean; side: 'light' | 'dark' | 'center'; regionId: string }
export interface WorldEdge { id: string; a: string; b: string; length: number }

export function prototypeWorld(): { nodes: WorldNode[]; edges: WorldEdge[] };
export function neighbors(edges: WorldEdge[], nodeId: string): string[];
export function pvpAllowed(node: WorldNode, warOpen: boolean): boolean;
export function canWalk(input: {
  edges: WorldEdge[];
  from: string;
  to: string;
  barrierDown: boolean;
  nodes: WorldNode[];
}): Result<'ok', 'no_edge' | 'barrier'>;
export function canBind(node: WorldNode, inCombat: boolean): Result<'ok', 'not_city' | 'combat'>;
```

## Алгоритм

- `canWalk` ищет ребро с концами from и to. Если любой конец имеет kind barrier или id `barrier_gate` используется как транзит: ребро, инцидентное `barrier_gate`, требует `barrierDown`. Прямого ребра cross_light—cross_dark в данных нет: путь идёт через узел барьера двумя рёбрами. `canWalk` проверяет один шаг.
- `pvpAllowed`: warOpen → true. Иначе `!node.safe`.
- Города прототипа safe true. Хабы, данжи, ресурсы safe false. barrier safe false. primordial safe false.

## Тесты

- из форта есть путь до light_dungeon через соседей.
- шаг на barrier_gate при закрытом барьере → `barrier`. После флага → ok.
- город не PvP, хаб PvP, город во время войны PvP.
- привязка в хабе → `not_city`. В городе в бою → `combat`.
- граф ненаправленный: соседство симметрично.

## Definition of done

Id узлов совпадают со списком в задаче и не переводятся.

## Зона правок

`packages/domain/src/world.ts` и тест.
