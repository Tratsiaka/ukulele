// Общий AudioContext приложения: один на всё (синтез, метроном, тюнер).
// Браузеры создают контекст в состоянии suspended до жеста пользователя, поэтому unlockAudio()
// нужно вызывать в обработчике нажатия.

/** @type {AudioContext|null} */
let ctx = null;
let micUsers = 0;
let sessionTouched = false;

/**
 * Возвращает единственный AudioContext приложения, создаёт его при первом вызове.
 * @returns {AudioContext}
 */
export function audioCtx() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Этот браузер не умеет играть звук через Web Audio.');
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}

/**
 * Будит звук: resume() и тихий буфер (без него iOS иногда молчит). Вызывать в обработчике жеста.
 * Никогда не бросает исключение.
 * @returns {Promise<AudioContext|null>} контекст или null, если Web Audio нет
 */
export async function unlockAudio() {
  let c;
  try {
    c = audioCtx();
  } catch {
    return null;
  }
  applySession();
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    // не критично
  }
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      // resume может отказать вне жеста — попробуем при следующем нажатии
    }
  }
  return c;
}

/**
 * Синхронно просит контекст проснуться (без ожидания). Удобно в обработчиках, где нельзя await.
 * @returns {AudioContext}
 */
export function ensureRunning() {
  const c = audioCtx();
  if (c.state !== 'running') c.resume().catch(() => {});
  return c;
}

// Аудиосессия есть только в Safari 16.4+: 'playback' — звук не глушится переключателем беззвучного режима,
// 'play-and-record' — нужен, пока работает микрофон. В других браузерах ничего не делаем.
function applySession() {
  const session = globalThis.navigator?.audioSession;
  if (!session) return;
  // чужой явный выбор типа не трогаем
  if (!sessionTouched && session.type !== 'auto') return;
  try {
    session.type = micUsers > 0 ? 'play-and-record' : 'playback';
    sessionTouched = true;
  } catch {
    // старый Safari без нужного типа
  }
}

/**
 * Отмечает, что микрофон включён или выключен (для аудиосессии iOS). Вызывает mic.js.
 * @param {boolean} active
 */
export function micInUse(active) {
  micUsers = Math.max(0, micUsers + (active ? 1 : -1));
  applySession();
}
