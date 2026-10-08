# Independent audit, cycle 14

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, or a live route does not call is not wired.

**Verdict: NOT COMPLETE.** The five cycle-13 leftovers now have a production call. One extra system with concrete rules, purification, is on that same path. Rules this pass saw and did not wire are listed under Still open.

Section 12's war-duration row (1–1.5 real hours) is a balance score from `measureSection12`, not a gate, and it is not still-open work. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5 (`WAR_MUSTER_MS`, `WAR_ASSAULT_MS`, `WAR_HOLD_MS`, `WAR_FINISH_MS`). Those phases were not retuned. `tickOnce` and `skipMs` still call `sampleBalance` → `measureSection12`. `SECTION12.warDurationMinMs` is 3 600 000 and `warDurationMaxMs` is 5 400 000.

## Cycle-13 wiring that still holds

1. **`setDoctrine` is a live route, and the tick stamps doctrine before `stepTick`.** `POST /guild/doctrine` is `guild_doctrine` → `changeDoctrine` → `setDoctrine`. `tickOnce` calls `stampGuildDoctrines` before `stepTick`. `App.tsx` calls `postDoctrine`. Verified: `changeDoctrine`, `setDoctrine`, `stampGuildDoctrines`, `postDoctrine`.

2. **Any guild member can read the bank operations.** `POST /guild/bank` is `guild_bank` → `readBankLog`, which returns the operation rows. Verified: `readBankLog`, `logBank`.

3. **A withdrawal past 10% and 25% of the bank sends the confirms those bands name.** `withdrawBank` adds `leaderConfirm` and `councilConfirms` above 10%, and `councilVote` above 25%. Verified: `withdraw`, `withdrawBank`.

4. **Racial cities used for registration have `place: "hall"`, and registration reads that place.** `registerAtHall` reads `node.place`. Verified: `registerAtHall`, `registrationPlace`.

5. **The contract board refuses a kill bounty under level 10 or against a guild member.** `POST /contract` is `contract_post` → `postBoardContract` → `postContract`. `App.tsx` calls `postContractBoard`. Verified: `postBoardContract`, `postContract`.

6. **`main.ts` still ticks every 100ms** with `void built.tickOnce()`.

## Wired this cycle

1. **Posted contracts take the resource and relic rewards artifact 16 §8.2 names. They do not expire.** `postContract` accepts `rewardResources` on `kill` and `defend`, and `rewardRelics` on `steal`. Smuggle and scout stay gold only. A reward the type does not name returns `gold`. `postBoardContract` forwards both fields, and `visibleContracts` returns them. `App.tsx` posts a kill with `rewardResources: 10` and a steal with `rewardRelics: 1`. §8.1 says the term is real time and names no duration. A search of `docs/` for a contract-board hour or deadline number found none, so this cycle did not invent one. Rows still have no `untilMs`. `tickOnce` and `skipMs` do not expire them. Verified: `postContract`, `postBoardContract`, `visibleContracts`, `postContractBoard`.

2. **A moderator who judges a report false mutes the reporter for 24 hours.** `POST /report` files the report. `POST /report/judge` is `report_judge` → `judgeReport`. A reviewer who is not a moderator or admin returns `rank`. `verdict === false` calls `falseReportSanction()` (`mute_24h`) and `imposeSanction` on the reporter. `POST /chat` is `chat_say` → `sayChat` → `social.say`, which refuses delivery while `nowMs < sanctionUntilMs`. The window is 24 × 3 600 000 ms. `skipMs` across that window lifts it. Verified: `falseReportSanction`, `judgeReport`, `imposeSanction`, `sayChat`.

3. **Three cheat strikes inside 24 hours ban the account.** `POST /cheat/strike` is `cheat_strike` → `noteCheatStrike` → `recordCheatStrike`. A rejected gateway frame with `cheatStrike` records the same counter. `tickOnce` and `skipMs` call `reviewCheatStrikes` → `sanctionForCheatStrikes`. Under 3 strikes the result is `none`. Three strikes call `applyCheatSanction`: `account_ban_7d` sets `banned` and `banUntilMs` to now + `CHAT_BAN_MS` (7 days) with `banReason: 'cheat'`. A later window, after that ban was applied, is `permanent` (`banUntilMs: null`). The repeat flag is set only after the ban is stored, and the strike list is cleared. Verified: `recordCheatStrike`, `reviewCheatStrikes`, `sanctionForCheatStrikes`, `applyCheatSanction`.

