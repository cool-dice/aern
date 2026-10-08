export interface DomainEventMap {
  'character.created': { characterId: string };
  'combat.hit': { attackerId: string; targetId: string; damage: number };
  'character.downed': { characterId: string };
  'item.crafted': { characterId: string; itemId: string };
  'chat.message': { channel: string; senderId: string };
  'quest.completed': { characterId: string; questId: string };
  'ai.rejected': { characterId: string; code: string };
  'gather.completed': { characterId: string; nodeId: string };
  'hack.opened': { characterId: string; kind: string };
  'wiki.written': { articleId: string; authorId: string };
  'build.installed': { characterId: string; kind: string };
}

export interface Bus {
  emit<K extends keyof DomainEventMap>(type: K, payload: DomainEventMap[K]): void;
  on<K extends keyof DomainEventMap>(
    type: K,
    handler: (payload: DomainEventMap[K]) => void,
  ): () => void;
}

type Handler<K extends keyof DomainEventMap> = (payload: DomainEventMap[K]) => void;

type HandlerLists = {
  [K in keyof DomainEventMap]: Handler<K>[];
};

function createHandlerLists(): HandlerLists {
  return {
    'character.created': [],
    'combat.hit': [],
    'character.downed': [],
    'item.crafted': [],
    'chat.message': [],
    'quest.completed': [],
    'ai.rejected': [],
    'gather.completed': [],
    'hack.opened': [],
    'wiki.written': [],
    'build.installed': [],
  };
}

function handlersFor<K extends keyof DomainEventMap>(lists: HandlerLists, type: K): Handler<K>[] {
  return lists[type];
}

export function createBus(): Bus {
  const lists = createHandlerLists();

  return {
    emit(type, payload) {
      // Snapshot so a handler can unsubscribe without skipping later subscribers.
      const snapshot = handlersFor(lists, type).slice();
      for (const handler of snapshot) {
        handler(payload);
      }
    },
    on(type, handler) {
      const bucket = handlersFor(lists, type);
      bucket.push(handler);
      return () => {
        const index = bucket.indexOf(handler);
        if (index >= 0) {
          bucket.splice(index, 1);
        }
      };
    },
  };
}
