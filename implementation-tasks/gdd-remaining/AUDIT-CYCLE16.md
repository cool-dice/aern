# Independent audit, cycle 16

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, a live route, or `App.tsx` does not call is not wired.

**Verdict: NOT COMPLETE.** Cycle 15's named next ten now have a production caller. The GDD is not complete. Rules this pass read and left unwired are under Still open.

Section 12's war-duration row (1–1.5 real hours) stays a score from `measureSection12`, not leftover work. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5. Those phases were not retuned.

## Documented gaps in the design text

These are gaps in the text, not work this cycle skipped.

- **Contract board duration.** Artifact 16 §8.1 says the term is real time and names no number. A search of `docs/` still finds no contract-board hour or deadline. Posted contracts still have no invented `untilMs`. `tickOnce` and `skipMs` do not expire them.
- **Ancient decipher lockout.** Artifact 3 §6, artifact 20 §10, artifact 20.6 §8.3, and task 028 name no decipher lockout. The "3 attempts" figure is the linguistic-ruins UPY minigame. The 10-minute lockout is the hack grid (`LOCKOUT_MS` after three misses). `decipherAttempt` does not grow a lockout, and the route does not add one.
- **NPC grade is not an item level.** Artifact 4 §2.2: level is independent of grade (1–50). `packages/content/data/items.json` has `grade` and no `level`. The live buy still calls `buyFromNpc(1, grade)`. No level was invented.
- **Book study has no 10-minute wait in `gainUpy`.** Artifact 3 names a book and 10 minutes. `gainUpy` with `'book'` adds 3 and does not wait. The catalog has no book rows. The live item id is `book_<language>`. This pass did not invent the wait.
- **Ruins UPY has no 3-attempt counter in `gainUpy`.** Success is +10 and fail is +1. The domain function does not count attempts or lock the player out. The live route does not add a counter. A ruins site pays once per character, ruins id, and language, because the artifact calls that gain one-time.
- **Recipes and quests name no language.** Live craft and quest accept use the character's side language (`common_light` for a light race, `common_dark` for a dark race). A player placed with `enterWorld` and no character sheet keeps the light starting UPY of 100. A stored sheet uses the stored value.
- **Invasion node hold and hub hold are not paid.** Artifact 21 §5.3 names them. The live settlement does not track a node hold or a hub hold, so it does not call `invasionReward('node_hold')` or `invasionReward('hub_hold')`.
- **`coreChance` has no template.** The reward names a core and no item id. A successful roll stores the stack id `core`. Catalog cores are `core_*`. This pass did not pick one of those templates.

## Relic sockets and implant categories

Read before coding. Artifact 6 §3.4 and the v2 canon are echo sockets 1/2/3/3 by relic grade (`socketCount`). Artifact 4 §3 is four body categories — head, torso, arms/hands, legs — not a fourth socket and not a flat cap of 4. `IMPLANT_SLOTS` is `implant_head`, `implant_torso`, `implant_hands`, `implant_legs`.

`relic()` refuses a taken category and a fifth worn relic before `installRelic`, so gold is not spent. `removeWornRelic` removes by `implantSlot` when the body names one. Echo sockets stay `socketCount(grade) - echoes`. `startInstall` and `removeRelic` were not changed to a flat 4. Verified: `socketCount`, `IMPLANT_SLOTS`, `removeRelic`.

## Wired this cycle

Verified by reading the function and the caller. `@rift/server` `cycle16.integration.test.ts` fails if that caller drops the `name(` call.

1. **`gainUpy` for book, ruins, and interaction.** `POST /language/book`, `/language/ruins`, and `/language/interact`. Book consumes `book_<language>` and grants +3. Ruins grant `ruins_success` or `ruins_fail` once. Interaction grants +2. `App.tsx` posts all three. Teacher lessons and passive gain beside a speaker still run. Verified: `gainUpy`, `studyBook`, `studyRuins`, `studyInteraction`.

2. **`chatPresentation`.** Local, trade, and mail chat use the listener's UPY. UPY 100 returns the caller's translated string, which is the original text because there is no dictionary. UPY 0 is raw. 1–99 is `garble`. Party and guild still bypass language. The chat reply also includes `muteRemainingMs` from `sanctionUntilMs`, which includes the 24-hour false-report mute. That field is not `silenceMs`. Verified: `chatPresentation`, `sayChat`.

3. **`questLanguageAccess`.** `questAccept` denies at UPY ≤ 30 before `quest.accept`. 31–60 is garbled inside `acceptQuest`. Above 60 is full. Verified: `questLanguageAccess`.

4. **`canCraftLanguage`.** `craftStart` and `craft.service.start` refuse below 60 (`CRAFT_LANGUAGE_MIN`). The crafter's `languageUpy` is the side-language value, not a hardcoded 100. Verified: `canCraftLanguage`.

5. **`refine`.** `POST /refine`. Three ordinary units and 10 gold per cleaned batch. Cleaned stock is `${resourceId}_cleaned`. The returned `gold` is the wallet after every batch the gold and the stack can pay. `App.tsx` posts it. Verified: `refine`, `refineResource`.

6. **`relicBonuses`.** `tickOnce` calls `stampWornRelics` before `stepTick`. A worn relic with durability above 0 and `nowMs` not before `silencedUntilMs` adds armor and accuracy, reaction, and perception. `toCombatant` adds those deltas when `applyAttack` resolves. A plate is +1 armor. A missing spore penalty is filled with a different stat so the domain function can run. Verified: `relicBonuses`, `stampWornRelics`.

