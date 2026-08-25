import { h, openSheet } from '../ui.js';
import { navigate, state } from '../router.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export async function renderCalendar() {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed

  const monthLabel = h('div', { class: 'cal-month' });
  const grid = h('div', { class: 'cal-grid' });

  function sessionsOn(y, m, d) {
    return state.sessions.filter((s) => {
      const sd = new Date(s.date);
      return sd.getFullYear() === y && sd.getMonth() === m && sd.getDate() === d;
    });
  }

  async function chooseWorkoutFor(dateObj) {
    const workoutId = await openSheet('Log a workout',
      state.workouts.map((w) => ({ label: w.label, value: w.id })));
    if (!workoutId) return;
    navigate('workout', { workoutId, date: dateObj.toISOString() });
  }

  function onDayTap(day) {
    const dateObj = new Date(viewYear, viewMonth, day, 12, 0, 0);
    const sessions = sessionsOn(viewYear, viewMonth, day);
    if (sessions.length) navigate('day', { date: dateObj.toISOString() });
    else chooseWorkoutFor(dateObj);
  }

  function buildGrid() {
    grid.replaceChildren();
    monthLabel.textContent = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    DOW.forEach((d) => grid.append(h('div', { class: 'cal-dow' }, d)));

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) grid.append(h('div', { class: 'cal-cell blank' }));

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
      const count = sessionsOn(viewYear, viewMonth, day).length;
      grid.append(
        h('button', {
          class: 'cal-cell' + (isToday ? ' today' : '') + (count ? ' has-log' : ''),
          onClick: () => onDayTap(day),
        },
          h('span', { class: 'cal-daynum' }, day),
          count ? h('span', { class: 'cal-dot' }) : null
        )
      );
    }
  }

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    buildGrid();
  }

  buildGrid();

  return h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, 'Calendar',
        h('div', { class: 'head-sub' }, 'Tap a day to log or view a workout'))
    ),
    h('div', { class: 'cal-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onClick: () => shiftMonth(-1) }, '‹'),
      monthLabel,
      h('button', { class: 'icon-btn', 'aria-label': 'Next month', onClick: () => shiftMonth(1) }, '›')
    ),
    grid
  );
}
