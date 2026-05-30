export interface OfflineTrackRecord {
  key: string;
  uri: string;
  name: string;
  artist: string;
  image?: string | null;
  previewUrl: string;
  downloadedAt: number;
}

const DB_NAME = "jkmusic-offline-v1";
const STORE = "tracks";
const DB_VERSION = 1;

export function offlineTrackKey(uri: string, name: string, artist: string): string {
  return uri || `${name}::${artist}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

export async function saveOfflineTrack(
  record: OfflineTrackRecord,
  audioBlob: Blob
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).put({ ...record, blob: audioBlob });
  });
  db.close();
}

export async function getOfflineTrack(
  key: string
): Promise<(OfflineTrackRecord & { blob: Blob }) | null> {
  const db = await openDb();
  const row = await new Promise<(OfflineTrackRecord & { blob: Blob }) | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as (OfflineTrackRecord & { blob: Blob }) | undefined);
  });
  db.close();
  return row ?? null;
}

export async function removeOfflineTrack(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).delete(key);
  });
  db.close();
}

export async function listOfflineTrackKeys(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
  });
  db.close();
  return keys;
}

/** Metadata only (no audio blobs) for the Downloaded library screen. */
export async function clearAllOfflineTracks(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).clear();
  });
  db.close();
}

export async function listAllOfflineTracks(): Promise<OfflineTrackRecord[]> {
  const db = await openDb();
  const rows = await new Promise<Array<OfflineTrackRecord & { blob?: Blob }>>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as Array<OfflineTrackRecord & { blob?: Blob }>) ?? []);
  });
  db.close();
  return rows
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}
