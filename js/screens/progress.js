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

    for (const ex of workout.exercises) {
      const history = historyFor(state.sessions, ex.id);
      const ready = isReadyHeavier(state.sessions, workout.id, ex);
      const current = lastWeightFor(state.sessions, ex.id);
      const first = history.length ? history[0].weight : null;
      const gain = current !== null && first !== null ? current - first : 0;

      let sub;
      if (!history.length) sub = 'Not logged yet';
      else if (ready) sub = h('span', { style: { color: 'var(--green)' } }, '▲ Ready to go heavier');
      else if (gain > 0) sub = `+${fmtWeight(gain)} lb since ${shortDate(history[0].date)}`;
      else sub = `${history.length} session${history.length === 1 ? '' : 's'} · since ${shortDate(history[0].date)}`;

      screen.append(h('button', {
        class: 'card card-btn',
        onClick: () => navigate('exercise', { exerciseId: ex.id, workoutId: workout.id }),
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
      ));
    }
  }

  return screen;
}

// --- Copy: a plain-text summary of every lift, for pasting elsewhere ---------
// e.g.  Hack Squat - 6 sessions logged - up 10 lb since start (60 -> 70 lb)
// An exercise that sits on two workouts (Ab Crunch) shares one history, so it's
// listed once, under the first workout it appears in.

function progressText() {
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const out = [`Lift progress (as of ${today})`];
  const seen = new Set();

  for (const workout of state.workouts) {
    const lines = [];
    for (const ex of workout.exercises) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);

      const history = historyFor(state.sessions, ex.id);
      if (!history.length) { lines.push(`${ex.name} - not logged yet`); continue; }

      const first = history[0].weight;
      const current = history[history.length - 1].weight;
      const gain = tidy(current - first);
      const change = gain > 0 ? `up ${fmtWeight(gain)} lb since start`
        : gain < 0 ? `down ${fmtWeight(Math.abs(gain))} lb since start`
        : 'no change since start';
      lines.push(`${ex.name} - ${history.length} session${history.length === 1 ? '' : 's'} logged - ${change} (${fmtWeight(first)} -> ${fmtWeight(current)} lb)`);
    }
    if (lines.length) out.push('', workout.label, ...lines);
  }
  return out.join('\n');
}

function copyProgress() {
  if (!state.sessions.length) { toast('Nothing logged yet'); return; }
  copyText(progressText());
}
