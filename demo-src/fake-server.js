/* ============================================================================
   Winter Services demo: a pretend server inside the browser
   ----------------------------------------------------------------------------
   make_demo.py points the app's server address at https://demo.invalid and runs this
   file BEFORE the app. Every call the app makes to that address is answered here, from
   a small database kept in this browser's localStorage. Nothing leaves the browser.

   The app is unchanged. It still writes to its own local copy first and sends each
   change as a queued call; this file takes the changed rows from that copy, the way the
   real server would take them from the call, and hands them to the other roles.

   Four people share one browser, as if they were four phones:
     Office      the shop's account (admin)
     Technician  Jun, who sees every job with a day on it
     Customer    Carmela, with an account and bookings of her own
     Guest       a stranger on the public booking page
   The strip at the bottom switches between them.

   Every name, number and address in here is invented.
   ============================================================================ */
(function(){
'use strict';
const BASE = 'https://demo.invalid';
const STORE_KEY = 'wsdemo_store';
const VERSION = 4;
const DAY = 864e5;

const P = {   // the people you can be
  office: {id: 'd0000000-0000-4000-8000-00000000a001', email: 'office@demo.winter',  role: 'admin',      name: 'Office (demo)'},
  tech:   {id: 'd0000000-0000-4000-8000-00000000a002', email: 'jun@demo.winter',     role: 'technician', name: 'Jun (technician)'},
  cust:   {id: 'd0000000-0000-4000-8000-00000000a004', email: 'carmela@demo.winter', role: 'customer',   name: 'Carmela Reyes'},
};
const TECH2 = {id: 'd0000000-0000-4000-8000-00000000a003', email: 'rey@demo.winter', role: 'technician', name: 'Rey (technician)'};

/* ---------------------------------------------------------------- small helpers */
const iso = t => new Date(t).toISOString();
const manila = (off = 0) => new Date(Date.now() + 8 * 36e5 + off * DAY).toISOString().slice(0, 10);
const digits = s => String(s || '').replace(/\D/g, '');
const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
let seq = 0;
const uid = () => {
  const h = (Date.now().toString(16) + (++seq).toString(16).padStart(4, '0') + Math.random().toString(16).slice(2) + '0000000000000000').slice(0, 32);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32);
};
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
function lsGet(k){ try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
// a moment on a Manila day, as an instant -- never later than now: a demo opened at 7am
// must not show a booking "made" at 9
const at = (dayOff, hour, min = 0) => {
  const midnight = Date.parse(manila(dayOff) + 'T00:00:00+08:00'), mins = hour * 60 + min;
  const upTo = Date.now() - 10 * 6e4;   // today's seed times all fit before this
  if (dayOff !== 0 || upTo - midnight >= 14 * 36e5) return iso(midnight + mins * 6e4);
  // before 2pm: today's morning is squeezed into the part of today that has happened
  return iso(midnight + Math.min(mins / (14 * 60), 1) * (upTo - midnight));
};

/* ---------------------------------------------------------------- the shop */
const SERVICES = [
  ['clean',     'Cleaning and maintenance',    10, {Window: 600,  Split: 1000, 'Floor-mounted': 1500, Cassette: 1800, Freezer: 700, 'Washing machine': 650}],
  ['repair',    'Repair',                      20, {Window: 800,  Split: 1200, 'Floor-mounted': 1800, Cassette: 2000, Freezer: 900, 'Washing machine': 800}],
  ['install',   'Installation',                30, {Window: 1500, Split: 3500, 'Floor-mounted': 5000, Cassette: 6000}],
  ['relocate',  'Relocation',                  40, {Window: 1800, Split: 4000, 'Floor-mounted': 5500, Cassette: 6500}],
  ['dismantle', 'Dismantling',                 50, {Window: 500,  Split: 1000, 'Floor-mounted': 1500, Cassette: 2000}],
  ['checkup',   'Check-up',                    60, {Window: 300,  Split: 300,  'Floor-mounted': 400,  Cassette: 400,  Freezer: 300, 'Washing machine': 300}],
  ['survey',    'Survey for new installation', 70, {}],
];
const AIRCON = ['clean', 'repair', 'install', 'relocate', 'dismantle', 'checkup', 'survey'];
const TYPES = [
  ['Window', 'ac-window', 10, AIRCON], ['Split', 'ac-split', 20, AIRCON],
  ['Floor-mounted', 'ac-floor', 30, AIRCON], ['Cassette', 'ac-cassette', 40, AIRCON],
  ['Freezer', 'freezer', 50, ['clean', 'repair', 'checkup']],
  ['Washing machine', 'washing-machine', 60, ['clean', 'repair', 'checkup']],
];
const priceOf = units => {
  let sum = 0, any = false;
  for (const u of units) for (const s of u.services){
    const row = SERVICES.find(x => x[0] === s), p = row && row[3][u.type];
    if (p != null){ sum += p; any = true; }
  }
  return any ? sum : null;
};
const unionSvc = units => [...new Set(units.flatMap(u => u.services))];
const typeOfUnits = units => { const t = [...new Set(units.map(u => u.type))]; return t.length === 1 ? t[0] : 'Mixed'; };
const newRef = () => {
  let ref; do { ref = 'WA-' + (1000 + Math.floor(Math.random() * 9000)); } while (Object.values(S.bookings).some(b => b.ref === ref));
  return ref;
};

/* ---------------------------------------------------------------- the invented town */
const PEOPLE = [
  ['Carmela Reyes',    '0917 555 0104', 'Lot 12 Blk 3, Villa Esperanza, Brgy. Mandalagan', 'Green gate beside the chapel'],
  ['Ramon Villanueva', '0918 555 0117', '21 Lacson Street, Brgy. Villamonte',              'Across the bakery, blue house'],
  ['Liza Gonzaga',     '0927 555 0123', 'Unit 4B, Palm Court, Brgy. Taculing',              'Second floor, near the stairs'],
  ['Dennis Aguilar',   '0935 555 0131', 'Purok Mahigugmaon, Brgy. Alijis',                  'Behind the barangay hall'],
  ['Grace Sarmiento',  '0945 555 0142', '8 Rosario Street, Brgy. 19',                       'Yellow two-storey, white gate'],
  ['Joel Tupas',       '0956 555 0150', 'Blk 7 Lot 2, Sunrise Homes, Brgy. Estefania',      'Corner lot, mango tree'],
  ['Nina Ledesma',     '0966 555 0168', '144 Burgos Avenue, Brgy. 26',                      'Above the pharmacy'],
  ['Paolo Jalandoni',  '0977 555 0172', 'Phase 2, Camella Homes, Brgy. Tangub',             'Beside the clubhouse'],
  ['Maricel Tan',      '0995 555 0189', '37 Araneta Street, Brgy. Singcang',                'Red roof, sari-sari store in front'],
  ['Arnel Bautista',   '0908 555 0193', 'Purok Malipayon, Brgy. Granada',                   'Near the elementary school'],
  ['Kristine Uy',      '0919 555 0201', 'Lot 5, Goldenfields Commercial, Brgy. Singcang',   'The bakery with the blue sign'],
  ['Ernesto Lopez',    '0928 555 0214', '12 Gatuslao Street, Brgy. 8',                      'Old wooden house, green windows'],
  ['Hazel Montinola',  '0939 555 0226', 'Blk 1 Lot 9, Villa Angela, Brgy. Villamonte',      'Last house on the right'],
  ['Rogelio Dizon',    '0947 555 0233', 'Purok Riverside, Brgy. Banago',                    'Near the fish port gate'],
  ['Sheila Canlas',    '0955 555 0248', '65 San Juan Street, Brgy. 12',                     'Beside the tailor'],
  ['Vic Ramos',        '0965 555 0252', 'Blk 4, Casa Mira South, Brgy. Punta Taytay',       'Guard house, ask for Blk 4'],
  ['Josie Magbanua',   '0975 555 0265', 'Door 3, Hernaez Apartments, Brgy. 17',             'Ground floor, door 3'],
  ['Allan Espinosa',   '0998 555 0279', 'Purok Kawayan, Brgy. Bata',                        'Bamboo fence, brown gate'],
];
const U = (type, services, brand = null, model = null) => ({type, services, brand, model});

function seed(){
  const now = Date.now();
  const s = {version: VERSION, seed_day: manila(0), touched: false,
    bookings: {}, customers: {}, jobs: {}, events: [], removed: [], photos: {},
    team: {}, settings: {}, services: [], types: []};
  const closedOn = new Date(manila(6) + 'T00:00:00Z').getUTCDay() === 0 ? manila(7) : manila(6);
  s.settings = {show_prices: true, show_prices_tech: true, closed_days: [0],
    closed_dates: [{on: closedOn, why: 'Team training day'}],
    facebook_url: '', page_photos: [], slot_capacity: 4,
    gcash_number: '0900 000 0000', gcash_name: 'Winter Air (demo)', checkup_months: 6};
  s.services = SERVICES.map(([key, label, sort, prices]) => ({key, label, active: true, sort, prices: {...prices}}));
  s.types = TYPES.map(([key, icon, sort, svc]) => ({key, label: key, icon, active: true, sort, services: [...svc].sort()}));

  const member = (p, when) => ({id: p.id, email: p.email, role: p.role, display_name: p.name, active: true,
    signup_kind: p.role === 'customer' ? 'customer' : 'employee', created_at: when, updated_at: when, last_sign_in_at: iso(now - 36e5)});
  s.team[P.office.id] = member(P.office, at(-120, 9));
  s.team[P.tech.id]   = member(P.tech,   at(-90, 9));
  s.team[TECH2.id]    = member(TECH2,    at(-60, 9));
  s.team[P.cust.id]   = member(P.cust,   at(-35, 19));
  const helper = uid();
  s.team[helper] = {id: helper, email: 'ben.helper@demo.winter', role: 'customer', display_name: 'Ben (new helper)', active: true,
    signup_kind: 'employee', created_at: at(0, 7, 40), updated_at: at(0, 7, 40), last_sign_in_at: at(0, 7, 40)};

  // customers: the first fourteen; the last four are still only bookings in the Inbox
  const cust = PEOPLE.slice(0, 14).map((p, i) => {
    const id = uid(), made = at(-40 + i, 10);
    return s.customers[id] = {id, full_name: p[0], contact: p[1], address: p[2], landmark: p[3],
      lat: 10.66 + (i % 7) * 0.006, lng: 122.94 + (i % 5) * 0.007, notes: null, from_booking: null,
      created_at: made, updated_at: made, checkup_snooze: null, photo_path: null,
      check_every: null, check_next: null, check_day: null};
  });
  // two customers on a regular check, one of them due today
  Object.assign(cust[4], {check_every: 3, check_next: manila(0)});
  Object.assign(cust[8], {check_every: 6, check_next: manila(12)});

  let refN = 4100;
  const ref = () => 'WA-' + (refN += 37);

  /* A booking that became a job. d = the job's day (relative), st = how far it got. */
  function job(ci, bookedOff, d, slot, units, st, o = {}){
    const c = cust[ci], bid = uid(), jid = uid(), made = at(bookedOff, 8 + (ci % 9), (ci * 7) % 60);
    const handled = iso(Date.parse(made) + (20 + (ci * 11) % 90) * 6e4);
    const tech = ci % 2 ? TECH2.id : P.tech.id;
    s.bookings[bid] = {id: bid, ref: ref(), created_at: made, updated_at: handled, status: 'accepted', source: o.phone ? 'office' : 'page',
      full_name: c.full_name, contact: c.contact, address: c.address, landmark: c.landmark, lat: c.lat, lng: c.lng,
      services: unionSvc(units), units, unit_count: units.length, unit_type: typeOfUnits(units),
      unit_brand: units[0].brand, unit_model: units[0].model, unit_serial: null, notes: o.notes || null,
      preferred_on: manila(d), slot, handled_at: handled, customer_id: c.id, reject_reason: null,
      account_id: ci === 0 ? P.cust.id : null, seen_at: iso(Date.parse(made) + 9 * 6e4), seen_by: P.office.id,
      quote: null, for_customer: null};
    const doneAt = st === 'done' ? at(d, slot === 'am' ? 11 : 15, 20 + ci) : null;
    const worked = st === 'done' || st === 'in_progress';
    s.jobs[jid] = {id: jid, created_at: handled, updated_at: doneAt || handled, customer_id: c.id, booking_id: bid,
      services: unionSvc(units), units, unit_count: units.length, unit_type: typeOfUnits(units),
      unit_brand: units[0].brand, unit_model: units[0].model, unit_serial: null, notes: o.notes || null,
      scheduled_on: manila(d), slot, schedule_at: handled, assigned_uid: null, assigned_at: null,
      status: st, status_at: doneAt || (st === 'in_progress' ? at(d, slot === 'am' ? 9 : 13, 30) : handled),
      status_by: worked ? tech : st === 'cancelled' ? P.office.id : null,
      cancel_reason: st === 'cancelled' ? (o.why || 'Customer asked to move it') : null,
      done_at: doneAt, price: priceOf(units), price_at: handled,
      on_way_at: worked || o.onway ? at(d, slot === 'am' ? 8 : 12, 40) : null, on_way_by: worked || o.onway ? tech : null,
      paid_at: o.paid ? iso(Date.parse(doneAt) + 12 * 6e4) : null, paid_method: o.paid || null, paid_by: o.paid ? P.office.id : null,
      followup_at: o.followup ? iso(Date.parse(doneAt) + 2 * DAY) : null, followup_by: o.followup ? P.office.id : null,
      followup_note: o.followup || null, quote: null};
  }

  // the month behind us: most done and paid, one cancelled
  job(0, -34, -33, 'am', [U('Split', ['clean'], 'Carrier', 'Optima')], 'done', {paid: 'gcash', followup: 'Happy — wants the bedroom one next'});
  job(1, -30, -28, 'am', [U('Split', ['clean'], 'Carrier'), U('Split', ['clean'], 'Carrier')], 'done', {paid: 'cash', followup: 'All good, both cold'});
  job(2, -27, -25, 'pm', [U('Window', ['repair'], 'Koppel')], 'done', {paid: 'gcash', notes: 'Not cooling, noisy fan'});
  job(3, -24, -23, 'am', [U('Split', ['install'], 'Daikin', 'FTKC25')], 'done', {paid: 'cash'});
  job(5, -22, -20, 'am', [U('Cassette', ['clean']), U('Cassette', ['clean'])], 'done', {paid: 'other'});
  job(6, -19, -18, 'pm', [U('Split', ['relocate'], 'Panasonic')], 'done', {paid: 'gcash'});
  job(7, -17, -15, 'am', [U('Window', ['clean']), U('Window', ['clean']), U('Split', ['clean'])], 'done', {paid: 'cash', followup: 'Asked about a check every 3 months'});
  job(9, -14, -12, 'pm', [U('Floor-mounted', ['repair', 'checkup'], 'LG')], 'done', {paid: 'gcash'});
  job(10, -12, -11, 'am', [U('Split', ['dismantle'])], 'cancelled', {why: 'Moved out early — will call again'});
  job(11, -10, -8, 'am', [U('Freezer', ['repair'], 'Sanyo')], 'done', {paid: 'cash'});
  job(12, -8, -6, 'pm', [U('Split', ['clean'], 'Aircon One'), U('Washing machine', ['clean'])], 'done', {paid: 'gcash'});
  job(13, -6, -4, 'am', [U('Window', ['checkup'])], 'done');
  job(4, -5, -3, 'pm', [U('Split', ['repair'], 'Kolin')], 'done', {notes: 'Leaking water inside'});
  job(8, -4, -2, 'am', [U('Cassette', ['repair', 'clean'])], 'done', {paid: 'cash'});
  // today, and the days in front of us
  job(1, -3, 0, 'am', [U('Split', ['checkup'], 'Carrier')], 'in_progress');
  job(5, -2, 0, 'am', [U('Window', ['clean']), U('Window', ['clean'])], 'scheduled', {onway: true});
  job(6, -2, 0, 'pm', [U('Split', ['install'], 'Daikin', 'FTKC35')], 'scheduled', {notes: 'Second floor bedroom, bracket needed'});
  job(0, -1, 1, 'am', [U('Split', ['clean'], 'Carrier', 'Optima'), U('Window', ['clean'])], 'scheduled', {notes: 'Bedroom unit this time'});
  job(9, -1, 1, 'pm', [U('Floor-mounted', ['clean'])], 'scheduled');
  job(3, -1, 2, 'am', [U('Split', ['repair'], 'Daikin')], 'scheduled', {notes: 'Error code U4 on the remote'});
  job(12, 0, 3, 'pm', [U('Cassette', ['survey'])], 'scheduled', {phone: true, notes: 'Office fit-out, survey for 3 cassettes'});
  job(7, 0, 5, 'am', [U('Split', ['relocate'])], 'scheduled');

  // the Inbox: new bookings from the page, one taken by phone, one rejected
  const inbox = (pi, madeOff, h, m, d, slot, units, o = {}) => {
    const p = PEOPLE[pi], id = uid(), made = at(madeOff, h, m);
    s.bookings[id] = {id, ref: ref(), created_at: made, updated_at: made, status: o.status || 'new', source: o.phone ? 'office' : 'page',
      full_name: p[0], contact: p[1], address: p[2], landmark: p[3], lat: o.pin ? 10.672 + pi * 0.001 : null, lng: o.pin ? 122.957 : null,
      services: unionSvc(units), units, unit_count: units.length, unit_type: typeOfUnits(units),
      unit_brand: units[0].brand, unit_model: units[0].model, unit_serial: null, notes: o.notes || null,
      preferred_on: manila(d), slot, handled_at: o.status ? iso(Date.parse(made) + 40 * 6e4) : null, customer_id: null,
      reject_reason: o.status === 'rejected' ? 'Outside our area — referred to a shop in Silay' : null,
      account_id: null, seen_at: o.seen ? iso(Date.parse(made) + 15 * 6e4) : o.phone ? made : null,
      seen_by: o.seen || o.phone ? P.office.id : null, quote: null, for_customer: null};
  };
  inbox(14, 0, 7, 12, 2, 'am', [U('Split', ['clean'], 'Carrier'), U('Split', ['clean'], 'Carrier')], {pin: true, notes: 'Both units in the living room'});
  inbox(15, 0, 8, 3, 3, 'pm', [U('Window', ['repair'], 'Koppel')], {notes: 'Turns on but no cold air'});
  inbox(16, -1, 20, 45, 4, 'am', [U('Split', ['install'], 'Daikin', 'FTKC25'), U('Split', ['install'], 'Daikin', 'FTKC25')], {seen: true});
  inbox(17, 0, 9, 30, 2, 'pm', [U('Washing machine', ['repair'])], {phone: true, notes: 'Called in — the drum will not spin'});
  inbox(11, -9, 14, 5, -7, 'am', [U('Split', ['survey'])], {status: 'rejected', seen: true});
  return s;
}

/* ---------------------------------------------------------------- the store */
let S = null;
function load(){
  S = lsGet(STORE_KEY);
  // a new day with nothing touched: the invented month moves with the calendar
  if (!S || S.version !== VERSION || (S.seed_day !== manila(0) && !S.touched)){
    S = seed();
    try { Object.keys(localStorage).filter(k => /^ws_(db|queue|notices)_/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    save();
  }
}
function save(){ if (!lsSet(STORE_KEY, S)) console.warn('demo: this browser would not save'); }
load();

window.wsDemoReset = function(){
  try { Object.keys(localStorage).filter(k => /^(ws_|wsdemo_)/.test(k) && k !== 'wsdemo_as').forEach(k => localStorage.removeItem(k)); } catch (e) {}
  const who = window.wsDemoWho();
  load();
  if (who !== 'guest' && P[who]) window.wsDemoAs(who); else location.reload();
};

/* ---------------------------------------------------------------- who is calling */
function personOf(token){
  if (!token || !token.startsWith('demo.')) return null;
  const id = token.slice(5), t = S.team[id];
  return t ? {id, role: t.active === false ? 'disabled' : t.role, name: t.display_name || t.email, email: t.email} : null;
}
const nameOf = id => { const t = id && S.team[id]; return t ? (t.display_name || t.email) : null; };
const bump = row => { row.updated_at = iso(Date.now()); };

/* ---------------------------------------------------------------- answers */
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const refuse = (msg, code = '22023', status = 400) => json({code, message: msg}, status);
const wait = ms => new Promise(r => setTimeout(r, ms));
const session = t => ({access_token: 'demo.' + t.id, refresh_token: 'demo-refresh.' + t.id, expires_in: 3600 * 24 * 365,
  token_type: 'bearer', user: {id: t.id, email: t.email}});

function auth(path, body){
  if (path.startsWith('/logout')) return json({});
  if (path.startsWith('/token?grant_type=refresh_token')){
    const t = S.team[String(body.refresh_token || '').replace('demo-refresh.', '')];
    return t ? json(session(t)) : json({error: 'invalid_grant', error_description: 'Sign in again.'}, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  let t = Object.values(S.team).find(x => (x.email || '').toLowerCase() === email);
  if (path.startsWith('/signup')){
    if (t) return json({msg: 'That email already has an account. Log in instead.'}, 422);
    const meta = body.data || (body.options && body.options.data) || {}, now = iso(Date.now()), id = uid();
    t = S.team[id] = {id, email, role: 'customer', display_name: meta.display_name || meta.full_name || email.split('@')[0],
      active: true, signup_kind: meta.signup_kind || 'customer', created_at: now, updated_at: now, last_sign_in_at: now};
    S.touched = true; save();
    return json(session(t));
  }
  if (path.startsWith('/token?grant_type=password')){
    if (!t) return json({error_description: 'Demo: switch person with the strip at the bottom, or make an account — any email works.'}, 400);
    t.last_sign_in_at = iso(Date.now()); save();
    return json(session(t));
  }
  return json({});
}

/* the shape a technician's phone gets (supabase/28, pull) */
function techJob(j){
  const c = S.customers[j.customer_id] || {}, b = j.booking_id && S.bookings[j.booking_id];
  const out = {id: j.id, status: j.status, status_at: j.status_at, customer_id: j.customer_id, scheduled_on: j.scheduled_on,
    slot: j.slot, services: j.services, unit_type: j.unit_type, unit_count: j.unit_count, units: j.units, booking_id: j.booking_id,
    unit_brand: j.unit_brand, unit_model: j.unit_model, notes: j.notes, done_at: j.done_at, cancel_reason: j.cancel_reason,
    on_way_at: j.on_way_at, booking_ref: b ? b.ref : null, status_by: j.status_by, status_by_name: nameOf(j.status_by),
    updated_at: (j.updated_at || '') > (c.updated_at || '') ? j.updated_at : c.updated_at,
    customer: {full_name: c.full_name, contact: c.contact, address: c.address, landmark: c.landmark, lat: c.lat, lng: c.lng, photo_path: c.photo_path}};
  if (S.settings.show_prices_tech) out.price = j.price;
  return out;
}
const jobOfBooking = b => Object.values(S.jobs).filter(j => j.booking_id === b.id)
  .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))[0] || null;
function custBooking(b){
  const j = jobOfBooking(b);
  return {id: b.id, ref: b.ref, status: b.status, created_at: b.created_at, preferred_on: b.preferred_on, slot: b.slot,
    services: b.services, unit_count: b.unit_count, units: b.units, address: b.address, landmark: b.landmark,
    updated_at: j && (j.updated_at || '') > (b.updated_at || '') ? j.updated_at : b.updated_at,
    job: j ? {status: j.status, scheduled_on: j.scheduled_on, slot: j.slot, done_at: j.done_at, units: j.units,
              services: j.services, on_way_at: j.on_way_at} : null};
}
const typesOut = () => S.types.map(t => ({key: t.key, label: t.label, icon: t.icon, active: t.active, sort: t.sort, services: t.services}))
  .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));

function pull(me, since){
  const fresh = r => !since || (r.updated_at || '') > since;
  const removed = tbl => S.removed.filter(x => x.tbl === tbl && (!since || x.at > since)).map(x => x.id);
  const t = S.team[me.id] || {};
  const profile = {id: me.id, role: me.role, display_name: t.display_name, signup_kind: t.signup_kind || 'customer', active: t.active !== false};
  let out;
  if (me.role === 'admin'){
    out = {bookings: Object.values(S.bookings).filter(fresh).map(b => { const o = clone(b); delete o.handled_by; return o; }),
      customers: Object.values(S.customers).filter(fresh).map(clone),
      jobs: Object.values(S.jobs).filter(fresh).map(clone),
      team: Object.values(S.team).filter(fresh).map(clone),
      settings: clone(S.settings), services: clone(S.services),
      removed_jobs: removed('jobs'), removed_customers: removed('customers'), removed_bookings: removed('bookings')};
  } else if (me.role === 'technician'){
    const from = manila(-30), show = !!S.settings.show_prices_tech;
    out = {bookings: [], customers: [], team: [], removed_customers: [],
      settings: show ? {show_prices_tech: true, gcash_number: S.settings.gcash_number, gcash_name: S.settings.gcash_name} : {show_prices_tech: false},
      services: show ? clone(S.services) : [], removed_jobs: removed('jobs'),
      jobs: Object.values(S.jobs).filter(j => j.scheduled_on && j.scheduled_on >= from).map(techJob).filter(fresh)};
  } else if (me.role === 'disabled'){
    out = {bookings: [], customers: [], jobs: [], team: [], removed_jobs: [], removed_bookings: [], removed_customers: [], settings: {}};
  } else {
    out = {customers: [], jobs: [], team: [], removed_jobs: [], removed_customers: [], settings: {},
      removed_bookings: S.removed.filter(x => x.tbl === 'bookings' && x.owner === me.id && (!since || x.at > since)).map(x => x.id),
      bookings: Object.values(S.bookings).filter(b => b.account_id === me.id).map(custBooking).filter(fresh)};
  }
  return {...out, types: typesOut(), role: me.role, me: me.id, profile, cursor: iso(Date.now())};
}

function listServices(){
  const showP = !!S.settings.show_prices;
  const rows = S.services.filter(s => s.active).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map(s => ({key: s.key, label: s.label, prices: showP && Object.keys(s.prices || {}).length ? {...s.prices} : null, shop: null}));
  if (rows[0]) rows[0].shop = {closed_days: S.settings.closed_days || [],
    closed_dates: (S.settings.closed_dates || []).filter(d => d.on >= manila(0)),
    facebook_url: S.settings.facebook_url || '', page_photos: S.settings.page_photos || [],
    types: typesOut().filter(t => t.active).map(t => ({key: t.key, label: t.label, icon: t.icon, services: t.services}))};
  return rows;
}

function bookJob(me, payload){
  const p = payload || {};
  if (String(p.website || '').trim()) return {ok: true, ref: 'WA-' + (1000 + Math.floor(Math.random() * 9000))};   // the honeypot
  const name = String(p.full_name || '').trim(), contact = String(p.contact || '').trim(), addr = String(p.address || '').trim();
  const slot = String(p.slot || '').toLowerCase(), on = String(p.preferred_on || '');
  if (name.length < 2) throw ['Please give your name.'];
  if (contact.length < 7) throw ['Please give a contact number.'];
  if (addr.length < 4) throw ['Please give the address.'];
  if (!['am', 'pm'].includes(slot)) throw ['Please choose AM or PM.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw ['Please choose a date.'];
  if (on < manila(0)) throw ['That date has already passed.'];
  if ((S.settings.closed_days || []).includes(new Date(on + 'T00:00:00Z').getUTCDay())) throw ['We are closed on that day. Please pick another.'];
  const cd = (S.settings.closed_dates || []).find(d => d.on === on);
  if (cd) throw ['We are closed on that day' + (cd.why ? ' — ' + cd.why : '') + '. Please pick another.'];
  const units = (Array.isArray(p.units) ? p.units : []).map(u => ({type: String(u.type || ''),
    services: [...new Set((u.services || []).map(String))], brand: u.brand || null, model: u.model || null}));
  if (!units.length) throw ['Add at least one aircon.'];
  if (units.length > 20) throw ['That is more than 20 aircons. Please ring us for a bigger job.'];
  for (const u of units){
    if (!S.types.some(x => x.key === u.type)) throw ['Each one needs its type — tap what it is.'];
    if (!u.services.length) throw ['Choose at least one service for each aircon.'];
  }
  if (Object.values(S.bookings).some(b => digits(b.contact) === digits(contact) && Date.now() - Date.parse(b.created_at) < 6e4))
    throw ['A booking from this number just came through. Give it a minute and check your reference code.', '53400'];
  const id = uid(), now = iso(Date.now()), ref = newRef();
  S.bookings[id] = {id, ref, created_at: now, updated_at: now, status: 'new', source: 'page', full_name: name, contact, address: addr,
    landmark: String(p.landmark || '').trim() || null, lat: p.lat ? +p.lat : null, lng: p.lng ? +p.lng : null,
    services: unionSvc(units), units, unit_count: units.length, unit_type: typeOfUnits(units),
    unit_brand: units[0].brand, unit_model: units[0].model, unit_serial: null, notes: String(p.notes || '').trim() || null,
    preferred_on: on, slot, handled_at: null, customer_id: null, reject_reason: null,
    account_id: me && me.role === 'customer' ? me.id : null, seen_at: null, seen_by: null, quote: null, for_customer: null};
  S.touched = true; save();
  return {ok: true, ref};
}

const byRef = code => Object.values(S.bookings).find(x => x.ref.toUpperCase() === String(code || '').trim().toUpperCase());
function checkBooking(code, contact){
  const b = byRef(code);
  if (!b || digits(b.contact) !== digits(contact))
    return {ok: false, message: 'We could not find that booking. Check the code and the number you booked with.'};
  return {ok: true, ref: b.ref, status: b.status, preferred_on: b.preferred_on, slot: b.slot};
}
function claim(me, code, contact){
  const b = byRef(code);
  if (!b || digits(b.contact) !== digits(contact)) return {ok: false, message: 'That code and number do not match a booking.'};
  let n = 0;
  for (const x of Object.values(S.bookings))
    if (!x.account_id && digits(x.contact) === digits(contact)){
      x.account_id = me.id; bump(x); n++;
      S.events.push({row: x.id, kind: 'claimed', at: iso(Date.now()), by: null, changes: null});
    }
  S.touched = true; save();
  return {ok: true, claimed: n};
}

/* ---------------------------------------------------------------- the history (full_status)
   The invented month has no history rows, so its steps are read off the row itself; what
   is done in the demo is written down as it happens, and wins over the read-off line. */
function fullStatus(me, a){
  let b = null, j = null;
  if (a.p_job){ j = S.jobs[a.p_job] || null; if (j && j.booking_id) b = S.bookings[j.booking_id] || null; }
  else if (a.p_booking){ b = S.bookings[a.p_booking] || null; if (b) j = jobOfBooking(b); }
  if (!b && !j) throw ['Nothing found.'];
  if (me.role === 'technician' && (!j || !j.scheduled_on)) throw ['That job is not on the schedule.', '42501'];
  if (me.role === 'customer' && (!b || b.account_id !== me.id)) throw ['That booking is not yours.', '42501'];
  const showP = me.role === 'admin' || (me.role === 'customer' && !!S.settings.show_prices)
             || (me.role === 'technician' && !!S.settings.show_prices_tech);
  const c = j ? S.customers[j.customer_id] : null;
  const ids = new Set([b && b.id, j && j.id].filter(Boolean));
  const live = S.events.filter(e => ids.has(e.row));
  const has = (row, kind) => live.some(e => e.row === row && e.kind === kind);
  const ev = [], office = nameOf(P.office.id);
  const add = (row, kind, when, by, changes) => { if (when && !has(row, kind)) ev.push({at: when, kind, by, changes: changes || null}); };
  if (b){
    add(b.id, 'booked', b.created_at, b.source === 'office' ? office : null);
    add(b.id, 'seen', b.seen_at, nameOf(b.seen_by) || 'the office');
    if (b.status === 'accepted') add(b.id, 'accepted', b.handled_at, office);
    if (b.status === 'rejected') add(b.id, 'rejected', b.handled_at, office);
    if (b.status === 'cancelled') add(b.id, 'cancelled', b.handled_at || b.updated_at, null);
  }
  if (j){
    add(j.id, 'job_created', j.created_at, office);
    if (j.scheduled_on) add(j.id, 'job_schedule', j.schedule_at || j.created_at, office, {before: {}, after: {scheduled_on: j.scheduled_on, slot: j.slot}});
    add(j.id, 'job_onway', j.on_way_at, nameOf(j.on_way_by || j.status_by));
    // the invented "Started" stays when the demo's own steps came after it
    const firstLive = live.filter(e => e.row === j.id && e.kind === 'job_status').map(e => e.at).sort()[0];
    const started = j.on_way_at && iso(Date.parse(j.on_way_at) + 40 * 6e4);
    if (started && ['in_progress', 'done'].includes(j.status) && (!firstLive || started < firstLive))
      ev.push({at: started, kind: 'job_status', by: nameOf(j.on_way_by || j.status_by),
               changes: {before: {status: 'scheduled'}, after: {status: 'in_progress'}}});
    if (!firstLive){
      if (j.status === 'done') ev.push({at: j.done_at, kind: 'job_status', by: nameOf(j.status_by), changes: {before: {status: 'in_progress'}, after: {status: 'done'}}});
      if (j.status === 'cancelled') ev.push({at: j.status_at, kind: 'job_status', by: office, changes: {before: {status: 'scheduled'}, after: {status: 'cancelled'}}});
    }
    if (showP) add(j.id, 'job_paid', j.paid_at, nameOf(j.paid_by), {before: {}, after: {paid: j.paid_method}});
    if (me.role !== 'customer') add(j.id, 'job_followup', j.followup_at, nameOf(j.followup_by), {before: {}, after: {note: j.followup_note}});
  }
  for (const e of live){
    if (['job_price', 'job_paid'].includes(e.kind) && !showP) continue;
    if (['job_photo', 'job_followup'].includes(e.kind) && me.role === 'customer') continue;
    ev.push({at: e.at, kind: e.kind, by: e.by, changes: e.changes || null});
  }
  ev.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  return {role: me.role, show_price: showP,
    booking: b ? {id: b.id, ref: b.ref, status: b.status, created_at: b.created_at, preferred_on: b.preferred_on, slot: b.slot,
      units: b.units, notes: b.notes, full_name: b.full_name, contact: b.contact, address: b.address, landmark: b.landmark,
      reject_reason: b.reject_reason} : null,
    job: j ? {id: j.id, status: j.status, scheduled_on: j.scheduled_on, slot: j.slot, done_at: j.done_at, units: j.units,
      notes: j.notes, cancel_reason: j.cancel_reason, on_way_at: j.on_way_at,
      paid_at: showP ? j.paid_at : null, paid_method: showP ? j.paid_method : null, price: showP ? j.price : null} : null,
    customer: c ? {full_name: c.full_name, contact: c.contact, address: c.address, landmark: c.landmark} : null,
    events: ev};
}

/* ---------------------------------------------------------------- writes
   By the time a write's call arrives, the app has already changed its own copy
   (write() → applyLocal → saveLocal). So a write is: note what happened, for the history,
   then take the rows the call names from the caller's copy. */
const localCopy = me => lsGet('ws_db_' + me.id) || {bookings: {}, customers: {}, jobs: {}, team: {}};
const TECH_JOB = ['status', 'done_at', 'on_way_at', 'notes', 'units', 'services', 'unit_count', 'unit_type', 'unit_brand', 'unit_model', 'cancel_reason'];
const TECH_CUST = ['address', 'landmark', 'lat', 'lng', 'photo_path'];

function lastAfter(row, kind, key){
  for (let i = S.events.length - 1; i >= 0; i--){
    const e = S.events[i];
    if (e.row === row && e.kind === kind && e.changes && e.changes.after && key in e.changes.after) return e.changes.after;
  }
  return null;
}
function logEvent(me, fn, a){
  const now = iso(Date.now()), j = a.p_job && S.jobs[a.p_job];
  const push = (row, kind, changes) => S.events.push({row, kind, at: now, by: me.name, changes: changes || null});
  switch (fn){
    case 'mark_seen': {
      const b = a.p_booking && S.bookings[a.p_booking];
      if (b && !b.seen_at){ b.seen_at = now; b.seen_by = me.id; bump(b); }
      break;
    }
    case 'accept_booking': push(a.p_booking, 'accepted'); break;
    case 'reject_booking': push(a.p_booking, 'rejected'); break;
    case 'create_job':     push(a.p_id, 'job_created'); break;
    case 'schedule_job': {
      // a job made in this same tap (Accept) arrives here already on its day: it had none before
      const madeNow = S.events.some(e => e.row === a.p_job && e.kind === 'job_created');
      const was = lastAfter(a.p_job, 'job_schedule', 'scheduled_on')
        || (!madeNow && j && j.scheduled_on ? {scheduled_on: j.scheduled_on, slot: j.slot} : {});
      push(a.p_job, 'job_schedule', {before: was, after: {scheduled_on: a.p_date, slot: a.p_slot}});
      if (j) j.schedule_at = now;
      break;
    }
    case 'set_job_status': case 'undo_job_status': {
      const was = (lastAfter(a.p_job, 'job_status', 'status') || {}).status || (j ? j.status : null);
      const mine = localCopy(me).jobs[a.p_job];
      push(a.p_job, 'job_status', {before: {status: was}, after: {status: fn === 'set_job_status' ? a.p_status : (mine ? mine.status : null)}});
      break;
    }
    case 'set_on_way':       push(a.p_job, 'job_onway'); if (j) j.on_way_by = me.id; break;
    case 'set_job_paid':     push(a.p_job, 'job_paid', {before: {}, after: {paid: a.p_method}}); if (j) j.paid_by = me.id; break;
    case 'set_job_price':    push(a.p_job, 'job_price', {before: {price: j ? j.price : null}, after: {price: a.p_price}}); break;
    case 'set_job_followup': push(a.p_job, 'job_followup', {before: {}, after: {note: a.p_note}}); if (j) j.followup_by = me.id; break;
    case 'edit_booking':     push(a.p_booking, 'edited'); break;
    case 'edit_job':         push(a.p_job, 'job_edit'); break;
  }
}

function takeRows(me, fn, a){
  const mine = localCopy(me), now = iso(Date.now());
  const ids = new Set(Object.values(a).filter(isUuid));
  const drop = (tbl, id, owner) => { if (!S[tbl][id]) return; delete S[tbl][id]; S.removed.push({tbl, id, at: now, owner: owner || null}); };

  if (fn === 'cancel_my_booking'){
    const b = Object.values(S.bookings).find(x => x.ref === a.p_ref && x.account_id === me.id);
    if (b && b.status === 'new'){
      b.status = 'cancelled'; b.handled_at = now; bump(b);
      S.events.push({row: b.id, kind: 'cancelled', at: now, by: me.name, changes: null});
    }
    return;
  }
  if (me.role === 'technician'){
    for (const id of ids){
      const row = mine.jobs && mine.jobs[id], j = S.jobs[id];
      if (!row || !j) continue;
      for (const k of TECH_JOB) if (k in row) j[k] = clone(row[k]);
      if (fn === 'set_job_status' || fn === 'undo_job_status'){
        j.status_by = me.id; j.status_at = now;
        if (j.status === 'done' && !j.done_at) j.done_at = now;
        if (j.status !== 'done') j.done_at = null;
      }
      bump(j);
      const c = S.customers[j.customer_id];
      if (c && row.customer){ for (const k of TECH_CUST) if (k in row.customer) c[k] = row.customer[k]; bump(c); }
    }
    return;
  }
  if (me.role !== 'admin') return;

  if (fn === 'delete_customer'){
    const cid = a.p_customer;
    Object.values(S.jobs).filter(j => j.customer_id === cid).forEach(j => drop('jobs', j.id));
    Object.values(S.bookings).filter(b => b.customer_id === cid || b.for_customer === cid).forEach(b => drop('bookings', b.id, b.account_id));
    drop('customers', cid);
    return;
  }
  if (fn === 'clear_old_bookings'){
    const cut = Date.now() - (Number(a.p_days) || 0) * DAY;
    Object.values(S.bookings).filter(b => ['rejected', 'cancelled'].includes(b.status) && Date.parse(b.created_at) <= cut)
      .forEach(b => drop('bookings', b.id, b.account_id));
    return;
  }
  if (['set_shop_setting', 'set_page_photos'].includes(fn) && mine.settings) S.settings = {...S.settings, ...clone(mine.settings)};
  if (fn === 'save_service' && mine.services) S.services = clone(mine.services);
  if (fn === 'save_unit_type' && mine.types) S.types = clone(mine.types);
  if (['set_role', 'set_active'].includes(fn) && mine.team && mine.team[a.p_user]){
    S.team[a.p_user] = {...S.team[a.p_user], ...clone(mine.team[a.p_user])}; bump(S.team[a.p_user]);
  }
  for (const tbl of ['bookings', 'customers', 'jobs']){
    for (const id of ids){
      const row = mine[tbl] && mine[tbl][id];
      if (!row) continue;
      const next = {...(S[tbl][id] || {}), ...clone(row)};
      delete next._prev;
      next.created_at = next.created_at || now;
      if (tbl === 'bookings'){
        if (!/^WA-/.test(next.ref || '')) next.ref = newRef();   // an office booking: the server gives the code
        if (fn === 'office_booking'){
          next.source = 'office'; next.seen_at = next.seen_at || now; next.seen_by = me.id;
          if (a.p_details && a.p_details.customer_id) next.for_customer = a.p_details.customer_id;
        }
        if (fn === 'accept_booking' && a.p_link_to) next.customer_id = a.p_link_to;
        if (fn === 'reject_booking') next.reject_reason = a.p_reason || 'No reason';
        if (['accept_booking', 'reject_booking'].includes(fn)) next.handled_at = next.handled_at || now;
      }
      if (tbl === 'jobs' && ['set_job_status', 'undo_job_status'].includes(fn)){
        next.status_by = me.id; next.status_at = now;
        if (next.status === 'done' && !next.done_at) next.done_at = now;
      }
      next.updated_at = now;
      S[tbl][id] = next;
    }
  }
}

/* ---------------------------------------------------------------- storage (photos) */
async function storage(method, path, init){
  const key = decodeURIComponent(path.replace(/^\/storage\/v1\/object\/(authenticated\/|public\/)?/, ''));
  if (method === 'GET'){
    const d = lsGet('wsdemo_photo:' + key) || S.photos[key];
    if (!d) return new Response('not found', {status: 404});
    const blob = await (await realFetch(d)).blob();
    return new Response(blob, {status: 200, headers: {'Content-Type': blob.type || 'image/jpeg'}});
  }
  if (method === 'DELETE'){
    delete S.photos[key]; try { localStorage.removeItem('wsdemo_photo:' + key); } catch (e) {}
    save(); return json({});
  }
  const body = init && init.body;
  if (body instanceof Blob){
    const url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(body); });
    if (!lsSet('wsdemo_photo:' + key, url)){ S.photos[key] = url; save(); }
  }
  return json({Key: key});
}

/* ---------------------------------------------------------------- the switchboard */
const realFetch = window.fetch.bind(window);
window.fetch = async function(input, init){
  const url = typeof input === 'string' ? input : input && input.url;
  if (!url || !url.startsWith(BASE)) return realFetch(input, init);
  init = init || {};
  const path = url.slice(BASE.length), method = (init.method || 'GET').toUpperCase();
  const hdr = init.headers || {}, bearer = String(hdr.Authorization || hdr.authorization || '').replace(/^Bearer\s+/, '');
  let body = {};
  if (typeof init.body === 'string'){ try { body = JSON.parse(init.body); } catch (e) {} }
  await wait(80 + Math.random() * 120);   // a little like a real network
  load();                                 // another tab may have changed it meanwhile
  try {
    if (path.startsWith('/auth/v1')) return auth(path.slice(8), body);
    if (path.startsWith('/storage/v1/object')) return await storage(method, path, init);
    const m = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
    if (!m) return refuse('Not found.', 'PGRST', 404);
    const fn = m[1], me = personOf(bearer);
    if (fn === 'list_services') return json(listServices());
    if (fn === 'book_job') return json(bookJob(me, body.payload));
    if (fn === 'check_booking') return json(checkBooking(body.code, body.contact));
    if (!me) return refuse('Sign in first.', '42501', 401);
    if (fn === 'pull') return json(pull(me, body.p_since));
    if (fn === 'full_status') return json(fullStatus(me, body));
    if (fn === 'claim_bookings') return json(claim(me, body.p_code, body.p_contact));
    if (fn === 'i_am_a_customer'){ const t = S.team[me.id]; if (t){ t.signup_kind = 'customer'; bump(t); save(); } return json({ok: true}); }
    if (fn === 'quote_signature') return json(null);
    // everything else is a queued write
    if (me.role === 'customer' && fn !== 'cancel_my_booking') return refuse('Only the office can do that.', '42501', 403);
    if (me.role === 'technician' && !['set_job_status', 'undo_job_status', 'set_on_way', 'edit_job', 'set_customer_photo', 'mark_job_seen'].includes(fn))
      return refuse('Only the office can do that.', '42501', 403);
    logEvent(me, fn, body);
    takeRows(me, fn, body);
    S.touched = true;
    save();
    return json(fn === 'set_page_photos' ? {ok: true, gone: []} : {ok: true});
  } catch (e) {
    if (Array.isArray(e)) return refuse(e[0], e[1] || '22023');
    console.error('demo server:', e);
    return refuse('Demo server: ' + ((e && e.message) || e), 'XX000', 400);
  }
};

/* ---------------------------------------------------------------- being someone
   Each person is a phone of their own: their own sign-in and local copy. Switching reloads. */
window.wsDemoWho = function(){
  const s = lsGet('ws_session');
  if (!s) return 'guest';
  for (const k of Object.keys(P)) if (P[k].id === s.uid) return k;
  return 'other';
};
window.wsDemoAs = function(who){
  try {
    if (who === 'guest') localStorage.removeItem('ws_session');
    else {
      const p = P[who], t = S.team[p.id] || p;
      localStorage.setItem('ws_session', JSON.stringify({access_token: 'demo.' + p.id, refresh_token: 'demo-refresh.' + p.id,
        expires_at: Date.now() + 365 * DAY, email: p.email, uid: p.id, role: t.role}));
    }
    localStorage.setItem('wsdemo_as', who);
    // each person opens on their first tab
    const ui = lsGet('ws_ui'); if (ui){ ui.tab = who === 'tech' ? 'jobs' : 'inbox'; lsSet('ws_ui', ui); }
  } catch (e) {}
  location.href = location.pathname + location.hash;
};
// ?as=office | tech | cust | guest opens the demo as that person (the deck's buttons use it)
const q = new URLSearchParams(location.search).get('as');
if (q && (P[q] || q === 'guest')){
  if (window.wsDemoWho() !== q) window.wsDemoAs(q);
  else history.replaceState(null, '', location.pathname + location.hash);
} else {
  try { if (!localStorage.getItem('wsdemo_as') && !localStorage.getItem('ws_session')) localStorage.setItem('wsdemo_as', 'guest'); } catch (e) {}
}
})();
