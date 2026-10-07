import { expect, test } from 'vitest';
import { CHAT_BAN_MS, MUTE_1H_MS } from '@rift/domain/moderation';
import { CHAT_TEXT_MAX } from '@rift/domain/social';
import { createBus, type DomainEventMap } from '../../shared/bus';
import { manualClock } from '../../shared/clock';
import { createSocialModule } from './index';

const START_MS = 1_700_000_000_000;

function harness() {
  const bus = createBus();
  const clock = manualClock(START_MS);
  const social = createSocialModule();
  const events: DomainEventMap['chat.message'][] = [];
  bus.on('chat.message', (event) => {
    events.push(event);
  });
  social.start({ bus, now: () => clock.now() });
  return { clock, social, service: social.service, events };
}

test('local chat at listener UPY 0 keeps the sender text in raw mode', async () => {
  const { service, events } = harness();
  const senderLanguage = 'common_dark' as const;
  const listenerLanguage = 'common_light' as const;
  expect(senderLanguage).not.toBe(listenerLanguage);

  service.register({ id: 'speaker', nodeId: 'square', language: senderLanguage, upy: 0 });
  service.register({ id: 'listener', nodeId: 'square', language: listenerLanguage, upy: 0 });
  service.register({ id: 'outsider', nodeId: 'other', language: listenerLanguage, upy: 0 });

  const text = 'Ab hello';
  const result = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text,
    nowMs: START_MS,
  });

  expect(result).toEqual({ ok: true, value: { delivered: 2 } });
  expect(service.inbox('listener')).toEqual([
    { channel: 'local', senderId: 'speaker', text, mode: 'raw' },
  ]);
  expect(service.inbox('speaker')).toEqual([
    { channel: 'local', senderId: 'speaker', text, mode: 'raw' },
  ]);
  expect(service.inbox('outsider')).toEqual([]);
  expect(events).toEqual([{ channel: 'local', senderId: 'speaker' }]);
  expect(service.sanctionOf('speaker')).toBe('none');
});

test('party chat at UPY 0 delivers the original string', async () => {
  const { service, events } = harness();
  service.register({ id: 'leader', nodeId: 'square', language: 'common_dark', upy: 0 });
  service.register({ id: 'mate', nodeId: 'far', language: 'common_light', upy: 0 });
  service.register({ id: 'novice', nodeId: 'far', language: 'common_light', upy: 10 });

  expect(await service.invite('leader', 'mate', 'damage')).toEqual({ ok: true, value: undefined });
  expect(await service.invite('leader', 'novice', 'support')).toEqual({
    ok: true,
    value: undefined,
  });

  const text = 'Ab';
  const result = await service.say({
    senderId: 'leader',
    channel: 'party',
    text,
    nowMs: START_MS,
  });

  expect(result).toEqual({ ok: true, value: { delivered: 3 } });
  expect(service.inbox('mate')).toEqual([
    { channel: 'party', senderId: 'leader', text, mode: 'raw' },
  ]);
  expect(service.inbox('mate')[0]?.text).toBe(text);
  expect(service.inbox('novice')).toEqual([
    { channel: 'party', senderId: 'leader', text: 'Ab', mode: 'raw' },
  ]);
  expect(events).toEqual([{ channel: 'party', senderId: 'leader' }]);
});

test('mail and guild channels and titles are feature stubs and write nothing', async () => {
  const { service, events } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });
  service.register({ id: 'listener', nodeId: 'square', language: 'common_dark', upy: 100 });

  const mail = await service.say({
    senderId: 'speaker',
    channel: 'mail',
    text: 'a letter',
    nowMs: START_MS,
  });
  const guild = await service.say({
    senderId: 'speaker',
    channel: 'guild',
    text: 'a letter',
    nowMs: START_MS,
  });

  expect(mail).toEqual({ ok: false, code: 'feature_stub' });
  expect(guild).toEqual({ ok: false, code: 'feature_stub' });
  expect(service.grantTitle()).toEqual({ ok: false, code: 'feature_stub' });
  expect(service.inbox('speaker')).toEqual([]);
  expect(service.inbox('listener')).toEqual([]);
  expect(events).toEqual([]);
  expect(service.sanctionOf('speaker')).toBe('none');
});

test('the fifth identical message does not increase delivered', async () => {
  const { service, events } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });
  service.register({ id: 'listener', nodeId: 'square', language: 'common_dark', upy: 0 });

  let delivered = 0;
  for (let index = 0; index < 4; index += 1) {
    const result = await service.say({
      senderId: 'speaker',
      channel: 'local',
      text: 'same',
      nowMs: START_MS + index * 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      delivered += result.value.delivered;
    }
  }

  expect(delivered).toBe(8);
  expect(service.inbox('listener')).toHaveLength(4);
  expect(events).toHaveLength(4);

  const fifth = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'same',
    nowMs: START_MS + 400,
  });

  expect(fifth).toEqual({ ok: true, value: { delivered: 0 } });
  expect(service.inbox('listener')).toHaveLength(4);
  expect(service.inbox('speaker')).toHaveLength(4);
  expect(events).toHaveLength(4);
  expect(service.sanctionOf('speaker')).toBe('mute_1h');
});

