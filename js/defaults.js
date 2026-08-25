// ---------------------------------------------------------------------------
// YOUR WORKOUTS — the starting template.
//
// You normally DON'T need to edit this file: use the "Edit Workouts" screen in
// the app instead. This file is only the seed used the very first time the app
// runs, and whatever "Reset to defaults" restores.
//
// Field guide:
//   id       stable internal name. NEVER change it after you've logged
//            sessions — your history is linked to it. Change `name` instead.
//   name     what you see on screen. Safe to change any time.
//   weight   STARTING weight in lb. Only used until you log the exercise once;
//            after that the app remembers what you actually lifted.
//   step     how much the - / + buttons move the weight.
//   sets     how many sets you do.
//   repLow   bottom of your rep range (each set starts here when you tap it).
//   repHigh  top of your rep range (hit this on every set = "go heavier" flag).
// ---------------------------------------------------------------------------

export const DEFAULT_WORKOUTS = [
  {
    id: 'legs',
    num: '01',
    label: 'Leg Day',
    exercises: [
      { id: 'hack-squat',      name: 'Hack Squat',      weight: 60, step: 5, sets: 3, repLow: 8,  repHigh: 10 },
      { id: 'leg-extension',   name: 'Leg Extension',   weight: 80, step: 5, sets: 3, repLow: 8,  repHigh: 10 },
      { id: 'seated-leg-curl', name: 'Seated Leg Curl', weight: 85, step: 5, sets: 3, repLow: 8,  repHigh: 10 },
      { id: 'calf-raises',     name: 'Calf Raises',     weight: 90, step: 5, sets: 3, repLow: 6,  repHigh: 10 },
      { id: 'ab-crunch',       name: 'Ab Crunch',       weight: 95, step: 5, sets: 1, repLow: 10, repHigh: 15 },
    ],
  },
  {
    id: 'chestback',
    num: '02',
    label: 'Chest/Back',
    exercises: [
      { id: 'db-bench-press',      name: 'Dumbbell Bench Press', weight: 35,  step: 2.5, sets: 3, repLow: 8,  repHigh: 10 },
      { id: 'lat-pulldown',        name: 'Lat Pulldown',         weight: 115, step: 5,   sets: 2, repLow: 6,  repHigh: 8  },
      { id: 'pec-deck',            name: 'Pec Deck',             weight: 85,  step: 5,   sets: 3, repLow: 8,  repHigh: 10 },
      { id: 'seated-cable-row',    name: 'Seated Cable Row',     weight: 85,  step: 5,   sets: 3, repLow: 7,  repHigh: 9  },
      { id: 'smith-incline-press', name: 'Smith Incline Press',  weight: 25,  step: 5,   sets: 2, repLow: 6,  repHigh: 9  },
      { id: 'seated-fixed-row',    name: 'Seated Fixed Row',     weight: 85,  step: 5,   sets: 2, repLow: 8,  repHigh: 10 },
      { id: 'ab-crunch',           name: 'Ab Crunch',            weight: 95,  step: 5,   sets: 1, repLow: 10, repHigh: 15 },
    ],
  },
  {
    id: 'arms',
    num: '03',
    label: 'Arm Day',
    exercises: [
      { id: 'shoulder-db-press',        name: 'Shoulder DB Press',            weight: 32.5, step: 2.5, sets: 2, repLow: 6, repHigh: 8  },
      { id: 'tricep-cable-pulldown',    name: 'Tricep Cable Pulldown',        weight: 45,   step: 5,   sets: 3, repLow: 6, repHigh: 8  },
      { id: 'seated-bicep-curl',        name: 'Seated Bicep Curl',            weight: 45,   step: 5,   sets: 2, repLow: 6, repHigh: 8  },
      { id: 'lateral-raises',           name: 'Lateral Raises',               weight: 15,   step: 2.5, sets: 4, repLow: 8, repHigh: 10 },
      { id: 'seated-dips',              name: 'Seated Dips',                  weight: 70,   step: 5,   sets: 2, repLow: 6, repHigh: 8  },
      { id: 'seated-hammer-curls',      name: 'Seated Hammer Curls',          weight: 17.5, step: 2.5, sets: 3, repLow: 8, repHigh: 10 },
      { id: 'standing-reverse-curls',   name: 'Standing Reverse Curls',       weight: 30,   step: 2.5, sets: 3, repLow: 6, repHigh: 8  },
      { id: 'one-arm-cable-tricep-ext', name: 'One-Arm Cable Tricep Ext.',    weight: 15,   step: 2.5, sets: 3, repLow: 8, repHigh: 8  },
    ],
  },
];
