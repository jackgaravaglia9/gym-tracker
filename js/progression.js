// ---------------------------------------------------------------------------
// PROGRESSION RULE
//
// "Ready to go heavier" = in the most recent logged session of that workout
// type, every set you logged for that exercise met or beat the TOP of its rep
// range.
//
// It all lives here, so if you ever want to change the rule (e.g. require all
// sets to be logged, or two good sessions in a row), this is the only file to
// touch.
//
// Machine changes: an exercise can carry `statsFrom` (a date). Everything that
// measures PROGRESS — current weight, graph, gain, plateau — only counts
// sessions on/after that date, so switching to a machine with a different
// scale doesn't read as a huge drop. Earlier sessions are never touched; they
// stay in your history, just not in the progress math. Functions below take it
// as `from`.
//
// Note on weights: exercise history is tracked by exercise id ACROSS workouts.
// So Ab Crunch is one exercise with one weight history, even though it appears
// on both Leg Day and Chest/Back. The "go heavier" flag is still judged per
// workout, because that's how the rule above is worded.
// ---------------------------------------------------------------------------

/**
 * Most recent session of a given workout type. `sessions` is oldest-first.
 *
 * Pass `beforeDate` when you're backfilling or editing a session dated in the
 * past — it bounds the search to sessions strictly before that date, so "last
 * time" means "before the day you're logging," not "most recent overall."
 * `excludeId` leaves out the session currently being edited.
 */
export function lastSessionFor(sessions, workoutId, opts = {}) {
  const { beforeDate = null, excludeId = null } = opts;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (excludeId && s.id === excludeId) continue;
    if (beforeDate && new Date(s.date) >= new Date(beforeDate)) continue;
    if (s.workoutId === workoutId) return s;
  }
  return null;
}

/** The weight you used the last time you did this exercise, in any workout. */
export function lastWeightFor(sessions, exerciseId, opts = {}) {
  const { beforeDate = null, excludeId = null, from = null } = opts;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (excludeId && s.id === excludeId) continue;
    if (beforeDate && new Date(s.date) >= new Date(beforeDate)) continue;
    if (from && new Date(s.date) < new Date(from)) break; // oldest-first: nothing older counts either
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && typeof entry.weight === 'number') return entry.weight;
  }
  return null;
}

/**
 * The most recent time you actually logged this exercise (in any workout),
 * with the sets you did. A lift you skipped last session still shows the reps
 * from the last time you did it, rather than going blank.
 */
export function lastEntryFor(sessions, exerciseId, opts = {}) {
  const { beforeDate = null, excludeId = null, from = null } = opts;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (excludeId && s.id === excludeId) continue;
    if (beforeDate && new Date(s.date) >= new Date(beforeDate)) continue;
    if (from && new Date(s.date) < new Date(from)) break;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId && e.sets && e.sets.length);
    if (entry) return { sets: entry.sets, weight: entry.weight, date: s.date, sessionId: s.id };
  }
  return null;
}

/** Every logged weight for an exercise over time — feeds the sparkline. */
export function historyFor(sessions, exerciseId, { from = null } = {}) {
  const out = [];
  for (const s of sessions) {
    if (from && new Date(s.date) < new Date(from)) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && typeof entry.weight === 'number') {
      out.push({ date: s.date, weight: entry.weight, sets: entry.sets || [], name: entry.name });
    }
  }
  return out;
}

/** THE RULE. */
export function isReadyHeavier(sessions, workoutId, exercise) {
  const last = lastSessionFor(sessions, workoutId);
  if (!last) return false;
  if (exercise.statsFrom && new Date(last.date) < new Date(exercise.statsFrom)) return false;
  const entry = last.entries.find((e) => e.exerciseId === exercise.id);
  if (!entry || !entry.sets || entry.sets.length === 0) return false;
  return entry.sets.every((reps) => reps >= exercise.repHigh);
}

/** How many exercises in this workout are flagged — shown on the Home screen. */
export function readyCount(sessions, workout) {
  return workout.exercises.filter((ex) => isReadyHeavier(sessions, workout.id, ex)).length;
}

/**
 * How many sessions since the weight last actually went up, given a
 * chronological (oldest-first) history from `historyFor`. 0 means it just
 * increased last time (or there's under 2 sessions to compare); if it's
 * never increased at all, returns the full length of the plateau.
 */
export function sessionsSinceIncrease(history) {
  if (history.length < 2) return 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].weight > history[i - 1].weight) return history.length - 1 - i;
  }
  return history.length - 1;
}
