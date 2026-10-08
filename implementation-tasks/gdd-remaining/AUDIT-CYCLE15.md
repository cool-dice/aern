# Independent audit, cycle 15

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, a live route, or `App.tsx` does not call is not wired.

**Verdict: NOT COMPLETE.** Cycle 14's named leftovers now have a production caller. The GDD is not complete. Rules this pass read and left unwired are under Still open.

Section 12's war-duration row (1–1.5 real hours) stays a score from `measureSection12`, not leftover work. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5. Those phases were not retuned.

## Documented gaps in the design text

These are gaps in the text, not work this cycle skipped.

- **Contract board duration.** Artifact 16 §8.1 says the term is real time and names no number. A search of `docs/` still finds no contract-board hour or deadline. Posted contracts still have no invented `untilMs`. `tickOnce` and `skipMs` do not expire them.
- **Ancient decipher lockout.** Artifact 3 §6, artifact 20 §10, artifact 20.6 §8.3, and task 028 name no decipher lockout. The "3 attempts" figure is the linguistic-ruins UPY minigame. The 10-minute lockout is the hack grid (`silenceMs` on a keeper). `decipherAttempt` does not grow a lockout, and the route does not add one.

## Cycle-14 behavior that still holds

Verified by reading the live path and by `@rift/server` `cycle14.integration.test.ts` (12 tests) plus `cycle15.integration.test.ts`.

1. **Contracts accept resource and relic rewards as well as gold, and the session can post them.** `postContract` still takes `rewardResources` and `rewardRelics`. `App.tsx` still calls `postContractBoard`.
2. **A false report mutes the reporter for 24 hours.** `judgeReport` still applies `falseReportSanction()`.
3. **Three cheat strikes inside 24 hours ban the account.** `reviewCheatStrikes` still calls `sanctionForCheatStrikes`.
4. **`POST` routes call `encodeAncient` and `decipherAttempt`.** `POST /ancient/encode` and `POST /ancient/decipher`.
5. **Coalition members can post a deposit and a read.** `POST /coalition/bank`.
6. **`POST /purify` starts purification, and `tickOnce` / `skipMs` finish it after 24 hours.** `beginPurify` / `completePurify`.

## Wired this cycle

1. **`coalitionBank` keeps a ledger of deposits and reads. The live read returns the rows.** Artifact 17 §9.2: a coalition has no shared bank. `coalitionBank()` still returns `err('bank')`, so `formPact` still refuses a coalition when that result is `ok`. Deposit and read append rows. The read value is `{ op, guildId, rows }` and has no `bank` total. Verified: `useCoalitionBank`, `coalitionBank`, `coalitionLedger`.

2. **Ancient fragments render, decode, and record on the live route.** `decipherAncient` calls `renderFragment`, then `decodeAncient`, then `decipherAttempt`. A bot (`controller === 'bot'`) gets `botRecord` without solving. Players still need a non-empty attempt, and success requires the decoded text to equal the stored plaintext. Verified: `renderFragment`, `decodeAncient`, `decipherAttempt`, `botRecord`.

   **Key rule, read from `packages/domain/src/ancient.ts`.** `PLAIN_ALPHABET` is the 33 Russian letters, including `ё`. `CIPHER_GLYPHS` is `!#$%&()*+,-./0123456789:;<=>?@[]^` (33). Task 028's glyph literal is 34 because it also contains `_`; the domain constant drops `_`. There is no space in the cipher alphabet. The permutation is Fisher–Yates via `mulberry32(hashSeed(serverSecret))`. Space stays space. `ё` folds to `е`. Uppercase folds to lowercase before encode. `.` is a cipher glyph, so a period in the plaintext does not round-trip. `fragment_rift_01` lore is stored as `предтечи открыли разлом в изначальном городе` — lowercased, and the period was not put back. `decodeAncient(encodeAncient(lore, key))` equals that lore.

