// utils/offlineQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
// Offline queue for the RENAX Rider Web App.
// Persists entries to localStorage so they survive page refreshes.
// When online, drains automatically. Workers are plugged in from callers.
// ─────────────────────────────────────────────────────────────────────────────

export type QueueItemKind = 'proof' | 'location_ping' | 'otp_attempt';

export interface QueueItem {
  id: string;
  kind: QueueItemKind;
  createdAt: number;        // epoch ms
  retries: number;
  maxRetries: number;
  payload: Record<string, unknown>;
}

const STORAGE_KEY = 'renax_rider_offline_queue';

// ── Persistence ───────────────────────────────────────────────────────────────

function loadQueue(): QueueItem[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Storage quota exceeded — evict oldest items
    try {
      const trimmed = items.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

let _queue: QueueItem[] = loadQueue();

export function enqueue(
  kind: QueueItemKind,
  payload: Record<string, unknown>,
  maxRetries = 5,
): QueueItem {
  const item: QueueItem = {
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    createdAt: Date.now(),
    retries: 0,
    maxRetries,
    payload,
  };
  _queue.push(item);
  saveQueue(_queue);
  return item;
}

export function dequeue(id: string) {
  _queue = _queue.filter(i => i.id !== id);
  saveQueue(_queue);
}

export function markRetry(id: string) {
  const item = _queue.find(i => i.id === id);
  if (item) {
    item.retries += 1;
    if (item.retries >= item.maxRetries) {
      dequeue(id); // dead-letter: remove after exhausted retries
    } else {
      saveQueue(_queue);
    }
  }
}

export function getQueue(kind?: QueueItemKind): QueueItem[] {
  return kind ? _queue.filter(i => i.kind === kind) : [..._queue];
}

export function queueSize(): number {
  return _queue.length;
}

// ── Auto-drain ────────────────────────────────────────────────────────────────
// Call `registerDrainWorker` once during app init with an async worker fn.
// When the browser goes online, all pending items are processed.

type DrainWorker = (item: QueueItem) => Promise<boolean>; // return true if success

const workers = new Map<QueueItemKind, DrainWorker>();

export function registerDrainWorker(kind: QueueItemKind, worker: DrainWorker) {
  workers.set(kind, worker);
}

async function drainAll() {
  if (!navigator.onLine) return;

  const pending = [..._queue]; // snapshot
  for (const item of pending) {
    const worker = workers.get(item.kind);
    if (!worker) continue;
    try {
      const success = await worker(item);
      if (success) {
        dequeue(item.id);
      } else {
        markRetry(item.id);
      }
    } catch {
      markRetry(item.id);
    }
  }
}

// Wire global online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    drainAll();
  });
  // Also attempt a drain on load if already online
  if (navigator.onLine) {
    setTimeout(drainAll, 2000);
  }
}

export { drainAll };
