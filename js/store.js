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
const DB_VERSION = 2;

// meta:       small key/value records — the workout config, the in-progress draft
// sessions:   one record per finished workout
// bodyweights: one record per day you logged your body weight
const META = 'meta';
const SESSIONS = 'sessions';
const BODYWEIGHTS = 'bodyweights';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Each block only adds what's missing — an existing store (and every
      // record in it) is left exactly alone when the version bumps.
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const s = db.createObjectStore(SESSIONS, { keyPath: 'id' });
        s.createIndex('workoutId', 'workoutId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(BODYWEIGHTS)) {
        const bw = db.createObjectStore(BODYWEIGHTS, { keyPath: 'id' });
        bw.createIndex('date', 'date');
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

// --- Body weight (your own daily weigh-ins) ---------------------------------
//
// One record per calendar day: { id, date, weight, loggedAt, updatedAt, deletedAt }.
// `loggedAt` is the real moment you first logged that day's weight — it's kept
// even if you come back and correct the number later (that just bumps
// `updatedAt`), so it stays useful for noticing things like "I've been
// weighing in later in the morning lately."

function sameCalendarDay(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function getBodyWeights() {
  const all = await tx(BODYWEIGHTS, 'readonly', (s) => s.getAll());
  return all
    .filter((w) => !w.deletedAt)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first
}

export async function getBodyWeightForDate(dateISO) {
  const all = await getBodyWeights();
  return all.find((w) => sameCalendarDay(w.date, dateISO)) || null;
}

export async function saveBodyWeight({ date, weight }) {
  const now = new Date().toISOString();
  const existing = await getBodyWeightForDate(date);
  const record = existing
    ? { ...existing, date, weight, updatedAt: now }
    : { id: newId(), date, weight, loggedAt: now, updatedAt: now };
  await tx(BODYWEIGHTS, 'readwrite', (s) => s.put(record));
  return record;
}

export async function deleteBodyWeight(id) {
  const existing = await tx(BODYWEIGHTS, 'readonly', (s) => s.get(id));
  if (!existing) return;
  const now = new Date().toISOString();
  await tx(BODYWEIGHTS, 'readwrite', (s) => s.put({ ...existing, deletedAt: now, updatedAt: now }));
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
    bodyWeights: await getBodyWeights(),
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
  if (Array.isArray(data.bodyWeights)) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const t = db.transaction(BODYWEIGHTS, 'readwrite');
      const store = t.objectStore(BODYWEIGHTS);
      store.clear();
      data.bodyWeights.forEach((w) => store.put({ ...w, updatedAt: now }));
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
  await tx(BODYWEIGHTS, 'readwrite', (s) => s.clear());
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

// --- One-time data migrations ------------------------------------------------
// Your workout list lives in IndexedDB on the device, not in defaults.js, so
// editing defaults.js never touches an install that already has data. When the
// stored list itself has to change (reorder, add an exercise), a migration
// does it ONCE and records its id so it never runs again — anything you
// change in Edit Workouts afterwards is left alone.
//
// Migrations only ever reshape the workout list or add data. They never delete
// or overwrite logged sessions.

const CHESTBACK_ORDER = [
  'db-bench-press', 'lat-pulldown', 'smith-incline-press',
  'seated-cable-row', 'seated-fixed-row', 'pec-deck', 'ab-crunch',
];

// Reps per set for Assisted Dips, day 1 (oldest) -> day 8 (newest); all at 55 lb.
// Days 5-8 had no weight written down, so they're assumed to be 55 too.
const ASSISTED_DIPS_SEED = [
  [8, 8, 7], [8, 8, 8], [10, 10, 8], [10, 7, 7],
  [10, 8, 8], [10, 10, 10], [10, 10, 7], [10, 10, 10],
];

const MIGRATIONS = [
  {
    id: '2026-11-chestback-order-and-assisted-dips',
    async run() {
      const workouts = await getWorkouts(); // seeds defaults on a brand-new install
      let changed = false;

      const chest = workouts.find((w) => w.id === 'chestback');
      if (chest) {
        // Stable sort: anything not in the list (a custom exercise) goes last.
        const rank = (ex) => {
          const i = CHESTBACK_ORDER.indexOf(ex.id);
          return i === -1 ? CHESTBACK_ORDER.length : i;
        };
        const sorted = [...chest.exercises].sort((a, b) => rank(a) - rank(b));
        if (sorted.some((ex, i) => ex !== chest.exercises[i])) {
          chest.exercises = sorted;
          changed = true;
        }
      }

      const arms = workouts.find((w) => w.id === 'arms');
      if (arms && !arms.exercises.some((ex) => ex.id === 'assisted-dips' || /assisted dips/i.test(ex.name))) {
        const at = arms.exercises.findIndex((ex) => ex.id === 'seated-dips');
        arms.exercises.splice(at === -1 ? arms.exercises.length : at + 1, 0, {
          id: 'assisted-dips', name: 'Assisted Dips', weight: 55, step: 5, sets: 3, repLow: 8, repHigh: 10,
        });
        changed = true;
      }

      if (changed) await saveWorkouts(workouts);
    },
  },
  {
    // Eight days of Assisted Dips history, attached to your most recent Arm Day
    // sessions (day 8 = newest). It only ADDS an Assisted Dips entry to each
    // session — nothing already logged is changed, and a session that already
    // has Assisted Dips is skipped. Returns a note shown once when the app opens.
    id: '2026-11-seed-assisted-dips-history',
    async run() {
      const workouts = await getWorkouts();
      const arms = workouts.find((w) => w.id === 'arms');
      const dips = arms && arms.exercises.find((ex) => ex.id === 'assisted-dips' || /assisted dips/i.test(ex.name));
      if (!dips) return "Assisted Dips isn't on Arm Day, so its history wasn't added.";

      const sessions = await getSessions();
      if (!sessions.length) return; // brand-new install: nothing to attach to, and nothing worth announcing
      const targets = sessions.filter((s) => s.workoutId === 'arms').slice(-ASSISTED_DIPS_SEED.length);
      if (!targets.length) return 'No Arm Days logged yet, so there was nothing to add Assisted Dips history to.';

      // If fewer than 8 Arm Days exist, the newest sessions still get the newest days.
      const firstDay = ASSISTED_DIPS_SEED.length - targets.length;
      let added = 0;
      for (let i = 0; i < targets.length; i++) {
        const session = targets[i];
        if (session.entries.some((e) => e.exerciseId === dips.id)) continue;
        const entries = [...session.entries];
        const after = entries.findIndex((e) => e.exerciseId === 'seated-dips');
        entries.splice(after === -1 ? entries.length : after + 1, 0, {
          exerciseId: dips.id, name: dips.name, weight: 55, sets: ASSISTED_DIPS_SEED[firstDay + i],
        });
        await saveSession({ ...session, entries });
        added++;
      }
      if (targets.length < ASSISTED_DIPS_SEED.length) {
        return `Added Assisted Dips history to ${added} Arm Days. You have ${targets.length} logged, so the oldest ${firstDay} days were left out.`;
      }
      return `Added ${added} days of Assisted Dips history to your last ${targets.length} Arm Days.`;
    },
  },
];

export async function runMigrations() {
  const done = await metaGet('migrationsDone', []);
  const notes = [];
  for (const m of MIGRATIONS) {
    if (done.includes(m.id)) continue;
    const note = await m.run();
    if (note) notes.push(note);
    done.push(m.id);
    await metaSet('migrationsDone', done);
  }
  return notes;
}