3. **The character row stores the relic stack, and `removeRelic` is a live route.** `POST /relic/remove` calls `removeWornRelic` → `removeRelic`. Echo programs on that relic are dropped. A worn relic can come off before purification. `App.tsx` calls `postRemoveRelic`. Verified: `removeRelic`, `removeWornRelic`, `relicStack`.

4. **`matchmake` is `POST /party/match`.** Level within 5, optional role, open seats `PARTY_MAX - members` (party max 4). `App.tsx` calls `postMatchmake`. Verified: `matchmake`, `matchParty`.

5. **`gainUpy` is a teacher lesson and passive time beside a speaker.** `POST /language/teach` charges 100 gold, caps at 80, and waits 24 hours. `tickOnce` and `skipMs` call `advanceLanguage`, which grants the passive +1 only after 7 200 000 ms online next to another character at the same node whose race speaks that language. Book, ruins, and interaction gains are still not callers. The domain checks gold before the cooldown. It does not implement a one-hour lesson wait, and this pass did not invent one. Verified: `gainUpy`, `teachLanguage`, `advanceLanguage`.

6. **`dayPhase` is cosmetic and the client shows the server clock.** Artifact 7: the cycle does not change mechanics. `tickOnce` and `skipMs` set `clockPhase = dayPhase(clock.now())`. `statePayload.dayPhase` is that value. `App.tsx` renders `payload.dayPhase` and does not recompute it. A game day is 2 real hours; the first hour is day, the second is night. Verified: `dayPhase`.

7. **`tickForgetting` and `recoverForgetting`.** Online idle on a path advances one forgetting step each 2 hours (`FORGET_STEP_MS`). `tickOnce` and `skipMs` call `advanceForgetting`. `POST /path/use` marks the path used so that tick clears idle and does not restore a step. `POST /path/recover` calls `recoverForgetting`: 50 gold, `readyAtMs` now + 30 minutes, city and not in combat. `App.tsx` calls `postPathUse` and `postRecoverPath`. Verified: `tickForgetting`, `recoverForgetting`, `advanceForgetting`, `markPathUsed`, `recoverPath`.

8. **`unequipCore` is `POST /core/unequip`.** City or hub, not in combat. The stored core list becomes empty, so another core can be equipped. `App.tsx` calls `postUnequipCore`. Verified: `unequipCore`, `coreUnequip`.

9. **`breakClean` is `POST /purity/break`.** It stores `clean: false` and keeps installed paths. It is not called from relic install. `startInstall` still returns `clean` until this route has been posted. `App.tsx` calls `postBreakClean`. Verified: `breakClean`, `breakPurity`.

10. **`openChest` is `POST /chest`.** Common spends 0 keys, rare 1, epic 2 (artifact 11 §9.3; `CHEST_KEYS` is private in the domain, and the caller uses those same counts). Keys are the wallet stack `key`. Region level is the catalog region's `levelMin` for the character's node. Gold and `gear_${grade}` are deposited; epic also deposits `unique_component`. `App.tsx` calls `postOpenChest`. Verified: `openChest`, `openLiveChest`.

11. **`buyFromNpc` is `POST /npc/buy`.** Catalog grade is used. A unique grade or `uniqueProfile` returns `unique`. Otherwise the price is `ceil(basePrice * 3 / 2)`. Catalog rows name no item level, so the level passed in is 1. A price on the request is ignored. Gold is spent and the stack is stored. `App.tsx` calls `postBuyNpc`. Verified: `buyFromNpc`, `buyNpc`.

12. **`expandStash` is `POST /stash/expand`.** 1 000 gold buys 50 slots. The domain result's `gold` is the cost, not the new wallet. Base is 200 when `stashSlots` is absent. Cap is 1 000. The wallet stores the new size. `App.tsx` calls `postExpandStash`. Verified: `expandStash`, `growStash`.

