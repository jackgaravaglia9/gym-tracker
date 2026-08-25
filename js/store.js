// ---------------------------------------------------------------------------
// STORAGE LAYER
//
// This is the ONLY file that knows your data lives in IndexedDB. Every screen
// talks to the app through the functions exported at the bottom, and every one
// of them returns a Promise.
//
// That's deliberate: a cloud backend is also asynchronous, so if you ever want
// cross-device sync, you rewrite the insides of THIS FILE ONLY (swap the idb
// calls for fetch() calls to a server) and none of the screen code changes.
// ---------------------------------------------------------------------------

import { DEFAULT_WORKOUTS } from './defaults.js';

const DB_NAME = 'gym-tracker';
const DB_VERSION = 1;

// meta:     small key/value records — the workout config, the in-progress draft
// sessions: one record per finished workout
const META = 'meta';
const SESSIONS = 'sessions';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const s = db.createObjectStore(SESSIONS, { keyPath: 'id' });
        s.createIndex('workoutId', 'workoutId');
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Tiny promise wrappers so the rest of the file reads cleanly.
async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    // Resolve on transaction complete (not request success) so the data is
    // genuinely committed to disk before we carry on.
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const metaGet = async (key, fallback = null) => {
  const rec = await tx(META, 'readonly', (s) => s.get(key));
  return rec ? rec.value : fallback;
};
const metaSet = (key, value) => tx(META, 'readwrite', (s) => s.put({ key, value }));
const metaDel = (key) => tx(META, 'readwrite', (s) => s.delete(key));

// --- Workouts (your editable exercise list) --------------------------------

export async function getWorkouts() {
  const saved = await metaGet('workouts');
  if (saved && Array.isArray(saved) && saved.length) return saved;
  // First ever run: seed from defaults.js and store an editable copy.
  const seed = structuredClone(DEFAULT_WORKOUTS);
  await metaSet('workouts', seed);
  return seed;
}

export async function saveWorkouts(workouts) {
  await metaSet('workouts', workouts);
  return workouts;
}

export async function resetWorkouts() {
  const seed = structuredClone(DEFAULT_WORKOUTS);
  await metaSet('workouts', seed);
  return seed;
}

// --- Sessions (your logged history) ----------------------------------------

// A session looks like:
// { id, workoutId, date (ISO string), entries: [ { exerciseId, weight, sets: [reps, reps, ...] } ] }
// Only sets you actually marked done are saved in `sets`.

export async function getSessions() {
  const all = await tx(SESSIONS, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first
}

export async function getSessionsForWorkout(workoutId) {
  const all = await getSessions();
  return all.filter((s) => s.workoutId === workoutId);
}

export function saveSession(session) {
  return tx(SESSIONS, 'readwrite', (s) => s.put(session));
}

export function deleteSession(id) {
  return tx(SESSIONS, 'readwrite', (s) => s.delete(id));
}

// --- Draft (auto-saved in-progress workout) --------------------------------
// So a locked phone or a phone call mid-workout never loses your sets.

export const getDraft = () => metaGet('draft', null);
export const saveDraft = (draft) => metaSet('draft', draft);
export const clearDraft = () => metaDel('draft');

// --- Backup ----------------------------------------------------------------

export async function exportAll() {
  return {
    app: 'gym-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: await getWorkouts(),
    sessions: await getSessions(),
  };
}

export async function importAll(data) {
  if (!data || data.app !== 'gym-tracker') throw new Error('Not a gym-tracker backup file.');
  if (Array.isArray(data.workouts)) await metaSet('workouts', data.workouts);
  if (Array.isArray(data.sessions)) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const t = db.transaction(SESSIONS, 'readwrite');
      const store = t.objectStore(SESSIONS);
      store.clear();
      data.sessions.forEach((s) => store.put(s));
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}

export async function eraseEverything() {
  await tx(SESSIONS, 'readwrite', (s) => s.clear());
  await metaDel('workouts');
  await metaDel('draft');
}

export function newId() {
  // Good enough for a single-user app, and sortable-ish by time.
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
