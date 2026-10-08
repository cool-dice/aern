# Отголоски, пути, ядра и нейронная нагрузка

- id: `009`
- title: Отголоски, пути, ядра и нейронная нагрузка
- status: `done`
- depends_on: `002`, `004`, `005`, `007`, `008`

## Цель

Проверить, можно ли включить сборку персонажа: реликты с отголосками или пути, одно ядро, лимит НН, нейрошок, забывание путей.

## Контекст

Артефакт 6 и длительности артефакта 7.

Стоимость НН:

| Элемент | НН |
|---|---|
| Осколок / наставление, грейд 1 | 1 |
| Отголосок / путь, грейд 2 | 2 |
| Воспоминание / традиция, грейд 3 | 3 |
| Ядро грейда 1 | 0 |
| Ядро грейда 2 | 1 |
| Ядро грейда 3–4 | 2 |
| Ядро грейда 5 | 3 |

Реликт, оружие, броня, расходники НН не едят.

Лимит НН = воля × 2. Если занято больше лимита: все активные способности и пассивы отголосков и путей выключены, статус `neuroshock`: скорость ×0.5 и урон ×0.5, пока нагрузку не снизят. Нейрошок не резистится.

Совместимость:

| | Реликтовый | Чистый |
|---|---|---|
| Реликты и отголоски | да | нет |
| Пути | нет | да |
| Имплант-ядро | да | нет |
| Внешнее ядро | да | да |
| Кап стата | 20 | 25 |

Отголоски ставятся и снимаются только в городе или хабе, мгновенно. Дубликат шаблона на персонаже запрещён. Слоты отголосков или путей: `floor(level / 3)` (0 на 1 уровне, 1 на 3, 16 на 48–50). Это кап установленных программ, отдельно от гнёзд реликта. Установка отголоска требует свободное гнездо и свободный слот прогрессии.

Изучение пути в городе или хабе, не в бою. Золото (решение, в GDD суммы нет): грейд 1 — 100, грейд 2 — 300, грейд 3 — 800. Время: 30 мин, 60 мин, 120 мин. Наставление-предмет исчезает. Нельзя учить второй экземпляр того же шаблона.

Забывание: 2 онлайн-часа без использования → +1 к счётчику 0..3. Эффект ×1, ×0.75, ×0.5, ×0. НН на 3 всё ещё занята. Использование сбрасывает таймер простоя, но не само забывание. Восстановление одного уровня: 30 онлайн-минут и 50 золота, только в городе.

Ядро «Набор Первого Инженера» id `first_engineer_kit`: только чистый, есть хотя бы один путь грейда 3, уровень персонажа ≥ 20, ядро внешнее грейд 5.

Установка реликта на чистого ломает чистоту немедленно: пути перестают давать эффект, НН путей остаётся занятой до переобучения. Переобучение забывает путь сразу и освобождает НН. Возврат к чистому: снять все реликты и имплант-ядра и прождать 24 онлайн-часа очищения. Пока идёт очищение, пути ещё не работают и кап уже чистый только после завершения. Во время очищения кап остаётся 20, `clean: false`, флаг `purifyingUntilMs`.

Прототипные «2 отголоска» — число шаблонов в контенте, не эта формула слотов.

## Решение противоречий

Обзор, пункты 8 и 11. Время путей — артефакт 7. Золото — решение этой задачи.

## Файлы

- `packages/domain/src/build.ts`
- `packages/domain/src/build.test.ts`

## Интерфейсы

