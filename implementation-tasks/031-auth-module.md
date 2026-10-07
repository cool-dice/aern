# Модуль Auth

- id: `031`
- title: Модуль Auth
- status: `pending`
- depends_on: `030`

## Цель

Регистрация, вход, JWT и сессионный ключ HMAC. Хранение — через интерфейс репозитория, в тестах память.

## Контекст

Артефакты 24 и 25. Пароль bcrypt cost 12. Роли `player`, `moderator`, `admin`. Бан: `banned`, `banReason`, `banUntil`. Почта уникальна в нижнем регистре. JWT в GDD «короткий»: access 15 минут, refresh 24 часа (решение обзора). Сессия Redis на 24 часа; в этой задаче репозиторий сессий in-memory с тем же TTL, проверяемым через Clock.

Сессионный ключ — 32 случайных байта hex. Им подписывают команды снаружи.

Один аккаунт — один активный персонаж-носитель бота. Создание бота не здесь.

## Решение противоречий

bcryptjs, не нативный модуль, чтобы тесты не собирали node-gyp. Cost в тестах можно не ускорять: один хеш на тест приемлем. Если слишком медленно, вынести cost аргументом, по умолчанию 12, в тестах 4. Зафиксировать: параметр `cost` в конструкторе сервиса, продакшен-композиция передаёт 12, тесты передают 4. Это не ослабляет прод, если `045` передаёт 12. Тест композиции проверит, что константа `PRODUCTION_BCRYPT_COST = 12` экспортирована и используется compose-файлом позже.

## Файлы

- `apps/server/src/modules/auth/types.ts`
- `apps/server/src/modules/auth/repository.ts` — интерфейс и `MemoryAuthRepository`
- `apps/server/src/modules/auth/service.ts`
- `apps/server/src/modules/auth/index.ts` — фабрика `createAuthModule`
- `apps/server/src/modules/auth/service.test.ts`

Не писать HTTP-роуты: их соберёт `045`. Сервис вызывается напрямую.

## Интерфейсы

```ts
export interface AuthService {
  register(email: string, password: string): Promise<Result<{ accountId: string }, 'email' | 'password'>>;
  login(email: string, password: string): Promise<Result<{ accessToken: string; refreshToken: string; sessionKey: string }, 'credentials' | 'banned'>>;
  verifyAccess(token: string): Result<{ accountId: string; role: string }, 'token'>;
}
```

Пароль короче 8 символов → `password`. Email без `@` → `email`.

Секрет JWT — аргумент конструктора, в тестах строка `test-jwt-secret`.

## Алгоритм

- register сохраняет hash, не пароль.
- login при banUntil > now → `banned`.
- verify просроченного токена (clock advance на 16 минут) → `token`.
- повторный register того же email → `email`.

## Тесты

- успешный цикл register/login/verify.
- неверный пароль → `credentials`, сессия не создаётся.
- бан → `banned`.
- просрочка access.
- в репозитории после register нет поля с открытым паролем: тест смотрит dump памяти.

## Definition of done

Модуль не импортирует character и prisma.

## Зона правок

`apps/server/src/modules/auth/**`.
