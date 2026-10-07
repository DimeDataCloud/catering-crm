// api.js — REST handlers. Pure functions over db.js; index.js owns HTTP + auth.
import { db, now, setting, MEAL_CATEGORIES, SUB_STATUSES, EVENT_STATUSES, DAYS } from './db.js';

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}
const bad = (res, msg) => json(res, 400, { error: msg });
const notFound = (res) => json(res, 404, { error: 'not found' });

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// ─── meals ───────────────────────────────────────────────────────────────
function mealOut(r) { return { ...r, tags: JSON.parse(r.tags || '[]'), active: !!r.active }; }

function listMeals(res, query) {
  let rows = db.prepare('SELECT * FROM meals ORDER BY sort_order ASC, id ASC').all();
  if (query.get('active') === '1') rows = rows.filter(r => r.active);
  json(res, 200, rows.map(mealOut));
}
function createMeal(res, b) {
  if (!b.name) return bad(res, 'name required');
  const cat = MEAL_CATEGORIES.includes(b.category) ? b.category : 'entree';
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM meals').get().m;
  const r = db.prepare(`INSERT INTO meals (name,category,description,price,unit,tags,photo_url,active,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name, cat, b.description || null, Number(b.price) || 0, b.unit || 'serving',
    JSON.stringify(b.tags || []), b.photo_url || null, b.active === false ? 0 : 1, maxOrder + 1, now(), now());
  json(res, 201, mealOut(db.prepare('SELECT * FROM meals WHERE id=?').get(r.lastInsertRowid)));
}
function updateMeal(res, id, b) {
  const existing = db.prepare('SELECT * FROM meals WHERE id=?').get(id);
  if (!existing) return notFound(res);
  const cat = b.category && MEAL_CATEGORIES.includes(b.category) ? b.category : existing.category;
  db.prepare(`UPDATE meals SET name=?, category=?, description=?, price=?, unit=?, tags=?, photo_url=?, active=?, sort_order=?, updated_at=? WHERE id=?`)
    .run(b.name ?? existing.name, cat, b.description ?? existing.description, b.price !== undefined ? Number(b.price) : existing.price,
      b.unit ?? existing.unit, JSON.stringify(b.tags ?? JSON.parse(existing.tags || '[]')), b.photo_url ?? existing.photo_url,
      b.active !== undefined ? (b.active ? 1 : 0) : existing.active, b.sort_order ?? existing.sort_order, now(), id);
  json(res, 200, mealOut(db.prepare('SELECT * FROM meals WHERE id=?').get(id)));
}
function deleteMeal(res, id) {
  db.prepare('DELETE FROM meals WHERE id=?').run(id);
  json(res, 200, { ok: true });
}

// ─── subscribers ─────────────────────────────────────────────────────────
function subOut(r) { return { ...r, selections: JSON.parse(r.selections || '[]') }; }

function priceSelections(selections) {
  const meals = db.prepare('SELECT id, price FROM meals').all();
  const byId = Object.fromEntries(meals.map(m => [m.id, m.price]));
  return round2(selections.reduce((sum, s) => sum + (byId[s.meal_id] || 0) * (s.servings || 1), 0));
}

function listSubscribers(res, query) {
  let rows = db.prepare('SELECT * FROM subscribers ORDER BY name ASC').all();
  const status = query.get('status');
  if (status) rows = rows.filter(r => r.status === status);
  json(res, 200, rows.map(subOut));
}
function createSubscriber(res, b) {
  if (!b.name) return bad(res, 'name required');
  const selections = Array.isArray(b.selections) ? b.selections : [];
  const status = SUB_STATUSES.includes(b.status) ? b.status : 'active';
  const day = DAYS.includes(b.delivery_day) ? b.delivery_day : 'sunday';
  const price = b.price_per_week !== undefined ? Number(b.price_per_week) : priceSelections(selections);
  const r = db.prepare(`INSERT INTO subscribers
    (name,email,phone,address,plan_meals_per_week,servings_per_meal,delivery_day,dietary_notes,status,price_per_week,selections,start_date,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name, b.email || null, b.phone || null, b.address || null,
    Number(b.plan_meals_per_week) || selections.reduce((s, x) => s + (x.servings || 1), 0), Number(b.servings_per_meal) || 1,
    day, b.dietary_notes || null, status, round2(price), JSON.stringify(selections),
    b.start_date || now().slice(0, 10), b.notes || null, now(), now());
  json(res, 201, subOut(db.prepare('SELECT * FROM subscribers WHERE id=?').get(r.lastInsertRowid)));
}
function updateSubscriber(res, id, b) {
  const existing = db.prepare('SELECT * FROM subscribers WHERE id=?').get(id);
  if (!existing) return notFound(res);
  const selections = b.selections !== undefined ? b.selections : JSON.parse(existing.selections || '[]');
  const status = b.status && SUB_STATUSES.includes(b.status) ? b.status : existing.status;
  const day = b.delivery_day && DAYS.includes(b.delivery_day) ? b.delivery_day : existing.delivery_day;
  const price = b.price_per_week !== undefined ? Number(b.price_per_week)
    : (b.selections !== undefined ? priceSelections(selections) : existing.price_per_week);
  db.prepare(`UPDATE subscribers SET name=?, email=?, phone=?, address=?, plan_meals_per_week=?, servings_per_meal=?,
    delivery_day=?, dietary_notes=?, status=?, price_per_week=?, selections=?, start_date=?, notes=?, updated_at=? WHERE id=?`)
    .run(b.name ?? existing.name, b.email ?? existing.email, b.phone ?? existing.phone, b.address ?? existing.address,
      b.plan_meals_per_week !== undefined ? Number(b.plan_meals_per_week) : existing.plan_meals_per_week,
      b.servings_per_meal !== undefined ? Number(b.servings_per_meal) : existing.servings_per_meal,
      day, b.dietary_notes ?? existing.dietary_notes, status, round2(price), JSON.stringify(selections),
      b.start_date ?? existing.start_date, b.notes ?? existing.notes, now(), id);
  json(res, 200, subOut(db.prepare('SELECT * FROM subscribers WHERE id=?').get(id)));
}
function deleteSubscriber(res, id) {
  db.prepare('DELETE FROM subscribers WHERE id=?').run(id);
  json(res, 200, { ok: true });
}

// ─── weekly schedule (prep list) ───────────────────────────────────────────
// Aggregates every active subscriber's standing selections, grouped by delivery day,
// plus manual per-week overrides (one-off batches, holiday skips via negative qty).
function getSchedule(res, weekStart) {
  const subs = db.prepare("SELECT * FROM subscribers WHERE status='active'").all();
  const meals = db.prepare('SELECT * FROM meals').all();
  const mealById = Object.fromEntries(meals.map(m => [m.id, m]));
  const byMeal = {};
  for (const s of subs) {
    for (const sel of JSON.parse(s.selections || '[]')) {
      const key = sel.meal_id;
      if (!byMeal[key]) byMeal[key] = { meal_id: key, standing_qty: 0, subscribers: [] };
      byMeal[key].standing_qty += sel.servings || 1;
      byMeal[key].subscribers.push({ id: s.id, name: s.name, servings: sel.servings || 1, delivery_day: s.delivery_day });
    }
  }
  const overrides = db.prepare('SELECT * FROM weekly_overrides WHERE week_start=? ORDER BY id ASC').all(weekStart);
  for (const o of overrides) {
    if (!byMeal[o.meal_id]) byMeal[o.meal_id] = { meal_id: o.meal_id, standing_qty: 0, subscribers: [] };
    byMeal[o.meal_id].override_qty = (byMeal[o.meal_id].override_qty || 0) + o.qty;
  }
  const items = Object.values(byMeal).map(row => {
    const meal = mealById[row.meal_id];
    const overrideQty = row.override_qty || 0;
    return {
      meal_id: row.meal_id,
      meal_name: meal ? meal.name : '(deleted meal)',
      category: meal ? meal.category : 'other',
      standing_qty: row.standing_qty,
      override_qty: overrideQty,
      total_qty: row.standing_qty + overrideQty,
      subscribers: row.subscribers,
    };
  }).sort((a, b) => b.total_qty - a.total_qty);

  const byDay = {};
  for (const d of DAYS) byDay[d] = 0;
  for (const s of subs) byDay[s.delivery_day] = (byDay[s.delivery_day] || 0) + 1;

  json(res, 200, {
    week_start: weekStart,
    total_servings: items.reduce((s, i) => s + i.total_qty, 0),
    active_subscribers: subs.length,
    subscribers_by_day: byDay,
    items,
    overrides,
  });
}
function addOverride(res, weekStart, b) {
  if (!b.meal_id) return bad(res, 'meal_id required');
  const r = db.prepare('INSERT INTO weekly_overrides (week_start,meal_id,qty,note,created_at) VALUES (?,?,?,?,?)')
    .run(weekStart, Number(b.meal_id), Number(b.qty) || 0, b.note || null, now());
  json(res, 201, db.prepare('SELECT * FROM weekly_overrides WHERE id=?').get(r.lastInsertRowid));
}
function deleteOverride(res, id) {
  db.prepare('DELETE FROM weekly_overrides WHERE id=?').run(id);
  json(res, 200, { ok: true });
}

// ─── venue events + quote calculator ───────────────────────────────────────
function eventOut(r) { return { ...r, addons: JSON.parse(r.addons || '[]'), menu_items: JSON.parse(r.menu_items || '[]'), deposit_paid: !!r.deposit_paid }; }

function computeQuote({ guest_count, per_person_rate, addons, travel_fee, discount, menu_items }) {
  const guests = Number(guest_count) || 0;
  const rate = Number(per_person_rate) || 0;
  const addonsTotal = (addons || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
  const menuTotal = (menu_items || []).reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.unit_price) || 0), 0);
  const travel = Number(travel_fee) || 0;
  const disc = Number(discount) || 0;
  const subtotal = guests * rate + addonsTotal + menuTotal + travel - disc;
  const pricing = setting('pricing') || {};
  const taxRate = Number(pricing.tax_rate) || 0;
  const tax = round2(subtotal * (taxRate / 100));
  const total = round2(subtotal + tax);
  const depositPct = Number(pricing.deposit_pct) || 25;
  return {
    guests, rate, addons_total: round2(addonsTotal), menu_total: round2(menuTotal), travel_fee: travel,
    discount: disc, subtotal: round2(subtotal), tax_rate: taxRate, tax, total,
    deposit_pct: depositPct, deposit_due: round2(total * (depositPct / 100)),
  };
}
function quoteEvent(res, b) { json(res, 200, computeQuote(b)); }

