# Реликты: установка, деградация, питание, риски

- id: `008`
- title: Реликты: установка, деградация, питание, риски
- status: `pending`
- depends_on: `002`, `007`

## Цель

Посчитать установку реликта, потерю прочности, голод и случайные риски за онлайн-час.

## Контекст

Артефакты 4 и 7.

| Подвид | id | Тип | Установка | Деградация в час | Гнёзда по грейду предмета |
|---|---|---|---|---|---|
| Споровик | `spore` | bio | 0 мин, 0 золота | 5% | см. грейд |
| Культура | `culture` | bio | 30 мин, 100 золота | 2% | |
| Симбионт | `symbiont` | bio | 60 мин, 250 золота | 1% | |
| Пластина | `plate` | mech | 0 мин, 0 золота | 1% | |
| Механизм | `mechanism` | mech | 30 мин, 100 золота | 2% | |
| Кристалл | `crystal` | mech | 60 мин, 250 золота | 1% | |

Гнёзда (артефакт 6, не артефакт 4): `common` 1, `rare` 2, `epic` 3, `unique` 3.

Питание: био — 1 аминокислота каждый онлайн-час, мех — 1 энергоячейка каждые 2 онлайн-часа. Без питания деградация ×2.

Риски в час, независимо, каждый проверяется отдельным `nextUnit`:

| Тип | id | Шанс | Эффект |
|---|---|---|---|
| Био | `mold` | 0.05 | −1 к случайному стату на 1 час |
| Био | `mutation` | 0.01 | маркер случайного эффекта на 60 сек (сам эффект выбирает бой) |
| Био | `reject` | 0.02 | реликт молчит 1 час |
| Мех | `corrosion` | 0.03 | ещё −5 прочности |
| Мех | `jam` | 0.02 | нет бонусов 10 минут |

Установка только в городе или хабе и не в бою. В бою функция получает `inCombat: true` и отказывает.

При 0% реликт не даёт бонусов и может быть снят. Снятие в городе удаляет отголоски из гнёзд (список id возвращается как потерянные). Чистый персонаж не ставит реликт.

Бонусы подвида до грейда (база, дальше умножается значением стата предмета из задачи 007 — нет: артефакт 4 говорит, что конкретные значения зависят от грейда и уровня). Решение: базовый бонус подвида — это плоский минимум, плюс `itemStatValue` не прибавляется второй раз. Плоские бонусы:

- spore: +2 случайный стат, −1 другой стат (случай выбирается при создании экземпляра и сохраняется, не каждый час).
- culture: +1 к сохранённому стату, плюс +1 за каждые 10 онлайн-часов ношения, максимум +5.
- symbiont: +1 к сохранённому стату, плюс +1 за каждые 5 уровней персонажа, максимум +5.
- plate: +1 броня.
- mechanism: +1 technique или perception, выбор зафиксирован на экземпляре.
- crystal: +1 will или accuracy, выбор зафиксирован.

Эти плоские бонусы не заменяют статы грейда на экземпляре предмета. Они дополнительные. Грейдовые статы предмета считает общий инвентарь через `items.ts`.

## Решение противоречий

Золото установки не задано GDD. Зафиксировано в таблице выше (обзор, пункт 24). Гнёзда — артефакт 6 (обзор, пункт 10). «Игровой час» очищения и деградации — онлайн-час носителя.

## Файлы

- `packages/domain/src/relics.ts`
- `packages/domain/src/relics.test.ts`

## Интерфейсы

