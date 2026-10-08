# Independent GDD audit

Date: 2026-10-08. Branch `cursor/implement-codebase-a579` at `78868c7`. This file does not trust `AUDIT.md`.

## Verdict

**NOT COMPLETE.**

`implementation-tasks/gdd-remaining/AUDIT.md` is materially false. It says no required GDD v2 system is missing, partial, or `feature_stub`. Domain helpers and unit tests exist for many formulas. The process that `apps/server/src/main.ts` actually starts does not put a player in the world, does not broadcast state, and does not call guild, mail, hack, gathering, wiki, build, quests, events, or AI. The client `App` never opens a socket, never mounts Pixi, and in a production build cannot leave the menu.

Canonical numbers that do exist in pure functions: tick `SIM_TICK_MS = 100`, relic sockets 1/2/3/3 in `packages/domain/src/relics.ts`, character `side` not stored, to-hit `accuracy + floor(perception / 2)` and damage from the accuracy stat in `packages/domain/src/stats.ts`, OD regen via `derive` inside `regenOd`, party cap `PARTY_MAX = 4`, corpse `CORPSE_MS = 7_200_000`, observation length 896 in `encodeObservation` and the Rust sidecar, hack password length 4, calendar epoch `2026-01-01` in `main.ts`. A formula in a module is not the same as the tick or the client session calling it.

## What the running server actually does

`main.ts` calls `buildApp` and `setInterval(tickOnce, 100)`. `tickOnce` in `apps/server/src/compose.ts` converts queued commands with `toSimCommand` and calls `stepTick`. The world starts as `emptyWorld` (no entities). `enterWorld` exists on the composition object and is called from `compose.test.ts`. Nothing in `main.ts`, the HTTP routes, or `bindGateway` calls it. After each tick the server does not call `broadcastState`. The socket sends a frame only when `handleMessage` rejects.

HTTP routes in `registerHttp`: `/health`, `/metrics`, `/auth/register`, `/auth/login`, `/characters`, `/characters/:id/inventory`, `/auction` (list or offer). No bid, mail, guild, hack, gather, dungeon, or enter-world route.

`createGatheringModule`, `createHackModule`, `createWikiModule`, and `createBuildModule` are started and then dropped. `compose` does not return them. No later line calls their services. `quest` is the same. `dungeon` is returned on the composition and is not called from `tickOnce` or HTTP. `ai.service.submit` and `observeEntity` are called from tests only.

## Gap list

### 1. Play session never enters the simulation

- **GDD:** Artifact 23, §1 and §4.1. «Клиент отправляет команды. Сервер применяет их и рассылает состояние.» «Tick rate: 10 тиков в секунду (100 мс).» «Состояние рассылается после каждого тика.»
- **Files:** `apps/server/src/main.ts`, `apps/server/src/compose.ts` (`emptyWorld`, `enterWorld`, `tickOnce`, `bindGateway`), `apps/server/src/infra/ws/gateway.ts` (`broadcastState`).
- **Code:** The 100 ms timer runs `stepTick` on an empty entity list. WebSocket commands are queued. `toSimCommand` maps `step_*`, `run_*`, `attack_*`, `revive`, `respawn`, `loot_corpse`. With no entity, `applyMove` / `applyAttack` push `missing`. `broadcastState` is never called from compose.
- **Severity:** partial. The tick function can apply those opcodes. The listen path never creates the entities and never publishes state.

### 2. Death, corpse loot, and respawn are not on the session path

- **GDD:** Artifact 5. «При 0 HP персонаж переходит в состояние «тяжёлый».» Corpse lifetime is the accepted 2 hours (`CORPSE_MS`).
- **Files:** `apps/server/src/sim/tick.ts` (`settlePlayers` → `fallDown`, `applyLoot` → `takeFromCorpse`, `applyRespawn` → `respawnAtBind`), `packages/domain/src/death.ts`.
- **Code:** Those calls sit inside `stepTick`. A listen-path world has no entity whose HP can reach 0. Monster corpses are created in `settleMonsters` only for entities already in that world. There is no monster respawn.
- **Severity:** partial.

### 3. Monster spawn, pathing, and attack do not run for a connected player

