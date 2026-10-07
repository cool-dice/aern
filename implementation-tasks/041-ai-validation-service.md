# Сервис валидации бота и utility-фолбэк

- id: `041`
- title: Сервис валидации бота и utility-фолбэк
- status: `pending`
- depends_on: `030`, `026`

## Цель

Принять действие бота тем же путём, что и команду игрока, и подставить utility, если сайдкар молчит.

## Контекст

Артефакты 22 и 30. Бот — контроллер `bot`, сторона dark. Команда имеет тот же конверт. Отклонения копятся. Порог античита живёт в задаче 042; здесь вызывается порт `Validator`.

Если с момента последнего ответа сайдкара прошло > 200 мс (`SIDECAR_TIMEOUT_MS`), сервис на этом тике берёт `utilityAction` и помечает решение `source: 'utility'`. Иначе `source: 'policy'`.

Офлайн носителя: сервис `onCarrierOffline` убирает бота из мира через порт `BotPresence` и не создаёт труп.

Память: `remember` добавляет запись, при 10_001-й удаляется самая старая (не архив в этой задаче: архив — массив `archive` в памяти, перенос одной записью, чтобы тест видел лимит 10_000 активных).

Обучение: `requestTrain('policy' | 'adapter', now)` сохраняет заявку. Повтор policy раньше 24 часов → `early`. Adapter раньше 6 часов → `early`. Никакого градиента.

## Решение противоречий

Валидатор передаётся портом. Тип порта объявлен в `modules/ai/types.ts`. Файл `sim/validate.ts` не импортируется, задача `042` может идти параллельно. Тест подставляет фейк. Utility не маскирует отказ валидатора, если команда сайдкара успела прийти.

## Файлы

`apps/server/src/modules/ai/**` и тест.

## Интерфейсы

```ts
export interface AiService {
  submit(input: { characterId: string; action: string; legal: string[]; sidecarAtMs: number; nowMs: number; hp: number; maxHp: number; od: number; nearestEnemy: number | null; weaponRange: number }): Promise<Result<{ action: string; source: 'policy' | 'utility' }, string>>;
  remember(characterId: string, entry: { atMs: number; text: string }): void;
  requestTrain(kind: 'policy' | 'adapter', nowMs: number): Result<{ atMs: number }, 'early'>;
}
```

## Алгоритм

- action не из `ACTION_IDS` → `invalid` до валидатора.
- валидатор вернул ошибку → эта ошибка наружу, utility не подменяет отказ. Utility только если сайдкар опоздал и исходное действие ещё не принято. Если опоздал, исходное action игнорируется и берётся utility, затем валидатор.
- remember сверх лимита двигает хвост в archive.

## Тесты

- известное действие и валидатор ok, свежий sidecar → source policy.
- sidecarAt на 201 мс старше now, legal attack_melee, враг рядом, hp полное → utility attack_melee.
- action `fly` → invalid, валидатор не вызван.
- 10_001 remember → активных 10_000, архив 1.
- train policy дважды в один now → вторая early. Через 24 часа ok. Adapter через 6 часов ok, через 5 — early.
- carrier offline вызывает presence.remove один раз и не вызывает corpse.

## Definition of done

В сервисе нет onnx, fetch и сокетов.

## Зона правок

`apps/server/src/modules/ai/**`.
