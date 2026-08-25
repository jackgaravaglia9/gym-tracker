import { h, toast, fmtWeight, tidy, relDate } from '../ui.js';
import { navigate, state } from '../router.js';
import { lastWeightFor, lastSessionFor, isReadyHeavier } from '../progression.js';
import * as store from '../store.js';

export async function renderWorkout({ workoutId }) {
  const workout = state.workouts.find((w) => w.id === workoutId);
  if (!workout) return h('div', { class: 'empty' }, 'That workout no longer exists.');

  // --- Load or start the working session ----------------------------------
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

  const session = draft && draft.workoutId === workoutId ? draft : blankSession(workout);

  // Keep the draft in step with the exercise list if you edited it mid-cycle.
  for (const ex of workout.exercises) {
    if (!session.entries[ex.id]) session.entries[ex.id] = blankEntry(ex);
    const entry = session.entries[ex.id];
    // Weight defaults to what you lifted last time for this exercise; if you've
    // never logged it, fall back to the starting weight from your config.
    if (typeof entry.weight !== 'number') {
      const previous = lastWeightFor(state.sessions, ex.id);
      entry.weight = previous === null ? ex.weight : previous;
    }
    while (entry.sets.length < ex.sets) entry.sets.push({ done: false, reps: ex.repLow });
    entry.sets.length = ex.sets;
  }

  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.saveDraft(session), 250);
  }

  // --- Build the screen ----------------------------------------------------
  const lastSession = lastSessionFor(state.sessions, workoutId);
  const cardsWrap = h('div', {});
  const finishBtn = h('button', { class: 'finish-btn', onClick: finish });

  function doneSetCount() {
    return Object.values(session.entries).reduce(
      (n, e) => n + e.sets.filter((s) => s.done).length, 0);
  }

  function updateFinish() {
    const n = doneSetCount();
    finishBtn.textContent = n ? `Finish — ${n} set${n === 1 ? '' : 's'}` : 'Tap a set to start';
    finishBtn.disabled = n === 0;
  }

  function drawCard(ex) {
    const entry = session.entries[ex.id];
    const previous = lastWeightFor(state.sessions, ex.id);
    const lastEntry = lastSession ? lastSession.entries.find((e) => e.exerciseId === ex.id) : null;
    const ready = isReadyHeavier(state.sessions, workoutId, ex);

    const card = h('div', { class: 'card' });

    const redraw = () => {
      const fresh = drawCard(ex);
      card.replaceWith(fresh);
    };

    // Header: name, rep range, go-heavier flag
    card.append(
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-name' }, ex.name),
        ready
          ? h('span', { class: 'ready-flag' }, '▲ Go heavier')
          : h('div', { class: 'ex-range' }, `${ex.repLow}–${ex.repHigh}`)
      )
    );
    if (ready) {
      card.append(h('div', { class: 'ex-range', style: { marginTop: '4px', paddingTop: 0 } },
        `Reps ${ex.repLow}–${ex.repHigh}`));
    }

    // Weight stepper
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

    // The "same as last time" chip
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
    if (lastEntry && lastEntry.sets && lastEntry.sets.length) {
      chipRow.append(h('span', { class: 'chip' }, `Last: ${lastEntry.sets.join(' · ')} reps`));
    }
    card.append(chipRow);

    // Sets
    const setsWrap = h('div', { class: 'sets' });
    entry.sets.forEach((set, i) => {
      const label = h('span', { class: 'set-label' }, `Set ${i + 1}`);

      if (!set.done) {
        setsWrap.append(
          h('button', {
            class: 'set-row',
            onClick: () => { set.done = true; set.reps = ex.repLow; autosave(); redraw(); updateFinish(); },
          }, label, h('span', { class: 'set-hint' }, 'Tap when done'))
        );
        return;
      }

      const bump = (delta) => {
        set.reps = Math.max(1, set.reps + delta);
        autosave();
        redraw();
      };
      setsWrap.append(
        h('div', { class: 'set-row done' },
          label,
          h('div', { class: 'set-controls' },
            h('button', { class: 'rep-btn', 'aria-label': 'One less rep', onClick: () => bump(-1) }, '−'),
            h('span', { class: 'rep-num' + (set.reps >= ex.repHigh ? ' at-top' : '') }, set.reps),
            h('button', { class: 'rep-btn', 'aria-label': 'One more rep', onClick: () => bump(1) }, '+'),
            h('button', {
              class: 'undo-btn', 'aria-label': 'Un-mark this set',
              onClick: () => { set.done = false; autosave(); redraw(); updateFinish(); },
            }, '✕')
          )
        )
      );
    });
    card.append(setsWrap);
    return card;
  }

  workout.exercises.forEach((ex) => cardsWrap.append(drawCard(ex)));
  updateFinish();

  // --- Finish / discard ----------------------------------------------------
  async function finish() {
    const entries = workout.exercises
      .map((ex) => {
        const e = session.entries[ex.id];
        const reps = e.sets.filter((s) => s.done).map((s) => s.reps);
        return reps.length ? { exerciseId: ex.id, name: ex.name, weight: e.weight, sets: reps } : null;
      })
      .filter(Boolean);

    if (!entries.length) return;

    await store.saveSession({
      id: session.id,
      workoutId: workout.id,
      date: new Date().toISOString(),
      entries,
    });
    await store.clearDraft();
    toast(`${workout.label} saved`);
    navigate('home');
  }

  async function discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return;
    await store.clearDraft();
    navigate('home');
  }

  return h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, workout.label,
        h('div', { class: 'head-sub' },
          lastSession ? `Last done ${relDate(lastSession.date).toLowerCase()}` : 'First session')
      )
    ),
    cardsWrap,
    h('button', { class: 'nav-btn btn-danger', onClick: discard }, 'Discard'),
    h('div', { class: 'finish-wrap' }, finishBtn)
  );
}

function blankSession(workout) {
  const entries = {};
  workout.exercises.forEach((ex) => { entries[ex.id] = blankEntry(ex); });
  return {
    id: store.newId(),
    workoutId: workout.id,
    startedAt: new Date().toISOString(),
    entries,
  };
}

function blankEntry(ex) {
  return { weight: null, sets: Array.from({ length: ex.sets }, () => ({ done: false, reps: ex.repLow })) };
}
