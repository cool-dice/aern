export { ok, err } from './result';
export type { Result } from './result';

export { createEntityId, assertCatalogId } from './ids';
export type { EntityId, CatalogId } from './ids';

export { mulberry32, hashSeed } from './rng';
export type { Rng } from './rng';

export { SIM_TICK_MS, REAL_SECOND_MS, GAME_DAY_MS, dayPhase, addMs, elapsedMs } from './time';
export type { DayPhase } from './time';

export {
  STAT_IDS,
  STAT_BASE,
  CREATION_STAT_POINTS,
  MAX_POINTS_PER_STAT,
  CAP_NORMAL,
  CAP_CLEAN,
  CAP_TEMPORARY,
  MAX_LEVEL,
  emptyPoints,
  derive,
  damageMultiplier,
  applyCap,
  cellsPerOd,
} from './stats';
export type { StatId, StatBlock, DerivedInput, DerivedStats } from './stats';

export { RACES, sideOf, finalStat, createCharacter } from './character';
export type {
  Controller,
  SideId,
  RaceId,
  RaceDef,
  Appearance,
  CharacterDraft,
  CreateError,
} from './character';

export {
  clampUpy,
  replacementRate,
  garble,
  chatPresentation,
  canCraftLanguage,
  questLanguageAccess,
  gainUpy,
} from './language';
export type { LanguageId, UpyState, UpyGain } from './language';

export {
  GRADE_IDS,
  EQUIP_SLOTS,
  IMPLANT_SLOTS,
  GRADES,
  STARTING_DURABILITY,
  WEAR_LOSS,
  AMMO_WEIGHT_KG,
  SPECIAL_AMMO_WEIGHT_MIN_KG,
  SPECIAL_AMMO_WEIGHT_MAX_KG,
  itemStatValue,
  applyWear,
  wearFor,
  effectiveBonuses,
  speedMultiplier,
  canEquip,
  specialAmmoWeightKg,
} from './items';
export type {
  GradeId,
  EquipSlot,
  ImplantSlot,
  GradeDef,
  WearKind,
  StandardAmmoKind,
  ItemBonus,
  EquipAttempt,
  EquipError,
} from './items';

export {
  socketCount,
  installDurationMs,
  installGold,
  startInstall,
  advanceRelic,
  removeRelic,
  relicBonuses,
} from './relics';
export type { RelicSubtype, RelicState, RelicError } from './relics';

export {
  progressionSlots,
  nnCostProgram,
  nnCostCore,
  nnUsed,
  NEUROSHOCK_FACTOR,
  neuroshock,
  neuroshockScale,
  effectMultiplier,
  installEcho,
  learnPath,
  tickForgetting,
  recoverForgetting,
  equipCore,
  unequipCore,
  breakClean,
  beginPurify,
  completePurify,
} from './build';
export type { ProgramKind, Program, CoreRef, BuildState, BuildError } from './build';

export { UNARMED_DAMAGE, limbMax, resolveAttack, orderByInitiative } from './combat';
export type { LimbId, Combatant, AttackInput, AttackError, AttackResult } from './combat';

export {
  STATUS_IDS,
  STATUS_DIFFICULTY,
  STATUS_DURATION_SECONDS,
  MUTATION_EFFECTS,
  statusDifficulty,
  statusDurationMs,
  rollMutationEffect,
  statusResist,
  tryApplyStatus,
  tickStatuses,
} from './status';
export type { StatusId, StatusInstance, MutationEffect } from './status';

export {
  DIRS,
  DOWNED_CRAWL_MS,
  step,
  chebyshev,
  cellsFor,
  move,
  shortestPath,
  escaped,
} from './movement';
export type { Dir, Cell, MoveError } from './movement';

export {
  CORPSE_MS,
  LOGOUT_GRACE_MS,
  REVIVE_HP_RATIO,
  WAR_RESPAWN_DELAY_MS,
  fallDown,
  takeFromCorpse,
  revive,
  respawnAtBind,
  warRespawnReady,
  respawn,
  warRespawnNode,
  warRespawnRole,
} from './death';
export type { LootStack as CorpseLootStack, Corpse, LifeState } from './death';

export {
  xpToNext,
  monsterXp,
  splitXp,
  pvpXp,
  grantXp,
  spendPoint,
  itemTier,
  pvpXpAllowed,
} from './progression';
export type { MonsterKind, Progress } from './progression';

export {
  SKILL_OPEN_GOLD,
  SKILL_MASTER_GOLD,
  CRAFT_LANGUAGE_MIN,
  STATION_BY_SKILL,
  UNCRAFTABLE_OUTPUTS,
  maxItemLevel,
  gradeWeights,
  rollGrade,
  craftDurationMs,
  trainSkill,
  buySkillLevel,
  startCraft,
  salvage,
} from './craft';
export type {
  CraftSkill,
  StationId,
  MaterialQuality,
  CraftKind,
  SkillState,
  UncraftableOutput,
  CraftError,
  SalvageError,
  SkillBuyError,
  StartCraftInput,
  StartedCraft,
} from './craft';

