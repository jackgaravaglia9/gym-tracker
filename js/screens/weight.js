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
    buildHistory();
  }

  async function removeEntry(id) {
    if (!confirm('Delete this weigh-in?')) return;
    await store.deleteBodyWeight(id);
    allWeights = await store.getBodyWeights();
    if (existing && existing.id === id) { existing = null; saveBtn.textContent = 'Save'; updateMetaNote(); }
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

  function weeklyCard() {
    const byWeek = new Map(); // week-start time -> that week's weigh-ins
    for (const w of allWeights) {
      const key = startOfWeek(new Date(w.date)).getTime();
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key).push(w.weight);
    }

    // Every week from your first weigh-in through this one, so a week you
    // skipped still shows up (as a gap) instead of silently vanishing.
    const thisStart = startOfWeek(new Date());
    const weeks = [];
    for (let d = startOfWeek(new Date(allWeights[0].date)); d <= thisStart; d.setDate(d.getDate() + 7)) {
      const vals = byWeek.get(d.getTime()) || [];
      weeks.push({ start: new Date(d), count: vals.length, avg: vals.length ? average(vals) : null });
    }

    const thisYear = new Date().getFullYear();
    const fmtDay = (d, withYear) => d.toLocaleDateString(undefined,
      withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

    const rows = weeks.map((wk, i) => {
      const isCurrent = wk.start.getTime() === thisStart.getTime();
      const end = new Date(wk.start); end.setDate(end.getDate() + 6);
      const name = isCurrent ? 'This week'
        : `${fmtDay(wk.start, wk.start.getFullYear() !== thisYear)} – ${fmtDay(end, false)}`;

      const prev = i > 0 ? weeks[i - 1] : null;
      let deltaText = '';
      if (wk.avg !== null && prev && prev.avg !== null) {
        const delta = tidy(wk.avg - prev.avg);
        deltaText = Math.abs(delta) < 0.05 ? 'no change' : `${delta > 0 ? '+' : ''}${fmtWeight(delta)} lb`;
      }

      const logged = wk.count ? `${wk.count} logged${isCurrent ? ' so far' : ''}` : 'no weigh-ins';
      return h('div', { class: 'stat-row week-row' },
        h('div', {},
          h('div', { class: 'week-name' }, name),
          h('div', { class: 'week-sub' }, logged)
        ),
        h('div', { class: 'week-right' },
          h('div', { class: 'stat-value' }, wk.avg !== null ? `${fmtWeight(wk.avg)} lb` : '—'),
          deltaText && h('div', { class: 'week-delta' }, deltaText)
        )
      );
    });

    return h('div', { class: 'card' }, ...rows.reverse()); // newest week first
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
      h('div', { class: 'prog-group-title' }, 'Weekly averages'),
      weeklyCard(),
      h('div', { class: 'prog-group-title' }, 'History'),
      h('div', { class: 'sets' }, ...rows)
    );
  }

  updateMetaNote();
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
    historyWrap
  );
}