7. **`silenceMs`.** This is keeper silence, not the chat mute. `hackGuess` calls `silenceMs(kind)` on a correct password and stores that instant. Patrol 60s, guard 30s, destroyer 15s, unique 10s. `tickOnce` calls `stampKeeperSilence`. A monster id that starts with `keeper` and matches that kind does not attack while `now < until`. `keeper_patrol` is patrol. Any other keeper id is unique. The 24-hour false-report mute is unchanged. Verified: `silenceMs`, `stampKeeperSilence`.

8. **`textHitsBlacklist`.** `sayChat` checks the whole token against `GUILD_NAME_BLACKLIST` (`slug`) before delivery. A hit returns `listed: true`, `delivered: 0`, and the later mute. Verified: `textHitsBlacklist`.

9. **`canVote`.** `castLeaderBallot` and `castInternalBallot` call it when the voter has a stored rank. A novice gets `rank`. A missing rank is not rejected, so an unseated ballot is unchanged. Charter seating still makes non-leaders veterans. Verified: `canVote`.

10. **`invasionReward`.** `tickOnce` and `skipMs` call `settleInvasion`. When the invasion phase is `done`, it calls `invasionReward` for `monsters_10`, `elite`, and `invasion_boss` and pays characters who earned them. Ten or more monster kills pay 200 gold and 500 XP. Each elite pays 500 gold, 1000 XP, and a 0.2 roll for `relic_shard`. A boss kill during `climax` pays 2000 gold, 5000 XP, and a 0.1 roll for `unique_component`. Kills after `done` are not counted. Verified: `invasionReward`, `settleInvasion`.

11. **`effectiveBonuses`.** `tickOnce` calls `stampWornGear` before `stepTick`. `toCombatant` calls `effectiveBonuses` on each worn piece, and on an empty list when nothing is equipped. An unmet requirement halves that piece (`floor(amount * 0.5)`). Reaction, accuracy, and perception are added the same way `derive` builds evasion and accuracy. Body, will, and technique have no combatant field, so they are resolved and not added to the swing. Starter gear stays unequipped until `inventory.service.equip`. Verified: `effectiveBonuses`, `gearBonusesOf`, `stampWornGear`.

## Still open

- The GDD is not complete.
- Contract deadlines, an ancient-decipher lockout, the book wait, the ruins attempt counter, NPC item levels, invasion node and hub holds, and a named core template are the gaps above. They were not given an invented number or item.
- Body, will, and technique item bonuses do not change the swing. See item 11.
- A name search of `export function` in `packages/domain/src` found 259 exports. 45 of those names still do not appear as `name(` under `apps/` or `packages/content`. That search is not a verdict that each name is a required system. Some of the 45 already run inside a domain function the live path calls (`applyWeather` inside `weatherEffect`, `garble` and `replacementRate` inside `chatPresentation`, `damageMultiplier` inside `resolveAttack`, `respawnAtBind` inside `respawn`, `maxItemLevel` inside `startCraft`, `pactLive` inside the guild pact checks, `applyWear` / `wearFor('death')` inside death and relic upkeep, `statusDurationMs` / `statusDifficulty` / `rollMutationEffect` inside `tryApplyStatus`). Helpers with no GDD behavior of their own (clock arithmetic, `clampUpy`, `basePrice`, `xpToNext`, `splitXp`, `itemTier`, `goldAmount`, `gearItemLevel`, id and path helpers, neural cost tables, `installGold`, `installDurationMs`) are not the next ten. These are the next ten that the GDD describes as player-facing, that have no `name(` under `apps/` or `packages/content`, and that this pass did not implement. Their behavior is not already performed by a live domain call:
  1. `speedMultiplier` — one missed item requirement sets move speed to 0.8 (`packages/domain/src/items.ts`). `effectiveBonuses` halves the stat and does not call this.
  2. `effectMultiplier` — a path's effect is ×1, ×0.75, ×0.5, then ×0 as forgetting advances (`packages/domain/src/build.ts`).
  3. `difficultyMultipliers` — dungeon easy / normal / hard / epic / raid scales hp, damage, loot, and xp (`packages/domain/src/dungeon.ts`).
  4. `nextWaveMultiplier` — each full 10% of a wave killed removes 5% strength from the next wave, capped at −50% (`packages/domain/src/events.ts`).
  5. `invasionRepelled` — the invasion is repelled only when its boss dies during climax (`packages/domain/src/events.ts`). Rewards can pay `invasion_boss` without setting this.
  6. `resourceNodesClosedUntil` — a destroyed hub closes regional resource nodes for one real hour (`packages/domain/src/events.ts`).
  7. `escaped` — combat ends past 15 cells from the origin and 10 cells from every enemy (`packages/domain/src/movement.ts`).
  8. `specialAmmoWeightKg` — special ammo weighs from 0.5 kg to 2 kg (`packages/domain/src/items.ts`).
  9. `statusResist` — effect resistance is will plus half of body, floored (`packages/domain/src/status.ts`). Live status applies pass `resist: 0` and do not call this.
  10. `materialGold` — unit price times quantity, which a craft rush spends at half (`packages/domain/src/economy.ts`).
- No Steam listing and no trained GPU weight file. Those were not required.
- The new session buttons in `App.tsx` were not clicked in a browser. Route behavior is covered by the server tests, which fail if the domain function is missing from `tickOnce`, `skipMs`, the live route, or `App.tsx`.