- **GDD:** Artifact 9. Basic monsters act; elites are a base monster plus a modifier; bosses have phases. Artifact 30’s prototype slice is five monsters plus a level-20 keeper with two phases. The remaining-task list requires that slice inside the tick.
- **Files:** `apps/server/src/sim/population.ts`, `apps/server/src/sim/bestiary.ts` (`PROTOTYPE_MONSTERS`, `KEEPER_PROTOTYPE`, `ELITE_MODIFIERS`), `apps/server/src/sim/tick.ts` (`pursuePlayers`, `settleMonsters`).
- **Code:** `prototypeEncounter` is the only spawner and is not called from the listen path. Its list is spore rat, bandit, cyborg dog, scout drone, and patrol keeper. It does not include `KEEPER_PROTOTYPE` (level 20, two phases) and does not pass `eliteId`. `pursuePlayers` steps one cell and melee-attacks when adjacent; it ignores `speedMultiplier`. Phase damage in `settleMonsters` only runs when `phases` is set. The two-phase keeper is spawned in `bestiary.test.ts`, not in the encounter.
- **Severity:** partial.

### 4. Elites, weather, seasons, neuroshock, and mutation do not change the live tick

- **GDD:** Artifact 21. «Сезоны влияют на геймплей: спавн монстров, доступность ресурсов и частоту погодных аномалий» and «+20% к спавну». Artifact 6. «Нейрошок»: −50% speed and damage. Artifact 9. Glowing fungus and the spore matron apply mutation. Artifact 21 weather changes combat numbers (sand, acid, blood moon, spore fog).
- **Files:** `apps/server/src/sim/weather.ts` (`combatWeather`, `seasonSpawnCount`), `apps/server/src/modules/event/service.ts`, `apps/server/src/sim/tick.ts`, `apps/server/src/modules/build/service.ts`, `packages/domain/src/status.ts`.
- **Code:** `stepTick` calls `combatWeather(world.weatherId)`. `emptyWorld` and `enterWorld` never set `weatherId`. `tickOnce` never calls `event.snapshot` or `planWeather`. `seasonSpawnCount` is referenced only by `weather.test.ts`. Neuroshock runs only when `entity.overloaded === true`; nothing in compose sets that from `neuroshock()`. Mutation multipliers run only if a `mutation` status is already on the entity. The tick applies stun, not mutation. Elite modifiers are not used by `prototypeEncounter`.
- **Severity:** partial. The multipliers exist. The production tick always feeds them identity inputs.

### 5. Experience and quest counters do not move

- **GDD:** Artifact 15, §1. «Квесты — основной источник опыта, золота и доступа к контенту.» Kill, gather, craft, deliver, escort, defend, and the other action kinds must advance.
- **Files:** `apps/server/src/sim/population.ts` (`playerEntity`), `apps/server/src/sim/progress.ts`, `apps/server/src/compose.ts` (`applyLife`), `apps/server/src/modules/quest/index.ts`.
- **Code:** `playerEntity` has no `progress` and no `quests`. `grantKill` and `applyLife` return immediately unless both are set. The quest module is not returned and is never told to accept or turn in a quest. Bus listeners for gather and craft only call `applyLife`.
- **Severity:** partial. `onKill` / `onGather` / `onCraft` / `onVisit` are unit-tested with a hand-built state. The player the server would spawn does not have that state.

### 6. Gathering, hack, wiki, and relic build are constructed and never called

- **GDD:** Artifact 12 gathering. Artifact 19, §4.2. «Мини-игра «подбор пароля». Сетка 4×4. 3 попытки.» Lockout 10 minutes. Artifact 6 relic sockets and neuroshock. Wiki is a social system in artifact 15 §9 and artifact 16.
- **Files:** `apps/server/src/modules/gathering/service.ts`, `apps/server/src/modules/hack/service.ts`, `packages/domain/src/hack.ts` (`PASSWORD_LENGTH = 4`, `LOCKOUT_MS`), `apps/server/src/modules/wiki/service.ts`, `apps/server/src/modules/build/service.ts`, `apps/server/src/compose.ts`.
- **Code:** Each module’s `start` replaces an internal service and keeps it private. No command, HTTP route, or tick reads it. The 4-symbol password and lockout run only if something calls `HackService.guess`. Nothing does.
- **Severity:** stub.

