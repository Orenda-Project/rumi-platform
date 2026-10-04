/**
 * "Rumi is typing…" on the Matrix channel, end to end inside one process:
 * the message is marked read, Rumi shows as typing while the work runs, and
 * the typing stops the moment a reply lands -- whoever sends it (the handler
 * in the bot, or the worker through the relay). Measured on the rig before
 * this: a reply on a path whose handler never stopped its typing controller
 * left "typing…" on for ~15 s AFTER the answer, and a lesson plan (a worker
 * job of about two minutes) showed no typing at all after the bot's ack.
 *
 * Real matrix-channel.service.js, matrix-events.adapter.js (driven through
 * attach()'s room.message listener) and matrix-outbound-relay.js; only the
 * matrix-bot-sdk client and Redis (the network boundary) are faked.
 */

const OWN = '@rumi:localhost';
const T = '@+15550100001:localhost';
const T_ID = 'mtx:15550100001';
const OTHER = '@+15550100002:localhost';
const DM = '!dm:localhost';
const STAFF = '!staff:localhost';

function fakeRedisServer() {
  const lists = new Map();
  class FakeRedis {
    constructor() { this.closed = false; }

    async lpush(key, value) {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).unshift(value);
      return lists.get(key).length;
    }

    async brpop(key, timeoutSeconds) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (!this.closed) {
        const list = lists.get(key);
        if (list && list.length) return [key, list.pop()];
        if (Date.now() >= deadline) return null;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return null;
    }

    async expire() { return 1; }

    disconnect() { this.closed = true; }
  }
  return { FakeRedis, lists };
}

const member = (userId, membership = 'join') => ({ membershipFor: userId, effectiveMembership: membership });
const ROOM_MEMBERS = {
  [DM]: [member(OWN), member(T)],
  [STAFF]: [member(OWN), member(T), member(OTHER)],
};

const savedRedisUrl = process.env.REDIS_URL;
let relay;
let service;

async function boot({ reply = 'Here is a warm-up idea.' } = {}) {
  jest.resetModules();
  const redis = fakeRedisServer();
  process.env.REDIS_URL = 'redis://fake:6379';
  process.env.MATRIX_ACCESS_TOKEN = 'test-token';
  process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.org';
  jest.doMock('ioredis', () => redis.FakeRedis);
  const logToFile = jest.fn();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile }));
  jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
    remember: jest.fn(), get: jest.fn().mockResolvedValue(null), clear: jest.fn(), resolveSelection: jest.fn(() => null),
  }));
  jest.doMock('../../bot/shared/services/messaging/text-flow', () => ({ isActive: jest.fn(async () => false), advance: jest.fn(async () => null) }));
  jest.doMock('../../bot/shared/services/messaging/text-flow-definitions', () => ({ ensureRegistered: jest.fn() }));
  jest.doMock('../../bot/shared/services/attendance-detector.service', () => ({
    detectAddClassIntent: () => ({ detected: false }), detectAttendanceIntent: () => ({ detected: false }),
  }));

  // Every call the bot makes on the homeserver, in order: what a client sees.
  const wire = [];
  const handlers = {};
  const client = {
    on: jest.fn((event, handler) => { handlers[event] = handler; }),
    sendMessage: jest.fn(async (roomId) => { wire.push(['message', roomId]); return `$sent${Math.random()}`; }),
    sendEvent: jest.fn(async (roomId, type) => { wire.push([type, roomId]); return `$ev${Math.random()}`; }),
    setTyping: jest.fn(async (roomId, typing) => { wire.push([typing ? 'typing:on' : 'typing:off', roomId]); }),
    sendReadReceipt: jest.fn(async (roomId, eventId) => { wire.push(['read', roomId, eventId]); }),
    dms: { getOrCreateDm: jest.fn(async () => DM), isDm: jest.fn((roomId) => roomId === DM) },
    storageProvider: { readValue: jest.fn(async () => null), storeValue: jest.fn(async () => {}) },
    getAllRoomMembers: jest.fn(async (roomId) => ROOM_MEMBERS[roomId] || []),
    getRoomStateEvent: jest.fn(async () => ({ name: 'Staff room' })),
    doRequest: jest.fn(async () => ({})),
    getUserId: jest.fn(async () => OWN),
    getUserProfile: jest.fn(async () => ({ displayname: 'Rumi' })),
    joinRoom: jest.fn(async () => { throw new Error('no welcome room'); }),
    resolveRoom: jest.fn(async () => { throw new Error('no welcome room'); }),
  };
  jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
    getClient: jest.fn(async () => client),
    getCachedUserId: () => OWN,
    isE2eeActive: () => false,
    isJoinedToRoom: () => true,
  }));

  relay = require('../../bot/shared/services/messaging/matrix-outbound-relay');
  relay.ownConnectionInThisProcess();
  service = require('../../bot/shared/services/messaging/matrix-channel.service');
  const adapter = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

  // What handleWebhookPost does for an accepted message, reduced to the
  // typing hook it calls on every driver and the reply.
  const hooks = { during: null, reply };
  const dispatch = jest.fn(async (req) => {
    const msg = req.body.entry[0].changes[0].value.messages[0];
    await service.showTypingIndicator(msg.from, msg.id);
    if (hooks.during) await hooks.during(msg);
    if (hooks.reply) await service.sendMessage(msg.from, hooks.reply);
  });
  await adapter.attach(dispatch);

  let n = 0;
  const say = async (roomId, body) => {
    const eventId = `$in${(n += 1)}`;
    await handlers['room.message'](roomId, {
      sender: T, event_id: eventId, origin_server_ts: Date.now() + 1000, content: { msgtype: 'm.text', body },
    });
    return eventId;
  };
  return { service, client, dispatch, say, hooks, wire, logToFile };
}

