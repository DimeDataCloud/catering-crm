// app.js — client SPA. Builds DOM directly (no server-templated HTML strings), fetches JSON API.
'use strict';

// ── tiny DOM helper ─────────────────────────────────────────────────────────
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only ever used with trusted, hardcoded strings (icons)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function icon(paths, size = 18) {
  return h('span', { class: 'ic', html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>` });
}
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  subscribers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15 20c.3-2.6 1.7-4.4 3.5-5"/>',
  meals: '<path d="M4 12a8 8 0 0 0 16 0"/><path d="M4 12h16"/><path d="M4 12c0-3 3-8 8-8s8 5 8 8"/><path d="M9 20h6"/>',
  schedule: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v3"/><path d="M16 3v3"/><path d="M7.5 13.5h3v3h-3z"/>',
  events: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M9 12h.01M15 12h.01M9 8.5h.01M15 8.5h.01"/>',
  analytics: '<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.6a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3.4 12.5H3.3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 5 7.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9.36 3 1.7 1.7 0 0 0 10.5 2H10.5a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.64 3a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.6 7.4 1.7 1.7 0 0 0 20.7 8.5H20.7a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.21 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
};

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }
function initials(name) { return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }

let toastTimer;
function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

// ── modal ────────────────────────────────────────────────────────────────
function openModal(title, bodyEl, buttons) {
  const root = document.getElementById('modalRoot');
  const close = () => { root.innerHTML = ''; };
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'close-x', onclick: close }, icon(ICONS.x, 16))),
      h('div', { class: 'modal-body' }, bodyEl),
      h('div', { class: 'modal-foot' }, ...(buttons || []).map(b => h('button', { class: 'btn ' + (b.cls || ''), onclick: async () => { try { await b.onClick(close); } catch (e) { toast(e.message, true); } } }, b.label)))
    ));
  root.innerHTML = '';
  root.appendChild(backdrop);
  return close;
}
function field(labelText, inputEl, helpText) {
  return h('div', { class: 'field' }, h('label', {}, labelText), inputEl, helpText ? h('div', { class: 'help' }, helpText) : null);
}
function input(attrs = {}) { return h('input', attrs); }
function select(options, selected) {
  const s = h('select', {});
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === selected) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

// ── nav config ───────────────────────────────────────────────────────────
const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { key: 'subscribers', label: 'Subscribers', icon: ICONS.subscribers },
  { key: 'meals', label: 'Meal library', icon: ICONS.meals },
  { key: 'schedule', label: 'Weekly schedule', icon: ICONS.schedule },
  { key: 'events', label: 'Venue events', icon: ICONS.events },
  { key: 'analytics', label: 'Analytics', icon: ICONS.analytics },
  { key: 'settings', label: 'Settings', icon: ICONS.settings },
];

const STATE = { user: null, business: {}, pricing: {}, brand: {}, meals: [], weekOffset: 0 };

function applyBrand(brand) {
  const root = document.documentElement.style;
  if (brand.accent) root.setProperty('--accent', brand.accent);
  if (brand.accent2) root.setProperty('--accent2', brand.accent2);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  const current = (location.hash.slice(2) || 'dashboard');
  for (const item of NAV) {
    const btn = h('button', { class: 'nav-item' + (item.key === current ? ' active' : ''), onclick: () => { location.hash = '#/' + item.key; closeSidebar(); } },
      icon(item.icon), h('span', {}, item.label));
    nav.appendChild(btn);
  }
}

function enableDemoLockdown(resetMin) {
  document.body.classList.add('demo-lock');
  const banner = document.getElementById('demoBanner');
  banner.hidden = false;
  banner.textContent = `Demo walkthrough — resets every ${resetMin} min, nothing here is saved`;
  // Deterrents only — a determined user can still view source. This just
  // keeps casual copy/paste and screenshotting-via-devtools out of the way.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const blocked = k === 'f12'
      || (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k))
      || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k))
      || ((e.ctrlKey || e.metaKey) && k === 'u')
      || ((e.ctrlKey || e.metaKey) && k === 's');
    if (blocked) e.preventDefault();
  });
}

function wireMobileNav() {
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  menuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('open');
  });
  backdrop.addEventListener('click', closeSidebar);
}

async function boot() {
  const sess = await api('GET', '/api/session');
  if (!sess.user) { window.location.href = '/login.html'; return; }
  STATE.user = sess.user;
  if (sess.demo) enableDemoLockdown(sess.demoResetMin || 20);
  wireMobileNav();
  document.getElementById('userName').textContent = sess.user.name;
  document.getElementById('userRole').textContent = cap(sess.user.role);
  document.getElementById('userAvatar').textContent = initials(sess.user.name);
  document.getElementById('logoutBtn').addEventListener('click', async () => { await api('POST', '/api/logout'); window.location.href = '/login.html'; });

  const [business, pricing, brand] = await Promise.all([
    api('GET', '/api/settings/business'), api('GET', '/api/settings/pricing'), api('GET', '/api/settings/brand'),
  ]);
  STATE.business = business; STATE.pricing = pricing; STATE.brand = brand;
  applyBrand(brand);
  document.getElementById('brandName').textContent = business.chef_name || 'Kitchen OS';
  document.getElementById('brandSub').textContent = business.tagline || 'Meal prep & event catering';
  document.getElementById('brandMark').textContent = initials(business.chef_name || 'Kitchen OS');

  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const key = (location.hash.slice(2) || 'dashboard');
  renderNav();
  const view = document.getElementById('view');
  const actions = document.getElementById('topbarActions');
  view.innerHTML = ''; actions.innerHTML = '';
  const found = NAV.find(n => n.key === key) || NAV[0];
  document.getElementById('viewTitle').textContent = found.label;
  const renderers = {
    dashboard: renderDashboard, subscribers: renderSubscribers, meals: renderMeals,
    schedule: renderSchedule, events: renderEvents, analytics: renderAnalytics, settings: renderSettings,
  };
  document.getElementById('viewSub').textContent = '';
  (renderers[found.key] || renderDashboard)(view, actions).catch(e => {
    view.appendChild(h('div', { class: 'card empty' }, 'Failed to load: ' + e.message));
  });
}

// ── DASHBOARD ────────────────────────────────────────────────────────────
async function renderDashboard(view) {
  document.getElementById('viewSub').textContent = STATE.business.service_area || '';
  const [a, subs, events] = await Promise.all([api('GET', '/api/analytics'), api('GET', '/api/subscribers?status=active'), api('GET', '/api/events')]);

  const stats = h('div', { class: 'stat-grid' },
    statCard('Weekly recurring revenue', money0(a.weekly_recurring_revenue), `${a.active_subscribers} active subscribers`),
    statCard('Monthly recurring (est.)', money0(a.monthly_recurring_estimate), '4.33 weeks/mo'),
    statCard('Upcoming event revenue', money0(a.upcoming_event_revenue), `${a.upcoming_event_count} quoted/booked`),
    statCard('Collected to date', money0(a.total_collected), `${a.completed_event_revenue ? money0(a.completed_event_revenue) + ' from completed events' : 'across subs + events'}`),
  );
  view.appendChild(stats);

  const grid = h('div', { class: 'grid-2' });
  const upcomingEvents = events.filter(e => ['inquiry', 'quoted', 'booked'].includes(e.status))
    .sort((x, y) => (x.event_date || '9999').localeCompare(y.event_date || '9999')).slice(0, 6);
  const evCard = h('div', { class: 'card' },
    h('div', { class: 'card-pad', style: 'display:flex; justify-content:space-between; align-items:center' },
      h('h3', {}, 'Upcoming venue events'), h('a', { class: 'btn sm ghost', onclick: () => location.hash = '#/events' }, 'View all')));
  const evTable = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Client'), h('th', {}, 'Date'), h('th', {}, 'Guests'), h('th', {}, 'Status'), h('th', {}, 'Quote'))));
  const evBody = h('tbody', {});
  if (!upcomingEvents.length) evBody.appendChild(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'No upcoming events.')));
  for (const e of upcomingEvents) {
    evBody.appendChild(h('tr', {}, h('td', {}, e.client_name), h('td', {}, fmtDate(e.event_date)), h('td', {}, e.guest_count),
      h('td', {}, h('span', { class: 'badge ' + e.status }, cap(e.status))), h('td', {}, money0(e.quote_total))));
  }
  evTable.appendChild(evBody);
  evCard.appendChild(evTable);

  const subCard = h('div', { class: 'card' },
    h('div', { class: 'card-pad', style: 'display:flex; justify-content:space-between; align-items:center' },
      h('h3', {}, 'Active subscribers'), h('a', { class: 'btn sm ghost', onclick: () => location.hash = '#/subscribers' }, 'View all')));
  const subTable = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Meals/wk'), h('th', {}, 'Delivery'), h('th', {}, 'Price'))));
  const subBody = h('tbody', {});
  const topSubs = subs.slice(0, 6);
  if (!topSubs.length) subBody.appendChild(h('tr', {}, h('td', { colspan: 4, class: 'empty' }, 'No active subscribers yet.')));
  for (const s of topSubs) subBody.appendChild(h('tr', {}, h('td', {}, s.name), h('td', {}, s.plan_meals_per_week), h('td', {}, cap(s.delivery_day)), h('td', {}, money0(s.price_per_week))));
  subTable.appendChild(subBody);
  subCard.appendChild(subTable);

  grid.appendChild(evCard); grid.appendChild(subCard);
  view.appendChild(grid);
}
function statCard(label, value, delta) {
  return h('div', { class: 'card stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'delta flat' }, delta));
}

// ── SUBSCRIBERS ──────────────────────────────────────────────────────────
async function renderSubscribers(view, actions) {
  actions.appendChild(h('button', { class: 'btn primary', onclick: () => openSubscriberForm() }, icon(ICONS.plus, 15), 'New subscriber'));
  const subs = await api('GET', '/api/subscribers');
  const card = h('div', { class: 'card' });
  const table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Plan'), h('th', {}, 'Delivery day'), h('th', {}, 'Status'), h('th', {}, 'Weekly price'), h('th', {}, ''))));
  const body = h('tbody', {});
  if (!subs.length) body.appendChild(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'No subscribers yet — add the first one.')));
  for (const s of subs) {
    const row = h('tr', { class: 'clickable', onclick: () => openSubscriberForm(s) },
      h('td', {}, h('div', { style: 'font-weight:700' }, s.name), h('div', { style: 'color:var(--ink-faint); font-size:11.5px' }, s.email || s.phone || '')),
      h('td', {}, `${s.plan_meals_per_week} meals × ${s.servings_per_meal} serving${s.servings_per_meal > 1 ? 's' : ''}`),
      h('td', {}, cap(s.delivery_day)),
      h('td', {}, h('span', { class: 'badge ' + s.status }, cap(s.status))),
      h('td', {}, money0(s.price_per_week) + '/wk'),
      h('td', { onclick: (e) => e.stopPropagation() }, h('button', { class: 'icon-btn', onclick: () => deleteSubscriber(s) }, icon(ICONS.trash, 16))),
    );
    body.appendChild(row);
  }
  table.appendChild(body);
  card.appendChild(table);
  view.appendChild(card);
}

function selectionsPicker(initial) {
  const wrap = h('div', { class: 'sel-list' });
  const rows = new Map();
  for (const m of STATE.meals.filter(m => m.active)) {
    const existing = (initial || []).find(s => s.meal_id === m.id);
    const check = h('input', { type: 'checkbox' });
    check.checked = !!existing;
    const qty = h('input', { type: 'number', min: '1', value: existing ? existing.servings : 1 });
    qty.disabled = !check.checked;
    check.addEventListener('change', () => { qty.disabled = !check.checked; });
    const row = h('div', { class: 'sel-row' }, check, h('span', { class: 'nm' }, m.name, ' ', h('span', { style: 'color:var(--ink-faint)' }, '(' + money(m.price) + ')')), qty);
    rows.set(m.id, { check, qty });
    wrap.appendChild(row);
  }
  wrap.getSelections = () => {
    const out = [];
    for (const [meal_id, { check, qty }] of rows) if (check.checked) out.push({ meal_id, servings: Number(qty.value) || 1 });
    return out;
  };
  return wrap;
}

async function openSubscriberForm(existing) {
  if (!STATE.meals.length) STATE.meals = await api('GET', '/api/meals');
  const nameI = input({ value: existing?.name || '', required: true });
  const emailI = input({ type: 'email', value: existing?.email || '' });
  const phoneI = input({ value: existing?.phone || '' });
  const addrI = input({ value: existing?.address || '' });
  const dayI = select(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => ({ value: d, label: cap(d) })), existing?.delivery_day || 'sunday');
  const statusI = select(['active', 'paused', 'cancelled'].map(s => ({ value: s, label: cap(s) })), existing?.status || 'active');
  const dietI = input({ value: existing?.dietary_notes || '' });
  const picker = selectionsPicker(existing?.selections);
  const priceOut = h('div', { class: 'field' }, h('label', {}, 'Weekly price (auto — editable below)'), input({ id: 'priceOverride', type: 'number', step: '0.01', value: existing?.price_per_week ?? 0 }));

  const recalc = () => {
    const sel = picker.getSelections();
    const total = sel.reduce((s, x) => { const m = STATE.meals.find(mm => mm.id === x.meal_id); return s + (m ? m.price * x.servings : 0); }, 0);
    document.getElementById('priceOverride').value = Math.round(total * 100) / 100;
  };
  picker.addEventListener('change', recalc);

  const body = h('div', {},
    h('div', { class: 'form-row' }, field('Name', nameI), field('Delivery day', dayI)),
    h('div', { class: 'form-row' }, field('Email', emailI), field('Phone', phoneI)),
    field('Address', addrI),
    h('div', { class: 'form-row' }, field('Dietary notes', dietI), field('Status', statusI)),
    field('Standing weekly meal selections', picker, 'Checked meals repeat every week until changed — this drives the prep schedule.'),
    priceOut,
  );

  openModal(existing ? 'Edit subscriber' : 'New subscriber', body, [
    { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save changes' : 'Add subscriber', cls: 'primary', onClick: async (close) => {
        if (!nameI.value.trim()) throw new Error('Name is required');
        const selections = picker.getSelections();
        const payload = {
          name: nameI.value.trim(), email: emailI.value.trim() || null, phone: phoneI.value.trim() || null,
          address: addrI.value.trim() || null, delivery_day: dayI.value, status: statusI.value,
          dietary_notes: dietI.value.trim() || null, selections,
          plan_meals_per_week: selections.reduce((s, x) => s + x.servings, 0),
          price_per_week: Number(document.getElementById('priceOverride').value) || 0,
        };
        if (existing) await api('PATCH', `/api/subscribers/${existing.id}`, payload);
        else await api('POST', '/api/subscribers', payload);
        toast(existing ? 'Subscriber updated' : 'Subscriber added');
        close(); route();
      }
    },
  ]);
}
async function deleteSubscriber(s) {
  if (!confirm(`Remove ${s.name} from subscribers?`)) return;
  await api('DELETE', `/api/subscribers/${s.id}`);
  toast('Subscriber removed'); route();
}

// ── MEALS ────────────────────────────────────────────────────────────────
async function renderMeals(view, actions) {
  actions.appendChild(h('button', { class: 'btn primary', onclick: () => openMealForm() }, icon(ICONS.plus, 15), 'New meal'));
  const meals = await api('GET', '/api/meals');
  STATE.meals = meals;
  const grid = h('div', { class: 'meal-grid' });
  if (!meals.length) grid.appendChild(h('div', { class: 'card empty' }, 'No meals yet — build the menu.'));
  for (const m of meals) {
    const card = h('div', { class: 'meal-card' + (m.active ? '' : ' inactive') },
      h('div', { class: 'meal-photo' }, initials(m.name)),
      h('div', { class: 'meal-body' },
        h('div', { class: 'n' }, m.name),
        h('div', { class: 'd' }, m.description || ''),
        h('div', {}, (m.tags || []).map(t => h('span', { class: 'tag' }, t))),
        h('div', { class: 'row' },
          h('span', { class: 'price' }, money(m.price) + ' /' + m.unit),
          h('div', {}, h('button', { class: 'icon-btn', onclick: () => openMealForm(m) }, icon(ICONS.edit, 15)), h('button', { class: 'icon-btn', onclick: () => deleteMeal(m) }, icon(ICONS.trash, 15))),
        ),
      ),
    );
    grid.appendChild(card);
  }
  view.appendChild(grid);
}
async function openMealForm(existing) {
  const nameI = input({ value: existing?.name || '', required: true });
  const catI = select(['entree', 'side', 'breakfast', 'dessert', 'other'].map(c => ({ value: c, label: cap(c) })), existing?.category || 'entree');
  const priceI = input({ type: 'number', step: '0.01', value: existing?.price ?? 13.5 });
  const unitI = input({ value: existing?.unit || 'serving' });
  const descI = h('textarea', {}, existing?.description || '');
  const tagsI = input({ value: (existing?.tags || []).join(', ') });
  const activeI = h('input', { type: 'checkbox' }); activeI.checked = existing ? existing.active : true;
  const body = h('div', {},
    h('div', { class: 'form-row' }, field('Name', nameI), field('Category', catI)),
    h('div', { class: 'form-row' }, field('Price', priceI), field('Unit', unitI)),
    field('Description', descI),
    field('Tags (comma separated)', tagsI, 'e.g. vegan, gluten-free, signature'),
    h('label', { class: 'checkline' }, activeI, 'Active — show on the menu'),
  );
  openModal(existing ? 'Edit meal' : 'New meal', body, [
    { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save changes' : 'Add meal', cls: 'primary', onClick: async (close) => {
        if (!nameI.value.trim()) throw new Error('Name is required');
        const payload = { name: nameI.value.trim(), category: catI.value, price: Number(priceI.value) || 0, unit: unitI.value.trim() || 'serving', description: descI.value.trim() || null, tags: tagsI.value.split(',').map(t => t.trim()).filter(Boolean), active: activeI.checked };
        if (existing) await api('PATCH', `/api/meals/${existing.id}`, payload);
        else await api('POST', '/api/meals', payload);
        toast(existing ? 'Meal updated' : 'Meal added');
        close(); route();
      }
    },
  ]);
}
async function deleteMeal(m) {
  if (!confirm(`Delete "${m.name}" from the menu? Subscribers using it will need reassigning.`)) return;
  await api('DELETE', `/api/meals/${m.id}`);
  toast('Meal deleted'); route();
}

// ── WEEKLY SCHEDULE ──────────────────────────────────────────────────────
function weekStartFor(offset) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  return d.toISOString().slice(0, 10);
}
async function renderSchedule(view, actions) {
  const weekStart = weekStartFor(STATE.weekOffset);
  const nav = h('div', { class: 'week-nav' },
    h('button', { class: 'btn sm', onclick: () => { STATE.weekOffset--; route(); } }, icon(ICONS.chevL, 14)),
    h('span', { class: 'label' }, 'Week of ' + fmtDate(weekStart)),
    h('button', { class: 'btn sm', onclick: () => { STATE.weekOffset++; route(); } }, icon(ICONS.chevR, 14)),
    STATE.weekOffset !== 0 ? h('button', { class: 'btn sm ghost', onclick: () => { STATE.weekOffset = 0; route(); } }, 'This week') : null,
  );
  view.appendChild(nav);

  if (!STATE.meals.length) STATE.meals = await api('GET', '/api/meals');
  const data = await api('GET', `/api/schedule/${weekStart}`);

  const stats = h('div', { class: 'stat-grid' },
    statCard('Total servings to prep', data.total_servings, `${data.active_subscribers} active subscribers`),
    statCard('Distinct meals this week', data.items.length, ''),
  );
  view.appendChild(stats);

  view.appendChild(h('div', { class: 'section-head' }, h('h2', {}, 'Delivery by day')));
  const dayRow = h('div', { class: 'daychip-row' });
  for (const d of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) {
    dayRow.appendChild(h('div', { class: 'daychip' }, cap(d).slice(0, 3), h('span', { class: 'n' }, data.subscribers_by_day[d] || 0)));
  }
  view.appendChild(dayRow);

  view.appendChild(h('div', { class: 'section-head' },
    h('h2', {}, 'Prep list'),
    h('button', { class: 'btn sm', onclick: () => openOverrideForm(weekStart) }, icon(ICONS.plus, 14), 'Add one-off batch')));

  const card = h('div', { class: 'card' });
  const max = Math.max(1, ...data.items.map(i => i.total_qty));
  if (!data.items.length) card.appendChild(h('div', { class: 'empty' }, 'No standing orders land this week yet.'));
  for (const item of data.items) {
    const row = h('div', { class: 'prep-item' },
      h('div', { class: 'prep-qty' }, item.total_qty),
      h('div', { class: 'prep-info' },
        h('div', { class: 'n' }, item.meal_name, ' ', h('span', { class: 'tag' }, cap(item.category))),
        h('div', { class: 'm' }, `${item.standing_qty} from subscribers` + (item.override_qty ? ` · ${item.override_qty > 0 ? '+' : ''}${item.override_qty} one-off` : '')),
        h('div', { class: 'prep-bar-track' }, h('div', { class: 'prep-bar-fill', style: `width:${(item.total_qty / max) * 100}%` })),
      ),
    );
    card.appendChild(row);
  }
  view.appendChild(card);

  if (data.overrides.length) {
    view.appendChild(h('div', { class: 'section-head' }, h('h2', {}, 'One-off adjustments this week')));
    const ovCard = h('div', { class: 'card' });
    for (const o of data.overrides) {
      const meal = STATE.meals.find(m => m.id === o.meal_id);
      ovCard.appendChild(h('div', { class: 'prep-item' },
        h('div', { class: 'prep-qty' }, (o.qty > 0 ? '+' : '') + o.qty),
        h('div', { class: 'prep-info' }, h('div', { class: 'n' }, meal ? meal.name : '(deleted meal)'), h('div', { class: 'm' }, o.note || '')),
        h('button', { class: 'icon-btn', onclick: async () => { await api('DELETE', `/api/schedule/override/${o.id}`); route(); } }, icon(ICONS.trash, 16)),
      ));
    }
    view.appendChild(ovCard);
  }
}
async function openOverrideForm(weekStart) {
  const mealI = select(STATE.meals.map(m => ({ value: m.id, label: m.name })));
  const qtyI = input({ type: 'number', value: 5 });
  const noteI = input({ value: '' });
  const body = h('div', {}, field('Meal', mealI), field('Quantity (use negative to skip/reduce)', qtyI), field('Note', noteI, 'e.g. "Extra batch for a tasting"'));
  openModal('Add one-off batch', body, [
    { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
    { label: 'Add', cls: 'primary', onClick: async (close) => { await api('POST', `/api/schedule/${weekStart}/override`, { meal_id: Number(mealI.value), qty: Number(qtyI.value), note: noteI.value.trim() || null }); toast('Added to prep list'); close(); route(); } },
  ]);
}

// ── VENUE EVENTS ─────────────────────────────────────────────────────────
const EVENT_COLUMNS = ['inquiry', 'quoted', 'booked', 'completed', 'cancelled'];
async function renderEvents(view, actions) {
  actions.appendChild(h('button', { class: 'btn primary', onclick: () => openEventForm() }, icon(ICONS.plus, 15), 'New event'));
  const events = await api('GET', '/api/events');
  const board = h('div', { class: 'kanban' });
  for (const status of EVENT_COLUMNS) {
    const items = events.filter(e => e.status === status);
    const col = h('div', { class: 'kanban-col' },
      h('div', { class: 'kanban-col-head' }, h('h4', {}, cap(status)), h('span', { class: 'kanban-count' }, items.length)));
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      await api('PATCH', `/api/events/${id}`, { status });
      toast('Moved to ' + cap(status)); route();
    });
    for (const ev of items) {
      const card = h('div', { class: 'kcard', draggable: true, onclick: () => openEventForm(ev) },
        h('div', { class: 'name' }, ev.client_name),
        h('div', { class: 'meta' }, (ev.venue_name || 'TBD') + ' · ' + fmtDate(ev.event_date)),
        h('div', { class: 'meta' }, ev.guest_count + ' guests · ' + cap(ev.event_type)),
        h('div', { class: 'amt' }, money0(ev.quote_total)),
      );
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', ev.id));
      col.appendChild(card);
    }
    board.appendChild(col);
  }
  view.appendChild(board);
}

function quoteCalculator(existing) {
  const pricing = STATE.pricing;
  const guestsI = input({ type: 'number', value: existing?.guest_count ?? 25 });
  const typeI = select(pricing.event_types.map(t => ({ value: t.key, label: t.label })), existing?.event_type || pricing.event_types[0]?.key);
  const rateI = input({ type: 'number', step: '0.01', value: existing?.per_person_rate ?? pricing.event_types[0]?.per_person_rate ?? 0 });
  typeI.addEventListener('change', () => { const t = pricing.event_types.find(t => t.key === typeI.value); if (t) rateI.value = t.per_person_rate; recalc(); });
  const travelI = input({ type: 'number', step: '0.01', value: existing?.travel_fee ?? 0 });
  const discountI = input({ type: 'number', step: '0.01', value: existing?.discount ?? 0 });
  const depositPaidI = h('input', { type: 'checkbox' }); depositPaidI.checked = !!existing?.deposit_paid;

  const addonsWrap = h('div', { class: 'editable-tag-list' });
  const addonRows = [];
  function addAddonRow(a) {
    const nameI = input({ type: 'text', value: a?.name || '', placeholder: 'Add-on name' });
    const priceI = input({ type: 'number', step: '0.01', value: a?.price ?? 0 });
    const row = h('div', { class: 'addon-row' }, nameI, priceI, h('button', { class: 'icon-btn', onclick: (e) => { e.preventDefault(); row.remove(); addonRows.splice(addonRows.indexOf(row), 1); recalc(); } }, icon(ICONS.trash, 15)));
    nameI.addEventListener('input', recalc); priceI.addEventListener('input', recalc);
    row.getData = () => ({ name: nameI.value.trim(), price: Number(priceI.value) || 0 });
    addonRows.push(row);
    addonsWrap.appendChild(row);
  }
  for (const a of (existing?.addons || [])) addAddonRow(a);
  const addBtn = h('button', { class: 'btn sm ghost', type: 'button', onclick: (e) => { e.preventDefault(); addAddonRow(); } }, icon(ICONS.plus, 13), 'Add line item');

  const quoteBox = h('div', { class: 'quote-box' });
  function recalc() {
    const addons = addonRows.map(r => r.getData()).filter(a => a.name);
    const g = Number(guestsI.value) || 0, r = Number(rateI.value) || 0;
    const addonsTotal = addons.reduce((s, a) => s + a.price, 0);
    const travel = Number(travelI.value) || 0, discount = Number(discountI.value) || 0;
    const subtotal = g * r + addonsTotal + travel - discount;
    const taxRate = Number(pricing.tax_rate) || 0;
    const tax = Math.round(subtotal * taxRate) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const depositPct = Number(pricing.deposit_pct) || 25;
    quoteBox.innerHTML = '';
    quoteBox.appendChild(h('div', { class: 'quote-line' }, h('span', {}, `${g} guests × ${money(r)}`), h('span', {}, money(g * r))));
    if (addonsTotal) quoteBox.appendChild(h('div', { class: 'quote-line' }, h('span', {}, 'Add-ons'), h('span', {}, money(addonsTotal))));
    if (travel) quoteBox.appendChild(h('div', { class: 'quote-line' }, h('span', {}, 'Travel'), h('span', {}, money(travel))));
    if (discount) quoteBox.appendChild(h('div', { class: 'quote-line' }, h('span', {}, 'Discount'), h('span', {}, '-' + money(discount))));
    if (taxRate) quoteBox.appendChild(h('div', { class: 'quote-line' }, h('span', {}, `Tax (${taxRate}%)`), h('span', {}, money(tax))));
    quoteBox.appendChild(h('div', { class: 'quote-line total' }, h('span', {}, 'Total quote'), h('span', {}, money(total))));
    quoteBox.appendChild(h('div', { class: 'quote-line deposit' }, h('span', {}, `Deposit (${depositPct}%)`), h('span', {}, money(total * depositPct / 100))));
  }
  guestsI.addEventListener('input', recalc); rateI.addEventListener('input', recalc);
  travelI.addEventListener('input', recalc); discountI.addEventListener('input', recalc);
  recalc();

  return {
    els: { guestsI, typeI, rateI, travelI, discountI, depositPaidI, addonsWrap, addBtn, quoteBox },
    getAddons: () => addonRows.map(r => r.getData()).filter(a => a.name),
  };
}

async function openEventForm(existing) {
  if (!STATE.meals.length) STATE.meals = await api('GET', '/api/meals');
  const clientI = input({ value: existing?.client_name || '', required: true });
  const emailI = input({ type: 'email', value: existing?.email || '' });
  const phoneI = input({ value: existing?.phone || '' });
  const dateI = input({ type: 'date', value: existing?.event_date || '' });
  const timeI = input({ type: 'time', value: existing?.event_time || '' });
  const venueI = input({ value: existing?.venue_name || '' });
  const addrI = input({ value: existing?.address || '' });
  const statusI = select(EVENT_COLUMNS.map(s => ({ value: s, label: cap(s) })), existing?.status || 'inquiry');
  const notesI = h('textarea', {}, existing?.notes || '');
  const calc = quoteCalculator(existing);

  const body = h('div', {},
    h('div', { class: 'form-row' }, field('Client / contact name', clientI), field('Status', statusI)),
    h('div', { class: 'form-row' }, field('Email', emailI), field('Phone', phoneI)),
    h('div', { class: 'form-row three' }, field('Event date', dateI), field('Time', timeI), field('Guest count', calc.els.guestsI)),
    h('div', { class: 'form-row' }, field('Venue', venueI), field('Address', addrI)),
    h('div', { class: 'form-row' }, field('Service type', calc.els.typeI), field('Rate per person', calc.els.rateI)),
    field('Add-ons / line items', h('div', {}, calc.els.addonsWrap, calc.els.addBtn)),
    h('div', { class: 'form-row three' }, field('Travel fee', calc.els.travelI), field('Discount', calc.els.discountI), h('label', { class: 'checkline', style: 'margin-top:26px' }, calc.els.depositPaidI, 'Deposit received')),
    field('Notes', notesI),
    field('Live quote', calc.els.quoteBox),
  );

  const buttons = [
    { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
    {
      label: existing ? 'Save changes' : 'Create event', cls: 'primary', onClick: async (close) => {
        if (!clientI.value.trim()) throw new Error('Client name is required');
        const payload = {
          client_name: clientI.value.trim(), email: emailI.value.trim() || null, phone: phoneI.value.trim() || null,
          event_date: dateI.value || null, event_time: timeI.value || null, venue_name: venueI.value.trim() || null,
          address: addrI.value.trim() || null, guest_count: Number(calc.els.guestsI.value) || 0, event_type: calc.els.typeI.value,
          status: statusI.value, per_person_rate: Number(calc.els.rateI.value) || 0, addons: calc.getAddons(),
          travel_fee: Number(calc.els.travelI.value) || 0, discount: Number(calc.els.discountI.value) || 0,
          deposit_paid: calc.els.depositPaidI.checked, notes: notesI.value.trim() || null,
        };
        if (existing) await api('PATCH', `/api/events/${existing.id}`, payload);
        else await api('POST', '/api/events', payload);
        toast(existing ? 'Event updated' : 'Event created');
        close(); route();
      }
    },
  ];
  if (existing) buttons.unshift({ label: 'Delete', cls: 'danger', onClick: async (close) => { if (!confirm('Delete this event?')) return; await api('DELETE', `/api/events/${existing.id}`); toast('Event deleted'); close(); route(); } });
  openModal(existing ? 'Edit venue event' : 'New venue event', body, buttons);
}

// ── ANALYTICS ────────────────────────────────────────────────────────────
async function renderAnalytics(view) {
  const a = await api('GET', '/api/analytics');
  view.appendChild(h('div', { class: 'stat-grid' },
    statCard('Weekly recurring revenue', money0(a.weekly_recurring_revenue), `${a.active_subscribers} active / ${a.paused_subscribers} paused`),
    statCard('Monthly recurring (est.)', money0(a.monthly_recurring_estimate), ''),
    statCard('Upcoming event revenue', money0(a.upcoming_event_revenue), `${a.upcoming_event_count} in pipeline`),
    statCard('Total collected', money0(a.total_collected), 'all payments logged'),
  ));

  const grid = h('div', { class: 'grid-2' });

  const revCard = h('div', { class: 'card card-pad' }, h('h3', { style: 'margin-bottom:14px' }, 'Revenue by month'));
  const maxRev = Math.max(1, ...a.revenue_by_month.map(m => m.amount));
  if (!a.revenue_by_month.length) revCard.appendChild(h('div', { class: 'empty' }, 'No payments logged yet.'));
  for (const m of a.revenue_by_month) {
    revCard.appendChild(h('div', { style: 'margin-bottom:10px' },
      h('div', { style: 'display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px' }, h('span', {}, m.month), h('span', { style: 'font-weight:700' }, money0(m.amount))),
      h('div', { class: 'prep-bar-track' }, h('div', { class: 'prep-bar-fill', style: `width:${(m.amount / maxRev) * 100}%` }))));
  }

  const popCard = h('div', { class: 'card card-pad' }, h('h3', { style: 'margin-bottom:14px' }, 'Most-ordered meals (standing weekly)'));
  const maxPop = Math.max(1, ...a.meal_popularity.map(m => m.servings_per_week));
  if (!a.meal_popularity.length) popCard.appendChild(h('div', { class: 'empty' }, 'No standing orders yet.'));
  for (const m of a.meal_popularity) {
    popCard.appendChild(h('div', { style: 'margin-bottom:10px' },
      h('div', { style: 'display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px' }, h('span', {}, m.name), h('span', { style: 'font-weight:700' }, m.servings_per_week + '/wk')),
      h('div', { class: 'prep-bar-track' }, h('div', { class: 'prep-bar-fill', style: `width:${(m.servings_per_week / maxPop) * 100}%` }))));
  }

  grid.appendChild(revCard); grid.appendChild(popCard);
  view.appendChild(grid);

  view.appendChild(h('div', { class: 'section-head' }, h('h2', {}, 'Venue events by stage')));
  const stageRow = h('div', { class: 'daychip-row' });
  for (const [status, count] of Object.entries(a.events_by_status)) stageRow.appendChild(h('div', { class: 'daychip' }, cap(status), h('span', { class: 'n' }, count)));
  view.appendChild(stageRow);
}

// ── SETTINGS ─────────────────────────────────────────────────────────────
async function renderSettings(view) {
  const business = await api('GET', '/api/settings/business');
  const pricing = await api('GET', '/api/settings/pricing');
  const brand = await api('GET', '/api/settings/brand');

  // business card
  const bNameI = input({ value: business.chef_name || '' });
  const bTagI = input({ value: business.tagline || '' });
  const bEmailI = input({ type: 'email', value: business.email || '' });
  const bPhoneI = input({ value: business.phone || '' });
  const bAreaI = input({ value: business.service_area || '' });
  const businessCard = h('div', { class: 'card card-pad' },
    h('h3', { style: 'margin-bottom:14px' }, 'Business profile'),
    h('div', { class: 'form-row' }, field('Chef / business name', bNameI), field('Tagline', bTagI)),
    h('div', { class: 'form-row' }, field('Email', bEmailI), field('Phone', bPhoneI)),
    field('Service area', bAreaI),
    h('button', { class: 'btn primary sm', onclick: async () => { await api('PATCH', '/api/settings/business', { chef_name: bNameI.value, tagline: bTagI.value, email: bEmailI.value, phone: bPhoneI.value, service_area: bAreaI.value }); toast('Business profile saved'); boot(); } }, 'Save profile'),
  );
  view.appendChild(businessCard);

  // brand card
  const accentI = input({ type: 'color', value: brand.accent || '#c1531f' });
  const accent2I = input({ type: 'color', value: brand.accent2 || '#5c6b3d' });
  accentI.addEventListener('input', () => document.documentElement.style.setProperty('--accent', accentI.value));
  accent2I.addEventListener('input', () => document.documentElement.style.setProperty('--accent2', accent2I.value));
  const brandCard = h('div', { class: 'card card-pad', style: 'margin-top:18px' },
    h('h3', { style: 'margin-bottom:14px' }, 'Brand colors'),
    h('div', { class: 'form-row' }, field('Primary accent', accentI), field('Secondary accent', accent2I)),
    h('button', { class: 'btn primary sm', onclick: async () => { await api('PATCH', '/api/settings/brand', { accent: accentI.value, accent2: accent2I.value }); toast('Brand colors saved'); } }, 'Save colors'),
  );
  view.appendChild(brandCard);

  // pricing card
  const defPriceI = input({ type: 'number', step: '0.01', value: pricing.default_meal_price ?? 13.5 });
  const depositI = input({ type: 'number', value: pricing.deposit_pct ?? 25 });
  const taxI = input({ type: 'number', step: '0.01', value: pricing.tax_rate ?? 0 });
  const travelFlatI = input({ type: 'number', step: '0.01', value: pricing.travel?.flat_fee ?? 0 });
  const travelRadiusI = input({ type: 'number', value: pricing.travel?.free_radius_miles ?? 15 });
  const travelMileI = input({ type: 'number', step: '0.01', value: pricing.travel?.per_mile ?? 0 });

  const typesWrap = h('div', { class: 'editable-tag-list' });
  const typeRows = [];
  function addTypeRow(t) {
    const labelI = input({ value: t?.label || '', placeholder: 'Service type name' });
    const rateI = input({ type: 'number', step: '0.01', value: t?.per_person_rate ?? 0 });
    const row = h('div', { class: 'addon-row' }, labelI, rateI, h('button', { class: 'icon-btn', onclick: () => { row.remove(); typeRows.splice(typeRows.indexOf(row), 1); } }, icon(ICONS.trash, 15)));
    row.getData = () => ({ key: (t?.key) || labelI.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: labelI.value.trim(), per_person_rate: Number(rateI.value) || 0 });
    typeRows.push(row); typesWrap.appendChild(row);
  }
  for (const t of pricing.event_types || []) addTypeRow(t);

  const addonsWrap = h('div', { class: 'editable-tag-list' });
  const addonRows2 = [];
  function addAddonRow2(a) {
    const nameI = input({ value: a?.name || '', placeholder: 'Add-on name' });
    const priceI = input({ type: 'number', step: '0.01', value: a?.price ?? 0 });
    const row = h('div', { class: 'addon-row' }, nameI, priceI, h('button', { class: 'icon-btn', onclick: () => { row.remove(); addonRows2.splice(addonRows2.indexOf(row), 1); } }, icon(ICONS.trash, 15)));
    row.getData = () => ({ name: nameI.value.trim(), price: Number(priceI.value) || 0 });
    addonRows2.push(row); addonsWrap.appendChild(row);
  }
  for (const a of pricing.addons || []) addAddonRow2(a);

  const pricingCard = h('div', { class: 'card card-pad', style: 'margin-top:18px' },
    h('h3', { style: 'margin-bottom:14px' }, 'Pricing & quote defaults'),
    h('div', { class: 'form-row three' }, field('Default meal price', defPriceI), field('Deposit %', depositI), field('Tax rate %', taxI)),
    h('div', { class: 'form-row three' }, field('Travel — flat fee', travelFlatI), field('Free radius (mi)', travelRadiusI), field('Per extra mile', travelMileI)),
    field('Event service types & per-person rates', h('div', {}, typesWrap, h('button', { class: 'btn sm ghost', onclick: () => addTypeRow() }, icon(ICONS.plus, 13), 'Add service type'))),
    field('Event add-ons', h('div', {}, addonsWrap, h('button', { class: 'btn sm ghost', onclick: () => addAddonRow2() }, icon(ICONS.plus, 13), 'Add add-on'))),
    h('button', {
      class: 'btn primary sm', onclick: async () => {
        const payload = {
          default_meal_price: Number(defPriceI.value) || 0, deposit_pct: Number(depositI.value) || 0, tax_rate: Number(taxI.value) || 0,
          travel: { flat_fee: Number(travelFlatI.value) || 0, free_radius_miles: Number(travelRadiusI.value) || 0, per_mile: Number(travelMileI.value) || 0 },
          event_types: typeRows.map(r => r.getData()).filter(t => t.label),
          addons: addonRows2.map(r => r.getData()).filter(a => a.name),
        };
        await api('PATCH', '/api/settings/pricing', payload);
        toast('Pricing saved'); STATE.pricing = payload;
      }
    }, 'Save pricing'),
  );
  view.appendChild(pricingCard);
}

boot().catch(e => { console.error(e); window.location.href = '/login.html'; });