test('an identical line after the spam window is delivered once the mute has expired', async () => {
  const { service } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });
  service.register({ id: 'listener', nodeId: 'square', language: 'common_dark', upy: 0 });

  for (let index = 0; index < 4; index += 1) {
    const result = await service.say({
      senderId: 'speaker',
      channel: 'local',
      text: 'same',
      nowMs: START_MS + index,
    });
    expect(result).toEqual({ ok: true, value: { delivered: 2 } });
  }

  const later = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'same',
    nowMs: START_MS + 11_000,
  });
  expect(later).toEqual({ ok: true, value: { delivered: 2 } });
  expect(service.sanctionOf('speaker')).toBe('none');
});

test('eight messages inside ten seconds do not deliver the eighth', async () => {
  const { service } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });

  for (let index = 0; index < 7; index += 1) {
    const result = await service.say({
      senderId: 'speaker',
      channel: 'local',
      text: `line-${index}`,
      nowMs: START_MS + index,
    });
    expect(result).toEqual({ ok: true, value: { delivered: 1 } });
  }

  const eighth = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'line-7',
    nowMs: START_MS + 7,
  });
  expect(eighth).toEqual({ ok: true, value: { delivered: 0 } });
  expect(service.inbox('speaker')).toHaveLength(7);
});

test('a clean line from a muted character is not delivered', async () => {
  const { service } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });
  service.register({ id: 'listener', nodeId: 'square', language: 'common_dark', upy: 0 });

  for (let index = 0; index < 5; index += 1) {
    await service.say({
      senderId: 'speaker',
      channel: 'local',
      text: 'same',
      nowMs: START_MS + index,
    });
  }

  const blocked = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'a different sentence',
    nowMs: START_MS + 5,
  });
  expect(blocked).toEqual({ ok: false, code: 'muted' });
  expect(service.inbox('listener')).toHaveLength(4);
});

test('repeated automutes escalate to a seven day chat ban', async () => {
  const { service } = harness();
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });

  const burst = async (text: string, nowMs: number) => {
    for (let index = 0; index < 4; index += 1) {
      const sent = await service.say({
        senderId: 'speaker',
        channel: 'local',
        text,
        nowMs: nowMs + index,
      });
      expect(sent).toEqual({ ok: true, value: { delivered: 1 } });
    }
    return service.say({
      senderId: 'speaker',
      channel: 'local',
      text,
      nowMs: nowMs + 4,
    });
  };

  expect(await burst('one', START_MS)).toEqual({ ok: true, value: { delivered: 0 } });
  expect(service.sanctionOf('speaker')).toBe('mute_1h');

  const secondAt = START_MS + MUTE_1H_MS + 1_000;
  expect(await burst('two', secondAt)).toEqual({ ok: true, value: { delivered: 0 } });
  expect(service.sanctionOf('speaker')).toBe('mute_1h');

  const thirdAt = secondAt + MUTE_1H_MS + 1_000;
  expect(await burst('three', thirdAt)).toEqual({ ok: true, value: { delivered: 0 } });
  expect(service.sanctionOf('speaker')).toBe('chat_ban_7d');

  const duringBan = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'hello again',
    nowMs: thirdAt + 10,
  });
  expect(duringBan).toEqual({ ok: false, code: 'muted' });

  const afterBan = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'hello again',
    nowMs: thirdAt + 4 + CHAT_BAN_MS,
  });
  expect(afterBan).toEqual({ ok: true, value: { delivered: 1 } });
});

test('invite fills a party of four and rejects the fifth', async () => {
  const { service } = harness();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    service.register({ id, nodeId: 'square', language: 'common_light', upy: 0 });
  }

  expect(await service.invite('a', 'b', 'tank')).toEqual({ ok: true, value: undefined });
  expect(await service.invite('a', 'c', 'damage')).toEqual({ ok: true, value: undefined });
  expect(await service.invite('a', 'd', 'support')).toEqual({ ok: true, value: undefined });

  expect(service.partyOf('a')).toEqual({
    leaderId: 'a',
    members: [
      { id: 'a', role: 'flex' },
      { id: 'b', role: 'tank' },
      { id: 'c', role: 'damage' },
      { id: 'd', role: 'support' },
    ],
  });

  expect(await service.invite('a', 'e', 'flex')).toEqual({ ok: false, code: 'full' });
  expect(service.partyOf('a')?.members).toHaveLength(4);
  expect(service.partyOf('e')).toBeNull();

  const said = await service.say({
    senderId: 'a',
    channel: 'party',
    text: 'roll',
    nowMs: START_MS,
  });
  expect(said).toEqual({ ok: true, value: { delivered: 4 } });
  expect(service.inbox('e')).toEqual([]);
});

