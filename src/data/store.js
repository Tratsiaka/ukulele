// IndexedDB «uke»: хранилища songs (песни) и kv (настройки, прогресс, служебное). Тонкая обёртка над idb.

import { openDB } from 'idb';

export const DB_NAME = 'uke';
export const DB_VERSION = 1;

let dbPromise = null;

/**
 * Открывает базу (один раз на вкладку). Нет IndexedDB (приватный режим, node) → отклонённый Promise.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export function openStore() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB недоступна'));
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Миграции идут по номерам версий: каждая следующая — отдельный if.
      if (oldVersion < 1) {
        const songs = db.createObjectStore('songs', { keyPath: 'id' });
        songs.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('kv', { keyPath: 'k' });
      }
    },
    blocking() {
      // Другая вкладка открыла новую версию схемы — отпускаем базу, при следующем обращении откроем заново.
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

/**
 * Всё содержимое базы за одну транзакцию.
 * @returns {Promise<{songs: object[], kv: Record<string, any>}>}
 */
export async function loadAll() {
  const db = await openStore();
  const tx = db.transaction(['songs', 'kv'], 'readonly');
  const [songs, kv] = await Promise.all([tx.objectStore('songs').getAll(), tx.objectStore('kv').getAll()]);
  await tx.done;
  return { songs, kv: Object.fromEntries(kv.map((r) => [r.k, r.v])) };
}

/**
 * Записать пачку изменений одной транзакцией.
 * @param {{songs?: object[], deleteSongIds?: string[], kv?: Record<string, any>}} batch
 * @returns {Promise<void>}
 */
export async function saveBatch({ songs = [], deleteSongIds = [], kv = {} }) {
  const kvEntries = Object.entries(kv);
  if (!songs.length && !deleteSongIds.length && !kvEntries.length) return;
  const db = await openStore();
  const tx = db.transaction(['songs', 'kv'], 'readwrite');
  const songStore = tx.objectStore('songs');
  const kvStore = tx.objectStore('kv');
  for (const s of songs) songStore.put(s);
  for (const id of deleteSongIds) songStore.delete(id);
  for (const [k, v] of kvEntries) kvStore.put({ k, v });
  await tx.done;
}

/**
 * Значение из kv.
 * @param {string} k
 * @returns {Promise<any>}
 */
export async function getKv(k) {
  const db = await openStore();
  return (await db.get('kv', k))?.v;
}

/**
 * Записать значение в kv.
 * @param {string} k
 * @param {any} v
 * @returns {Promise<void>}
 */
export async function setKv(k, v) {
  await saveBatch({ kv: { [k]: v } });
}

/**
 * Песня по id (включая удалённые).
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export async function getSongRecord(id) {
  const db = await openStore();
  return db.get('songs', id);
}

/**
 * Стереть всё (для «сбросить данные» в настройках).
 * @returns {Promise<void>}
 */
export async function clearAll() {
  const db = await openStore();
  const tx = db.transaction(['songs', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('songs').clear(), tx.objectStore('kv').clear()]);
  await tx.done;
}
