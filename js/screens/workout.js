import { h, toast, fmtWeight, tidy, relDate, shortDate, toDateInputValue, fromDateInputValue } from '../ui.js';
import { navigate, state } from '../router.js';
import { lastWeightFor, lastSessionFor, lastEntryFor, isReadyHeavier } from '../progression.js';
import * as store from '../store.js';

// Three ways this screen gets used:
//   { workoutId }                  -> today, live: resumes an auto-saved draft,
//                                     Finish stamps the current time.
//   { workoutId, date }             -> backfill: logging a workout for a day
//                                     that has nothing recorded yet.
//   { workoutId, sessionId }        -> edit: reopens an already-saved day so
//                                     you can correct weights/reps or delete it.
//
// Across all three, "last time" comparisons (weight defaults, the "same as
// last time" chip, the go-heavier flag) are bounded to sessions strictly
// before the date being logged — so backfilling an old Thursday after you've
// already logged Friday still compares against what came before Thursday.

export async function renderWorkout({ workoutId, date, sessionId }) {
  const workout = state.workouts.find((w) => w.id === workoutId);
  if (!workout) return h('div', { class: 'empty' }, 'That workout no longer exists.');

  const mode = sessionId ? 'edit' : date ? 'backfill' : 'live';

  if (mode === 'edit') {
    const existing = state.sessions.find((s) => s.id === sessionId);
    if (!existing) {
      return h('div', { class: 'screen' },
        h('div', { class: 'head' },
          h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('calendar') }, '‹'),
          h('div', { class: 'head-title' }, 'Not found')
        ),
        h('div', { class: 'empty' }, 'That log no longer exists.'));
    }
    return buildScreen(workout, mode, existing.date, null, existing);
  }

  if (mode === 'backfill') {
    return buildScreen(workout, mode, date, null, null);
  }

  // --- live mode: resume today's draft, or start a fresh one ----------------
  let draft = await store.getDraft();
  if (draft && draft.workoutId !== workoutId) {
    const other = state.workouts.find((w) => w.id === draft.workoutId);
    const ok = confirm(
      `You have an unfinished ${other ? other.label : 'workout'}.\n\nStarting ${workout.label} will discard it.`
    );
    if (!ok) { navigate('home'); return h('div'); }
    await store.clearDraft();
    draft = null;
  }
  return buildScreen(workout, mode, new Date().toISOString(), draft && draft.workoutId === workoutId ? draft : null, null);
}

