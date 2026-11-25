import { h, fmtWeight, shortDate, sparkline } from '../ui.js';
import { navigate, state } from '../router.js';
import { historyFor, isReadyHeavier, sessionsSinceIncrease } from '../progression.js';

export async function renderExercise({ exerciseId, workoutId }) {
  const workout = state.workouts.find((w) => w.id === workoutId);
  const ex = workout ? workout.exercises.find((e) => e.id === exerciseId) : null;

  // `from` is set when the machine changed: progress only counts sessions on or
  // after it, but every older session is still listed below.
  const from = ex ? ex.statsFrom : null;
  const all = historyFor(state.sessions, exerciseId);
  const history = from ? historyFor(state.sessions, exerciseId, { from }) : all;

  // The exercise may since have been renamed or removed from the template —
  // fall back to the name each historical entry saved for itself, so history
  // never breaks just because the workout list changed.
  const name = ex ? ex.name : (all.length ? all[all.length - 1].name : 'Exercise');

  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('progress') }, '‹'),
      h('div', { class: 'head-title' }, name,
        h('div', { class: 'head-sub' }, workout ? workout.label : ''))
    )
  );

  if (!all.length) {
    screen.append(h('div', { class: 'empty' }, `${name} hasn't been logged yet.`));
    return screen;
  }

  const ready = ex ? isReadyHeavier(state.sessions, workout.id, ex) : false;
  const plateau = sessionsSinceIncrease(history);

  const chips = [
    ready && h('span', { class: 'ready-flag' }, '▲ Go heavier'),
    plateau >= 2 && h('span', { class: 'chip' }, `No increase in your last ${plateau} sessions`),
    from && h('span', { class: 'chip' }, `Counting from ${shortDate(from)} (machine change)`),
  ].filter(Boolean);
  const chipRow = chips.length
    ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' } }, ...chips)
    : null;

  if (history.length) {
    const current = history[history.length - 1].weight;
    const first = history[0].weight;
    const gain = current - first;
    screen.append(h('div', { class: 'card' },
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
      chipRow
    ));

    const spark = sparkline(history.map((p) => p.weight), ready, { width: 320, height: 110 });
    spark.classList.add('spark-lg');
    screen.append(h('div', { class: 'card' }, spark));
  } else {
    // Machine changed but nothing logged on the new one yet.
    screen.append(h('div', { class: 'card' },
      h('div', { class: 'stat-row' },
        h('span', { class: 'stat-label' }, 'Starting weight'),
        h('span', { class: 'stat-value' }, `${fmtWeight(ex.weight)} lb`)
      ),
      chipRow,
      h('div', { class: 'small-note' }, 'No sessions logged since the machine change yet.')
    ));
  }

  const isEarlier = (p) => Boolean(from) && new Date(p.date) < new Date(from);
  const row = (p) => h('button', {
    class: 'set-row' + (isEarlier(p) ? ' old' : ''),
    onClick: () => navigate('day', { date: p.date }),
  },
    h('span', { class: 'set-label' }, shortDate(p.date)),
    h('span', { class: 'set-hint' }, `${fmtWeight(p.weight)} lb — ${p.sets.join(', ')} reps`)
  );

  const newestFirst = [...all].reverse();
  const recentRows = newestFirst.filter((p) => !isEarlier(p)).map(row);
  const earlierRows = newestFirst.filter(isEarlier).map(row);

  if (recentRows.length) {
    screen.append(h('div', { class: 'prog-group-title' }, 'History'), h('div', { class: 'sets' }, ...recentRows));
  }
  if (earlierRows.length) {
    screen.append(
      h('div', { class: 'prog-group-title' }, `Before ${shortDate(from)} · earlier machine`),
      h('div', { class: 'sets' }, ...earlierRows)
    );
  }

  return screen;
}
