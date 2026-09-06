import { h, fmtWeight, toast, openSheet } from '../ui.js';
import { navigate, state } from '../router.js';
import * as store from '../store.js';

export async function renderDay({ date }) {
  const target = new Date(date);
  const sameDay = (iso) => {
    const d = new Date(iso);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
  };
  const sessions = state.sessions.filter((s) => sameDay(s.date));
  const weight = state.bodyWeights.find((w) => sameDay(w.date)) || null;

  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('calendar') }, '‹'),
      h('div', { class: 'head-title' },
        target.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))
    )
  );

  if (!sessions.length && !weight) {
    screen.append(h('div', { class: 'empty' }, 'Nothing logged this day.'));
  }

  if (weight) {
    screen.append(
      h('div', { class: 'card' },
        h('div', { class: 'ex-head' }, h('div', { class: 'ex-name' }, 'Body Weight')),
        h('div', { style: { marginTop: '10px' } },
          h('div', { class: 'prog-weight', style: { fontSize: '24px' } }, fmtWeight(weight.weight), h('small', {}, 'lb')),
          h('div', { class: 'prog-sub' }, `Logged at ${new Date(weight.loggedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`)
        ),
        h('button', {
          class: 'nav-btn', style: { marginTop: '14px' },
          onClick: () => navigate('weight', { date: target.toISOString() }),
        }, 'Edit')
      )
    );
  }

  for (const session of sessions) {
    const workout = state.workouts.find((w) => w.id === session.workoutId);
    const card = h('div', { class: 'card' },
      h('div', { class: 'ex-head' }, h('div', { class: 'ex-name' }, workout ? workout.label : 'Workout'))
    );

    for (const entry of session.entries) {
      card.append(
        h('div', { style: { marginTop: '14px' } },
          h('div', { class: 'prog-name', style: { fontSize: '18px' } }, entry.name || entry.exerciseId),
          h('div', { class: 'prog-sub' }, `${fmtWeight(entry.weight)} lb — ${entry.sets.join(', ')} reps`)
        )
      );
    }

    card.append(
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', {
          class: 'nav-btn', style: { marginTop: 0 },
          onClick: () => navigate('workout', { workoutId: session.workoutId, sessionId: session.id }),
        }, 'Edit'),
        h('button', {
          class: 'nav-btn btn-danger', style: { marginTop: 0 },
          onClick: () => removeSession(session.id),
        }, 'Delete')
      )
    );
    screen.append(card);
  }

  async function removeSession(id) {
    if (!confirm('Delete this workout log? This cannot be undone.')) return;
    await store.deleteSession(id);
    toast('Log deleted');
    navigate('calendar');
  }

  async function addAnother() {
    const workoutId = await openSheet('Log a workout',
      state.workouts.map((w) => ({ label: w.label, value: w.id })));
    if (!workoutId) return;
    navigate('workout', { workoutId, date: target.toISOString() });
  }

  screen.append(h('button', { class: 'nav-btn', onClick: addAnother }, '+ Log another workout this day'));

  if (!weight) {
    screen.append(h('button', {
      class: 'nav-btn',
      onClick: () => navigate('weight', { date: target.toISOString() }),
    }, '+ Log body weight this day'));
  }

  return screen;
}
