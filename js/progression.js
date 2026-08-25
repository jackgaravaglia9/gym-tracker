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
// Note on weights: exercise history is tracked by exercise id ACROSS workouts.
// So Ab Crunch is one exercise with one weight history, even though it appears
// on both Leg Day and Chest/Back. The "go heavier" flag is still judged per
// workout, because that's how the rule above is worded.
// ---------------------------------------------------------------------------

/** Most recent session of a given workout type. `sessions` is oldest-first. */
export function lastSessionFor(sessions, workoutId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].workoutId === workoutId) return sessions[i];
  }
  return null;
}

/** The weight you used the last time you did this exercise, in any workout. */
export function lastWeightFor(sessions, exerciseId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const entry = sessions[i].entries.find((e) => e.exerciseId === exerciseId);
    if (entry && typeof entry.weight === 'number') return entry.weight;
  }
  return null;
}

/** Every logged weight for an exercise over time — feeds the sparkline. */
export function historyFor(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && typeof entry.weight === 'number') {
      out.push({ date: s.date, weight: entry.weight, sets: entry.sets || [] });
    }
  }
  return out;
}

/** THE RULE. */
export function isReadyHeavier(sessions, workoutId, exercise) {
  const last = lastSessionFor(sessions, workoutId);
  if (!last) return false;
  const entry = last.entries.find((e) => e.exerciseId === exercise.id);
  if (!entry || !entry.sets || entry.sets.length === 0) return false;
  return entry.sets.every((reps) => reps >= exercise.repHigh);
}

/** How many exercises in this workout are flagged — shown on the Home screen. */
export function readyCount(sessions, workout) {
  return workout.exercises.filter((ex) => isReadyHeavier(sessions, workout.id, ex)).length;
}
