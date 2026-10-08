# Сервисы персонажа и инвентаря

- id: `032`
- title: Сервисы персонажа и инвентаря
- status: `done`
- depends_on: `030`, `005`, `007`, `013`, `014`

## Цель

Создать персонажа через домен, выдать стартовый набор и надеть предмет. Состояние хранит memory-репозиторий.

## Контекст

Создание вызывает `createCharacter`. Стартовые вещи из каталога: 100 золота (`STARTER_GOLD`), ржавый меч, кожаная куртка, 3 бинта, 20 лёгких патронов. Контроллер игрока вынужден `human`, если features.playableRaces ограничены; бот — `demon`. Сервис читает каталог аргументом, не ФС: тест передаёт минимальный каталог.

Инвентарь: слоты-числа с 0, `equipped` и слот. Надеть вызывает `canEquip`. Перегруз считается суммой веса и `derive`.

Событие `character.created` после успешного создания.

Привязка стартовая: `fort_humans` для light, `obsidian_tower` для dark.

## Решение противоречий

Прототип не запрещает доменные расы, запрет в сервисе по списку `playableRaces`.

## Файлы

- `apps/server/src/modules/character/**`
- `apps/server/src/modules/inventory/**`
- тесты обоих сервисов

## Интерфейсы

```ts
export interface CharacterService {
  create(input: { accountId: string; controller: 'player' | 'bot'; name: string; clean: boolean; points: StatBlock; appearance: Appearance }): Promise<Result<{ characterId: string }, string>>;
  grantXp(characterId: string, amount: number): Promise<void>;
  spend(characterId: string, stat: StatId): Promise<Result<void, string>>;
}

export interface InventoryService {
  equip(characterId: string, itemId: string): Promise<Result<void, string>>;
  list(characterId: string): Promise<{ gold: number; items: { itemId: string; equipped: boolean }[] }>;
}
```

Репозиторий персонажа хранит draft плюс id, hp = derive.hp, od = will (вне боя полный лимит, не 1).

## Алгоритм

- Имя-дубликат в репозитории → код `name_taken`.
- Раса не из playable → `race`.
- equip меча в main_hand успешен. Второй предмет в тот же слот → ошибка домена `slot_blocked`.
- grantXp использует `grantXp` домена и сохраняет level.

## Тесты

- человек с примером бойца из задачи 005 (очки 10/5/5/0/0/0) создаётся, золото 100, 4 стека (меч, куртка, бинты qty 3 одним стеком, патроны qty 20).
- демон-бот создаётся. Человек с race, если сервис сам выбирает расу по стороне, отдельного выбора расы в прототипе нет: игрок всегда human. Не принимать raceId снаружи в прототип-сервисе.
- трата 11-го очка в стат → ошибка, очки не списаны.
- событие created один раз. Подписка на bus в тесте.

## Definition of done

Сервисы не открывают сокет и не импортируют друг друга: инвентарь получает персонажа через свой репозиторий, который тест наполняет. CharacterService после создания вызывает inventory через порт `StarterGranter`, переданный в конструктор. Это не импорт модуля inventory, а интерфейс в `character/types.ts`. Реализация грантера в тесте и позже в compose.

## Зона правок

`apps/server/src/modules/character/**`, `apps/server/src/modules/inventory/**`.
