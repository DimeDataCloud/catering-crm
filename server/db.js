// db.js — schema, helpers, seed. node:sqlite (built into Node 22+, zero npm deps).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'chef.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  pw TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'entree',
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'serving',
  tags TEXT NOT NULL DEFAULT '[]',
  photo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT, phone TEXT, address TEXT,
  plan_meals_per_week INTEGER NOT NULL DEFAULT 4,
  servings_per_meal INTEGER NOT NULL DEFAULT 1,
  delivery_day TEXT NOT NULL DEFAULT 'sunday',
  dietary_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  price_per_week REAL NOT NULL DEFAULT 0,
  selections TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON subscribers(status);

CREATE TABLE IF NOT EXISTS weekly_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wo_week ON weekly_overrides(week_start);

CREATE TABLE IF NOT EXISTS venue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  email TEXT, phone TEXT,
  event_date TEXT, event_time TEXT,
  venue_name TEXT, address TEXT,
  guest_count INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL DEFAULT 'drop_off',
  status TEXT NOT NULL DEFAULT 'inquiry',
  per_person_rate REAL NOT NULL DEFAULT 0,
  addons TEXT NOT NULL DEFAULT '[]',
  travel_fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  deposit_pct REAL NOT NULL DEFAULT 25,
  deposit_paid INTEGER NOT NULL DEFAULT 0,
  menu_items TEXT NOT NULL DEFAULT '[]',
  quote_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_status ON venue_events(status);
