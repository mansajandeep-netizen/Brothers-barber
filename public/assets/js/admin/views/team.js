import { get, post, patch, del } from '../api.js';
import { state } from '../state.js';
import { h, icon, button, modal, confirmDialog, field, readForm, showFieldErrors, withBusy, toast, fmtTimestamp, initials } from '../ui.js';
import { cardWith } from './shared.js';

const ROLE_HELP = {
  owner: 'Full access, including services, prices, hours, business info and team.',
  staff: 'Can view and manage appointments, customers and blocked time.',
};

export async function render(ctx) {
  const { el, setActions } = ctx;
  const { users } = await get('/users');
  if (!ctx.isCurrent()) return;
  const reload = () => ctx.refresh();
  setActions(button('Add team member', { variant: 'secondary', size: 'sm', iconName: 'plus', onClick: () => openEditor(null, reload) }));

  el.replaceChildren(
    h('div', { class: 'page__head' }, h('div', null, h('h2', null, 'Team & Access'), h('p', null, 'Who can sign in to this dashboard.'))),
    h(
      'div',
      { class: 'grid grid--2-1' },
      cardWith(
        `${users.length} account${users.length === 1 ? '' : 's'}`,
        '',
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table table--stack' },
            h('thead', null, h('tr', null, ['Name', 'Role', 'Last sign-in', ''].map((t) => h('th', { scope: 'col' }, t)))),
            h(
              'tbody',
              null,
              users.map((u) =>
                h(
                  'tr',
                  null,
                  h(
                    'td',
                    null,
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                      h('span', { class: 'avatar avatar--light' }, initials(u.name)),
                      h('div', null, h('span', { class: 'cell-title' }, u.name, u.id === state.user.id ? ' (you)' : ''), h('span', { class: 'cell-sub' }, u.email)),
                    ),
                  ),
                  h('td', { 'data-label': 'Role' }, h('span', { class: `badge ${u.role === 'owner' ? 'badge--accent' : 'badge--booked'} badge--plain` }, u.role === 'owner' ? 'Owner' : 'Staff')),
                  h('td', { 'data-label': 'Last sign-in' }, u.lastLoginAt ? fmtTimestamp(u.lastLoginAt) : h('span', { class: 'muted' }, 'Never')),
                  h(
                    'td',
                    { class: 'actions' },
                    button('Edit', { variant: 'ghost', size: 'xs', iconName: 'edit', onClick: () => openEditor(u, reload) }),
                    u.id !== state.user.id
                      ? button('', {
                          variant: 'ghost',
                          size: 'xs',
                          iconName: 'trash',
                          'aria-label': `Remove ${u.name}`,
                          onClick: async () => {
                            const ok = await confirmDialog({ title: `Remove ${u.name}?`, message: 'They will be signed out and can no longer access the dashboard.', confirmLabel: 'Remove access', danger: true });
                            if (!ok) return;
                            try {
                              await del(`/users/${u.id}`);
                              toast('Access removed.');
                              reload();
                            } catch (err) {
                              toast(err.message, 'error');
                            }
                          },
                        })
                      : null,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      cardWith(
        'Roles',
        '',
        h(
          'div',
          { class: 'card__body stack stack--sm' },
          Object.entries(ROLE_HELP).map(([role, text]) => h('p', { style: { margin: 0 } }, h('strong', null, role === 'owner' ? 'Owner — ' : 'Staff — '), text)),
          h('div', { class: 'alert alert--info' }, icon('lock'), h('p', null, 'Each person should have their own account. Passwords need at least 10 characters.')),
        ),
      ),
    ),
  );
}

function openEditor(user, onDone) {
  const u = user;
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('div', { class: 'form-row form-row--2' }, field({ label: 'Name', name: 'name', value: u?.name ?? '' }), field({ label: 'Email', name: 'email', type: 'email', value: u?.email ?? '', attrs: { autocomplete: 'off' } })),
    field({
      label: 'Role',
      name: 'role',
      type: 'select',
      value: u?.role ?? 'staff',
      options: [
        { value: 'staff', label: 'Staff — appointments & customers' },
        { value: 'owner', label: 'Owner — full access' },
      ],
    }),
    field({
      label: u ? 'New password (leave blank to keep current)' : 'Temporary password',
      name: 'password',
      type: 'password',
      attrs: { autocomplete: 'new-password', minlength: 10 },
      hint: 'At least 10 characters. Share it privately; they can change it under My account.',
    }),
  );
  const save = button(u ? 'Save' : 'Create account', { variant: 'primary', onClick: () => submit() });
  const m = modal({ title: u ? `Edit ${u.name}` : 'Add a team member', body: form, actions: [button('Cancel', { variant: 'ghost', onClick: () => m.close() }), save] });

  async function submit() {
    const d = readForm(form);
    if (u && !d.password) delete d.password;
    await withBusy(save, async () => {
      try {
        if (u) await patch(`/users/${u.id}`, d);
        else await post('/users', d);
        toast(u ? 'Account updated.' : 'Account created.');
        m.close();
        onDone();
      } catch (err) {
        if (err.fields) showFieldErrors(form, err.fields);
        m.setError(err.message);
      }
    });
  }
}
