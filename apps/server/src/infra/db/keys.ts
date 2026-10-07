/** Redis key names and TTLs. Online sets have no TTL. */

export const KEY_TTL_SEC = {
  session: 86_400,
  characterState: 3_600,
  nodeState: 3_600,
  instance: 600,
  lock: 30,
  wikiCache: 300,
  auctionCache: 60,
} as const;

export const ONLINE_CHARACTERS_KEY = 'online:characters';
export const ONLINE_BOTS_KEY = 'online:bots';

export function sessionKey(accountId: string): string {
  return `session:${accountId}`;
}

export function characterStateKey(id: string): string {
  return `state:character:${id}`;
}

export function nodeStateKey(id: string): string {
  return `state:node:${id}`;
}

export function instanceKey(id: string): string {
  return `instance:${id}`;
}

export function lockKey(resource: string): string {
  return `lock:${resource}`;
}

export function wikiCacheKey(id: string): string {
  return `cache:wiki:${id}`;
}

export function auctionCacheKey(city: string): string {
  return `cache:auction:${city}`;
}