export {
  GOLD_COEFFICIENT,
  UNIQUE_COMPONENT_CHANCE,
  goldAmount,
  gearItemLevel,
  rollLoot,
  openChest,
} from './loot';
export type { LootKind, LootGrade, ChestTier, LootEntry, LootStack } from './loot';

export {
  NODE_IDS,
  NODES,
  isNodeId,
  respawnDurationMs,
  gatherSeconds,
  rollGather,
  refine,
  advanceRespawn,
  wearTool,
} from './gathering';
export type { ToolId, ToolKind, Quality, NodeId, GatherNode } from './gathering';

export {
  WALLET_CAP,
  GUILD_BANK_CAP,
  AUCTION_TAX,
  AUCTION_LOT_MS,
  AUCTION_LOT_LIMIT,
  STARTER_GOLD,
  STASH_BASE_SLOTS,
  STASH_EXPAND_SLOTS,
  STASH_EXPAND_GOLD,
  STASH_SLOT_CAP,
  STASH_MAX_PURCHASES,
  CITY_FEE_MIN,
  CITY_FEE_MAX,
  SERVICE_CUT_PERCENT,
  PORTAL_BLOCK_MS,
  basePrice,
  sellToNpc,
  buyFromNpc,
  repairCost,
  deposit,
  portalFee,
  ownedCrossingFee,
  setCityFee,
  serviceCut,
  askHostilePortal,
  placeBid,
  sellerProceeds,
  auctionTaxSink,
  trade,
  materialGold,
  expandStash,
  STORAGE_GOLD_PER_SLOT_DAY,
  CITY_SERVICES,
  rentStorage,
  isCityService,
} from './economy';
export type { AuctionTaxSink, PortalStance, CityService } from './economy';

export {
  ACTIVE_QUEST_LIMIT,
  DAILY_QUEST_LIMIT,
  QUEST_OBJECTIVE_KINDS,
  QUEST_DIFFICULTY_COEFFICIENT,
  utcDayStartMs,
  questReward,
  acceptQuest,
  advance,
  turnIn,
  abandon,
  failExpired,
  recordChoice,
  branchScene,
  setWorldFlagOnce,
} from './quests';
export type {
  QuestObjectiveKind,
  QuestDifficulty,
  QuestStatus,
  QuestObjective,
  QuestProgress,
  WorldQuestFlags,
  WorldQuestFlag,
} from './quests';

export { INSTANCE_TTL_MS, generateDungeon, sameSeedWindow, difficultyMultipliers } from './dungeon';
export type { DungeonSize, RoomKind, Room, DungeonLayout } from './dungeon';

export {
  PROTOTYPE_NODE_IDS,
  prototypeWorld,
  neighbors,
  inCitySafeRadius,
  pvpAllowed,
  canWalk,
  canBind,
  canPortal,
} from './world';
export type { NodeKind, WorldNode, WorldEdge, PrototypeNodeId } from './world';

export {
  chatBypass,
  CHAT_TEXT_MAX,
  MAIL_SUBJECT_MAX,
  MAIL_BODY_MAX,
  PARTY_MAX,
  deliverChat,
  sendMail,
  invite,
  leave,
  matchmake,
  bumpReputation,
  reputationTier,
} from './social';
export type {
  ChatChannel,
  ChatMode,
  ChatDelivery,
  PartyRole,
  PartyMember,
  Party,
  MatchCandidate,
  ReputationEvent,
} from './social';

export { readWiki, writeProse, writeBotEntry, vote } from './wiki';
export type { WikiArticleSide, WikiReaderSide, WikiVoteValue, WikiBotEntry } from './wiki';