### 7. Guild create is not a player action, and gold is not the character wallet

- **GDD:** Artifact 17, §2.2 and the summary table. Creation requires 4 characters and 10 000 gold. Wars and withdrawals are guild operations, not a preview.
- **Files:** `apps/server/src/modules/guild/service.ts`, `apps/server/src/modules/guild/index.ts`, `apps/server/src/compose.ts` (`guildWallets`, `creditGuildGold`).
- **Code:** `GuildService.create` does call `createGuild`, charges `gold.deduct`, and `saveGuild`. `options.mode` is stored and never read, so `mode: 'stub'` does not return `feature_stub`. Compose builds that deduct function over a `Map` filled only by `creditGuildGold`. There is no HTTP or WebSocket command that creates a guild or moves character gold. `BuiltServer` exposes `guild`, and tests call it directly.
- **Severity:** partial.

### 8. Auction tax is not the GDD settlement

- **GDD:** Artifact 13, §5. «Налог с продавца: 5%.» «Продавец получает 95%.» Guild cities pay the 5% into the guild bank. Neutral cities sink it. Bids step by 5%.
- **Files:** `packages/domain/src/economy.ts` (`AUCTION_TAX`, `sellerProceeds`, `auctionTaxSink`), `apps/server/src/modules/economy/service.ts` (`offerAuction`, `bidAuction`), `apps/server/src/compose.ts` (`registerHttp`).
- **Code:** `POST /auction` can list or offer. Nothing on the listen path calls `bidAuction`. On buyout, `sellerProceeds` keeps 95% and `auctionTaxSink(lot.guildCity)` is called and ignored, so a guild city does not receive the tax. A non-buyout bid only updates `currentBid`.
- **Severity:** partial.

### 9. Mail and titles are service methods without a route

- **GDD:** Artifact 16 mail and titles. Artifact 30’s prototype stubs are cancelled by `implementation-tasks/gdd-remaining/README.md`.
- **Files:** `apps/server/src/modules/social/service.ts` (`say` with mail, `grantTitle`), `apps/server/src/compose.ts`.
- **Code:** `features.json` says `"mail": "live"` and `"titles": "live"`. The social service can store a mail line and a title when a test calls it. `tickOnce` and HTTP do not. `toSimCommand` returns null for every other action, so a WebSocket `mail` or `title` command is dropped.
- **Severity:** partial.

### 10. Prisma is an adapter, not the running save path

- **GDD:** Artifact 25. Account, character without `side`, inventory, `quest_progress`, `guild_members`. Task 115: with `DATABASE_URL` the battle path writes through a generated client. Migrations are part of shipping that schema.
- **Files:** `apps/server/prisma/schema.prisma`, `apps/server/prisma/sql/partitions.sql`, `apps/server/prisma/sql/ivfflat.sql`, `apps/server/src/infra/db/prisma.ts`, `apps/server/src/compose.ts` (`openRepositories`).
- **Code:** There is no `prisma/migrations` directory. No generated Prisma client is in the tree (`@prisma/client` is required at runtime only when `DATABASE_URL` is set). Default `compose` uses `MemoryWorld`. `bindAuth` keeps sessions in a `Map` even when account rows use Prisma. `createPrismaWorldRepository` ignores the database and returns `memoryWorldRepository()`. `bindEconomy` updates an in-memory repository and then `write()`, which does `void task.catch(() => undefined)` and does not await. `prisma.test.ts` injects a double. `prisma generate` was not run in this audit; dependencies are not installed here, and nothing in the repo shows a successful generate output.
- **Severity:** partial.

### 11. Catalog data versus the GDD, and what the runtime uses

Counts in `packages/content/data`:

| Catalog | Rows | Runtime |
|---|---|---|
| Races | 8 (`races.json`) | Creation allows human and demon. The other six are data only. |
| Items | 164 | Not equipped or dropped by the listen-path tick. |
| Recipes | 139 | Craft service is started and has no command route. |
| Monsters | 39, including `keeper_enhanced` and `keeper_enhanced_prototype` | Encounter spawns 5 templates. The level-20 two-phase keeper is not one of them. |
| Echoes / paths | 38 / 38 | Build service is never called. |
| Relics in items | 8 | Same. |
| Quests | 12 | Not accepted by the quest service on the listen path. |
| World nodes | 13 | Prototype fort, tower, two hubs, two dungeon nodes, four resource nodes, barrier, primordial city. |

