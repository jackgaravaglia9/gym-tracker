import { h, toast, relDate } from '../ui.js';
import { navigate, state } from '../router.js';
import * as store from '../store.js';
import * as sync from '../sync.js';

export async function renderSettings() {
  // Edit a COPY. Nothing touches your real data until you press Save.
  let workouts = structuredClone(state.workouts);
  let dirty = false;

  const wrap = h('div', { class: 'screen' });

  const markDirty = () => { dirty = true; saveBtn.textContent = 'Save changes •'; };

  const saveBtn = h('button', { class: 'nav-btn btn-primary', onClick: save }, 'Save changes');

  async function save() {
    // Sanity-check the numbers so a stray keystroke can't corrupt a workout.
    for (const w of workouts) {
      for (const ex of w.exercises) {
        ex.name = (ex.name || '').trim() || 'Untitled exercise';
        ex.weight = clamp(num(ex.weight, 0), 0, 2000);
        ex.step = clamp(num(ex.step, 5), 0.5, 100);
        ex.sets = clamp(Math.round(num(ex.sets, 3)), 1, 10);
        ex.repLow = clamp(Math.round(num(ex.repLow, 8)), 1, 100);
        ex.repHigh = clamp(Math.round(num(ex.repHigh, 10)), ex.repLow, 100);
      }
      w.label = (w.label || '').trim() || 'Workout';
    }
    await store.saveWorkouts(workouts);
    dirty = false;
    toast('Workouts saved');
    navigate('home');
  }

  function leave() {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('home');
  }

  function build() {
    wrap.replaceChildren();
    wrap.append(
      h('div', { class: 'head' },
        h('button', { class: 'back', 'aria-label': 'Back', onClick: leave }, '‹'),
        h('div', { class: 'head-title' }, 'Edit Workouts',
          h('div', { class: 'head-sub' }, 'Your logged history is always kept')
        )
      )
    );

    workouts.forEach((w, wi) => {
      const card = h('div', { class: 'card' });

      card.append(
        h('div', { class: 'ex-head' },
          h('div', { class: 'day-num', style: { paddingTop: '6px' } }, w.num || ''),
          h('div', { class: 'ex-name', style: { paddingLeft: '4px' } }, w.label)
        ),
        textField('Workout name', w.label, (v) => { w.label = v; markDirty(); })
      );

      w.exercises.forEach((ex, i) => {
        card.append(
          h('div', { class: 'ex-editor' },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('div', { class: 'prog-name', style: { flex: '1', minWidth: '0' } }, ex.name || 'New exercise'),
              h('div', { class: 'editor-tools' },
                h('button', { class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0,
                  onClick: () => { move(w.exercises, i, -1); markDirty(); build(); } }, '↑'),
                h('button', { class: 'icon-btn', 'aria-label': 'Move down', disabled: i === w.exercises.length - 1,
                  onClick: () => { move(w.exercises, i, 1); markDirty(); build(); } }, '↓'),
                h('button', { class: 'icon-btn', 'aria-label': 'Delete exercise',
                  onClick: () => {
                    if (!confirm(`Remove ${ex.name} from ${w.label}?\n\nPast sessions keep their record of it.`)) return;
                    w.exercises.splice(i, 1); markDirty(); build();
                  } }, '🗑')
              )
            ),
            textField('Exercise name', ex.name, (v) => { ex.name = v; markDirty(); }),
            h('div', { class: 'grid-2' },
              numField('Start weight (lb)', ex.weight, (v) => { ex.weight = v; markDirty(); }, 0.5),
              numField('+/− step', ex.step, (v) => { ex.step = v; markDirty(); }, 0.5)
            ),
            h('div', { class: 'grid-3' },
              numField('Sets', ex.sets, (v) => { ex.sets = v; markDirty(); }, 1),
              numField('Reps low', ex.repLow, (v) => { ex.repLow = v; markDirty(); }, 1),
              numField('Reps high', ex.repHigh, (v) => { ex.repHigh = v; markDirty(); }, 1)
            )
          )
        );
      });

      card.append(
        h('button', {
          class: 'nav-btn', style: { marginTop: '16px' },
          onClick: () => {
            w.exercises.push({
              id: 'ex-' + store.newId(), name: '', weight: 20, step: 5, sets: 3, repLow: 8, repHigh: 10,
            });
            markDirty(); build();
            wrap.querySelectorAll('.card')[wi].scrollIntoView({ block: 'end', behavior: 'smooth' });
          },
        }, '+ Add exercise')
      );

      wrap.append(card);
    });

    wrap.append(saveBtn);
    if (sync.isConfigured()) {
      wrap.append(
        h('div', { class: 'prog-group-title', style: { marginTop: '30px' } }, 'Cloud Sync'),
        syncCard()
      );
    }
    wrap.append(
      h('div', { class: 'prog-group-title', style: { marginTop: '30px' } }, 'Backup & Reset'),
      h('div', { class: 'card' },
        h('div', { class: 'btn-row' },
          h('button', { class: 'nav-btn', style: { marginTop: 0 }, onClick: exportBackup }, 'Export'),
          h('button', { class: 'nav-btn', style: { marginTop: 0 }, onClick: importBackup }, 'Import')
        ),
        h('div', { class: 'small-note' },
          'Export saves a .json file with every workout and session. Keep one somewhere safe — ',
          'if you delete the app from your home screen, iOS eventually clears its stored data.'
        ),
        h('button', { class: 'nav-btn', onClick: resetDefaults }, 'Reset to defaults'),
        h('button', { class: 'nav-btn btn-danger', onClick: eraseAll }, 'Erase all data')
      )
    );
  }

  function syncCard() {
    const s = sync.getStatus();
    if (!s.signedIn) {
      return h('div', { class: 'card' },
        h('div', { class: 'small-note' }, 'Not signed in — your data stays on this device only.'),
        h('button', { class: 'nav-btn btn-primary', onClick: () => navigate('auth') }, 'Enable cloud backup')
      );
    }
    const syncNowBtn = h('button', {
      class: 'nav-btn', style: { marginTop: 0 },
      onClick: async () => { await sync.syncNow(); build(); },
    }, s.syncing ? 'Syncing…' : 'Sync now');
    syncNowBtn.disabled = s.syncing;

    return h('div', { class: 'card' },
      h('div', { class: 'small-note' },
        `Signed in as ${s.email}`, h('br'),
        s.error ? `Last sync failed: ${s.error}` : s.lastSyncedAt ? `Last synced ${relDate(s.lastSyncedAt).toLowerCase()}` : 'Not synced yet'
      ),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        syncNowBtn,
        h('button', {
          class: 'nav-btn btn-danger', style: { marginTop: 0 },
          onClick: async () => { if (!confirm('Sign out of cloud sync on this device?')) return; await sync.signOut(); build(); },
        }, 'Sign out')
      )
    );
  }

  // --- Backup actions ------------------------------------------------------
  async function exportBackup() {
    const data = await store.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([JSON.stringify(data, null, 2)], `gym-tracker-${stamp}.json`,
      { type: 'application/json' });

    // On iPhone the share sheet is the reliable way to keep a file; a plain
    // download link often does nothing in home-screen (standalone) mode.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* cancelled */ }
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Backup exported');
  }

  function importBackup() {
    const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!confirm('Import this backup? It replaces your current workouts and sessions.')) return;
        await store.importAll(data);
        toast('Backup imported');
        navigate('home');
      } catch (err) {
        alert(`Couldn't import that file.\n\n${err.message}`);
      }
    });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  }

  async function resetDefaults() {
    if (!confirm('Reset your workout list to the built-in defaults?\n\nLogged sessions are NOT deleted.')) return;
    workouts = await store.resetWorkouts();
    dirty = false;
    toast('Workouts reset');
    build();
  }

  async function eraseAll() {
    if (!confirm('Erase EVERYTHING — all workouts and all logged sessions?\n\nThis cannot be undone.')) return;
    if (!confirm('Really erase all of your logged history?')) return;
    await store.eraseEverything();
    toast('All data erased');
    navigate('home');
  }

  build();
  const unsubscribe = sync.onStatusChange(() => build());
  return { node: wrap, cleanup: unsubscribe };
}

// --- little form helpers -----------------------------------------------------
function textField(label, value, onChange) {
  const input = h('input', { type: 'text', value: value ?? '' });
  input.addEventListener('input', () => onChange(input.value));
  return h('div', { class: 'field' }, h('label', {}, label), input);
}

function numField(label, value, onChange, step) {
  const input = h('input', { type: 'number', inputmode: 'decimal', step, value: value ?? '' });
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  return h('div', { class: 'field' }, h('label', {}, label), input);
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function move(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
