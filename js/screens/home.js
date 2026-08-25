import { h, relDate } from '../ui.js';
import { navigate, state } from '../router.js';
import { lastSessionFor, readyCount } from '../progression.js';
import * as store from '../store.js';
import * as sync from '../sync.js';

export async function renderHome() {
  const draft = await store.getDraft();
  const dismissed = await store.getSyncPromptDismissed();
  const syncStatus = sync.getStatus();

  const timeEl = h('div', { class: 'clock-time' });
  const dateEl = h('div', { class: 'clock-date' });

  function tick() {
    const now = new Date();
    let hh = now.getHours();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeEl.replaceChildren(
      document.createTextNode(`${hh}:${mm}`),
      h('span', { class: 'ampm' }, ampm)
    );
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }
  tick();
  const timer = setInterval(tick, 1000);

  const dayButtons = state.workouts.map((w) => {
    const last = lastSessionFor(state.sessions, w.id);
    const ready = readyCount(state.sessions, w);
    return h('button', { class: 'day-btn', onClick: () => navigate('workout', { workoutId: w.id }) },
      h('div', { class: 'day-top' },
        h('span', { class: 'day-num' }, w.num || ''),
        h('span', { class: 'day-name' }, w.label),
        h('span', { class: 'day-chev' }, '›')
      ),
      h('div', { class: 'day-meta' },
        h('span', {}, last ? `Last: ${relDate(last.date)}` : 'Not logged yet'),
        ready > 0 && h('span', { class: 'flag-pill' }, `▲ ${ready} ready to go heavier`)
      )
    );
  });

  const resume = draft
    ? h('button', {
        class: 'day-btn',
        style: { borderColor: 'rgba(255,154,31,.45)', background: 'rgba(255,154,31,.08)' },
        onClick: () => navigate('workout', { workoutId: draft.workoutId }),
      },
      h('div', { class: 'day-top' },
        h('span', { class: 'day-num' }, 'IN PROGRESS'),
        h('span', { class: 'day-chev' }, '›')
      ),
      h('div', { class: 'day-meta' },
        h('span', {}, `Resume ${labelFor(draft.workoutId)} — started ${relDate(draft.startedAt).toLowerCase()}`)
      )
    )
    : null;

  const showSyncBanner = sync.isConfigured() && !syncStatus.signedIn && !dismissed;
  const syncBanner = showSyncBanner
    ? h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h('div', { style: { flex: '1' } },
          h('div', { class: 'prog-name', style: { fontSize: '17px' } }, '☁ Enable cloud backup'),
          h('div', { class: 'prog-sub' }, 'Sync your workouts across devices')
        ),
        h('button', {
          class: 'nav-btn btn-primary', style: { marginTop: 0, flex: '0 0 auto', width: 'auto', padding: '0 16px' },
          onClick: () => navigate('auth'),
        }, 'Enable'),
        h('button', {
          class: 'icon-btn', 'aria-label': 'Dismiss',
          onClick: async () => { await store.setSyncPromptDismissed(); navigate('home'); },
        }, '✕')
      )
    : null;

  return {
    node: h('div', { class: 'screen' },
      h('div', { class: 'clock' }, timeEl, dateEl),
      syncBanner,
      resume,
      ...dayButtons,
      h('button', { class: 'nav-btn', onClick: () => navigate('progress') }, 'Progress'),
      h('button', { class: 'nav-btn', onClick: () => navigate('calendar') }, 'Calendar'),
      h('button', { class: 'nav-btn', onClick: () => navigate('settings') }, 'Edit Workouts')
    ),
    cleanup: () => clearInterval(timer),
  };
}

function labelFor(workoutId) {
  const w = state.workouts.find((x) => x.id === workoutId);
  return w ? w.label : 'workout';
}