function listEvents(res, query) {
  let rows = db.prepare("SELECT * FROM venue_events ORDER BY COALESCE(event_date, '9999') ASC").all();
  const status = query.get('status');
  if (status) rows = rows.filter(r => r.status === status);
  json(res, 200, rows.map(eventOut));
}
function createEvent(res, b) {
  if (!b.client_name) return bad(res, 'client_name required');
  const status = EVENT_STATUSES.includes(b.status) ? b.status : 'inquiry';
  const q = computeQuote(b);
  const r = db.prepare(`INSERT INTO venue_events
    (client_name,email,phone,event_date,event_time,venue_name,address,guest_count,event_type,status,
     per_person_rate,addons,travel_fee,discount,deposit_pct,deposit_paid,menu_items,quote_total,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.client_name, b.email || null, b.phone || null, b.event_date || null, b.event_time || null,
    b.venue_name || null, b.address || null, Number(b.guest_count) || 0, b.event_type || 'drop_off', status,
    Number(b.per_person_rate) || 0, JSON.stringify(b.addons || []), Number(b.travel_fee) || 0, Number(b.discount) || 0,
    q.deposit_pct, b.deposit_paid ? 1 : 0, JSON.stringify(b.menu_items || []), q.total, b.notes || null, now(), now());
  json(res, 201, eventOut(db.prepare('SELECT * FROM venue_events WHERE id=?').get(r.lastInsertRowid)));
}
function updateEvent(res, id, b) {
  const existing = db.prepare('SELECT * FROM venue_events WHERE id=?').get(id);
  if (!existing) return notFound(res);
  const merged = {
    guest_count: b.guest_count ?? existing.guest_count,
    per_person_rate: b.per_person_rate ?? existing.per_person_rate,
    addons: b.addons ?? JSON.parse(existing.addons || '[]'),
    travel_fee: b.travel_fee ?? existing.travel_fee,
    discount: b.discount ?? existing.discount,
    menu_items: b.menu_items ?? JSON.parse(existing.menu_items || '[]'),
  };
  const q = computeQuote(merged);
  const status = b.status && EVENT_STATUSES.includes(b.status) ? b.status : existing.status;
  db.prepare(`UPDATE venue_events SET client_name=?, email=?, phone=?, event_date=?, event_time=?, venue_name=?, address=?,
    guest_count=?, event_type=?, status=?, per_person_rate=?, addons=?, travel_fee=?, discount=?, deposit_pct=?, deposit_paid=?,
    menu_items=?, quote_total=?, notes=?, updated_at=? WHERE id=?`).run(
    b.client_name ?? existing.client_name, b.email ?? existing.email, b.phone ?? existing.phone,
    b.event_date ?? existing.event_date, b.event_time ?? existing.event_time, b.venue_name ?? existing.venue_name,
    b.address ?? existing.address, merged.guest_count, b.event_type ?? existing.event_type, status,
    merged.per_person_rate, JSON.stringify(merged.addons), merged.travel_fee, merged.discount, q.deposit_pct,
    b.deposit_paid !== undefined ? (b.deposit_paid ? 1 : 0) : existing.deposit_paid, JSON.stringify(merged.menu_items),
    q.total, b.notes ?? existing.notes, now(), id);
  json(res, 200, eventOut(db.prepare('SELECT * FROM venue_events WHERE id=?').get(id)));
}
function deleteEvent(res, id) {
  db.prepare('DELETE FROM venue_events WHERE id=?').run(id);
  json(res, 200, { ok: true });
}

// ─── payments ───────────────────────────────────────────────────────────
function listPayments(res) {
  json(res, 200, db.prepare('SELECT * FROM payments ORDER BY date DESC, id DESC').all());
}
function createPayment(res, b) {
  if (!b.amount || !b.source) return bad(res, 'amount and source required');
  const r = db.prepare('INSERT INTO payments (source,ref_id,amount,date,method,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(b.source, b.ref_id || null, Number(b.amount), b.date || now().slice(0, 10), b.method || null, b.note || null, now());
  json(res, 201, db.prepare('SELECT * FROM payments WHERE id=?').get(r.lastInsertRowid));
}

// ─── analytics ──────────────────────────────────────────────────────────
function analytics(res) {
  const activeSubs = db.prepare("SELECT * FROM subscribers WHERE status='active'").all();
  const weeklyRecurring = round2(activeSubs.reduce((s, x) => s + x.price_per_week, 0));
  const events = db.prepare('SELECT * FROM venue_events').all();
  const upcoming = events.filter(e => ['quoted', 'booked'].includes(e.status));
  const upcomingRevenue = round2(upcoming.reduce((s, e) => s + e.quote_total, 0));
  const completedRevenue = round2(events.filter(e => e.status === 'completed').reduce((s, e) => s + e.quote_total, 0));
  const payments = db.prepare('SELECT * FROM payments').all();
  const collected = round2(payments.reduce((s, p) => s + p.amount, 0));

  const byMonth = {};
  for (const p of payments) {
    const m = (p.date || '').slice(0, 7);
    byMonth[m] = round2((byMonth[m] || 0) + p.amount);
  }
  const revenueByMonth = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));

  const meals = db.prepare('SELECT * FROM meals').all();
  const mealById = Object.fromEntries(meals.map(m => [m.id, m]));
  const popularity = {};
  for (const s of activeSubs) {
    for (const sel of JSON.parse(s.selections || '[]')) {
      popularity[sel.meal_id] = (popularity[sel.meal_id] || 0) + (sel.servings || 1);
    }
  }
  const mealPopularity = Object.entries(popularity)
    .map(([id, servings]) => ({ meal_id: Number(id), name: mealById[id]?.name || '(deleted)', servings_per_week: servings }))
    .sort((a, b) => b.servings_per_week - a.servings_per_week)
    .slice(0, 8);

  const eventsByStatus = {};
  for (const s of EVENT_STATUSES) eventsByStatus[s] = events.filter(e => e.status === s).length;

  json(res, 200, {
    active_subscribers: activeSubs.length,
    paused_subscribers: db.prepare("SELECT COUNT(*) c FROM subscribers WHERE status='paused'").get().c,
    weekly_recurring_revenue: weeklyRecurring,
    monthly_recurring_estimate: round2(weeklyRecurring * 4.33),
    upcoming_event_count: upcoming.length,
    upcoming_event_revenue: upcomingRevenue,
    completed_event_revenue: completedRevenue,
    total_collected: collected,
    revenue_by_month: revenueByMonth,
    meal_popularity: mealPopularity,
    events_by_status: eventsByStatus,
  });
}

// ─── settings ───────────────────────────────────────────────────────────
function getSettingsBlock(res, key) { json(res, 200, setting(key) || {}); }
function patchSettingsBlock(res, key, b) {
  const merged = { ...(setting(key) || {}), ...b };
  setting(key, merged);
  json(res, 200, merged);
}

// ─── router ─────────────────────────────────────────────────────────────
export function handleApi(req, res, pathname, query, body) {
  const m = req.method;
  const seg = pathname.split('/').filter(Boolean); // ['api', ...]

  if (seg[1] === 'meals') {
    if (m === 'GET' && seg.length === 2) return listMeals(res, query), true;
    if (m === 'POST' && seg.length === 2) return createMeal(res, body), true;
    if (m === 'PATCH' && seg.length === 3) return updateMeal(res, Number(seg[2]), body), true;
    if (m === 'DELETE' && seg.length === 3) return deleteMeal(res, Number(seg[2])), true;
  }
  if (seg[1] === 'subscribers') {
    if (m === 'GET' && seg.length === 2) return listSubscribers(res, query), true;
    if (m === 'POST' && seg.length === 2) return createSubscriber(res, body), true;
    if (m === 'PATCH' && seg.length === 3) return updateSubscriber(res, Number(seg[2]), body), true;
    if (m === 'DELETE' && seg.length === 3) return deleteSubscriber(res, Number(seg[2])), true;
  }
  if (seg[1] === 'schedule') {
    if (m === 'GET' && seg.length === 3) return getSchedule(res, seg[2]), true;
    if (m === 'POST' && seg.length === 4 && seg[3] === 'override') return addOverride(res, seg[2], body), true;
    if (m === 'DELETE' && seg[1] === 'schedule' && seg[2] === 'override' && seg.length === 4) return deleteOverride(res, Number(seg[3])), true;
  }
  if (seg[1] === 'events') {
    if (m === 'GET' && seg.length === 2) return listEvents(res, query), true;
    if (m === 'POST' && seg.length === 3 && seg[2] === 'quote') return quoteEvent(res, body), true;
    if (m === 'POST' && seg.length === 2) return createEvent(res, body), true;
    if (m === 'PATCH' && seg.length === 3) return updateEvent(res, Number(seg[2]), body), true;
    if (m === 'DELETE' && seg.length === 3) return deleteEvent(res, Number(seg[2])), true;
  }
  if (seg[1] === 'payments') {
    if (m === 'GET' && seg.length === 2) return listPayments(res), true;
    if (m === 'POST' && seg.length === 2) return createPayment(res, body), true;
  }
  if (seg[1] === 'analytics' && m === 'GET') return analytics(res), true;
  if (seg[1] === 'settings' && seg.length === 3) {
    if (m === 'GET') return getSettingsBlock(res, seg[2]), true;
    if (m === 'PATCH') return patchSettingsBlock(res, seg[2], body), true;
  }
  return false;
}

export { computeQuote };
