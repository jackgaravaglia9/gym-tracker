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
//
// `workoutsUpdatedAt` is bookkeeping for sync.js: it's how two devices agree
// on whose copy of the workout list is newer. Plain local use never reads it.

export async function getWorkouts() {
  const saved = await metaGet('workouts');
  if (saved && Array.isArray(saved) && saved.length) return saved;
  // First ever run: seed from defaults.js and store an editable copy.
  const seed = structuredClone(DEFAULT_WORKOUTS);
  await metaSet('workouts', seed);
  await metaSet('workoutsUpdatedAt', new Date().toISOString());
  return seed;
}

export async function saveWorkouts(workouts) {
  await metaSet('workouts', workouts);
  await metaSet('workoutsUpdatedAt', new Date().toISOString());
  return workouts;
}

export async function resetWorkouts() {
  const seed = structuredClone(DEFAULT_WORKOUTS);
  await metaSet('workouts', seed);
  await metaSet('workoutsUpdatedAt', new Date().toISOString());
  return seed;
}

export const getWorkoutsUpdatedAt = () => metaGet('workoutsUpdatedAt', null);

// Used only by sync.js to write a copy pulled from the cloud, preserving its
// original timestamp rather than stamping a fresh "now" over it.
export async function setWorkoutsRaw(workouts, updatedAt) {
  await metaSet('workouts', workouts);
  await metaSet('workoutsUpdatedAt', updatedAt);
}

// --- Sessions (your logged history) ----------------------------------------

// A session looks like:
// { id, workoutId, date (ISO string), entries: [ { exerciseId, weight, sets: [reps, reps, ...] } ],
//   updatedAt (ISO string), deletedAt (ISO string or undefined) }
// Only sets you actually marked done are saved in `sets`.
//
// Deletes are SOFT (deletedAt gets stamped, the row stays) so that deleting a
// log on one device can tell another device to remove it too, next sync —
// a real delete would just have the row silently reappear on the next pull.

export async function getSessions() {
  const all = await tx(SESSIONS, 'readonly', (s) => s.getAll());
  return all
    .filter((s) => !s.deletedAt)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first
}

export async function getSessionsForWorkout(workoutId) {
  const all = await getSessions();
  return all.filter((s) => s.workoutId === workoutId);
}

export function saveSession(session) {
  return putSessionRaw({ ...session, updatedAt: new Date().toISOString() });
}

export async function deleteSession(id) {
  const existing = await tx(SESSIONS, 'readonly', (s) => s.get(id));
  if (!existing) return;
  const now = new Date().toISOString();
  await putSessionRaw({ ...existing, deletedAt: now, updatedAt: now });
}

// --- Low-level access for sync.js -------------------------------------------
// These bypass the "stamp updatedAt to now" behavior above, because sync.js
// needs to write records exactly as they came from (or are about to go to)
// the cloud, timestamp included — not as a fresh local edit.

export const getAllSessionsRaw = () => tx(SESSIONS, 'readonly', (s) => s.getAll());
export const putSessionRaw = (session) => tx(SESSIONS, 'readwrite', (s) => s.put(session));

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
  const now = new Date().toISOString();
  if (Array.isArray(data.workouts)) {
    await metaSet('workouts', data.workouts);
    await metaSet('workoutsUpdatedAt', now);
  }
  if (Array.isArray(data.sessions)) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const t = db.transaction(SESSIONS, 'readwrite');
      const store = t.objectStore(SESSIONS);
      store.clear();
      // Stamped fresh: an imported backup counts as a new local change, so it
      // gets pushed up on the next sync rather than looking already-stale.
      data.sessions.forEach((s) => store.put({ ...s, updatedAt: now }));
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}

export async function eraseEverything() {
  // Local-only, by design: this does not touch your Supabase project. If
  // you're signed in, the next sync will pull your cloud copy back down —
  // this button resets THIS device, it's not a way to delete synced data.
  await tx(SESSIONS, 'readwrite', (s) => s.clear());
  await metaDel('workouts');
  await metaDel('workoutsUpdatedAt');
  await metaDel('draft');
}

export function newId() {
  // Good enough for a single-user app, and sortable-ish by time.
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// --- Sync UI bookkeeping -----------------------------------------------------
// Whether you've dismissed the "enable cloud backup" nudge on Home, so it
// doesn't nag you every time you open the app.

export const getSyncPromptDismissed = () => metaGet('syncPromptDismissed', false);
export const setSyncPromptDismissed = () => metaSet('syncPromptDismissed', true);
