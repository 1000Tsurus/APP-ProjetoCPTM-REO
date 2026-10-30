import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const DB_NAME = 'raillog-evidence';

function webDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function webPut(key: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const db = await webDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function webGet(key: string): Promise<string | null> {
  const db = await webDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction('photos', 'readonly').objectStore('photos').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob ? URL.createObjectURL(blob) : null;
}

export async function persistPhoto(uri: string, inspectionId: string, category: string) {
  const key = `${inspectionId}-${category}-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    await webPut(key, uri);
    return `idb:${key}`;
  }
  const directory = new Directory(Paths.document, 'raillog-evidence');
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, key);
  new File(uri).copy(destination);
  return destination.uri;
}

export async function resolvePhoto(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return uri.startsWith('idb:') ? webGet(uri.slice(4)) : null;
  return new File(uri).exists ? uri : null;
}

export async function removePhoto(uri: string) {
  if (Platform.OS === 'web') {
    if (!uri.startsWith('idb:')) return;
    const db = await webDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(uri.slice(4));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return;
  }
  const file = new File(uri);
  if (file.exists) file.delete();
}
