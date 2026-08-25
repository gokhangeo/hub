const CACHE_NAME = 'bulutsuz-transfer-v2';
const BASE_PATH = new URL('./', self.location.href).pathname;
const APP_SHELL = [BASE_PATH, `${BASE_PATH}manifest.webmanifest`, `${BASE_PATH}runtime-config.js`, `${BASE_PATH}icons/app-icon.svg`];
const DB_NAME = 'bulutsuz-transfer-share-target';
const STORE_NAME = 'shared-files';
const MAX_SHARED_FILES = 20;
const MAX_SHARED_BYTES = 512 * 1024 * 1024;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSharedFiles(files) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > MAX_SHARED_FILES || totalBytes > MAX_SHARED_BYTES) throw new Error('share_limit');
  if (self.navigator?.storage?.estimate) {
    const estimate = await self.navigator.storage.estimate();
    if (estimate.quota && estimate.usage + totalBytes > estimate.quota * 0.85) throw new Error('storage_quota');
  }
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const file of files) {
      store.add({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified });
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === `${BASE_PATH}share-target`) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('files').filter((value) => value instanceof File && value.size >= 0);
        if (files.length) await storeSharedFiles(files);
        return Response.redirect(`${BASE_PATH}?share-target=1`, 303);
      } catch (error) {
        const reason = error?.message === 'share_limit' ? 'limit' : error?.message === 'storage_quota' ? 'quota' : 'unknown';
        return Response.redirect(`${BASE_PATH}?share-error=${reason}`, 303);
      }
    })());
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached || (event.request.mode === 'navigate' ? caches.match(BASE_PATH) : Response.error());
    }
  })());
});
