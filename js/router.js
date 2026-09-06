// ---------------------------------------------------------------------------
// The world's smallest router. Screens register themselves by name; navigate()
// swaps whichever one is showing inside #app.
//
// It also holds `state`, a freshly-loaded snapshot of your workouts + sessions
// so screens don't each have to hit the database.
// ---------------------------------------------------------------------------

import * as store from './store.js';

const screens = {};
let current = null;      // { name, params, cleanup }

export const state = { workouts: [], sessions: [], bodyWeights: [] };

export function register(name, renderFn) {
  screens[name] = renderFn;
}

/** Re-read everything from storage into `state`. */
export async function loadState() {
  const [workouts, sessions, bodyWeights] = await Promise.all([
    store.getWorkouts(), store.getSessions(), store.getBodyWeights(),
  ]);
  state.workouts = workouts;
  state.sessions = sessions;
  state.bodyWeights = bodyWeights;
}

export async function navigate(name, params = {}) {
  const root = document.getElementById('app');
  if (current && typeof current.cleanup === 'function') current.cleanup();

  await loadState();

  const result = await screens[name](params);
  const node = result instanceof Node ? result : result.node;
  const cleanup = result instanceof Node ? null : result.cleanup;

  root.replaceChildren(node);
  window.scrollTo(0, 0);
  current = { name, params, cleanup };
}

/** Reload data and redraw the screen you're already on. */
export function refresh() {
  if (!current) return navigate('home');
  return navigate(current.name, current.params);
}
