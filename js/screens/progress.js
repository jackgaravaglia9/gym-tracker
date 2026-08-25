import { h, svg, fmtWeight, relDate, shortDate } from '../ui.js';
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

      screen.append(h('div', { class: 'card' },
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

/** A tiny weight-over-time line. Amber normally, green when you're flagged. */
function sparkline(values, ready) {
  const W = 84, H = 30, PAD = 3;
  const stroke = ready ? 'var(--green)' : 'var(--amber)';
  const node = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });

  if (values.length === 0) {
    node.append(svg('line', {
      x1: PAD, y1: H / 2, x2: W - PAD, y2: H / 2,
      stroke: 'var(--border)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '2 4',
    }));
    return node;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const pt = (v, i) => [
    PAD + i * stepX,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ];
  const points = values.map(pt);

  if (values.length === 1) {
    // One data point: a flat baseline plus the dot, so it doesn't look broken.
    node.append(svg('line', {
      x1: PAD, y1: H / 2, x2: W - PAD, y2: H / 2,
      stroke: 'var(--border)', 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    node.append(svg('circle', { cx: W - PAD, cy: H / 2, r: 3, fill: stroke }));
    return node;
  }

  node.append(svg('polyline', {
    points: points.map((p) => p.join(',')).join(' '),
    fill: 'none', stroke, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
  const lastPt = points[points.length - 1];
  node.append(svg('circle', { cx: lastPt[0], cy: lastPt[1], r: 3, fill: stroke }));
  return node;
}