- **GDD:** Artifact 2, eight races. Artifact 20.2, racial cities (forest city, dwarf fortress, troll refuge, ogre camp, ash spire, goblin workshop), a neutral city per region, and the primordial city rings. Artifact 20.6, three acts per side with real scenes (survive, learn the Barrier, collect fragments, enter the primordial city, meet the other side). Artifact 15, the action kinds, chains, and quest items. Artifact 18, server-authoritative dungeon generation.
- **Code:** Region ids exist (`plains` through `center`) without the racial cities or rings as nodes. `act1_light` through `act3_dark` are one or two counter objectives (`escort` target 1, and so on), not the scenes in artifact 20.6. `tutorial` uses kinds `wake`, `look`, `steps`, `equip`, `loot`, `inventory`, `bind`, which are not in `QUEST_OBJECTIVE_KINDS`. `advanceMatching` only increments `kill`, `gather`, `craft`, and `visit`. `createDungeonModule` is not entered from HTTP, the gateway, or the tick. `load.ts` rejects a quest unless `prototype: true`, so the loader cannot hold a non-prototype quest catalog.
- **Severity:** partial for races, items, monsters, echoes, paths, and recipes (data present, runtime absent). Missing for the geography and the story as written. Stub for dungeon play.

### 12. The client is a menu plus local fixtures

- **GDD:** Artifact 27 and artifact 30. Menu, creation, grid scene, inventory, combat, craft, chat, quests, map. Artifact 23: the client sends commands and receives state every 100 ms. Movement prediction only.
- **Files:** `apps/client/src/App.tsx`, `apps/client/src/boot.ts`, `apps/client/src/play/session.ts`, `apps/client/src/main.tsx`, `apps/client/src/render/pixi-app.ts`, `apps/client/src/net/apply.ts`.
- **Code:** `main.tsx` renders `App`. `App` calls `canEnterWorld(false, devMock)`. `playAction` returns `callsNetwork: false`. The login form calls `pushLog` on the request object from `loginBody` / `registerBody` and does not `fetch`. `createClientNet` is used in `boot.test.ts` and `apply.test.ts`, not in `App`. `createApplication` is never imported. The canvas is a raw element with `data-pixi="frame"`. `pressKey` returns `step_*` or `attack_melee` and `App` discards the return. It does not change `self.cell` or `self.hp`. `enterWorld` writes a fixed local snapshot (`hp: 40`, one rat at `(3,0)`, one rusty sword). Death cannot happen. `PlayPanels` renders inventory, craft, quests, map, chat, trade, hack, and settings from constants (`recipes={[{ id: 'rusty_sword' }]}`, `hack` hint default `'ABCD'`). Those panels mount only after the local snapshot, which a production build never reaches because sidecar pong is hardcoded `false` and `devMockEnabled` requires `DEV` and `VITE_SIDECAR_MOCK=1`.
- **Severity:** stub. Screens and `buildFrame` exist. A session cannot log in, move, attack, or die.

### 13. The 896 observation is not built from the live world

- **GDD:** Artifact 22. Perception is a 896-length vector. Artifact 23 / overview: if the sidecar is silent for 200 ms, the server uses utility AI. `SIDECAR_TIMEOUT_MS` is that window.
- **Files:** `apps/server/src/modules/ai/observe.ts` (`observeEntity`), `apps/server/src/modules/ai/service.ts` (`chooseAction`), `apps/sidecar/src/lib.rs`, `apps/client/src/play/sidecar.ts`.
- **Code:** `observeEntity` pads `encodeObservation` to 896 and is called from `observe.test.ts` only. `tickOnce` does not call `ai.submit`. Utility AI therefore never replaces a silent sidecar during a tick. `spawnMockSidecar` returns the string `cargo run ...` and does not spawn a process. The Rust `encode` path can return a 896-vector when a process is given one. The server never sends the sim world into that path.
- **Severity:** partial. The encoder and the timeout check exist. The tick does not use them.

### 14. `feature_stub` is gone as a return code and the systems are still unwired

