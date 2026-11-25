import { h, fmtWeight, relDate, shortDate, sparkline, tidy, copyText, toast } from '../ui.js';
import { navigate, state } from '../router.js';
import { historyFor, isReadyHeavier, lastSessionFor, lastWeightFor } from '../progression.js';

export async function renderProgress() {
  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, 'Progress',
        h('div', { class: 'head-sub' }, `${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'} logged`)
      ),
      h('button', { class: 'copy-btn', onClick: copyProgress }, 'Copy')
    )
  );

  if (!state.sessions.length) {
    screen.append(h('div', { class: 'empty' },
      'No sessions yet.', h('br'), 'Finish a workout and your progress shows up here.'));
    return screen;
  }

  for (const workout of state.workouts) {
    const last = lastSessionFor(state.sessions, workout.id);
    screen.append(h('div', { class: 'prog-group-title' },
      `${workout.num || ''} ${workout.label} — ${last ? relDate(last.date) : 'not logged'}`.trim()));

    for (const ex of workout.exercises) screen.append(exerciseCard(ex, workout.id));
  }

  const archived = archivedLifts();
  if (archived.length) {
    screen.append(h('div', { class: 'prog-group-title' }, 'Archived'));
    for (const ex of archived) screen.append(exerciseCard(ex, null));
  }

  return screen;
}

/**
 * Lifts you've logged but that are no longer on any workout (retired machines,
 * swapped exercises). Derived from your sessions, so "archiving" a lift is just
 * taking it off its workouts — its history stays here, nothing is deleted.
 */
function archivedLifts() {
  const onAWorkout = new Set(state.workouts.flatMap((w) => w.exercises.map((e) => e.id)));
  const found = new Map();
  for (const s of state.sessions) {
    for (const e of s.entries) {
      if (!onAWorkout.has(e.exerciseId)) found.set(e.exerciseId, e.name || e.exerciseId); // oldest-first, so the latest name wins
    }
  }
  return [...found].map(([id, name]) => ({ id, name }));
}

function exerciseCard(ex, workoutId) {
  const archived = workoutId === null;
  const history = historyFor(state.sessions, ex.id, { from: ex.statsFrom });
  const ready = archived ? false : isReadyHeavier(state.sessions, workoutId, ex);
  const current = lastWeightFor(state.sessions, ex.id, { from: ex.statsFrom });
  const first = history.length ? history[0].weight : null;
  const gain = current !== null && first !== null ? current - first : 0;

  let sub;
  if (!history.length) sub = ex.statsFrom ? `Counting from ${shortDate(ex.statsFrom)}` : 'Not logged yet';
  else if (ready) sub = h('span', { style: { color: 'var(--green)' } }, '▲ Ready to go heavier');
  else if (gain > 0) sub = `+${fmtWeight(gain)} lb since ${shortDate(history[0].date)}`;
  else sub = `${history.length} session${history.length === 1 ? '' : 's'} · since ${shortDate(history[0].date)}`;

  return h('button', {
    class: 'card card-btn',
    onClick: () => navigate('exercise', { exerciseId: ex.id, workoutId: workoutId || undefined }),
  },
    h('div', { class: 'prog-row' },
      h('div', { class: 'prog-left' },
        h('div', { class: 'prog-name' }, ex.name),
        h('div', { class: 'prog-sub' }, sub)
      ),
      h('div', { class: 'prog-right' },
        sparkline(history.map((p) => p.weight), ready),
        h('div', { class: 'prog-weight' },
          current === null ? fmtWeight(ex.weight) : fmtWeight(current),
          h('small', {}, 'lb')
        )
      )
    )
  );
}

// --- Copy: a plain-text summary of every lift, for pasting elsewhere ---------
// e.g.  Hack Squat - 6 sessions logged - up 10 lb since start (60 -> 70 lb)
// An exercise that sits on two workouts shares one history, so it's listed
// once, under the first workout it appears in. Archived lifts come last.

function liftLine(ex) {
  const history = historyFor(state.sessions, ex.id, { from: ex.statsFrom });
  const since = ex.statsFrom ? shortDate(ex.statsFrom) : 'start';
  if (!history.length) {
    return ex.statsFrom ? `${ex.name} - no sessions since ${since} yet` : `${ex.name} - not logged yet`;
  }

  const first = history[0].weight;
  const current = history[history.length - 1].weight;
  const gain = tidy(current - first);
  const change = gain > 0 ? `up ${fmtWeight(gain)} lb since ${since}`
    : gain < 0 ? `down ${fmtWeight(Math.abs(gain))} lb since ${since}`
    : `no change since ${since}`;
  return `${ex.name} - ${history.length} session${history.length === 1 ? '' : 's'} logged - ${change} (${fmtWeight(first)} -> ${fmtWeight(current)} lb)`;
}

function progressText() {
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const out = [`Lift progress (as of ${today})`];
  const seen = new Set();

  for (const workout of state.workouts) {
    const lines = [];
    for (const ex of workout.exercises) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      lines.push(liftLine(ex));
    }
    if (lines.length) out.push('', workout.label, ...lines);
  }

  const archived = archivedLifts();
  if (archived.length) out.push('', 'Archived', ...archived.map(liftLine));
  return out.join('\n');
}

function copyProgress() {
  if (!state.sessions.length) { toast('Nothing logged yet'); return; }
  copyText(progressText());
}
