# Gym Tracker

A phone-first workout tracker. Offline, no login, all data stored on the device.

---

## 1. Put it on GitHub (one time)

1. Go to **https://github.com/new**
2. Repository name: **`gym-tracker`**
3. Set it to **Public** (GitHub Pages is free for public repos)
4. Do **not** tick "Add a README" — this folder already has one
5. Click **Create repository**

GitHub then shows you a page with commands. Ignore it and run these instead,
from inside this folder, replacing `YOUR-USERNAME`:

```bash
git remote add origin https://github.com/YOUR-USERNAME/gym-tracker.git && git branch -M main && git push -u origin main
```

## 2. Turn on GitHub Pages (one time)

1. In your new repo, click **Settings**
2. In the left sidebar, click **Pages**
3. Under "Build and deployment" → **Source**, choose **Deploy from a branch**
4. Branch: **`main`**, folder: **`/ (root)`** → **Save**

Wait about a minute. Your app is live at:

```
https://YOUR-USERNAME.github.io/gym-tracker/
```

## 3. Add it to your iPhone home screen

1. Open that URL **in Safari** (it must be Safari — Chrome on iOS can't install web apps)
2. Tap the **Share** button (square with an arrow, at the bottom)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

You now have a "Gym" icon. Launching it opens full-screen with no browser bars,
and it works with no signal.

> **Open it once on wifi before your first gym session.** That first visit is
> when your phone downloads and saves its offline copy.

---

## Changing your workouts

**Just use the app.** Home screen → **Edit Workouts**. You can rename exercises,
change starting weights, the +/− step, the number of sets, and the rep range —
add or delete exercises, and reorder them with ↑ / ↓. Press **Save changes**.

Your logged history is never touched by edits. Renaming an exercise keeps its
history, because the app tracks exercises by a hidden id, not by name.

`js/defaults.js` holds the built-in starting list. That's what
**Reset to defaults** restores — you only need to edit that file if you want to
change what "default" means.

---

## Publishing changes to the app itself

If you edit any file in this project:

1. **Bump the version in `sw.js`.** Change `const VERSION = 'v1';` to `'v2'`, etc.
   Your phone caches the whole app for offline use — this is the signal that
   tells it to fetch the new copy. **If you skip this, your phone will keep
   showing the old version.**
2. Commit and push:

```bash
git add -A && git commit -m "Describe your change" && git push
```

3. Wait ~1 minute, then open the app on your phone and close/reopen it once.

---

## Running it on your computer

You can't just double-click `index.html` — service workers and ES modules need a
real web server. From this folder:

```bash
python3 -m http.server 8777
```

Then open **http://localhost:8777** in your browser.

---

## Backing up

Home → **Edit Workouts** → **Export**. That gives you a `.json` file with every
workout and every logged session. **Import** puts it back.

Worth doing every month or two. iOS can clear a web app's stored data if you
delete the app from your home screen or don't open it for a very long time.

---

## How the files fit together

| File | What it does |
|---|---|
| `index.html` | The only page. Everything renders inside it. |
| `manifest.webmanifest` | Tells iOS the name, icon, and full-screen behaviour. |
| `sw.js` | Service worker — saves the app to your phone so it works offline. |
| `css/styles.css` | All styling. The colour and size dials are at the top. |
| `js/defaults.js` | Your starting workout list, as plain data. |
| `js/store.js` | **All data access.** The only file that knows about IndexedDB. |
| `js/progression.js` | The "ready to go heavier" rule, on its own. |
| `js/router.js` | Swaps which screen is showing. |
| `js/ui.js` | Small shared helpers (build an element, show a toast, format a date). |
| `js/app.js` | Startup: wires the screens together, registers the service worker. |
| `js/screens/*.js` | One file per screen: home, workout, progress, settings. |

### Adding cloud sync later

Every screen reads and writes data **only** through the functions exported from
`js/store.js`, and every one of them returns a Promise. To sync across devices,
rewrite the inside of that one file to call a server instead of IndexedDB. No
screen code has to change.

---

## The progression rule

An exercise is flagged **▲ ready to go heavier** when, in your most recent
logged session of that workout, **every set you logged** hit or beat the **top**
of its rep range.

Two things worth knowing:

- It counts only sets you actually marked done. Log one set at the top of the
  range and stop, and it will flag.
- The flag never changes your weight for you. It just tells you you've earned
  the jump — you decide.

To change the rule, edit `isReadyHeavier()` in `js/progression.js`. It's about
six lines and it's the only place the rule exists.
