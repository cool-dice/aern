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