- **Files:** `packages/protocol/src/envelope.ts`, `apps/server/src/modules/guild/service.ts`.
- **Code:** `feature_stub` remains a protocol reject code. Guild mode does not return it, because mode is ignored. Gathering, hack, wiki, and build do not return it either, because nothing calls them. That is not the same as those features running.
- **Severity:** stub.

## What is actually on a call chain

| Action | Chain | Reaches a live session? |
|---|---|---|
| Move / attack | `toSimCommand` → `stepTick` → `applyMove` / `applyAttack` → `resolveAttack` | No. World has no entities unless a test calls `enterWorld`. |
| Death / loot | `stepTick` → `settlePlayers` / `settleMonsters` → `fallDown` / `rolledLoot`; `applyLoot` | No. Same reason. |
| Monster chase | `stepTick` → `pursuePlayers` | No. Same reason. Not elites, not the two-phase keeper. |
| Guild create | `GuildService.create` → `createGuild` → `repository.saveGuild` | No route. Gold is `guildWallets`, not character gold. |
| Auction bid | `EconomyService.bidAuction` → `placeBid` → `sellerProceeds` | No route. Offer has `POST /auction`. Tax sink return value is discarded. |
| Mail | `SocialService.say` | No route. |
| Prisma save | `createPrismaRepositories` → `db.account.create` / `db.character.create` / inventory / `questProgress` / `guildMember` | Only if `DATABASE_URL` is set and the caller uses those repositories. Default server uses memory. No migrations. Sessions and the world repository stay in memory. |
| Client play | `App` → `loginBody` / `enterWorld` / `pressKey` / `buildFrame` | No network, no Pixi, no HP change, production stays on the menu. |

## Smallest remaining cycles

1. **Session simulation.** From login, create the character entity, call `enterWorld` (or replace it), run step/run/attack against those entities, broadcast `State` every tick, and let 0 HP call `fallDown`, corpse loot, and respawn. Spawn the prototype set plus the level-20 two-phase keeper. Roll elites onto that population. Point `weatherId`, season spawn, neuroshock, and mutation at the same entities from the event and build services. Initialize `progress` and `quests` on the player so kills, gathers, crafts, and visits move them.

2. **Command dispatch.** Route gather, hack (server password, 4 symbols, 3 attempts, 10-minute lockout), wiki, relic/echo/path/core, dungeon enter, quest accept and turn-in, guild create against character gold, auction bid with the 5% tax paid to the guild bank or the sink, mail, and titles. Do this from the gateway, not from a test holding the service.

3. **Persistence.** Add Prisma migrations, run `prisma generate` as part of the server build, and use that client on the production path for account, character (no `side`), inventory, quest progress, guild members, auction, and mail. Persist sessions and the world. Await writes.

4. **World and story content.** Add the racial cities, regional nodes, and primordial rings from artifact 20.2. Replace the six act counters and the tutorial kinds outside `QUEST_OBJECTIVE_KINDS` with the scenes in artifact 20.6, and advance every artifact 15 kind from a real event rather than from a manual counter.

5. **Client session.** Mount Pixi from `createApplication`, open `createClientNet`, POST register and login, send the key command, apply server snapshots, and let the player move, attack, and die. Bind inventory, craft, quests, map, chat, trade, the 4×4 hack grid, and settings to that server state. Build the 896 observation from the sim world and call `ai.submit` so a 200 ms silence uses utility AI.

Excluded, as specified: a live Steam store listing, and a trained GPU weight file.

## Cycle 2

Date: 2026-10-08. The five runtime gaps above are now called from production code. The original verdict stands for the tree it audited. This section is the call chain after that audit.

### Wired

