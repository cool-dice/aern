# События, сезоны и погода

- id: `025`
- title: События, сезоны и погода
- status: `done`
- depends_on: `002`

## Цель

Определить сезон мира, эффект погоды и фазы вторжения по UTC-миллисекундам.

## Контекст

Артефакт 21 отменяет косметичность сезонов из 20.1. Календарь: эпоха `2026-01-01T00:00:00.000Z`, сутки 86_400_000 мс, месяц 28 суток, год 336 суток, сезон 84 суток.

| Сезон | Месяцы | Спавн | Ресурс +1 | Погода |
|---|---|---|---|---|
| `awakening` | 1–3 | стаи ×1.2 | wood | дожди и туманы +10% |
| `heat` | 4–6 | огонь и пустыня ×1.2 | crystals | жара +20% |
| `fade` | 7–9 | нежить ×1.2 | spores | туман и ветер +15% |
| `frost` | 10–12 | лёд и броня ×1.2 | metal | снег +15% |

День и ночь (артефакт 7) не меняют эти множители. Функция `dayPhase` уже в задаче 002, здесь не дублировать.

Погода, длительность минут, эффекты числами:

| id | минуты | эффекты |
|---|---|---|
| `fog` | 15 | vision ×0.5, ranged accuracy −2 |
| `sand` | 20 | speed ×0.7, accuracy −2, anomaly damage ×1.2 |
| `acid` | 10 | 1 HP/с вне укрытия, armor ×0.9 |
| `storm` | 15 | energy weapon ×1.2, resist ×0.8 |
| `magnetic` | 30 | portals false |
| `blood_moon` | 20 | monster damage ×1.3, loot ×1.2 |
| `ice_wind` | 15 | speed ×0.8, 1 HP/с, fire vuln ×1.2 |
| `spore_fog` | 25 | mutation chance +0.10, perception −1 |

Анонс за 5 минут до старта. В сейф-зоне эффекты не применяются: функция `applyWeather(effect, inSafe)` возвращает нейтральный эффект внутри сейфа.

Вторжение: подготовка 10 мин, волна 1 — 15, волна 2 — 15, кульминация 15, завершение 5. Убийство 10% монстров волны снижает следующую на 5% силы, суммировать по 10% шагам, максимум −50% (решение). Босс убит в кульминации → отражено. Хаб уничтожен → ресурсные узлы региона закрыты на 1 час.

Праздники: день Разлома — 1-й день 1-го месяца, 1 сутки, опыт лора ×1.1. День Первых — 15-й день 6-го месяца, 2 суток. День Барьера — 1-й день 12-го месяца, 3 суток, урон по Хранителям ×1.1.

Награды вторжения константами из артефакта 21 раздела 5.3, функция `invasionReward(kind)`.

## Решение противоречий

Обзор, пункты 17 и 18. «Первый день месяца» — мировой месяц от эпохи, не гражданский календарь.

## Файлы

- `packages/domain/src/events.ts`
- `packages/domain/src/events.test.ts`

## Интерфейсы

```ts
export type SeasonId = 'awakening' | 'heat' | 'fade' | 'frost';
export function seasonAt(nowMs: number): SeasonId;
export function seasonResource(season: SeasonId): 'wood' | 'crystals' | 'spores' | 'metal';
export function spawnMultiplier(season: SeasonId, tag: string): number;
export function weatherEffect(id: string, inSafe: boolean): Record<string, number | boolean>;
export function invasionPhase(elapsedMs: number): 'prepare' | 'wave1' | 'wave2' | 'climax' | 'end' | 'done';
export function nextWaveMultiplier(killedRatio: number): number;
export function holidayAt(nowMs: number): 'rift_day' | 'first_day' | 'barrier_day' | null;
```

`EPOCH_MS = Date.UTC(2026, 0, 1)`.

## Алгоритм

- dayIndex = floor((nowMs - EPOCH) / 86_400_000). Отрицательный now до эпохи — сезон awakening (clamp dayIndex ≥ 0).
- month = floor((dayIndex % 336) / 28) + 1. Месяцы 1–3 awakening и т.д.
- spawnMultiplier: если tag сезона совпал (`pack`, `fire`, `undead`, `ice` — передать tag), вернуть 1.2, иначе 1. Несколько тегов не стакаются выше 1.2.
- invasionPhase границы: 0, 10, 25, 40, 55, 60 минут.
- killedRatio 0.1 → 0.95 силы. 0.19 → 0.95. 0.2 → 0.90. 1 → 0.50.
- holiday: day-of-year = dayIndex % 336. День 0 (первый день) rift 1 сутки. День 15+28*5 = 155 — первый из двух суток Первых (месяц 6 начинается на дне 28*5=140, 15-й день — индекс 140+14=154). Считать день месяца с 1: monthDay = (dayIndex % 28) + 1. Месяц 1 day 1 → rift. Месяц 6 day 15 и 16 → first. Месяц 12 day 1, 2, 3 → barrier.

## Тесты

- now = EPOCH → awakening, месяц логически 1, holiday rift_day.
- EPOCH + 84 суток → heat.
- EPOCH + 28*5 суток + 14 суток → first_day.
- сейф обнуляет acid hp-урон: поле hpPerSecond 0.
- фаза на 10 минутах ровно ещё prepare или уже wave1: граница включается в следующую фазу. На 600_000 мс → wave1. На 599_999 → prepare.
- holiday null в обычный день месяца 1 день 2.

## Definition of done

Эпоха и длина месяца — именованные константы.

## Зона правок

`packages/domain/src/events.ts` и тест.