export {
  GUILD_CREATE_GOLD,
  GUILD_CREATE_SIZE,
  GUILD_MIN_LEVEL,
  OFFICE_COOLDOWN_MS,
  REVOTE_MS,
  NOVICE_LOCK_MS,
  WAR_GOLD,
  WAR_RESOURCES,
  NEUTRAL_CAPTURE_GOLD,
  NEUTRAL_GUARD_COUNT,
  WAR_LEAD_MS,
  CONTENDER_GOLD,
  CONTENDER_CLOSE_MS,
  WAR_MUSTER_MS,
  WAR_ASSAULT_MS,
  WAR_HOLD_MS,
  WAR_FINISH_MS,
  CITY_CAPTURE_COOLDOWN_MS,
  DRAW_WAR_COOLDOWN_MS,
  GUILD_WAR_COOLDOWN_MS,
  DOCTRINE_COOLDOWN_MS,
  DOCTRINE_MULTIPLIER,
  GUILD_BANK_SLOTS,
  GUILD_RANKS,
  RANK_LIMIT,
  WITHDRAW_PERCENT,
  DOCTRINE_IDS,
  DOCTRINE_RESOURCES,
  DOCTRINE_COST,
  DOCTRINE_AFFECTS,
  CONTRACT_TYPES,
  createGuild,
  founderRanks,
  castLeaderVote,
  canVote,
  seatRank,
  depositBank,
  withdraw,
  declareWar,
  declareNeutralCapture,
  registerContender,
  warPhase,
  assaultWindowMs,
  holdWins,
  advanceHold,
  warWinner,
  settleWar,
  doctrineMultiplier,
  applyDoctrine,
  setDoctrine,
  postContract,
  canDissolve,
  dissolveShares,
  NODE_PLANT_MS,
  NODE_DROP_MS,
  NODE_CHEST_CAP,
  NODE_TAX_MAX,
  NODE_TAX_OFFICER_MAX,
  NODE_TAX_COOLDOWN_MS,
  freshResourceNode,
  advanceResourceNode,
  depositNodeChest,
  setNodeTax,
  setNodeAccess,
  nodeAccessCategory,
  nodeAccessAllows,
  NODE_ACCESS_CATEGORIES,
  settleNodeDrop,
  PACT_MS,
  ALLIANCE_BREAK_MS,
  VASSAL_TAX_MIN,
  VASSAL_TAX_MAX,
  NAP_BREACH_GOLD,
  NAP_FLAG_MS,
  VASSAL_RELEASE_MS,
  PACT_KINDS,
  MERCENARY_KINDS,
  PATROL_QUEST_MS,
  PATROL_QUEST_GOLD,
  coalitionBank,
  formPact,
  pactLive,
  pactAlly,
  breakAlliance,
  releaseVassal,
  noticeAllianceBreak,
  noticeVassalRelease,
  renewPact,
  suzerainDefenders,
  coalitionChannel,
  vassalMayDeclare,
  applyVassalTithe,
  titheDays,
  breachNonAggression,
  failSuzerainDefense,
  allianceFriendlyFire,
  napBetween,
  postMercenary,
  escortArrived,
  postPatrolQuest,
  tickContract,
} from './guild';
export type {
  GuildRank,
  DoctrineId,
  DoctrineResource,
  DoctrineAffect,
  DoctrineCost,
  ContractType,
  GuildCode,
  GuildDraft,
  GuildFounder,
  RankCounts,
  WarPhase,
  WarOutcome,
  LeaderElection,
  NodeAccess,
  ResourceNode,
  PactKind,
  GuildPact,
  MercenaryKind,
  ContractStatus,
} from './guild';

export { HACK_ALPHABET, LOCKOUT_MS, hackDifficulty, silenceMs, newHack, guess } from './hack';
export type { KeeperKind } from './hack';

export {
  EPOCH_MS,
  DAY_MS,
  MONTH_DAYS,
  YEAR_DAYS,
  SEASON_DAYS,
  SEASON_SPAWN_MULTIPLIER,
  SEASON_RESOURCE_BONUS,
  ANNOUNCE_LEAD_MS,
  RESOURCE_NODES_CLOSED_MS,
  WEATHER_IDS,
  monthAt,
  monthDayAt,
  seasonAt,
  seasonResource,
  seasonSpawnTag,
  seasonWeatherBonus,
  spawnMultiplier,
  spawnMultiplierForTags,
  holidayAt,
  holidayMultiplier,
  weatherDurationMinutes,
  applyWeather,
  weatherEffect,
  invasionPhase,
  nextWaveMultiplier,
  invasionRepelled,
  resourceNodesClosedUntil,
  invasionReward,
} from './events';
export type {
  SeasonId,
  SeasonResource,
  HolidayId,
  HolidayStat,
  InvasionPhase,
  InvasionRewardKind,
  InvasionReward,
  WeatherId,
} from './events';

export {
  MEMORY_CAP,
  WORKING_MEMORY,
  OBSERVATION_BLOCK_ORDER,
  BLOCK_LENGTHS,
  OBSERVATION_LENGTH,
  BLOCK_OFFSETS,
  GRID_SIZE,
  CELL_FEATURE_ORDER,
  ACTOR_SLOTS,
  ACTOR_SLOT_LENGTH,
  ACTOR_FEATURE_ORDER,
  OBJECT_SLOTS,
  OBJECT_SLOT_LENGTH,
  ACTION_IDS,
  encodeActorFeatures,
  encodeObservation,
  utilityAction,
} from './ai';
export type { ObservationBlock, ObservationParts, ActionId, UtilityInput } from './ai';

export {
  MUTE_1H_MS,
  CHAT_BAN_MS,
  classifyMessage,
  sanctionForCheatStrikes,
  falseReportSanction,
} from './moderation';
export type { Sanction } from './moderation';

export {
  PLAIN_ALPHABET,
  CIPHER_GLYPHS,
  buildPermutation,
  encodeAncient,
  decodeAncient,
  botRecord,
  renderFragment,
  decipherAttempt,
} from './ancient';
export type {
  AncientFragment,
  KnownLetterPair,
  RenderedFragment,
  DecipherSuccess,
} from './ancient';
