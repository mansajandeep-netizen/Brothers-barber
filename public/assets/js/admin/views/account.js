import { post } from '../api.js';
import { state } from '../state.js';
import { h, field, readForm, showFieldErrors, withBusy, toast, button } from '../ui.js';
import { cardWith } from './shared.js';

export async function render(ctx) {
  const { el } = ctx;
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field({ label: 'Current password', name: 'currentPassword', type: 'password', attrs: { autocomplete: 'current-password' } }),
    field({ label: 'New password', name: 'newPassword', type: 'password', attrs: { autocomplete: 'new-password', minlength: 10 }, hint: 'At least 10 characters. A short phrase is easy to remember and hard to guess.' }),
    field({ label: 'Confirm new password', name: 'confirm', type: 'password', attrs: { autocomplete: 'new-password' } }),
  );
  const save = button('Change password', { variant: 'primary', type: 'submit' });
  form.append(h('div', null, save));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const fields = {};
    if (!d.currentPassword) fields.currentPassword = 'Enter your current password.';
    if (d.newPassword.length < 10) fields.newPassword = 'Use at least 10 characters.';
    if (d.newPassword !== d.confirm) fields.confirm = 'Passwords don’t match.';
    showFieldErrors(form, fields);
    if (Object.keys(fields).length) return;
    await withBusy(save, async () => {
      try {
        await post('/me/password', { currentPassword: d.currentPassword, newPassword: d.newPassword });
        form.reset();
        toast('Password changed. Other devices have been signed out.');
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        toast(err.message, 'error');
      }
    });
  });

  el.replaceChildren(
    h('div', { class: 'page__head' }, h('div', null, h('h2', null, 'My account'), h('p', null, `${state.user.name} · ${state.user.email} · ${state.user.role === 'owner' ? 'Owner' : 'Staff'}`))),
    h('div', { style: { maxWidth: '560px' } }, cardWith('Password', '', h('div', { class: 'card__body' }, form))),
  );
}
