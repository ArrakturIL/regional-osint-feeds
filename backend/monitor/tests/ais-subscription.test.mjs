// 23.11: aisstream stopped sending SubscriptionConfirmation reliably. Position
// reports count as a live subscription; a silent session is retried once.
import test from 'node:test';
import assert from 'node:assert/strict';

const scripts = [];
class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.handlers = {};
    this.plan = scripts.shift() || [];
    setTimeout(() => this.emit('open'), 0);
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  emit(type, data) {
    this.handlers[type]?.(data === undefined ? {} : { data });
  }
  send() {
    for (const [ms, msg] of this.plan) setTimeout(() => this.emit('message', JSON.stringify(msg)), ms);
  }
  close() {
    this.readyState = 3;
  }
}
globalThis.WebSocket = FakeSocket;
const ais = await import('../src/collectors/maritime/ais.js');
const pos = mmsi => ({ MessageType: 'PositionReport', MetaData: { MMSI: mmsi } });
const env = { AIS_KEY: 'k', AIS_CONFIRM_MS: 40 };

test('position reports without a confirmation are a working subscription', async () => {
  scripts.push([
    [5, pos(1)],
    [6, pos(2)],
  ]);
  const [it] = await ais.vessels(env, 'maritime');
  assert.match(JSON.stringify(it), /"observed_vessels":2/);
  assert.match(JSON.stringify(it), /"resubscribed":false/);
});

test('a silent session is retried once; data on the retry wins', async () => {
  scripts.push([], [[5, pos(7)]]);
  const [it] = await ais.vessels(env, 'maritime');
  assert.match(JSON.stringify(it), /"observed_vessels":1/);
  assert.match(JSON.stringify(it), /"resubscribed":true/);
});

test('two silent sessions fail with the old error', async () => {
  scripts.push([], []);
  await assert.rejects(ais.vessels(env, 'maritime'), /AIS subscription not confirmed/);
});