1. **Session simulation.** `POST /auth/register` creates a character and calls `enterCharacter` → `enterWorld` → `prototypeEncounter`. `POST /auth/login` calls `resume`, which calls `enterWorld` for each character of that account. `POST /characters` does the same. `main.ts` still runs `setInterval(tickOnce, 100)`. `tickOnce` queues `step_*` / `run_*` / `attack_*` through `toSimCommand` and `stepTick`. After the step, `observeAndSubmit` builds an 896-vector with `observeEntity` and calls `ai.service.submit` with `sidecarAtMs` older than `SIDECAR_TIMEOUT_MS` (200), so `utilityAction` runs when the sidecar is silent. `publishState` calls `broadcastState` and `socket.send`s it to every connection. `GET /state` returns the same payload. `settlePlayers` calls `fallDown` at 0 HP and writes a corpse (`CORPSE_MS` is unchanged). `respawn` calls `respawnAtBind`. Dead monsters are queued in `settleMonsters` and return after `MONSTER_RESPAWN_MS`. `prototypeEncounter` spawns the five prototype monsters, elites with `eliteId`, and `KEEPER_PROTOTYPE`. `compose` calls `spawnNamed('keeper_enhanced')` and `POST /encounter` can place that level-50 three-phase keeper. Each tick reads `event.service.snapshot` and `planWeather`. `seasonSpawn` feeds `topUpSeasonSpawns` and gathering. `stepTick` passes `weatherId` into `combatWeather`, which sets vision, speed, damage, and gather modifiers. `pursuePlayers` steps with `speedMultiplier`. `neuralOverload` (nn above nnLimit, or `overloaded`) scales speed and damage by `neuroshockScale`. A spore/fungus/matron hit and a weather `mutationChance` roll call `tryApplyStatus` for the 60s mutation. Players carry `progress` and `quests`. `onObjective` / `note` / `reportKind` advance them from the tick and the bus.

2. **Command dispatch.** `POST /command` and the routes in `LIVE_ROUTES` call `runLive`: gather, hack start/guess (password length 4, 3 attempts, `LOCKOUT_MS`), wiki, relic, echo, path, core, dungeon enter, quest accept and turn-in, guild create, auction bid, mail, title grant, encounter. Guild create uses `gold.deduct` on `repos.economy` character gold (`GUILD_CREATE_GOLD` 10_000, four members). `bidAuction` keeps `sellerProceeds` (95%) and `auctionTaxSink`: guild cities add the tax to `taxLedger().guild` and `GuildService.creditTax` adds it to stored guild banks; neutral cities add it to `taxLedger().void`. Mail is `POST /mail` → `social.say`. Titles are `POST /titles` → `grantTitle`.

3. **Persistence.** `prisma/migrations/20261008000000_init` is the schema migration. `apps/server` `build` runs `prisma generate` before `tsc`. `openRepositories` uses `createPrismaRepositories` when `DATABASE_URL` is set and `MemoryWorld` when it is not. `write` tracks promises; `flush` awaits them and rethrows. Sessions use `storage` id `session:${accountId}`. The world snapshot uses `world:sim`. Account, character (no side column), inventory, quest_progress, guild members, auction lots, and mail still go through those repositories.

4. **World and story.** `world.json` `sites` / `siteEdges` hold the racial cities, neutral markets, regional nodes, and primordial rings. `withGeography` merges them into `WorldRepository.load`. Tutorial objectives use `QUEST_OBJECTIVE_KINDS` (`survive`, `investigate`, `visit`, `collect`, `lore`). Act objectives are scenes from artifact 20.6 and still include every artifact 15 kind. Those kinds advance from `note` / `reportKind` on kill, gather, craft, loot, visit, talk, hack, damage, dungeon, revive, wiki, auction buyout, mail, and guild create.

5. **Client session.** `App` calls `createApplication`, `spawnMockSidecar({ start: true })`, `createClientNet`, and `fetch` for `/auth/register`, `/auth/login`, `/characters`, `/state`, and `/command`. `pressKey`'s return value is passed to `sendKey` (socket when open, otherwise `POST /command`). Snapshots go through `ingest` / `applySnapshot`, so hp, cell, and phase update. Inventory, craft, quests, map, chat, trade, hack, and settings are buttons on the play view and keys in `pressKey`. `PlayPanels` passes `hackPassword` into `HackScreen` when the server has one. `spawnMockSidecar` starts `apps/sidecar/mock-server.mjs` when that file exists and returns `error` when it does not. The server utility fallback does not depend on that process.

### Still open

- A planned weather id changes combat, vision, movement, and gathering only after `ANNOUNCE_LEAD_MS` (5 minutes). The tick reads the event service every time. The season spawn multiplier applies on the same tick.
- `ai.submit` does not read the mock process stdout. Silence is represented by a timestamp already past 200 ms, and utility AI runs inside `submit`.
- No Steam store listing and no trained weight file, as specified.
