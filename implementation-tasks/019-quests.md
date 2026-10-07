# Квесты

- id: `019`
- title: Квесты
- status: `pending`
- depends_on: `002`, `006`

## Цель

Принять, продвинуть, завершить или отменить квест и выдать награду по формуле.

## Контекст

Артефакт 15.

Награда: золото и опыт = `50 * coefficient * characterLevel`. Коэффициенты: easy 1, normal 2, hard 5, epic 10. Пример: hard, уровень 20 → 5000 и 5000.

Активных квестов 20. Сюжетные (`story: true`) и контракты не входят в лимит. Ежедневных не больше 5, сброс в 00:00 UTC. Одноразовый повторно не берётся. Проваленный можно взять снова, если не одноразовый.

Язык выдающего NPC: `questLanguageAccess`. `deny` запрещает взять. `garbled` помечает квест, но цели те же.

Цели типов: `kill`, `collect`, `gather`, `craft`, `deliver`, `visit`, `talk`, `hack`, `survive`. Прогресс — счётчик `current/target`. Несколько целей, все должны быть полны для сдачи.

Отмена удаляет квестовые предметы (их список на квесте) и не даёт награду. Провал по сроку (`expiresAtMs`) тот же плюс репутация NPC снаружи.

Ветвление личное: выбор `choiceId` записывается, мир не меняется. Глобальные флаги `barrierDown` и `primordialOpened` ставятся отдельной функцией один раз.

Лимит ежедневных и активных проверяется до выдачи.

## Решение противоречий

Две таблицы прогресса не создавать в домене. Один объект `QuestProgress`.

## Файлы

- `packages/domain/src/quests.ts`
- `packages/domain/src/quests.test.ts`

## Интерфейсы

```ts
export type QuestDifficulty = 'easy' | 'normal' | 'hard' | 'epic';
export interface QuestObjective { id: string; kind: string; target: number; current: number }
export interface QuestProgress {
  questId: string;
  story: boolean;
  daily: boolean;
  repeatable: boolean;
  status: 'active' | 'completed' | 'failed';
  objectives: QuestObjective[];
  expiresAtMs?: number;
  garbled: boolean;
  choiceId?: string;
}

export function questReward(level: number, difficulty: QuestDifficulty): { gold: number; xp: number };
export function acceptQuest(input: {
  active: QuestProgress[];
  completedOnce: string[];
  quest: QuestProgress;
  upy: number;
  nowMs: number;
  dailiesAcceptedToday: number;
}): Result<QuestProgress[], 'limit' | 'daily' | 'once' | 'language' | 'duplicate'>;
export function advance(progress: QuestProgress, objectiveId: string, amount: number): QuestProgress;
export function turnIn(progress: QuestProgress, level: number, difficulty: QuestDifficulty):
  Result<{ progress: QuestProgress; gold: number; xp: number }, 'incomplete' | 'inactive'>;
export function abandon(progress: QuestProgress): { progress: QuestProgress; removeItemIds: string[] };
export function failExpired(progress: QuestProgress, nowMs: number): QuestProgress;
```

`acceptQuest` получает уже собранный шаблон с current 0 и возвращает новый массив.

## Алгоритм

- Сюжетный не увеличивает счётчик лимита 20. Обычные active считаются.
- Повтор того же questId в active → `duplicate`.
- `advance` не превышает target. Неизвестный objective игнорируется (возвращает ту же копию).
- `turnIn` только если все current ≥ target и status active. Статус становится completed.
- `abandon` ставит failed. `removeItemIds` — поле шаблона, добавить `itemIds: string[]` в progress.

## Тесты

- формула easy 1 уровня → 50. hard 20 → 5000.
- 20 обычных активных, 21-й обычный → `limit`. Сюжетный 21-й проходит.
- шестой дейлик → `daily`.
- УПЯ 30 → `language`. УПЯ 40 ставит `garbled` true. УПЯ 61 garbled false.
- одноразовый в `completedOnce` → `once`.
- advance 3 при target 2 остаётся 2. turnIn без полного прогресса → `incomplete`.
- срок `now` больше expires переводит в failed и turnIn затем → `inactive`.

## Definition of done

Награды целые. Функции без часов `Date.now`.

## Зона правок

`packages/domain/src/quests.ts` и тест.