test('a duplicate invite of a full party is duplicate', async () => {
  const { service } = harness();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    service.register({ id, nodeId: 'square', language: 'common_light', upy: 0 });
  }
  expect((await service.invite('a', 'b', 'tank')).ok).toBe(true);
  expect((await service.invite('a', 'c', 'damage')).ok).toBe(true);
  expect((await service.invite('a', 'd', 'support')).ok).toBe(true);

  expect(await service.invite('a', 'b', 'tank')).toEqual({ ok: false, code: 'duplicate' });
  expect(await service.invite('a', 'e', 'flex')).toEqual({ ok: false, code: 'full' });
  expect(service.partyOf('a')?.members).toHaveLength(4);
});

test('the leader leaving hands leadership to the first remaining member', async () => {
  const { service } = harness();
  for (const id of ['a', 'b', 'c', 'd']) {
    service.register({ id, nodeId: 'square', language: 'common_light', upy: 0 });
  }
  await service.invite('a', 'b', 'tank');
  await service.invite('a', 'c', 'damage');
  await service.invite('a', 'd', 'support');

  expect(await service.leave('a')).toEqual({ ok: true, value: undefined });
  expect(service.partyOf('b')).toEqual({
    leaderId: 'b',
    members: [
      { id: 'b', role: 'tank' },
      { id: 'c', role: 'damage' },
      { id: 'd', role: 'support' },
    ],
  });
  expect(service.partyOf('a')).toBeNull();
  expect(await service.invite('c', 'a', 'flex')).toEqual({ ok: false, code: 'not_leader' });

  const said = await service.say({
    senderId: 'b',
    channel: 'party',
    text: 'still',
    nowMs: START_MS,
  });
  expect(said).toEqual({ ok: true, value: { delivered: 3 } });
  expect(service.inbox('a')).toEqual([]);
});

test('trade chat reaches the same node and an empty line is rejected', async () => {
  const { service, events } = harness();
  service.register({ id: 'speaker', nodeId: 'market', language: 'common_light', upy: 0 });
  service.register({ id: 'listener', nodeId: 'market', language: 'common_dark', upy: 0 });
  service.register({ id: 'outsider', nodeId: 'alley', language: 'common_dark', upy: 0 });

  const said = await service.say({
    senderId: 'speaker',
    channel: 'trade',
    text: 'wtb sword',
    nowMs: START_MS,
  });
  expect(said).toEqual({ ok: true, value: { delivered: 2 } });
  expect(service.inbox('listener')[0]?.text).toBe('wtb sword');
  expect(service.inbox('outsider')).toEqual([]);
  expect(events).toEqual([{ channel: 'trade', senderId: 'speaker' }]);

  const empty = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: '',
    nowMs: START_MS + 1,
  });
  const overlong = await service.say({
    senderId: 'speaker',
    channel: 'local',
    text: 'x'.repeat(CHAT_TEXT_MAX + 1),
    nowMs: START_MS + 2,
  });
  expect(empty).toEqual({ ok: false, code: 'empty' });
  expect(overlong).toEqual({ ok: false, code: 'empty' });
  expect(events).toHaveLength(1);
});

test('say before start throws and does not read Date.now or Math.random', async () => {
  const unstarted = createSocialModule();
  unstarted.service.register({
    id: 'speaker',
    nodeId: 'square',
    language: 'common_light',
    upy: 0,
  });
  await expect(
    unstarted.service.say({
      senderId: 'speaker',
      channel: 'local',
      text: 'hi',
      nowMs: START_MS,
    }),
  ).rejects.toThrow(/not started/);

  const { clock, service, social } = harness();
  expect(social.name).toBe('social');
  service.register({ id: 'speaker', nodeId: 'square', language: 'common_light', upy: 0 });
  service.register({ id: 'mate', nodeId: 'square', language: 'common_dark', upy: 0 });

  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => {
    throw new Error('Date.now must not be read');
  };
  Math.random = () => {
    throw new Error('Math.random must not be read');
  };
  try {
    clock.advance(100);
    const said = await service.say({
      senderId: 'speaker',
      channel: 'local',
      text: 'Ab',
      nowMs: clock.now(),
    });
    expect(said).toEqual({ ok: true, value: { delivered: 2 } });
    expect(await service.invite('speaker', 'mate', 'flex')).toEqual({ ok: true, value: undefined });
    expect(service.grantTitle()).toEqual({ ok: false, code: 'feature_stub' });
    expect(await service.leave('speaker')).toEqual({ ok: true, value: undefined });
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
});
