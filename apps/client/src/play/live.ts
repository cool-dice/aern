import type { ClientStore } from '../state/store';

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface LiveResponse {
  ok: boolean;
  body: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: Record<string, unknown>,
): Promise<LiveResponse> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, body: asRecord(await response.json()) };
}

/** Posts `/craft/start` and writes the job onto the store. */
export async function startCraft(input: {
  server: string;
  characterId: string;
  recipeId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const posted = await postJson(input.fetchImpl ?? fetch, `${input.server}/craft/start`, {
    characterId: input.characterId,
    recipeId: input.recipeId,
    itemLevel: 1,
  });
  input.store.getState().setCraftJob(posted.body);
  const jobId = typeof posted.body.jobId === 'string' ? posted.body.jobId : 'error';
  input.store.getState().pushLog(posted.ok ? `craft:${jobId}` : `craft:${String(posted.body.code ?? 'error')}`);
  return posted;
}

/**
 * Posts `/trade` then `/trade/accept` for the same character and stores both bodies.
 * The accept uses the offer's `tradeId`.
 */
export async function completeTrade(input: {
  server: string;
  characterId: string;
  counterpartyId: string;
  gold: number;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const offered = await postJson(fetchImpl, `${input.server}/trade`, {
    characterId: input.characterId,
    counterpartyId: input.counterpartyId,
    gold: input.gold,
    items: {},
  });
  if (!offered.ok || typeof offered.body.tradeId !== 'string') {
    input.store.getState().setTradeResult({ offer: offered.body });
    input.store.getState().pushLog(`trade:${String(offered.body.code ?? 'error')}`);
    return offered;
  }
  const accepted = await postJson(fetchImpl, `${input.server}/trade/accept`, {
    characterId: input.characterId,
    tradeId: offered.body.tradeId,
  });
  input.store.getState().setTradeResult({ offer: offered.body, accept: accepted.body });
  const status = typeof accepted.body.status === 'string' ? accepted.body.status : 'error';
  input.store.getState().pushLog(accepted.ok ? `trade:${status}` : `trade:${String(accepted.body.code ?? 'error')}`);
  return accepted;
}

/**
 * Posts `/portal/ask`. A neutral asking a guild-owned city is refused until
 * the owner grants them or the 24-hour block lifts. An allowed ask then portals.
 */
export async function askPortal(input: {
  server: string;
  characterId: string;
  toNodeId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const posted = await postJson(input.fetchImpl ?? fetch, `${input.server}/portal/ask`, {
    characterId: input.characterId,
    toNodeId: input.toNodeId,
  });
  input.store.getState().setPortalResult(posted.body);
  const nodeId = typeof posted.body.nodeId === 'string' ? posted.body.nodeId : String(posted.body.code ?? 'error');
  input.store.getState().pushLog(posted.ok ? `portal-ask:${nodeId}` : `portal-ask:${nodeId}`);
  return posted;
}

/** Posts `/portal` and stores the fee, cooldown, and destination. */
export async function startPortal(input: {
  server: string;
  characterId: string;
  toNodeId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const posted = await postJson(input.fetchImpl ?? fetch, `${input.server}/portal`, {
    characterId: input.characterId,
    toNodeId: input.toNodeId,
  });
  input.store.getState().setPortalResult(posted.body);
  const nodeId = typeof posted.body.nodeId === 'string' ? posted.body.nodeId : String(posted.body.code ?? 'error');
  input.store.getState().pushLog(posted.ok ? `portal:${nodeId}` : `portal:${nodeId}`);
  return posted;
}

/**
 * Posts `/dungeon`. A shared `groupId` and party size place both characters
 * on the seed for that window. Party size 1 is a solo enter.
 */
export async function enterDungeon(input: {
  server: string;
  characterId: string;
  store: ClientStore;
  groupId: string;
  partySize: number;
  nodeId?: string;
  edgeId?: string;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const posted = await postJson(input.fetchImpl ?? fetch, `${input.server}/dungeon`, {
    characterId: input.characterId,
    nodeId: input.nodeId ?? 'light_dungeon',
    edgeId: input.edgeId ?? 'edge_light__fort_humans',
    groupId: input.groupId,
    partySize: input.partySize,
  });
  input.store.getState().setDungeonResult(posted.body);
  const instanceId = typeof posted.body.instanceId === 'string' ? posted.body.instanceId : String(posted.body.code ?? 'error');
  input.store.getState().pushLog(posted.ok ? `dungeon:${instanceId}` : `dungeon:${instanceId}`);
  return posted;
}

async function postService(input: {
  server: string;
  path: string;
  body: Record<string, unknown>;
  store: ClientStore;
  fetchImpl?: FetchLike;
  log: string;
}): Promise<LiveResponse> {
  const posted = await postJson(input.fetchImpl ?? fetch, `${input.server}${input.path}`, input.body);
  input.store.getState().setServiceResult({ route: input.path, ...posted.body });
  const code = typeof posted.body.code === 'string' ? posted.body.code : input.log;
  input.store.getState().pushLog(posted.ok ? `${input.log}:ok` : `${input.log}:${code}`);
  return posted;
}

/** Posts `/city-fee` and stores the fee the owner set. */
export async function setCityFee(input: {
  server: string;
  guildId: string;
  cityId: string;
  fee: number;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/city-fee',
    body: { guildId: input.guildId, cityId: input.cityId, fee: input.fee },
    store: input.store,
    log: 'city-fee',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/node/tax`. The server applies the officer cap. */
export async function setNodeTax(input: {
  server: string;
  guildId: string;
  nodeId: string;
  characterId: string;
  taxPercent: number;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/node/tax',
    body: {
      guildId: input.guildId,
      nodeId: input.nodeId,
      characterId: input.characterId,
      taxPercent: input.taxPercent,
    },
    store: input.store,
    log: 'node-tax',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/node/access` and stores the access mode. */
export async function setNodeAccess(input: {
  server: string;
  guildId: string;
  nodeId: string;
  category: 'allies' | 'guilds' | 'neutrals';
  access: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/node/access',
    body: {
      guildId: input.guildId,
      nodeId: input.nodeId,
      category: input.category,
      access: input.access,
    },
    store: input.store,
    log: 'node-access',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/node/grant` and stores the grant. */
export async function grantNode(input: {
  server: string;
  guildId: string;
  nodeId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/node/grant',
    body: { guildId: input.guildId, nodeId: input.nodeId, characterId: input.characterId },
    store: input.store,
    log: 'node-grant',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/storage`. One slot for one day debits 1 gold. */
export async function rentStorage(input: {
  server: string;
  characterId: string;
  cityId: string;
  slots: number;
  days: number;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/storage',
    body: { characterId: input.characterId, cityId: input.cityId, slots: input.slots, days: input.days },
    store: input.store,
    log: 'storage',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/war`. `GuildService.declareWar` is the live route. */
export async function declareWar(input: {
  server: string;
  attackerGuildId: string;
  cityId: string;
  store: ClientStore;
  leaderConsent?: boolean;
  councilConsents?: number;
  resources?: number;
  suzerainConsent?: boolean;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/war',
    body: {
      attackerGuildId: input.attackerGuildId,
      cityId: input.cityId,
      leaderConsent: input.leaderConsent ?? true,
      councilConsents: input.councilConsents ?? 2,
      resources: input.resources ?? 20_000,
      suzerainConsent: input.suzerainConsent ?? false,
    },
    store: input.store,
    log: 'war',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/**
 * Posts `/guild/withdraw`. Above 10% of `bank` the body includes `leaderConfirm`
 * and `councilConfirms`. Above 25% it also includes `councilVote`. A large
 * withdrawal is not sent as `amount` alone.
 */
export async function withdrawBank(input: {
  server: string;
  guildId: string;
  characterId: string;
  amount: number;
  bank?: number;
  leaderConfirm?: boolean;
  councilConfirms?: number;
  councilVote?: boolean;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  const over10 = input.bank !== undefined && input.amount > Math.floor((input.bank * 10) / 100);
  const over25 = input.bank !== undefined && input.amount > Math.floor((input.bank * 25) / 100);
  return postService({
    server: input.server,
    path: '/guild/withdraw',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      amount: input.amount,
      ...(over10
        ? {
            leaderConfirm: input.leaderConfirm ?? true,
            councilConfirms: input.councilConfirms ?? 2,
          }
        : {}),
      ...(over25 ? { councilVote: input.councilVote ?? true } : {}),
    },
    store: input.store,
    log: 'withdraw',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/doctrine`. Changing doctrine needs the leader and the council. */
export async function postDoctrine(input: {
  server: string;
  guildId: string;
  characterId: string;
  doctrine: string;
  store: ClientStore;
  leaderConfirm?: boolean;
  councilConfirms?: number;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/doctrine',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      doctrine: input.doctrine,
      leaderConfirm: input.leaderConfirm ?? true,
      councilConfirms: input.councilConfirms ?? 1,
    },
    store: input.store,
    log: 'doctrine',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/bank` and stores the operation rows for a guild member. */
export async function readBankLog(input: {
  server: string;
  guildId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/bank',
    body: { guildId: input.guildId, characterId: input.characterId },
    store: input.store,
    log: 'bank-log',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/contract`. The board is a hub or a city. A kill below level 10 is refused. */
export async function postContractBoard(input: {
  server: string;
  characterId: string;
  type: string;
  rewardGold: number;
  targetLevel: number;
  store: ClientStore;
  targetIsMember?: boolean;
  rewardResources?: number;
  rewardRelics?: number;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/contract',
    body: {
      characterId: input.characterId,
      type: input.type,
      rewardGold: input.rewardGold,
      targetLevel: input.targetLevel,
      targetIsMember: input.targetIsMember ?? false,
      ...(input.rewardResources !== undefined ? { rewardResources: input.rewardResources } : {}),
      ...(input.rewardRelics !== undefined ? { rewardRelics: input.rewardRelics } : {}),
    },
    store: input.store,
    log: 'contract',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/mercenary`. The tick pays or fails the contract. */
export async function postMercenary(input: {
  server: string;
  guildId: string;
  characterId: string;
  mercenaryId: string;
  nodeId: string;
  kind: string;
  rewardGold: number;
  destinationId?: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/mercenary',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      mercenaryId: input.mercenaryId,
      nodeId: input.nodeId,
      kind: input.kind,
      rewardGold: input.rewardGold,
      ...(input.destinationId !== undefined ? { destinationId: input.destinationId } : {}),
    },
    store: input.store,
    log: 'mercenary',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/quest`. Section 8.7: a leader or council member posts a guild quest. */
export async function postGuildQuest(input: {
  server: string;
  guildId: string;
  characterId: string;
  nodeId: string;
  assigneeId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/quest',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      nodeId: input.nodeId,
      assigneeId: input.assigneeId,
    },
    store: input.store,
    log: 'guild-quest',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/patrol`. The default reward is the 3-hour guild patrol. */
export async function postPatrol(input: {
  server: string;
  guildId: string;
  characterId: string;
  nodeId: string;
  assigneeId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/patrol',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      nodeId: input.nodeId,
      assigneeId: input.assigneeId,
    },
    store: input.store,
    log: 'patrol',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/pact/notice`. The alliance still holds for 24 hours; a vassal notice runs 7 days. */
export async function noticePact(input: {
  server: string;
  pactId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/pact/notice',
    body: { pactId: input.pactId, characterId: input.characterId },
    store: input.store,
    log: 'pact-notice',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/pact/break` after the 24-hour notice. The alliance holds until this action. */
export async function breakPact(input: {
  server: string;
  pactId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/pact/break',
    body: { pactId: input.pactId, characterId: input.characterId },
    store: input.store,
    log: 'pact-break',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/coalition`. Only a live coalition has this diplomatic channel. */
export async function postCoalition(input: {
  server: string;
  characterId: string;
  text: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/coalition',
    body: { characterId: input.characterId, text: input.text },
    store: input.store,
    log: 'coalition',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/pact/renew`. Alliances and non-aggression pacts last another 7 days. */
export async function renewPact(input: {
  server: string;
  pactId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/pact/renew',
    body: { pactId: input.pactId, characterId: input.characterId },
    store: input.store,
    log: 'pact-renew',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/vote` with an internal ballot `choice`. Section 3.3 is not a leader candidate. */
export async function castGuildChoice(input: {
  server: string;
  guildId: string;
  voterId: string;
  choice: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/vote',
    body: { guildId: input.guildId, voterId: input.voterId, choice: input.choice },
    store: input.store,
    log: 'choice',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/emblem`. An open leader poll keeps it until that poll closes. */
export async function postGuildEmblem(input: {
  server: string;
  guildId: string;
  characterId: string;
  emblem: string;
  description?: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/emblem',
    body: {
      guildId: input.guildId,
      characterId: input.characterId,
      emblem: input.emblem,
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    store: input.store,
    log: 'emblem',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/vote`. One character, one ballot. The server calls `castLeaderVote`. */
export async function castLeaderVote(input: {
  server: string;
  guildId: string;
  voterId: string;
  candidateId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/vote',
    body: { guildId: input.guildId, voterId: input.voterId, candidateId: input.candidateId },
    store: input.store,
    log: 'vote',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/guild/dissolve`. Leader and council confirmation, then `dissolveShares`. */
export async function dissolveGuild(input: {
  server: string;
  guildId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/guild/dissolve',
    body: { guildId: input.guildId, characterId: input.characterId },
    store: input.store,
    log: 'dissolve',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/node/strike`. Section 8.3 takes the flag down and pockets the chest. */
export async function strikeNode(input: {
  server: string;
  guildId: string;
  nodeId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/node/strike',
    body: { guildId: input.guildId, nodeId: input.nodeId, characterId: input.characterId },
    store: input.store,
    log: 'strike',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}

/** Posts `/war/contend`. Registration costs 10 000 gold and closes one hour before the war. */
export async function registerContender(input: {
  server: string;
  guildId: string;
  warId: string;
  characterId: string;
  store: ClientStore;
  fetchImpl?: FetchLike;
}): Promise<LiveResponse> {
  return postService({
    server: input.server,
    path: '/war/contend',
    body: { guildId: input.guildId, warId: input.warId, characterId: input.characterId },
    store: input.store,
    log: 'contend',
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  });
}