CREATE INDEX IF NOT EXISTS idx_event_date ON venue_events(event_date);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  ref_id INTEGER,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  method TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(date);
`);

export const now = () => new Date().toISOString();

// ─── auth helpers ──────────────────────────────────────────────────────────
export function hashPw(pw) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(pw, salt, 64).toString('hex');
}
export function checkPw(pw, stored) {
  try {
    const [salt, key] = String(stored).split(':');
    const a = Buffer.from(key, 'hex');
    const b = scryptSync(pw, salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

export function setting(k, v) {
  if (v === undefined) {
    const row = db.prepare('SELECT v FROM settings WHERE k=?').get(k);
    return row ? JSON.parse(row.v) : null;
  }
  db.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v));
  return v;
}

// ─── seed data ───────────────────────────────────────────────────────────────
const SEED_MEALS = [
  { name: 'Herb-Roasted Chicken & Rice', category: 'entree', description: 'Free-range chicken thigh, garlic herb jasmine rice, charred broccolini.', price: 13.5, tags: ['gluten-free', 'high-protein'] },
  { name: 'Braised Short Rib', category: 'entree', description: 'Red-wine braised short rib, whipped potato, roasted carrots.', price: 17, tags: ['signature'] },
  { name: 'Miso-Glazed Salmon', category: 'entree', description: 'Miso salmon, sesame greens, sushi rice.', price: 16, tags: ['gluten-free', 'pescatarian'] },
  { name: 'Southern Shrimp & Grits', category: 'entree', description: 'Blackened shrimp, stone-ground grits, andouille cream.', price: 15, tags: ['signature'] },
  { name: 'Roasted Vegetable Grain Bowl', category: 'entree', description: 'Farro, roasted seasonal veg, tahini, pickled onion.', price: 12, tags: ['vegan', 'vegetarian'] },
  { name: 'Thai Basil Beef', category: 'entree', description: 'Ground beef, thai basil, jasmine rice, fried egg.', price: 14, tags: ['spicy'] },
  { name: 'Overnight Oats — Peach & Pecan', category: 'breakfast', description: 'Steel-cut oats, brown sugar peach, toasted pecan.', price: 7, tags: ['vegetarian'] },
  { name: 'Egg White Bites', category: 'breakfast', description: 'Spinach, roasted red pepper, feta.', price: 6.5, tags: ['gluten-free', 'vegetarian'] },
  { name: 'Roasted Garlic Mash', category: 'side', description: 'Yukon gold, roasted garlic, brown butter.', price: 4.5, tags: ['gluten-free', 'vegetarian'] },
  { name: 'Charred Brussels Sprouts', category: 'side', description: 'Balsamic glaze, toasted almond.', price: 4.5, tags: ['vegan'] },
  { name: 'Brown Butter Blondie', category: 'dessert', description: 'Brown butter, sea salt, toasted pecan.', price: 5, tags: ['vegetarian'] },
];

const DEFAULT_ADDONS = [
  { name: 'Bar / drink service', price: 250 },
  { name: 'Extra serving staff (per person)', price: 150 },
  { name: 'Rentals — tables, linens, chafing', price: 180 },
  { name: 'Custom dessert course', price: 6 },
];

const DEFAULT_EVENT_TYPES = [
  { key: 'drop_off', label: 'Drop-off catering', per_person_rate: 22 },
  { key: 'staffed', label: 'Staffed buffet', per_person_rate: 38 },
  { key: 'plated', label: 'Full-service plated', per_person_rate: 65 },
];

export function seed() {
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
    const pw = process.env.ADMIN_PASSWORD || 'changeme2026';
    db.prepare('INSERT INTO users (email,name,role,pw,created_at) VALUES (?,?,?,?,?)')
      .run((process.env.ADMIN_EMAIL || 'owner@example.com').toLowerCase().trim(), process.env.ADMIN_NAME || 'Owner', 'owner', hashPw(pw), now());
    if (!process.env.ADMIN_PASSWORD) console.warn('[auth] ADMIN_PASSWORD not set: seeded owner uses the default password, change it after first login');
  }

  if (!db.prepare('SELECT COUNT(*) c FROM meals').get().c) {
    const ins = db.prepare(`INSERT INTO meals (name,category,description,price,unit,tags,active,sort_order,created_at,updated_at)
      VALUES (?,?,?,?,'serving',?,1,?,?,?)`);
    SEED_MEALS.forEach((m, i) => ins.run(m.name, m.category, m.description, m.price, JSON.stringify(m.tags), i, now(), now()));
  }

  if (!setting('business')) {
    setting('business', {
      name: 'Kitchen OS',
      chef_name: 'Your Name',
      tagline: 'Weekly meal prep & private event catering',
      email: 'you@example.com',
      phone: '(555) 555-5555',
      service_area: 'Your service area',
      logo_note: 'Dish photos + brand mark — add yours in Settings',
    });
  }

  if (!setting('pricing')) {
    setting('pricing', {
      default_meal_price: 13.5,
      event_types: DEFAULT_EVENT_TYPES,
      addons: DEFAULT_ADDONS,
      travel: { flat_fee: 0, free_radius_miles: 15, per_mile: 2.5 },
      deposit_pct: 25,
      tax_rate: 9.25,
    });
  }

  if (!setting('brand')) {
    setting('brand', { accent: '#c1531f', accent2: '#5c6b3d', mode: 'light' });
  }

  if (!db.prepare('SELECT COUNT(*) c FROM subscribers').get().c) {
    const meals = db.prepare('SELECT id, price FROM meals ORDER BY id').all();
    const pick = (...idx) => idx.map(i => meals[i]).filter(Boolean);
    const mkSel = (rows, servings) => rows.map(r => ({ meal_id: r.id, servings }));
    const ins = db.prepare(`INSERT INTO subscribers
      (name,email,phone,address,plan_meals_per_week,servings_per_meal,delivery_day,dietary_notes,status,price_per_week,selections,start_date,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const rows = [
      { name: 'Maria Chen', email: 'maria.chen@example.com', phone: '(555) 555-0142', address: '12 Maple St, Riverton', plan: 6, serv: 1, day: 'sunday', diet: null, status: 'active', sel: mkSel(pick(0, 1, 2, 3, 4, 5), 1), start: '2026-06-02' },
      { name: 'The Whitfield Household', email: 'jwhitfield@example.com', phone: '(555) 555-0198', address: '801 Oak Hollow Rd, Riverton', plan: 10, serv: 2, day: 'wednesday', diet: 'No shellfish', status: 'active', sel: mkSel(pick(0, 1, 4, 5), 2), start: '2026-05-12' },
      { name: 'Priya Anand', email: 'priya.a@example.com', phone: '(555) 555-0110', address: '2200 Park Ave, Riverton', plan: 4, serv: 1, day: 'sunday', diet: 'Vegetarian', status: 'active', sel: mkSel(pick(4, 9, 6, 7), 1), start: '2026-07-14' },
      { name: 'Devon Marsh', email: 'devon.marsh@example.com', phone: '(555) 555-0176', address: '415 Mill St, Riverton', plan: 5, serv: 1, day: 'wednesday', diet: null, status: 'paused', sel: mkSel(pick(1, 3, 5), 1), start: '2026-04-01' },
      { name: 'Grace Kimura', email: 'grace.kimura@example.com', phone: '(555) 555-0133', address: '3800 Ridge Rd, Riverton', plan: 6, serv: 1, day: 'sunday', diet: 'Gluten-free', status: 'active', sel: mkSel(pick(0, 2, 9), 2), start: '2026-06-23' },
    ];
    for (const r of rows) {
      const price = r.sel.reduce((sum, s) => {
        const m = meals.find(x => x.id === s.meal_id);
        return sum + (m ? m.price * s.servings : 0);
      }, 0);
      ins.run(r.name, r.email, r.phone, r.address, r.plan, r.serv, r.day, r.diet, r.status,
        Math.round(price * 100) / 100, JSON.stringify(r.sel), r.start, null, now(), now());
    }
  }

  if (!db.prepare('SELECT COUNT(*) c FROM venue_events').get().c) {
    const ins = db.prepare(`INSERT INTO venue_events
      (client_name,email,phone,event_date,event_time,venue_name,address,guest_count,event_type,status,
       per_person_rate,addons,travel_fee,discount,deposit_pct,deposit_paid,menu_items,quote_total,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const rows = [
      { client: 'Sarah & Tom Whitaker', email: 'sarah.whitaker@example.com', phone: '(555) 555-0284', date: '2026-09-13', time: '17:00', venue: 'The Grain Hall', address: '609 Station St, Riverton', guests: 90, type: 'plated', status: 'booked', rate: 65, addons: [{ name: 'Bar / drink service', price: 250 }], travel: 0, discount: 0, dep: 25, depPaid: 1, notes: 'Wedding reception — plated, 3 course. Tasting done 2026-07-30.' },
      { client: 'Riverton Design Collective', email: 'events@ndc-example.com', phone: '(555) 555-0311', date: '2026-08-22', time: '12:00', venue: 'Warehouse District loft', address: '1006 Foundry Way, Riverton', guests: 45, type: 'staffed', status: 'quoted', rate: 38, addons: [{ name: 'Rentals — tables, linens, chafing', price: 180 }], travel: 0, discount: 0, dep: 25, depPaid: 0, notes: 'Corporate lunch, quote sent 2026-08-06, awaiting signature.' },
      { client: 'Renee Okafor', email: 'renee.okafor@example.com', phone: '(555) 555-0092', date: '2026-08-30', time: '18:30', venue: 'Private residence — Hillcrest', address: '4100 Hillcrest Dr, Riverton', guests: 20, type: 'drop_off', status: 'inquiry', rate: 22, addons: [], travel: 0, discount: 0, dep: 25, depPaid: 0, notes: '40th birthday, still confirming headcount + menu.' },
      { client: 'Summit Climbing Gym', email: 'events@summit-example.com', phone: '(555) 555-0055', date: '2026-07-19', time: '19:00', venue: 'Summit Climbing — Eastside', address: '1234 Eastside Ave, Riverton', guests: 60, type: 'staffed', status: 'completed', rate: 34, addons: [], travel: 0, discount: 50, dep: 25, depPaid: 1, notes: 'Member appreciation night. Paid in full 2026-07-22.' },
    ];
    for (const r of rows) {
      const addonsTotal = r.addons.reduce((s, a) => s + a.price, 0);
      const subtotal = r.guests * r.rate + addonsTotal + r.travel - r.discount;
      ins.run(r.client, r.email, r.phone, r.date, r.time, r.venue, r.address, r.guests, r.type, r.status,
        r.rate, JSON.stringify(r.addons), r.travel, r.discount, r.dep, r.depPaid, '[]',
        Math.round(subtotal * 100) / 100, r.notes, now(), now());
    }
  }

  if (!db.prepare('SELECT COUNT(*) c FROM payments').get().c) {
    const ins = db.prepare('INSERT INTO payments (source,ref_id,amount,date,method,note,created_at) VALUES (?,?,?,?,?,?,?)');
    const rows = [
      { source: 'event', ref_id: 4, amount: 2010, date: '2026-07-22', method: 'card', note: 'Summit Climbing — paid in full' },
      { source: 'event', ref_id: 1, amount: 1712.5, date: '2026-07-30', method: 'transfer', note: 'Whitaker wedding — deposit' },
      { source: 'subscription', ref_id: 1, amount: 81, date: '2026-08-03', method: 'card', note: 'Maria Chen — weekly' },
      { source: 'subscription', ref_id: 2, amount: 152, date: '2026-08-04', method: 'card', note: 'Whitfield Household — weekly' },
      { source: 'subscription', ref_id: 3, amount: 47.5, date: '2026-08-03', method: 'card', note: 'Priya Anand — weekly' },
      { source: 'subscription', ref_id: 5, amount: 74, date: '2026-08-03', method: 'card', note: 'Grace Kimura — weekly' },
    ];
    for (const r of rows) ins.run(r.source, r.ref_id, r.amount, r.date, r.method, r.note, now());
  }
}

// ─── demo mode ─────────────────────────────────────────────────────────────
// Wipes everything mutable back to the pristine seed set. Leaves `users` alone
// so logins keep working across a reset. Called on an interval when
// DEMO_MODE=1 so a demo visitor can click around freely without anything
// they do sticking around for the next person (or forever).
export function resetDemoData() {
  db.exec(`
    DELETE FROM weekly_overrides;
    DELETE FROM payments;
    DELETE FROM venue_events;
    DELETE FROM subscribers;
    DELETE FROM meals;
  `);
  db.prepare("DELETE FROM settings WHERE k IN ('business','pricing','brand')").run();
  seed();
}

export const MEAL_CATEGORIES = ['entree', 'side', 'breakfast', 'dessert', 'other'];
export const SUB_STATUSES = ['active', 'paused', 'cancelled'];
export const EVENT_STATUSES = ['inquiry', 'quoted', 'booked', 'completed', 'cancelled'];
export const EVENT_STATUS_LABELS = { inquiry: 'Inquiry', quoted: 'Quoted', booked: 'Booked', completed: 'Completed', cancelled: 'Cancelled' };
export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