4. **Ancient encode and decipher are live routes.** `POST /ancient/encode` is `ancient_encode` → `encodeAncientText` → `encodeAncient`. `POST /ancient/decipher` is `ancient_decipher` → `decipherAncient` → `decipherAttempt`. The server permutation is `buildPermutation` of the JWT secret. A wrong attempt returns `mismatch` and does not include the plaintext. A matching attempt returns `plaintext`, `solved`, and `firstSolve`. The domain function has no lockout, and the route does not add one. `App.tsx` calls `encodeAncientLine` with `привет` and `decipherAncient` for `fragment_rift_01`. The catalog lore for that fragment no longer ends with `.`, because that glyph is in the cipher alphabet and the official key could not round-trip. `implementation-tasks/029-content-catalogs.md` still quotes the period. Verified: `encodeAncient`, `decipherAttempt`, `encodeAncientText`, `decipherAncient`, `encodeAncientLine`.

5. **Coalition members can post a deposit and a read. The bank stays closed.** Artifact 17 §9.2: a coalition has no shared bank. `POST /coalition/bank` is `coalition_bank` → `useCoalitionBank`. The caller must belong to a guild in a live coalition (`coalitionChannel`); otherwise the code is `member`. `coalitionBank()` returns `bank` for both `deposit` and `read`. There is no ledger. `formPact` still refuses a coalition when `coalitionBank()` succeeds, so this route does not make that function succeed. `App.tsx` calls `postCoalitionBank` with `op: 'deposit'` and `op: 'read'`. Verified: `useCoalitionBank`, `coalitionBank`, `coalitionChannel`, `postCoalitionBank`.

## Extra system

**Purification** (artifact 6 §6.4–6.5), domain `beginPurify` and `completePurify`. `POST /purify` is `purify` → `startPurify` → `beginPurify`. The route does not read a client relic or implant count. Implant cores are `cores` with `implant: true`. A worn relic is the one install the character row stores: `relicSocketFree > 0`, an echo program, or `echoIds`. That is a presence count of one, not a stack. Either leftover returns `still_impure`. A purification already stored returns `busy`. Success sets `clean: false` and `purifyingUntilMs` to now + 24 hours (`PURIFY_MS` = 24 × 60 × 60 000) and records the character in `purifyingIds`. `tickOnce` and `skipMs` call `finishPurifications` → `completePurify(state, clock.now())`. Before the deadline the build stays impure. At the deadline `clean` becomes true, `purifyingUntilMs` is cleared, and path forgetting and idle return to 0. `App.tsx` calls `postPurify` with the character id only. Verified: `startPurify`, `beginPurify`, `storedRelicsLeft`, `implantCoresLeft`, `finishPurifications`, `completePurify`, `persistPurify`, `postPurify`.

## Not a gate

Section 12 war duration stays a measured score. It is not a declare or settle refusal and it is not leftover implementation work.

## Still open

- The GDD is not complete.
- Contract deadlines have no number in artifact 16 §8.1 or elsewhere under `docs/`. A posted contract does not expire, and the tick does not settle it.
- A coalition has no shared bank. `coalitionBank` returns `bank`. The live route does not keep deposits.
- Ancient decipher has no lockout in `decipherAttempt`. The route does not add one. `decodeAncient`, `botRecord`, and `renderFragment` still have no caller in `apps/` or `packages/content`.
- The character row does not store a relic stack, and `removeRelic` has no live caller, so a worn relic cannot be taken off before purification.
- A name search of 259 `export function` declarations in `packages/domain/src` found 72 names that do not appear as `name(` under `apps/` or `packages/content`. That search is not a verdict that each name is a required system. These are the ones this pass read and left unwired:
  - `matchmake` — level within 5, optional role, open seats (`packages/domain/src/social.ts`).
  - `gainUpy` — teacher cap 80, 100 gold, 24-hour cooldown; passive gain waits 7 200 000 ms online (`packages/domain/src/language.ts`).
  - `dayPhase` — cosmetic day/night. Artifact 7 says the cycle does not change mechanics (`packages/domain/src/time.ts`).
  - `tickForgetting` and `recoverForgetting` — path idle advances forgetting; recovery is a separate gold channel (`packages/domain/src/build.ts`). `unequipCore` and `breakClean` in that file are also unwired.
  - `openChest` — rare needs 1 key, epic needs 2; gold and gear stacks (`packages/domain/src/loot.ts`).
  - `buyFromNpc` — a unique is refused; otherwise the price is 3/2 of `basePrice` (`packages/domain/src/economy.ts`).
  - `expandStash` — 50 slots for 1 000 gold, cap 1 000 (`packages/domain/src/economy.ts`).
  - `pvpXp` and `pvpXpAllowed` — same-victim experience waits `PVP_XP_COOLDOWN_MS` (600 000) (`packages/domain/src/progression.ts`).
  - `readWiki` (`packages/domain/src/wiki.ts`).
- No Steam listing and no trained GPU weight file. Those were not required.