```ts
export type ProgramKind = 'echo' | 'path';
export interface Program {
  templateId: string;
  grade: 1 | 2 | 3;
  kind: ProgramKind;
  forgetting: 0 | 1 | 2 | 3;
  idleMs: number;
}

export interface CoreRef {
  templateId: string;
  grade: 1 | 2 | 3 | 4 | 5;
  implant: boolean;
}

export interface BuildState {
  clean: boolean;
  purifyingUntilMs: number | null;
  level: number;
  will: number;
  programs: Program[];
  cores: CoreRef[]; // 0 или 1
  relicSocketFree: number;
  inCityOrHub: boolean;
  inCombat: boolean;
}

export function progressionSlots(level: number): number;
export function nnCostProgram(grade: 1 | 2 | 3): number;
export function nnCostCore(grade: 1 | 2 | 3 | 4 | 5): number;
export function nnUsed(state: BuildState): number;
export function neuroshock(state: BuildState): boolean;
export function effectMultiplier(program: Program): number;

export type BuildError =
  | 'zone' | 'combat' | 'duplicate' | 'slots' | 'sockets' | 'nn'
  | 'incompatible' | 'gold' | 'core_taken' | 'requirements' | 'busy';

export function installEcho(...): Result<BuildState, BuildError>;
export function learnPath(state: BuildState, program: Program, gold: number, nowMs: number):
  Result<{ state: BuildState; gold: number; readyAtMs: number }, BuildError>;
export function tickForgetting(program: Program, onlineDeltaMs: number, used: boolean): Program;
export function recoverForgetting(state: BuildState, templateId: string, gold: number, nowMs: number):
  Result<{ state: BuildState; gold: number; readyAtMs: number }, BuildError>;
export function equipCore(state: BuildState, core: CoreRef, gold: number): Result<BuildState, BuildError>;
export function breakClean(state: BuildState, nowMs: number): BuildState;
export function beginPurify(state: BuildState, relicsLeft: number, implantCoresLeft: number, nowMs: number):
  Result<BuildState, 'busy' | 'still_impure'>;
```

`installEcho` увеличивает число программ и уменьшает `relicSocketFree` на 1 в возвращённом состоянии. НН может превысить лимит: установка разрешена, `neuroshock` становится true. Ошибка `nn` не используется для запрета установки. Код `nn` оставить в объединении на будущее и не возвращать. Это решение записать в тесте: перегруз ставится, а не отклоняется (артефакт 6 описывает последствие превышения, не запрет надеть).

## Алгоритм

- Слоты: `Math.floor(level / 3)`.
- Чужой вид программы: чистый не ставит echo, грязный не учит path → `incompatible`.
- Имплант-ядро грязному можно, чистому нельзя. Внешнее можно всем.
- Второе ядро → `core_taken`. Сначала снять (функция `unequipCore` возвращает состояние с пустым массивом, только в городе и не в бою).
- `first_engineer_kit` проверяет требования, иначе `requirements`.
- `tickForgetting`: если `used`, `idleMs = 0`. Иначе прибавить delta. Каждые 7_200_000 мс простоя, пока forgetting < 3, forgetting += 1 и idle вычитает 7_200_000. На 3 дальше не растёт.
- `breakClean` ставит `clean: false`, пути не удаляет.
- `beginPurify` при relicsLeft или implantCoresLeft > 0 → `still_impure`. Иначе `purifyingUntilMs = now + 24h` и `clean: false` до отдельной функции `completePurify(state, nowMs)`, которая при `now >= purifyingUntilMs` ставит `clean: true` и обнуляет forgetting путей в 0.

Добавить `unequipCore` и `completePurify` в файл.

## Тесты

- слоты уровней 1, 3, 6, 48, 50 → 0, 1, 2, 16, 16.
- воля 10, три грейда 3 → nn 9, лимит 20, шока нет. Воля 2, один грейд 3 и ядро 5 → занято 6 при лимите 4, `neuroshock` true.
- множители забывания 1, 0.75, 0.5, 0.
- дубликат templateId → `duplicate`. Слот 0 на уровне 1 → `slots`.
- чистый не ставит echo. Грязный не учит path.
- изучение грейда 3 списывает 800 и ready через 7_200_000 мс. Золота 799 → состояние и золото исходные.
- простой 2 часа → forgetting 1. Ещё 4 часа → 3. Использование обнуляет idle, forgetting не уменьшает.
- набор инженера на грязном или без грейда 3 → `requirements`. На чистом 20 уровня с традицией → успех.
- purify с надетым реликтом → ошибка. Без реликтов ставит срок. `completePurify` раньше срока не чистит, после — чистит.

## Definition of done

Нейрошок не лечится сопротивлением и не описывается как статус из задачи `011`: это флаг сборки. Бой читает флаг.

## Зона правок

`packages/domain/src/build.ts` и тест.
