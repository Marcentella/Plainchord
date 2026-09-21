import type { Tab } from "./tab.ts";

const DB_NAME = "plainchord";
const DB_VERSION = 1;
const STORE_NAME = "tabHistory";
// ponytail: picked by eye as "a real working session's worth," not a
// library — revisit (and add an importedAt index instead of sorting
// getAll() in JS) if this cap is ever raised much higher.
const MAX_HISTORY_ENTRIES = 20;

export type TabHistoryEntry = {
  id: string;
  /** Date.now() at import time — the sort key for "most recent first." */
  importedAt: number;
  tab: Tab;
};

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listTabHistory(): Promise<TabHistoryEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const entries = await promisifyRequest(tx.objectStore(STORE_NAME).getAll());
  db.close();
  return (entries as TabHistoryEntry[]).sort((a, b) => b.importedAt - a.importedAt);
}

/**
 * Pure, testable without a real indexedDB (Node has none): given all
 * entries and a cap, the ids that are over it (oldest first) — eviction
 * itself is just "delete these ids."
 */
export function overflowIds(entries: Pick<TabHistoryEntry, "id" | "importedAt">[], max: number): string[] {
  return [...entries]
    .sort((a, b) => b.importedAt - a.importedAt)
    .slice(max)
    .map((e) => e.id);
}

export async function saveTabToHistory(tab: Tab): Promise<void> {
  const entry: TabHistoryEntry = { id: crypto.randomUUID(), importedAt: Date.now(), tab };
  const db = await openDb();
  const writeTx = db.transaction(STORE_NAME, "readwrite");
  writeTx.objectStore(STORE_NAME).put(entry);
  await promisifyTx(writeTx);

  const readTx = db.transaction(STORE_NAME, "readonly");
  const all = (await promisifyRequest(readTx.objectStore(STORE_NAME).getAll())) as TabHistoryEntry[];
  const evict = overflowIds(all, MAX_HISTORY_ENTRIES);
  db.close();

  if (evict.length > 0) {
    const evictDb = await openDb();
    const evictTx = evictDb.transaction(STORE_NAME, "readwrite");
    const store = evictTx.objectStore(STORE_NAME);
    for (const id of evict) store.delete(id);
    await promisifyTx(evictTx);
    evictDb.close();
  }
}

export async function deleteTabFromHistory(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await promisifyTx(tx);
  db.close();
}
