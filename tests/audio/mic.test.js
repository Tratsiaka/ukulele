import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getMic, stopStream, toMicError, MicError } from '../../src/audio/mic.js';

const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const secureDesc = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete globalThis.navigator;
  if (secureDesc) Object.defineProperty(globalThis, 'isSecureContext', secureDesc);
  else delete globalThis.isSecureContext;
});

const err = (name) => Object.assign(new Error(name), { name });

function fakeStream() {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  return { tracks, getTracks: () => tracks };
}

test('toMicError maps browser errors to friendly Russian messages', () => {
  const denied = toMicError(err('NotAllowedError'));
  assert.ok(denied instanceof MicError);
  assert.equal(denied.code, 'denied');
  assert.match(denied.message, /доступ/i);
  assert.equal(toMicError(err('NotFoundError')).code, 'notfound');
  assert.match(toMicError(err('NotFoundError')).message, /не найден/);
  assert.equal(toMicError(err('NotReadableError')).code, 'busy');
  assert.equal(toMicError(new Error('boom')).code, 'unknown');
  assert.equal(toMicError(denied), denied);
});

test('getMic: insecure context → friendly error', async () => {
  Object.defineProperty(globalThis, 'isSecureContext', { value: false, configurable: true });
  await assert.rejects(getMic(), (e) => e.code === 'insecure' && /https/.test(e.message));
});

test('getMic: no mediaDevices → unsupported', async () => {
  setNavigator({});
  await assert.rejects(getMic(), (e) => e.code === 'unsupported');
});

test('getMic: asks for raw audio without processing', async () => {
  let constraints;
  const stream = fakeStream();
  setNavigator({ mediaDevices: { getUserMedia: async (c) => ((constraints = c), stream) } });
  assert.equal(await getMic(), stream);
  assert.equal(constraints.audio.echoCancellation, false);
  assert.equal(constraints.audio.noiseSuppression, false);
  assert.equal(constraints.audio.autoGainControl, false);
});

test('getMic: OverconstrainedError → retries with plain audio', async () => {
  const calls = [];
  const stream = fakeStream();
  setNavigator({
    mediaDevices: {
      getUserMedia: async (c) => {
        calls.push(c);
        if (calls.length === 1) throw err('OverconstrainedError');
        return stream;
      },
    },
  });
  assert.equal(await getMic(), stream);
  assert.deepEqual(calls[1], { audio: true });
});

test('getMic: NotAllowedError → MicError denied', async () => {
  setNavigator({ mediaDevices: { getUserMedia: async () => { throw err('NotAllowedError'); } } });
  await assert.rejects(getMic(), (e) => e instanceof MicError && e.code === 'denied');
});

test('stopStream stops all tracks and tolerates repeats and null', () => {
  const s = fakeStream();
  stopStream(s);
  assert.ok(s.tracks.every((t) => t.stopped));
  stopStream(s);
  stopStream(null);
  stopStream(undefined);
});
