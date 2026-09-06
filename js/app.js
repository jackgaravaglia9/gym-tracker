// ---------------------------------------------------------------------------
// Boot file: wires the screens into the router, registers the service worker
// (offline support), and shows the Home screen.
// ---------------------------------------------------------------------------

import { register, navigate } from './router.js';
import { renderHome } from './screens/home.js';
import { renderWorkout } from './screens/workout.js';
import { renderProgress } from './screens/progress.js';
import { renderCalendar } from './screens/calendar.js';
import { renderDay } from './screens/day.js';
import { renderSettings } from './screens/settings.js';
import { renderAuth } from './screens/auth.js';
import { renderExercise } from './screens/exercise.js';
import { renderWeight } from './screens/weight.js';
import * as sync from './sync.js';

register('home', renderHome);
register('workout', renderWorkout);
register('progress', renderProgress);
register('calendar', renderCalendar);
register('day', renderDay);
register('settings', renderSettings);
register('auth', renderAuth);
register('exercise', renderExercise);
register('weight', renderWeight);

// Never blocks boot: if there's no config or no signal, this quietly no-ops
// and the app you already see behaves exactly as if it weren't here.
sync.initSync();

navigate('home').catch((err) => {
  document.getElementById('app').innerHTML =
    `<div class="empty">Something went wrong starting the app.<br><br>
     <span style="font-size:12px">${err.message}</span></div>`;
  console.error(err);
});

// Offline support. Registered with relative paths because GitHub Pages serves
// this app from /gym-tracker/, not the root of the domain.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.error);
  });
}
