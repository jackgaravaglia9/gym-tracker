import { h, fmtWeight, relDate, shortDate, sparkline } from '../ui.js';
import { navigate, state } from '../router.js';
import { historyFor, isReadyHeavier, lastSessionFor, lastWeightFor } from '../progression.js';

export async function renderProgress() {
  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, 'Progress',
        h('div', { class: 'head-sub' }, `${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'} logged`)
      )
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