13. **`pvpXp` and `pvpXpAllowed` run from `tickOnce`.** A character who was online and is now downed, with a non-monster `lastAttackerId`, is scored after the tick has written `killerId` on the corpse. Same victim waits 600 000 ms. Levels outside 1..50 are skipped so `pvpXp` is not thrown. A player killer receives the XP on the character row and on `entity.progress` when that field exists. An offline bot (`carrierOffline` or phase `offline`) awards nothing. When the killer's character is a bot, the XP goes to the player on that same account (the carrier). Task 014 says an online-bot kill pays the killer; artifact 14 §8.2 says a bot kill is credited to the bot's carrier. This caller uses the killer's level in `pvpXp`, pays a player killer directly, and pays the carrier when the killer is the bot. Verified: `pvpXp`, `pvpXpAllowed`, `awardPvpXp`.

14. **`readWiki` is `POST /wiki/read`.** Primordial or the reader's own side is allowed. The opposite side returns `side`. Reader side comes from `RACES` on the character (players are human/light, bots are demon/dark). Article side is the stored row, or `primordial` when the id is `primordial` or starts with `primordial_`. The client does not choose the side. `POST /wiki` still calls `writeProse` only. `App.tsx` calls `postReadWiki`. Verified: `readWiki`, `readArticle`, `writeProse`.

## Not a gate

Section 12 war duration stays a measured score. It is not a declare or settle refusal and it is not leftover implementation work.

## Still open

- The GDD is not complete.
- Contract deadlines and an ancient-decipher lockout are the documented gaps above. They were not given a number.
- `gainUpy` book, ruins, and interaction gains have no production caller. Teacher and passive-beside-a-speaker do.
- Artifact 4 names 4 relic slots. `removeRelic` and `startInstall` do not cap the stack at 4, so this pass did not add a cap the domain function does not have.
- Catalog NPC goods have a grade and no item level. The live buy uses level 1 with that grade.
- A name search of `export function` in `packages/domain/src` found 55 names that still do not appear as `name(` under `apps/` or `packages/content`. That search is not a verdict that each name is a required system. Helpers with no GDD behavior of their own (clock arithmetic, `clampUpy`, `basePrice`, `xpToNext`, `splitXp`, `itemTier`, `goldAmount`, `gearItemLevel`, id and path helpers, neural cost tables, `installGold`, `installDurationMs`) are not the next ten. These are the next ten that the GDD describes as player-facing and that this pass did not implement:
  1. `chatPresentation` — chat the listener sees is raw, garbled, or translated from their UPY (`packages/domain/src/language.ts`). `garble` is the replacement that function calls; it has no separate production caller either.
  2. `questLanguageAccess` — a quest is denied, garbled, or full from UPY (`packages/domain/src/language.ts`).
  3. `canCraftLanguage` — a recipe in that language needs UPY ≥ 60 (`packages/domain/src/language.ts`).
  4. `refine` — 3 ordinary resource and 10 gold per cleaned batch (`packages/domain/src/gathering.ts`).
  5. `relicBonuses` — stats and armor from a worn relic, empty when broken or silenced (`packages/domain/src/relics.ts`).
  6. `silenceMs` — keeper silence after a hack, by keeper kind (`packages/domain/src/hack.ts`).
  7. `textHitsBlacklist` — a blacklist entry matches a whole token (artifact 32 §3.6) (`packages/domain/src/moderation.ts`).
  8. `canVote` — a novice cannot vote (`packages/domain/src/guild.ts`).
  9. `invasionReward` — the payout for an invasion result (`packages/domain/src/events.ts`).
  10. `effectiveBonuses` — an unmet item requirement pays half the bonus (`packages/domain/src/items.ts`).
- No Steam listing and no trained GPU weight file. Those were not required.
- The new session buttons in `App.tsx` were not clicked in a browser. Route behavior is covered by the server tests, which fail if the domain function is missing from `tickOnce`, `skipMs`, the live route, or `App.tsx`.