```ts
export type RelicSubtype = 'spore' | 'culture' | 'symbiont' | 'plate' | 'mechanism' | 'crystal';

export function socketCount(grade: GradeId): number;
export function installDurationMs(subtype: RelicSubtype): number;
export function installGold(subtype: RelicSubtype): number;

export interface RelicState {
  subtype: RelicSubtype;
  grade: GradeId;
  durability: number;
  fed: boolean;
  onlineWornMs: number;
  silencedUntilMs: number;
  bonusStat?: StatId;
  penaltyStat?: StatId;
  echoIds: string[];
}

export type RelicError = 'clean' | 'combat' | 'zone' | 'gold' | 'busy';

export function startInstall(input: {
  clean: boolean;
  inCombat: boolean;
  inCityOrHub: boolean;
  gold: number;
  subtype: RelicSubtype;
  nowMs: number;
}): Result<{ gold: number; readyAtMs: number }, RelicError>;

export function advanceRelic(input: {
  relic: RelicState;
  onlineDeltaMs: number;
  amino: number;
  cells: number;
  nowMs: number;
  rng: Rng;
}): { relic: RelicState; amino: number; cells: number; risks: string[] };

export function removeRelic(relic: RelicState, inCityOrHub: boolean, inCombat: boolean):
  Result<{ lostEchoIds: string[] }, 'zone' | 'combat'>;

export function relicBonuses(relic: RelicState, characterLevel: number, nowMs: number): {
  stats: Partial<Record<StatId, number>>;
  armor: number;
  active: boolean;
};
```

## Алгоритм

- `startInstall` списывает золото сразу. `readyAtMs = nowMs + duration`. Ноль длительности → `readyAtMs = nowMs`.
- `advanceRelic` за каждый полный онлайн-час (остаток миллисекунд возвращается в `onlineWornMs` как уже учтённый накопленный остаток: хранить `onlineWornMs` включая остаток, применять целое число новых часов `floor((prev + delta) / 3_600_000) - floor(prev / 3_600_000)`).
- Био ест 1 аминокислоту на каждый такой час, если она есть. Иначе `fed` false на этот час и деградация ×2. Мех ест 1 ячейку на каждый чётный час ношения (часы 2, 4, 6…), если час наступил и ячейка есть.
- Деградация вычитается из durability через `applyWear`.
- Риски кидаются по одному на каждый полный час, только если реликт ещё жив (durability > 0).
- `relicBonuses.active` false, если durability ≤ 0, или `nowMs < silencedUntilMs`, или висит jam (кодировать jam как `silencedUntilMs` на 10 минут — нет, jam и reject оба выключают бонусы; хранить одно поле `silencedUntilMs`, выставляя максимум из текущего и нового срока).
- culture рост: `min(5, floor(onlineWornMs / (10 * 3_600_000)))` добавка к +1.
- symbiont: `min(5, floor(characterLevel / 5))` добавка к +1. Уровень 1 → +1, уровень 5 → +2, уровень 25 → +6 ограничить до +1+5 = +6? «+1 каждые 5 уровней, макс +5» означает добавка не больше 5, база +1 отдельно, потолок суммарного бонуса стата +6. Зафиксировать: суммарный бонус стата = `1 + min(5, floor(level / 5))`.

## Тесты

- гнёзда common/rare/epic/unique → 1/2/3/3.
- установка споровика: золото не меняется, `readyAtMs === now`. Симбионт списывает 250 и +60 минут. Золота 249 → `gold`.
- чистый → `clean`. Бой → `combat`. Не город → `zone`.
- час споровика с едой: прочность 100 → 95, аминокислота −1. Без еды → 90.
- пластина за час → 99. Механизм без ячейки на втором часе → деградация 4 за тот час (2×2).
- коррозия при `nextUnit`, который сначала даёт 0, срабатывает и снимает дополнительные 5. При `nextUnit` 0.5 не срабатывает.
- снятие возвращает echo ids. В бою → `combat`.
- культура после 10 часов: бонус стата +2. После 50 часов: +6 (1+5).
- симбионт уровень 4 → +1, уровень 5 → +2, уровень 50 → +6.

## Definition of done

Риски детерминированы от rng. Питание не уходит в минус.

## Зона правок

`packages/domain/src/relics.ts` и тест.
