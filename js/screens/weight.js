import { h, toast, fmtWeight, tidy, toDateInputValue, fromDateInputValue, sparkline, shortDate, copyText } from '../ui.js';
import { navigate, state } from '../router.js';
import * as store from '../store.js';

const STEP = 0.2;

export async function renderWeight({ date } = {}) {
  let formDateISO = date || new Date().toISOString();
  let allWeights = state.bodyWeights; // oldest-first, refreshed locally after any save/delete
  let existing = await store.getBodyWeightForDate(formDateISO);
  let weight = existing ? existing.weight : (allWeights.length ? allWeights[allWeights.length - 1].weight : 150);

  const dateInput = h('input', { type: 'date', value: toDateInputValue(formDateISO), max: toDateInputValue(new Date()) });
  const weightDisplay = h('button', { class: 'weight-display', onClick: typeWeight },
    h('span', { class: 'weight-num' }, fmtWeight(weight)), h('span', { class: 'weight-unit' }, 'lb'));
  const metaNote = h('div', { class: 'small-note' });
  const saveBtn = h('button', { class: 'nav-btn btn-primary', onClick: save }, existing ? 'Update' : 'Save');
  const weeklyWrap = h('div', {});
  const historyWrap = h('div', {});

  function timeOf(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function updateMetaNote() {
    metaNote.textContent = existing
      ? `Logged at ${timeOf(existing.loggedAt)}` + (existing.updatedAt !== existing.loggedAt ? ` · updated ${timeOf(existing.updatedAt)}` : '')
      : '';
  }

  function renderWeightDisplay() {
    weightDisplay.replaceChildren(
      h('span', { class: 'weight-num' }, fmtWeight(weight)),
      h('span', { class: 'weight-unit' }, 'lb')
    );
  }

  function setWeight(v) {
    weight = Math.max(0, tidy(v));
    renderWeightDisplay();
  }

  function typeWeight() {
    const input = h('input', { class: 'weight-input', type: 'number', inputmode: 'decimal', step: STEP, value: weight });
    weightDisplay.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = parseFloat(input.value);
      setWeight(Number.isFinite(v) ? v : weight);
      input.replaceWith(weightDisplay);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  async function loadFormFor(iso) {
    formDateISO = iso;
    dateInput.value = toDateInputValue(iso);
    existing = await store.getBodyWeightForDate(iso);
    if (existing) setWeight(existing.weight);
    saveBtn.textContent = existing ? 'Update' : 'Save';
    updateMetaNote();
  }

  dateInput.addEventListener('change', () => { if (dateInput.value) loadFormFor(fromDateInputValue(dateInput.value).toISOString()); });

  async function save() {
    existing = await store.saveBodyWeight({ date: formDateISO, weight });
    allWeights = await store.getBodyWeights();
    toast('Weight saved');
    saveBtn.textContent = 'Update';
    updateMetaNote();
    buildWeekly();
    buildHistory();
  }

  async function removeEntry(id) {
    if (!confirm('Delete this weigh-in?')) return;
    await store.deleteBodyWeight(id);
    allWeights = await store.getBodyWeights();
    if (existing && existing.id === id) { existing = null; saveBtn.textContent = 'Save'; updateMetaNote(); }
    buildWeekly();
    buildHistory();
  }

  // --- Copy: every logged day as plain text, oldest first, for pasting -------
  function copyLog() {
    if (!allWeights.length) { toast('No weigh-ins to copy yet'); return; }
    const lines = allWeights.map((w) => {
      const day = new Date(w.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      return `${day} - ${fmtWeight(w.weight)} lb` + (w.loggedAt ? ` (logged ${timeOf(w.loggedAt)})` : '');
    });
    copyText([`Body weight log (${allWeights.length} ${allWeights.length === 1 ? 'entry' : 'entries'})`, ...lines].join('\n'));
  }

  // --- Weekly averages: Sunday-start weeks, matching the Calendar grid -------
  function startOfWeek(d) {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return s;
  }
  function average(nums) { return nums.reduce((a, b) => a + b, 0) / nums.length; }

  function buildWeekly() {
    const now = new Date();
    const thisStart = startOfWeek(now);
    const nextStart = new Date(thisStart); nextStart.setDate(nextStart.getDate() + 7);
    const lastStart = new Date(thisStart); lastStart.setDate(lastStart.getDate() - 7);

    const inWeek = (iso, start, end) => { const d = new Date(iso); return d >= start && d < end; };
    const thisWeekVals = allWeights.filter((w) => inWeek(w.date, thisStart, nextStart)).map((w) => w.weight);
    const lastWeekVals = allWeights.filter((w) => inWeek(w.date, lastStart, thisStart)).map((w) => w.weight);
    const thisAvg = thisWeekVals.length ? average(thisWeekVals) : null;
    const lastAvg = lastWeekVals.length ? average(lastWeekVals) : null;

    let delta = null;
    if (thisAvg !== null && lastAvg !== null) delta = tidy(thisAvg - lastAvg);

    weeklyWrap.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'stat-row' },
          h('span', { class: 'stat-label' }, `This week (${thisWeekVals.length} logged)`),
          h('span', { class: 'stat-value' }, thisAvg !== null ? `${fmtWeight(thisAvg)} lb` : '—')
        ),
        h('div', { class: 'stat-row' },
          h('span', { class: 'stat-label' }, 'Last week'),
          h('span', { class: 'stat-value' }, lastAvg !== null ? `${fmtWeight(lastAvg)} lb` : '—')
        ),
        delta !== null && h('div', { class: 'small-note', style: { marginTop: '8px' } },
          `${delta > 0 ? '+' : ''}${fmtWeight(delta)} lb vs last week`)
      )
    );
  }

  function buildHistory() {
    if (!allWeights.length) {
      historyWrap.replaceChildren(h('div', { class: 'empty' }, 'No weigh-ins yet.'));
      return;
    }
    const spark = sparkline(allWeights.map((w) => w.weight), false, { width: 320, height: 110 });
    spark.classList.add('spark-lg');

    const rows = [...allWeights].reverse().map((w) =>
      h('div', { class: 'set-row' },
        h('button', { class: 'set-tap', onClick: () => loadFormFor(w.date) },
          h('span', { class: 'set-label' }, shortDate(w.date)),
          h('span', { class: 'set-hint' }, `${fmtWeight(w.weight)} lb · ${timeOf(w.loggedAt)}`)
        ),
        h('button', { class: 'undo-btn', 'aria-label': 'Delete this weigh-in', onClick: () => removeEntry(w.id) }, '✕')
      )
    );

    historyWrap.replaceChildren(
      h('div', { class: 'card' }, spark),
      h('div', { class: 'prog-group-title' }, 'History'),
      h('div', { class: 'sets' }, ...rows)
    );
  }

  updateMetaNote();
  buildWeekly();
  buildHistory();

  return h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, 'Body Weight'),
      h('button', { class: 'copy-btn', onClick: copyLog }, 'Copy')
    ),
    h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', {}, 'Date'), dateInput),
      h('div', { class: 'weight-row' },
        h('button', { class: 'stepper', onClick: () => setWeight(weight - STEP) }, '−'),
        weightDisplay,
        h('button', { class: 'stepper', onClick: () => setWeight(weight + STEP) }, '+')
      ),
      metaNote,
      saveBtn
    ),
    weeklyWrap,
    historyWrap
  );
}