afterEach(async () => {
  // A test that leaves a job's hold open would leave its refresh timer
  // running, and the driver's lazy getClient() would hand the next test's
  // client to it: end this test's typing first.
  if (service) await service._stopTypingIndicator(T_ID);
  service = null;
  if (relay) relay._resetForTests();
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = savedRedisUrl;
  delete process.env.MATRIX_ACCESS_TOKEN;
  delete process.env.MATRIX_HOMESERVER_URL;
  jest.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
// A send while a job still holds the typing turns it off, then on again 1 s
// later (matrix-channel.service.js#reannounceTyping).
const reannounced = () => new Promise((resolve) => setTimeout(resolve, 1200));
const typingIn = (wire, roomId) => wire.filter(([kind, room]) => kind.startsWith('typing') && room === roomId).map(([kind]) => kind);

it('a DM question: marked read, typing on, and typing off right after the reply is sent', async () => {
  const { say, wire } = await boot();
  const eventId = await say(DM, 'How do I teach fractions?');
  await settle();
  expect(wire).toContainEqual(['read', DM, eventId]);
  expect(typingIn(wire, DM)[0]).toBe('typing:on');
  const replyAt = wire.findIndex(([kind]) => kind === 'message');
  const offAt = wire.findIndex(([kind], i) => kind === 'typing:off' && i > replyAt);
  expect(offAt).toBeGreaterThan(replyAt);
  // ...and nothing turns it back on afterwards.
  expect(wire.slice(offAt).some(([kind]) => kind === 'typing:on')).toBe(false);
});

it('a message whose handling sends nothing still clears the typing when its handling ends', async () => {
  const { say, hooks, wire } = await boot();
  hooks.reply = null;
  await say(DM, 'ok');
  await settle();
  expect(typingIn(wire, DM)).toEqual(['typing:on', 'typing:off']);
});

it('a group message not addressed to Rumi: no typing, no read receipt', async () => {
  const { say, dispatch, wire } = await boot();
  await say(STAFF, 'is anyone free at lunch?');
  await settle();
  expect(dispatch).not.toHaveBeenCalled();
  expect(wire.filter(([kind]) => kind.startsWith('typing') || kind === 'read')).toEqual([]);
});

it('a group message addressed to Rumi shows the typing in that group, and clears it after the reply', async () => {
  const { say, wire } = await boot();
  await say(STAFF, 'Rumi, a warm-up idea?');
  await settle();
  expect(typingIn(wire, STAFF)).toEqual(['typing:on', 'typing:off']);
  expect(typingIn(wire, DM)).toEqual([]);
});

it('a worker job holds the typing through the relay, and the worker\'s reply ends it', async () => {
  const { wire } = await boot();
  // What the worker does around a lesson-plan job, through the relay's real, signed caller side.
  await relay.call('_holdTyping', [T_ID, 'job:lp-1']);
  await settle();
  expect(typingIn(wire, DM)).toEqual(['typing:on']);
  await relay.call('sendMessage', [T_ID, 'Your lesson plan is ready.']);
  await settle();
  expect(typingIn(wire, DM)).toEqual(['typing:on', 'typing:off']);
  // The job's own release afterwards changes nothing on the wire.
  await relay.call('_releaseTyping', [T_ID, 'job:lp-1']);
  await settle();
  expect(typingIn(wire, DM)).toEqual(['typing:on', 'typing:off']);
});

// Test paper, quiz and lesson-plan paths queue the job FIRST and then send the
// "I'm making it…" ack (testpaper-orchestrator.service.js). A worker that picks
// the job up at once takes its hold while the inbound message is still being
// handled, before the ack is sent. (Found in review: the ack used to end the
// job's hold with the rest, and the room went quiet for the whole job.)
it('a job the worker picked up before the ack keeps "typing" while it runs', async () => {
  const { say, hooks, wire } = await boot({ reply: 'I am making your test paper. It takes a minute or two.' });
  hooks.during = async () => {
    await relay.call('_holdTyping', [T_ID, 'job:tp-1']); // withJobTyping in the worker, job still running
    await settle();
  };
  await say(DM, 'make the test paper');
  await reannounced();
  const typing = typingIn(wire, DM);
  // The job has not finished and has not released its hold: the teacher should still see "Rumi is typing…".
  expect(typing[typing.length - 1]).toBe('typing:on');
});

it('a job\'s typing ends with the job\'s own delivery, not with a send that has nothing to do with it', async () => {
  const { service, say, hooks, wire } = await boot({ reply: 'I am making your test paper.' });
  const job = (fn) => relay.forJob('testpaper_generate:tp-2', fn);
  hooks.during = async () => {
    await job(() => relay.call('_holdTyping', [T_ID, 'hold:worker:1']));
    await settle();
  };
  await say(DM, 'make the test paper');
  await reannounced();
  const last = () => typingIn(wire, DM).slice(-1)[0];
  expect(last()).toBe('typing:on');
  // A reminder the bot sends meanwhile, and a nudge from another process over the relay.
  await service.sendMessage(T_ID, 'Reminder: staff meeting at 2.');
  await relay.call('sendMessage', [T_ID, 'How did the fractions lesson go?']);
  await reannounced();
  expect(last()).toBe('typing:on');
  // The job delivers its paper: the typing ends there, and the job's release afterwards changes nothing.
  await job(() => relay.call('sendMessage', [T_ID, 'Your test paper is ready.']));
  await settle();
  expect(last()).toBe('typing:off');
  const n = typingIn(wire, DM).length;
  await job(() => relay.call('_releaseTyping', [T_ID, 'hold:worker:1']));
  await settle();
  expect(typingIn(wire, DM)).toHaveLength(n);
});

// What a client (Element) is told, from the bot's typing calls on the wire.
// Synapse 1.143, measured on the rig: it sends an m.typing event to a syncing
// client only when the user's typing state changes, so a "typing on" while
// already typing reaches no one, and "off" then "on" reaches it as two events.
function typingEventsSeenByClient(wire, roomId) {
  const events = [];
  let typing = false;
  wire.forEach(([kind, room], at) => {
    if (room !== roomId) return;
    if (kind === 'message') events.push({ at, kind: 'message' });
    if (!kind.startsWith('typing')) return;
    const on = kind === 'typing:on';
    if (on !== typing) events.push({ at, kind: 'm.typing', userIds: on ? [OWN] : [] });
    typing = on;
  });
  return events;
}
const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await settle(); // eslint-disable-line no-await-in-loop
};

// Element stops showing a user as typing when that user sends a message, and
// shows it again only on a new m.typing event naming them. On the public
// instance a worker job held the typing for its whole run but, after Rumi's
// "Making it now", Element showed nothing: the bot only refreshed a typing
// that was already on, and Synapse emits nothing for that.
it('after the ack, while a job still holds the typing, the client receives a new m.typing naming Rumi', async () => {
  const { say, hooks, wire } = await boot({ reply: 'Making it now. It takes a minute or two.' });
  hooks.during = async () => {
    await relay.forJob('lesson_plan:lp-9', () => relay.call('_holdTyping', [T_ID, 'hold:worker:9']));
    await settle();
  };
  await say(DM, 'make me a lesson plan on fractions');
  const ackAt = () => wire.findIndex(([kind, room]) => kind === 'message' && room === DM);
  const afterAck = () => typingEventsSeenByClient(wire, DM).filter((e) => e.at > ackAt()).map(({ kind, userIds }) => ({ kind, userIds }));
  await waitFor(() => ackAt() >= 0 && afterAck().some((e) => e.userIds && e.userIds.length));
  expect(ackAt()).toBeGreaterThanOrEqual(0);
  // Off (Element has already hidden it under the ack), then Rumi typing again.
  expect(afterAck()).toEqual([{ kind: 'm.typing', userIds: [] }, { kind: 'm.typing', userIds: [OWN] }]);
});

it('a job that delivers within a second of the ack: the typing stays off, the re-announce never fires', async () => {
  const { say, hooks, wire } = await boot({ reply: 'Making it now.' });
  const job = (fn) => relay.forJob('lesson_plan:lp-10', fn);
  hooks.during = async () => {
    await job(() => relay.call('_holdTyping', [T_ID, 'hold:worker:10']));
    await settle();
  };
  await say(DM, 'make me a lesson plan on fractions');
  await settle();
  await job(() => relay.call('sendMessage', [T_ID, 'Your lesson plan is ready.']));
  await reannounced();
  expect(typingIn(wire, DM).slice(-1)[0]).toBe('typing:off');
  const events = typingEventsSeenByClient(wire, DM);
  const lastMessageAt = events.map((e) => e.kind).lastIndexOf('message');
  expect(events.slice(lastMessageAt + 1).some((e) => e.userIds && e.userIds.length)).toBe(false);
});

it('a quick answer: the typing ends with the reply and does not come back', async () => {
  const { say, wire } = await boot();
  await say(DM, 'How do I teach fractions?');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const events = typingEventsSeenByClient(wire, DM);
  const replyAt = events.findIndex((e) => e.kind === 'message');
  expect(events.slice(replyAt + 1)).toEqual([expect.objectContaining({ kind: 'm.typing', userIds: [] })]);
});

it('typing failures never break a reply (fail open, logged)', async () => {
  const { say, client, wire, logToFile } = await boot();
  client.setTyping.mockRejectedValue(new Error('M_LIMIT_EXCEEDED'));
  await say(DM, 'How do I teach fractions?');
  await settle();
  expect(wire.filter(([kind]) => kind === 'message')).toHaveLength(1);
  expect(logToFile).toHaveBeenCalledWith(expect.stringMatching(/typing/i), expect.objectContaining({ message: expect.stringMatching(/M_LIMIT_EXCEEDED/) }));
});
