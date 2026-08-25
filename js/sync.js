// ---------------------------------------------------------------------------
// SYNC ENGINE — the bridge between local IndexedDB (via store.js) and your
// Supabase project. This is entirely additive: if it fails, is offline, or
// was never set up, the app behaves exactly as it did before this file
// existed — every read/write still goes through store.js first.
//
// The Supabase client library is loaded lazily, from a CDN, only at the
// moment you actually try to sign in or sync — never at app boot. That
// means a cold, no-signal start at the gym never waits on, or depends on,
// any of this.
//
// Sync strategy: last-write-wins, per record, using each record's own
// `updatedAt`. Every sync pulls your whole remote copy, merges it against
// local (whichever side is newer per record wins), writes the merged result
// back to IndexedDB, then pushes up anything local that turned out newer.
// That's simple rather than clever, which is the right trade for one real
// person occasionally using two devices — there's no concurrent-editing
// problem to solve here.
// ---------------------------------------------------------------------------

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as store from './store.js';

const SUPABASE_CDN_URL = 'https://esm.sh/@supabase/supabase-js@2';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise = null;
function getClient() {
  if (!isConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ SUPABASE_CDN_URL)
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
      .catch((err) => {
        console.error('Could not load the Supabase client (offline?)', err);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

// --- status: a tiny pub/sub so Home/Settings can show live sync state ------

let status = { signedIn: false, email: null, syncing: false, lastSyncedAt: null, error: null };
const listeners = new Set();

export function getStatus() { return status; }
export function onStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}

// --- auth --------------------------------------------------------------------

export async function getUser() {
  const client = await getClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data?.user ?? null;
}

export async function signInWithEmail(email) {
  const client = await getClient();
  if (!client) throw new Error("Sync isn't set up yet.");
  const redirectTo = location.href.split('#')[0].split('?')[0];
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  const client = await getClient();
  if (client) await client.auth.signOut();
  setStatus({ signedIn: false, email: null, lastSyncedAt: null });
}

// --- merge helpers -------------------------------------------------------------

// Is timestamp `a` strictly newer than `b`? Missing timestamps lose (they
// never beat something that exists, but anything beats nothing).
function isNewer(a, b) {
  if (!a) return false;
  if (!b) return true;
  return new Date(a) > new Date(b);
}

async function syncWorkouts(client, userId) {
  const [localList, localUpdatedAt, remoteResult] = await Promise.all([
    store.getWorkouts(),
    store.getWorkoutsUpdatedAt(),
    client.from('workouts').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (remoteResult.error) throw remoteResult.error;
  const remoteRow = remoteResult.data;
  const remoteUpdatedAt = remoteRow?.updated_at ?? null;

  if (isNewer(remoteUpdatedAt, localUpdatedAt)) {
    await store.setWorkoutsRaw(remoteRow.data, remoteUpdatedAt);
  } else if (!remoteRow || isNewer(localUpdatedAt, remoteUpdatedAt)) {
    const { error } = await client.from('workouts').upsert({
      user_id: userId,
      data: localList,
      updated_at: localUpdatedAt || new Date().toISOString(),
    });
    if (error) throw error;
  }
}

async function syncSessions(client, userId) {
  const [localAll, remoteResult] = await Promise.all([
    store.getAllSessionsRaw(),
    client.from('sessions').select('*').eq('user_id', userId),
  ]);
  if (remoteResult.error) throw remoteResult.error;

  const localById = new Map(localAll.map((s) => [s.id, s]));
  const remoteById = new Map((remoteResult.data || []).map((r) => [r.id, {
    id: r.id,
    workoutId: r.workout_id,
    date: r.date,
    entries: r.entries,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || undefined,
  }]));

  const toPush = [];
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const local = localById.get(id);
    const remote = remoteById.get(id);
    if (local && remote) {
      if (isNewer(local.updatedAt, remote.updatedAt)) toPush.push(local);
      else if (isNewer(remote.updatedAt, local.updatedAt)) await store.putSessionRaw(remote);
    } else if (local) {
      toPush.push(local);
    } else {
      await store.putSessionRaw(remote);
    }
  }

  if (toPush.length) {
    const rows = toPush.map((s) => ({
      id: s.id,
      user_id: userId,
      workout_id: s.workoutId,
      date: s.date,
      entries: s.entries,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt || null,
    }));
    const { error } = await client.from('sessions').upsert(rows);
    if (error) throw error;
  }
}

let syncing = false;

export async function syncNow() {
  if (syncing || !isConfigured()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const client = await getClient();
  if (!client) return;
  const user = await getUser();
  if (!user) { setStatus({ signedIn: false, email: null }); return; }

  syncing = true;
  setStatus({ signedIn: true, email: user.email, syncing: true, error: null });
  try {
    await syncWorkouts(client, user.id);
    await syncSessions(client, user.id);
    setStatus({ syncing: false, lastSyncedAt: new Date().toISOString(), error: null });
  } catch (err) {
    console.error('Sync failed', err);
    setStatus({ syncing: false, error: err.message || 'Sync failed' });
  } finally {
    syncing = false;
  }
}

// Call once at app boot. Never blocks: if there's no network or no config,
// this resolves quickly and the app has already moved on to Home.
export async function initSync() {
  if (!isConfigured()) return;
  const client = await getClient();
  if (!client) return;

  const user = await getUser();
  if (user) {
    setStatus({ signedIn: true, email: user.email });
    syncNow();
  }

  client.auth.onAuthStateChange((_event, session) => {
    setStatus({ signedIn: Boolean(session), email: session?.user?.email ?? null });
    if (session) syncNow();
  });

  window.addEventListener('online', () => syncNow());
}
