// Доступ к микрофону для тюнера. Обработку звука браузером выключаем: шумодав и автоусиление
// на Android режут ровный тон струны, и тюнер начинает врать.

import { micInUse } from './context.js';

const MESSAGES = {
  insecure: 'Микрофон работает только по защищённой ссылке (https). Открой приложение по ней.',
  unsupported: 'Этот браузер не даёт доступ к микрофону. Попробуй Chrome.',
  denied: 'Нет доступа к микрофону. Разреши его в настройках сайта (значок слева от адреса) и попробуй ещё раз.',
  notfound: 'Микрофон не найден. Проверь, что он подключён и включён.',
  busy: 'Микрофон занят другим приложением. Закрой его и попробуй снова.',
  unknown: 'Не получилось включить микрофон. Попробуй ещё раз.',
};

/** Потоки, которые мы учли в micInUse: stopStream можно звать сколько угодно раз. */
const active = new WeakSet();

/**
 * Ошибка микрофона с понятным текстом в `message` и кодом причины в `code`.
 */
export class MicError extends Error {
  /**
   * @param {'insecure'|'unsupported'|'denied'|'notfound'|'busy'|'unknown'} code
   * @param {unknown} [cause] исходная ошибка браузера
   */
  constructor(code, cause) {
    super(MESSAGES[code] || MESSAGES.unknown);
    this.name = 'MicError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Превращает ошибку getUserMedia в MicError с понятным текстом.
 * @param {unknown} err
 * @returns {MicError}
 */
export function toMicError(err) {
  if (err instanceof MicError) return err;
  switch (/** @type {{name?: string}} */ (err)?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new MicError('denied', err);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new MicError('notfound', err);
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new MicError('busy', err);
    default:
      return new MicError('unknown', err);
  }
}

/**
 * Включает микрофон без шумодава, эхоподавления и автоусиления.
 * Ограничения «желательные», не строгие: на части Android строгие дают OverconstrainedError.
 * @returns {Promise<MediaStream>}
 * @throws {MicError} с понятным текстом в message
 */
export async function getMic() {
  if (globalThis.isSecureContext === false) throw new MicError('insecure');
  const devices = globalThis.navigator?.mediaDevices;
  if (!devices?.getUserMedia) throw new MicError('unsupported');
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
  micInUse(true);
  try {
    let stream;
    try {
      stream = await devices.getUserMedia({ audio });
    } catch (err) {
      if (err?.name !== 'OverconstrainedError' && err?.name !== 'TypeError') throw err;
      stream = await devices.getUserMedia({ audio: true });
    }
    active.add(stream);
    return stream;
  } catch (err) {
    micInUse(false);
    throw toMicError(err);
  }
}

/**
 * Выключает все дорожки потока (гаснет индикатор микрофона). Повторный вызов безопасен.
 * @param {MediaStream|null|undefined} stream
 */
export function stopStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  if (active.has(stream)) {
    active.delete(stream);
    micInUse(false);
  }
}
