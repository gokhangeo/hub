const DB_NAME = 'bulutsuz-transfer-share-target';
const STORE_NAME = 'shared-files';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function takeSharedFiles() {
  if (!('indexedDB' in window)) return [];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const files = request.result.map((item) => new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }));
      store.clear();
      resolve(files);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}
