import { h, toast } from '../ui.js';
import { navigate } from '../router.js';
import * as sync from '../sync.js';

export async function renderAuth() {
  const screen = h('div', { class: 'screen' },
    h('div', { class: 'head' },
      h('button', { class: 'back', 'aria-label': 'Back', onClick: () => navigate('home') }, '‹'),
      h('div', { class: 'head-title' }, 'Cloud Backup')
    )
  );

  const body = h('div', {});
  screen.append(body);

  function showForm(message) {
    const input = h('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    const errorEl = message ? h('div', { class: 'small-note', style: { color: '#ff6b5e' } }, message) : null;
    const sendBtn = h('button', { class: 'nav-btn btn-primary', onClick: send }, 'Send magic link');

    async function send() {
      const email = input.value.trim();
      if (!email || !email.includes('@')) { showForm('Enter a valid email address.'); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        await sync.signInWithEmail(email);
        showSent(email);
      } catch (err) {
        showForm(err.message || "Couldn't send the link. Try again.");
      }
    }

    body.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'ex-name', style: { fontSize: '20px' } }, 'Sync across devices'),
        h('div', { class: 'small-note' },
          "Enter your email once per device. We'll send a link — tap it, and this device stays " +
          'signed in from then on. No password, and you’ll never see this screen again unless you sign out.'),
        h('div', { class: 'field' }, h('label', {}, 'Email'), input),
        errorEl,
        sendBtn
      )
    );
    input.focus();
  }

  function showSent(email) {
    body.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'ex-name', style: { fontSize: '20px' } }, 'Check your email'),
        h('div', { class: 'small-note' }, `Sent a sign-in link to ${email}. Open it on this device to finish.`),
        h('button', { class: 'nav-btn', onClick: () => showForm() }, 'Use a different email')
      )
    );
  }

  showForm();
  return screen;
}
