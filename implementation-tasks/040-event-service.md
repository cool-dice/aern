# Сервис событий мира

- id: `040`
- title: Сервис событий мира
- status: `pending`
- depends_on: `030`, `025`

## Цель

По часам сервиса публиковать сезон, активную погоду региона и фазу вторжения.

## Контекст

Домен `seasonAt` и погода. Сервис хранит расписание погоды как список `{regionId, weatherId, startMs}` и не случайничает сам: rng передаётся в `planWeather(regionId, nowMs, rng)`, которая с шансом `0.1 * seasonWeatherBonus` ставит погоду через 5 минут анонса. Для детерминизма тест передаёт rng.

Сейф-зона не получает урон погоды: метод `effectsFor(characterNode, now)` смотрит `node.safe`.

Вторжение стартует методом `startInvasion(regionId, now)` и дальше фаза от elapsed.

## Решение противоречий

Сезоны влияют на спавн через множитель, который сервис отдаёт наружу числом. Спавнер монстров в этой задаче не пишется: только `spawnMultiplier` в снимке региона.

## Файлы

`apps/server/src/modules/event/**` и тест.

## Интерфейсы

```ts
export interface EventService {
  snapshot(nowMs: number, regionId: string, inSafe: boolean): {
    season: SeasonId;
    resourceBonus: string;
    spawnTagMultiplier: number;
    weather: Record<string, number | boolean> | null;
    invasion: string | null;
  };
  planWeather(regionId: string, nowMs: number, rng: Rng): void;
  startInvasion(regionId: string, nowMs: number): void;
}
```

## Алгоритм

- До анонса + 5 минут погода в snapshot null, но поле `announced: true` добавить в результат, если план есть и now в окне анонса.
- В сейфе acid не даёт hpPerSecond.
- invasion phase на 10-й минуте `wave1`.

## Тесты

- EPOCH → awakening и wood.
- planWeather с rng, у которого nextUnit всегда 0, создаёт анонс. nextUnit всегда 0.99 не создаёт.
- startInvasion и snapshot через 10 минут → wave1.
- safe гасит урон.

## Definition of done

Нет таймера `setInterval`. Время аргументом.

## Зона правок

`apps/server/src/modules/event/**`.
