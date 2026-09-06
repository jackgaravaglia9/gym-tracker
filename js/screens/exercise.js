import { h, fmtWeight, shortDate, sparkline } from '../ui.js';
import { navigate, state } from '../router.js';
import { historyFor, lastWeightFor, isReadyHeavier, sessionsSinceIncrease } from '../progression.js';

export async function renderExercise({ exerciseId, workoutId }) {
  const workout = state.workouts.find((w) => w.id === workoutId);
  const ex = workout ? workout.exercises.find((e) => e.id === exerciseId) : null;
  const history = historyFor(state.sessions, exerciseId);

  // The exercise may since have been renamed or removed from the template —
  // fall back to the name each historical entry saved for itself, so history
  // never breaks just because the workout list changed.
  const name = ex ? ex.name : (history.length ? history[history.length - 1].name : 'Exercise');

  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('progress') }, '‹'),
      h('div', { class: 'head-title' }, name,
        h('div', { class: 'head-sub' }, workout ? workout.label : ''))
    )
  );

  if (!history.length) {
    screen.append(h('div', { class: 'empty' }, `${name} hasn't been logged yet.`));
    return screen;
  }

  const current = lastWeightFor(state.sessions, exerciseId);
  const first = history[0].weight;
  const gain = current - first;
  const ready = ex ? isReadyHeavier(state.sessions, workout.id, ex) : false;
  const plateau = sessionsSinceIncrease(history);

  const stats = h('div', { class: 'card' },
    h('div', { class: 'stat-row' },
      h('span', { class: 'stat-label' }, 'Current weight'),
      h('span', { class: 'stat-value' }, `${fmtWeight(current)} lb`)
    ),
    h('div', { class: 'stat-row' },
      h('span', { class: 'stat-label' }, 'Started at'),
      h('span', { class: 'stat-value' }, `${fmtWeight(first)} lb · ${shortDate(history[0].date)}`)
    ),
    h('div', { class: 'stat-row' },
      h('span', { class: 'stat-label' }, 'Total gain'),
      h('span', { class: 'stat-value' }, gain > 0 ? `+${fmtWeight(gain)} lb` : `${fmtWeight(gain)} lb`)
    ),
    h('div', { class: 'stat-row' },
      h('span', { class: 'stat-label' }, 'Logged'),
      h('span', { class: 'stat-value' }, `${history.length} time${history.length === 1 ? '' : 's'}`)
    ),
    (ready || plateau >= 2) && h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' } },
      ready && h('span', { class: 'ready-flag' }, '▲ Go heavier'),
      plateau >= 2 && h('span', { class: 'chip' }, `No increase in your last ${plateau} sessions`)
    )
  );

  const spark = sparkline(history.map((p) => p.weight), ready, { width: 320, height: 110 });
  spark.classList.add('spark-lg');

  const historyList = h('div', { class: 'sets' },
    ...[...history].reverse().map((p) =>
      h('button', {
        class: 'set-row',
        onClick: () => navigate('day', { date: p.date }),
      },
        h('span', { class: 'set-label' }, shortDate(p.date)),
        h('span', { class: 'set-hint' }, `${fmtWeight(p.weight)} lb — ${p.sets.join(', ')} reps`)
      )
    )
  );

  screen.append(
    stats,
    h('div', { class: 'card' }, spark),
    h('div', { class: 'prog-group-title' }, 'History'),
    historyList
  );

  return screen;
}
