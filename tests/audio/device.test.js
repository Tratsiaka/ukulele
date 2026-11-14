import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestWakeLock, vibrate } from '../../src/lib/device.js';

const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete globalThis.navigator;
  delete globalThis.document;
});

function fakeDocument() {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.setVisible = (v) => {
    doc.visibilityState = v ? 'visible' : 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return doc;
}

function fakeWakeLock() {
  const sentinels = [];
  return {
    sentinels,
    async request(type) {
      assert.equal(type, 'screen');
      const s = { released: false, async release() { this.released = true; } };
      sentinels.push(s);
      return s;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('requestWakeLock: unsupported → no-op release', async () => {
  setNavigator({});
  const release = await requestWakeLock();
  assert.equal(typeof release, 'function');
  await release();
});

test('requestWakeLock: acquires, re-acquires after the tab comes back, release stops it', async () => {
  const wl = fakeWakeLock();
  setNavigator({ wakeLock: wl });
  const doc = fakeDocument();
  globalThis.document = doc;

  const release = await requestWakeLock();
  assert.equal(wl.sentinels.length, 1);

  // браузер сам снимает блокировку при скрытии вкладки
  wl.sentinels[0].released = true;
  doc.setVisible(false);
  await tick();
  assert.equal(wl.sentinels.length, 1, 'no request while hidden');
  doc.setVisible(true);
  await tick();
  assert.equal(wl.sentinels.length, 2, 're-acquired on return');

  await release();
  assert.equal(wl.sentinels[1].released, true);
  doc.setVisible(false);
  doc.setVisible(true);
  await tick();
  assert.equal(wl.sentinels.length, 2, 'no re-acquire after release');
  await release();
});

test('requestWakeLock: request rejected (battery saver) → still returns release', async () => {
  setNavigator({ wakeLock: { request: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } });
  globalThis.document = fakeDocument();
  const release = await requestWakeLock();
  await release();
});

test('vibrate: safe without support, passes pattern through when supported', () => {
  setNavigator({});
  assert.equal(vibrate(50), false);
  let got;
  setNavigator({ vibrate: (p) => ((got = p), true) });
  assert.equal(vibrate([30, 50, 30]), true);
  assert.deepEqual(got, [30, 50, 30]);
  setNavigator({ vibrate: () => { throw new Error('nope'); } });
  assert.equal(vibrate(10), false);
});