// `resumedLiveDraft` (live mode only) is an in-progress draft: its entries are
// already keyed by exercise id in the working shape ({ weight, sets: [{done,
// reps}] }). `editingSession` (edit mode only) is a genuine FINISHED session
// pulled from storage: its entries are the saved array shape ({ exerciseId,
// weight, sets: [reps, ...] }). These two are deliberately kept separate —
// collapsing them caused a bug where a resumed draft was parsed as if it were
// a finished session's array-shaped entries.
function buildScreen(workout, mode, initialDateISO, resumedLiveDraft, editingSession) {
  const originalDateISO = editingSession ? editingSession.date : initialDateISO;

  let session;
  if (editingSession) {
    session = {
      id: editingSession.id,
      date: editingSession.date,
      entries: Object.fromEntries(
        workout.exercises.map((ex) => {
          const saved = editingSession.entries.find((e) => e.exerciseId === ex.id);
          return [ex.id, saved
            ? { weight: saved.weight, sets: saved.sets.map((reps) => ({ done: true, reps })) }
            : { weight: lastWeightFor(state.sessions, ex.id, { from: ex.statsFrom, beforeDate: editingSession.date, excludeId: editingSession.id }) ?? ex.weight, sets: [] }];
        })
      ),
    };
  } else if (resumedLiveDraft) {
    session = { id: resumedLiveDraft.id, date: resumedLiveDraft.date, entries: {} };
    workout.exercises.forEach((ex) => {
      session.entries[ex.id] = resumedLiveDraft.entries[ex.id] || {
        weight: lastWeightFor(state.sessions, ex.id, { from: ex.statsFrom, beforeDate: initialDateISO }) ?? ex.weight,
        sets: Array.from({ length: ex.sets }, () => ({ done: false, reps: ex.repLow })),
      };
    });
  } else {
    session = {
      id: store.newId(),
      date: initialDateISO,
      entries: Object.fromEntries(
        workout.exercises.map((ex) => {
          const previous = lastWeightFor(state.sessions, ex.id, { from: ex.statsFrom, beforeDate: initialDateISO });
          return [ex.id, {
            weight: previous === null ? ex.weight : previous,
            sets: Array.from({ length: ex.sets }, () => ({ done: false, reps: ex.repLow })),
          }];
        })
      ),
    };
  }

  let saveTimer = null;
  function autosave() {
    if (mode !== 'live') return; // backfill/edit are quick one-off entries; only the live draft needs crash-recovery
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.saveDraft({ workoutId: workout.id, ...session }), 250);
  }

  const backTarget = mode === 'live' ? { name: 'home' }
    : mode === 'edit' ? { name: 'day', params: { date: originalDateISO } }
    : { name: 'calendar' };

  const headSub = h('div', { class: 'head-sub' });
  function updateHeadSub() {
    const last = lastSessionFor(state.sessions, workout.id, { beforeDate: session.date, excludeId: session.id });
    headSub.textContent = last ? `Last done ${relDate(last.date).toLowerCase()}` : 'First session';
  }

  const cardsWrap = h('div', {});
  const finishBtn = h('button', {
    class: 'finish-btn',
    onClick: mode === 'live' ? finishLive : mode === 'backfill' ? finishBackfill : finishEdit,
  });

  function doneSetCount() {
    return Object.values(session.entries).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  }
  function updateFinish() {
    const n = doneSetCount();
    const verb = mode === 'live' ? 'Finish' : 'Save';
    finishBtn.textContent = n ? `${verb} — ${n} set${n === 1 ? '' : 's'}` : (mode === 'live' ? 'Tap a set to start' : 'Log at least one set');
    finishBtn.disabled = n === 0;
  }

  function drawCard(ex) {
    const entry = session.entries[ex.id];
    const previous = lastWeightFor(state.sessions, ex.id, { from: ex.statsFrom, beforeDate: session.date, excludeId: session.id });
    const lastSession = lastSessionFor(state.sessions, workout.id, { beforeDate: session.date, excludeId: session.id });
    const lastEntry = lastEntryFor(state.sessions, ex.id, { from: ex.statsFrom, beforeDate: session.date, excludeId: session.id });
    const ready = isReadyHeavier(state.sessions, workout.id, ex);

    const card = h('div', { class: 'card' });
    const redraw = () => card.replaceWith(drawCard(ex));

    card.append(
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-name' }, ex.name),
        ready
          ? h('span', { class: 'ready-flag' }, '▲ Go heavier')
          : h('div', { class: 'ex-range' }, `${ex.repLow}–${ex.repHigh}`)
      )
    );
    if (ready) {
      card.append(h('div', { class: 'ex-range', style: { marginTop: '4px' } }, `Reps ${ex.repLow}–${ex.repHigh}`));
    }

    const weightDisplay = h('button', { class: 'weight-display', onClick: typeWeight },
      h('span', { class: 'weight-num' }, fmtWeight(entry.weight)),
      h('span', { class: 'weight-unit' }, 'lb')
    );

    function setWeight(v) {
      entry.weight = Math.max(0, tidy(v));
      autosave();
      redraw();
    }

    function typeWeight() {
      const input = h('input', {
        class: 'weight-input', type: 'number', inputmode: 'decimal',
        step: ex.step, value: entry.weight,
      });
      weightDisplay.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const v = parseFloat(input.value);
        setWeight(Number.isFinite(v) ? v : entry.weight);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    }

    card.append(
      h('div', { class: 'weight-row' },
        h('button', { class: 'stepper', onClick: () => setWeight(entry.weight - ex.step) }, '−'),
        weightDisplay,
        h('button', { class: 'stepper', onClick: () => setWeight(entry.weight + ex.step) }, '+')
      )
    );

    const chipRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    if (previous === null) {
      chipRow.append(h('span', { class: 'chip' }, 'First time logging this'));
    } else if (entry.weight === previous) {
      chipRow.append(h('span', { class: 'chip' }, 'Same as last time'));
    } else {
      const d = tidy(entry.weight - previous);
      chipRow.append(h('span', { class: 'chip changed' },
        `${d > 0 ? '+' : '−'}${fmtWeight(Math.abs(d))} lb from last time`));
    }
    if (lastEntry) {
      // If you skipped this lift last time, say when those reps are from.
      const fromEarlier = lastSession && lastEntry.sessionId !== lastSession.id;
      chipRow.append(h('span', { class: 'chip' },
        `Last${fromEarlier ? ` (${shortDate(lastEntry.date)})` : ''}: ${lastEntry.sets.join(' · ')} reps`));
    }
    card.append(chipRow);

    const setsWrap = h('div', { class: 'sets' });
    entry.sets.forEach((set, i) => {
      const label = h('span', { class: 'set-label' }, `Set ${i + 1}`);
      const removeSet = () => { entry.sets.splice(i, 1); autosave(); redraw(); updateFinish(); };

      if (!set.done) {
        setsWrap.append(
          h('div', { class: 'set-row' },
            h('button', {
              class: 'set-tap',
              onClick: () => { set.done = true; set.reps = ex.repLow; autosave(); redraw(); updateFinish(); },
            }, label, h('span', { class: 'set-hint' }, 'Tap when done')),
            h('button', { class: 'undo-btn', 'aria-label': 'Remove this set', onClick: removeSet }, '✕')
          )
        );
        return;
      }

      const bump = (delta) => { set.reps = Math.max(1, set.reps + delta); autosave(); redraw(); };
      setsWrap.append(
        h('div', { class: 'set-row done' },
          label,
          h('div', { class: 'set-controls' },
            h('button', { class: 'rep-btn', 'aria-label': 'One less rep', onClick: () => bump(-1) }, '−'),
            h('span', { class: 'rep-num' + (set.reps >= ex.repHigh ? ' at-top' : '') }, set.reps),
            h('button', { class: 'rep-btn', 'aria-label': 'One more rep', onClick: () => bump(1) }, '+'),
            h('button', { class: 'undo-btn', 'aria-label': 'Remove this set', onClick: removeSet }, '✕')
          )
        )
      );
    });
    card.append(setsWrap);

    card.append(h('button', {
      class: 'add-set-btn',
      onClick: () => { entry.sets.push({ done: false, reps: ex.repLow }); autosave(); redraw(); },
    }, '+ Add set'));

    return card;
  }

  function rebuildCards() {
    cardsWrap.replaceChildren(...workout.exercises.map(drawCard));
  }

  updateHeadSub();
  rebuildCards();
  updateFinish();

  function collectEntries() {
    return workout.exercises
      .map((ex) => {
        const e = session.entries[ex.id];
        const reps = e.sets.filter((s) => s.done).map((s) => s.reps);
        return reps.length ? { exerciseId: ex.id, name: ex.name, weight: e.weight, sets: reps } : null;
      })
      .filter(Boolean);
  }

  function goBack() { navigate(backTarget.name, backTarget.params); }

  async function finishLive() {
    const entries = collectEntries();
    if (!entries.length) return;
    await store.saveSession({ id: session.id, workoutId: workout.id, date: new Date().toISOString(), entries });
    await store.clearDraft();
    toast(`${workout.label} saved`);
    navigate('home');
  }

  async function finishBackfill() {
    const entries = collectEntries();
    if (!entries.length) return;
    await store.saveSession({ id: session.id, workoutId: workout.id, date: session.date, entries });
    toast(`${workout.label} logged`);
    navigate('day', { date: session.date });
  }

  async function finishEdit() {
    const entries = collectEntries();
    if (!entries.length) return;
    await store.saveSession({ id: session.id, workoutId: workout.id, date: session.date, entries });
    toast('Changes saved');
    navigate('day', { date: session.date });
  }

  async function discardLive() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return;
    await store.clearDraft();
    navigate('home');
  }

  function cancelBackfill() {
    const touched = Object.values(session.entries).some((e) => e.sets.some((s) => s.done));
    if (touched && !confirm('Discard this log? Nothing will be saved.')) return;
    navigate('calendar');
  }

  function cancelEdit() {
    if (!confirm('Discard your changes?')) return;
    goBack();
  }

  async function deleteLog() {
    if (!confirm('Delete this workout log? This cannot be undone.')) return;
    await store.deleteSession(session.id);
    toast('Log deleted');
    navigate('calendar');
  }

  // --- header ----------------------------------------------------------------
  const titlePrefix = mode === 'backfill' ? 'Log ' : mode === 'edit' ? 'Edit ' : '';
  const head = h('div', { class: 'head' },
    h('button', { class: 'back', 'aria-label': 'Back', onClick: goBack }, '‹'),
    h('div', { class: 'head-title' }, `${titlePrefix}${workout.label}`, headSub)
  );

  const dateField = mode === 'live' ? null : h('div', { class: 'field' },
    h('label', {}, 'Date'),
    (() => {
      const input = h('input', {
        type: 'date',
        value: toDateInputValue(session.date),
        max: toDateInputValue(new Date()),
      });
      input.addEventListener('change', () => {
        if (!input.value) return;
        session.date = fromDateInputValue(input.value).toISOString();
        autosave();
        updateHeadSub();
        rebuildCards();
      });
      return input;
    })()
  );

  const bottomButtons = mode === 'live'
    ? [h('button', { class: 'nav-btn btn-danger', onClick: discardLive }, 'Discard')]
    : mode === 'backfill'
      ? [h('button', { class: 'nav-btn', onClick: cancelBackfill }, 'Cancel')]
      : [h('div', { class: 'btn-row' },
          h('button', { class: 'nav-btn', style: { marginTop: 0 }, onClick: cancelEdit }, 'Cancel'),
          h('button', { class: 'nav-btn btn-danger', style: { marginTop: 0 }, onClick: deleteLog }, 'Delete log'))];

  return h('div', { class: 'screen' },
    head,
    dateField,
    cardsWrap,
    ...bottomButtons,
    h('div', { class: 'finish-wrap' }, finishBtn)
  );
}
