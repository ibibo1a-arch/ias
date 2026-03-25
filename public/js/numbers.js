/**
 * numbers.js — Getatext SMS rental, clean UI
 * Matches DaisySMS-style layout: API key → Service → Max Price → Carrier → Rent
 * Independence: account linking via hub.pub + window.tgAssignNumber fallback
 */
'use strict';

// ── Storage ───────────────────────────────────────────────────────
const GAT_KEY_STORAGE = 'gat_key';
function gatKey()      { try { return localStorage.getItem(GAT_KEY_STORAGE) || ''; } catch { return ''; } }
function gatSaveKey(k) { try { localStorage.setItem(GAT_KEY_STORAGE, k.trim()); } catch {} }

// ── Local number store (session) ──────────────────────────────────
let gatLocalNumbers = [];
let _gatLocalId     = 0;

function gatAddLocal(number, code, service) {
  const entry = {
    id: 'gn_' + (++_gatLocalId),
    number, code: code || '', service: service || '',
    attachedAccId: null, _attachedAccNum: null, addedAt: Date.now(),
  };
  gatLocalNumbers.unshift(entry);
  gatSyncNumsToHub();
  gatRenderLocal();
  return entry;
}

// Publish current local numbers to hub.store so other modules (accounts) can read them
function gatSyncNumsToHub() {
  try { if (typeof hub !== 'undefined') hub.store.set('gat_numbers', gatLocalNumbers); } catch(e) {}
}

// ── API proxy ─────────────────────────────────────────────────────
async function gatCall(method, path, body) {
  const key = gatKey();
  if (!key) throw new Error('No API key');
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json', 'x-gat-key': key }, signal: ctrl.signal };
    if (body) opts.body = JSON.stringify(body);
    const r    = await fetch('/api/getatext' + path, opts);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      // On HTTP error, extract error message from any common field name Getatext may use
      const errVal = json.errors || json.error || json.message || json.msg || null;
      throw new Error(errVal
        ? (Array.isArray(errVal) ? errVal.join(', ') : String(errVal))
        : 'HTTP ' + r.status + ': ' + JSON.stringify(json).slice(0, 100));
    }
    // On success (2xx), ONLY check dedicated error fields — NOT message/msg which may be
    // informational (e.g. "Number rented successfully") and would otherwise trigger false errors.
    const errVal = json.errors || json.error || null;
    if (errVal && errVal !== 'null') {
      throw new Error(Array.isArray(errVal) ? errVal.join(', ') : String(errVal));
    }
    return json;
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('Request timed out (20s)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── State ─────────────────────────────────────────────────────────
let gatServices        = [];
let gatServicesLoaded  = false;
let gatSelectedService = null;
let gatRentals         = new Map();
let gatFavorites       = new Set();
let gatServiceFilter   = '';

function gatLoadFavs() {
  try { gatFavorites = new Set(JSON.parse(localStorage.getItem('gat_favs') || '[]')); } catch { gatFavorites = new Set(); }
}
function gatSaveFavs() {
  try { localStorage.setItem('gat_favs', JSON.stringify([...gatFavorites])); } catch {}
}
gatLoadFavs();

// ── UI helpers ────────────────────────────────────────────────────
function gatStatus(msg, cls) {
  const el = $('gatStatus'); if (!el) return;
  el.textContent = msg;
  el.className   = 'num-status-row' + (cls ? ' ' + cls : '');
}
function gatUpdateBalance(val) {
  const el = $('gatBalance');
  if (el) el.textContent = val != null ? '$' + parseFloat(val).toFixed(2) : '—';
}
function numShowForm(connected) {
  const cw = $('numConnectWrap');
  const fw = $('numFormWrap');
  if (cw) cw.style.display = connected ? 'none'  : 'flex';
  if (fw) fw.style.display = connected ? 'flex' : 'none';
}

// ── Init ──────────────────────────────────────────────────────────
(function gatInit() {
  // Pre-fill key field
  const keyEl = $('gatApiKey');
  if (keyEl) keyEl.value = gatKey();

  // If already have a key — go straight to form view
  if (gatKey()) {
    numShowForm(true);
    setTimeout(async () => {
      try {
        const b = await gatCall('GET', '/balance');
        gatUpdateBalance(gatExtractBalance(b));
        gatStatus('Connected', 'ok');
        await gatLoadServices();
      } catch(e) { gatStatus(e.message, 'err'); }
    }, 200);
  }

  // Connect
  $('btnGatSaveKey')?.addEventListener('click', async () => {
    const k = ($('gatApiKey')?.value || '').trim();
    if (!k) { gatStatus('Enter an API key first', 'err'); return; }
    gatSaveKey(k);
    gatStatus('Connecting…', '');
    try {
      const b = await gatCall('GET', '/balance');
      gatUpdateBalance(gatExtractBalance(b));
      gatStatus('Connected', 'ok');
      numShowForm(true);
      await gatLoadServices();
    } catch(e) { gatStatus(e.message, 'err'); }
  });
  $('gatApiKey')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btnGatSaveKey')?.click(); });

  // Disconnect
  $('btnNumClearKey')?.addEventListener('click', () => {
    try { localStorage.removeItem(GAT_KEY_STORAGE); } catch {}
    gatUpdateBalance(null);
    gatStatus('', '');
    numShowForm(false);
    const keyEl = $('gatApiKey'); if (keyEl) keyEl.value = '';
  });

  // Refresh balance + services
  $('btnGatRefreshServices')?.addEventListener('click', async () => {
    const btn = $('btnGatRefreshServices');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const b = await gatCall('GET', '/balance');
      gatUpdateBalance(gatExtractBalance(b));
      await gatLoadServices();
      gatStatus('Refreshed', 'ok');
    } catch(e) { gatStatus(e.message, 'err'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'refresh'; } }
  });

  // Ensure search input + fav button exist — create them from JS if HTML is cached/stale
  gatEnsureServiceControls();

  // Service select change
  $('gatServiceSelect')?.addEventListener('change', function() {
    gatSelectedService = gatServices.find(s => s.api_name === this.value) || null;
    gatUpdateServiceMeta();
  });

  // Service search — filter select in real time (event on body handles dynamically created element too)
  document.body.addEventListener('input', e => {
    if (e.target.id === 'gatServiceSearch') {
      gatServiceFilter = e.target.value || '';
      gatRenderServiceSelect();
    }
  });

  // Favorite toggle button (event on body handles dynamically created element too)
  document.body.addEventListener('click', e => {
    if (e.target.id === 'btnGatFavSvc') {
      if (!gatSelectedService) { showToast('Select a service first'); return; }
      const name = gatSelectedService.api_name;
      if (gatFavorites.has(name)) gatFavorites.delete(name);
      else gatFavorites.add(name);
      gatSaveFavs();
      gatRenderServiceSelect();
      gatUpdateFavBtn();
    }
  });

  // Rent
  $('btnGatRent')?.addEventListener('click', gatRentClicked);

  // Manual number add
  $('btnGatAddManual')?.addEventListener('click', () => {
    const raw = ($('gatManualInput')?.value || '').trim();
    if (!raw) { showToast('Enter a number first'); return; }
    gatAddLocal(raw, '', 'manual');
    const inp = $('gatManualInput'); if (inp) inp.value = '';
    showToast('Number saved');
  });
  $('gatManualInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btnGatAddManual')?.click(); });

  gatRenderLocal();
})();

// ── Balance field normalization ───────────────────────────────────
function gatExtractBalance(b) {
  if (!b) return null;
  // Try direct field first, then nested data, then aliases
  return b.balance ?? b.data?.balance ?? b.amount ?? b.credit ?? b.credits ?? null;
}

// ── Load services → populate <select> ────────────────────────────
async function gatLoadServices() {
  const sel = $('gatServiceSelect');
  if (sel) sel.innerHTML = '<option value="">loading services…</option>';
  gatStatus('Loading services…', '');
  try {
    const data = await gatCall('GET', '/prices');

    // Getatext /api/v1/prices-info confirmed fields: api_name, service_name, price, stock
    // Response can be: plain array, or wrapped object with data/services/list/items/result key
    let arr = [];
    if (Array.isArray(data)) {
      arr = data;
    } else if (data && typeof data === 'object') {
      // Try common wrapper keys first
      var inner = data.data || data.services || data.list || data.items || data.result || data.prices || null;
      if (Array.isArray(inner)) {
        arr = inner;
      } else if (data.api_name) {
        arr = [data];  // single service object
      } else {
        // Keyed object: { "whatsapp": { price, stock, ... }, ... }
        arr = Object.entries(data)
          .filter(function(e) { return e[1] && typeof e[1] === 'object' && !Array.isArray(e[1]); })
          .map(function(e) {
            var key = e[0], val = e[1];
            return {
              api_name:     val.api_name || key,
              service_name: val.service_name || val.name || (key.charAt(0).toUpperCase() + key.slice(1)),
              price:        parseFloat(val.price || val.cost || 0),
              stock:        parseInt(val.stock || val.count || val.physicalCount || 0),
            };
          });
      }
    }

    gatServices = arr
      .filter(function(s) { return s.api_name && s.service_name; })
      .map(function(s) {
        return {
          api_name:     String(s.api_name),
          service_name: String(s.service_name),
          price:        parseFloat(s.price || 0),
          stock:        parseInt(s.stock || 0),
        };
      })
      .sort(function(a, b) { return a.service_name.localeCompare(b.service_name); });

    gatServicesLoaded = true;

    if (!gatServices.length) {
      const sel = $('gatServiceSelect');
      if (sel) sel.innerHTML = '<option value="">No services available</option>';
      gatStatus('No services returned from API', 'err');
      return;
    }

    gatRenderServiceSelect();

    if (gatSelectedService) {
      const sel = $('gatServiceSelect');
      if (sel && !sel.value) gatSelectedService = null;
    }

    gatUpdateServiceMeta();
    gatStatus('', '');

  } catch(e) {
    gatStatus('Could not load services: ' + e.message, 'err');
    console.error('[numbers] gatLoadServices:', e);
  }
}


// Inject search input + fav button if not present in HTML (handles cached HTML)
function gatEnsureServiceControls() {
  const sel = $('gatServiceSelect');
  if (!sel) return;

  // Search input — insert above the select's parent row
  if (!$('gatServiceSearch')) {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'gatServiceSearch';
    inp.placeholder = 'search services…';
    inp.autocomplete = 'off';
    inp.style.cssText = 'width:100%;padding:8px 11px;font-family:var(--font);font-size:12px;' +
      'background:var(--bg);border:1px solid var(--border);border-radius:6px;' +
      'color:var(--fg);box-sizing:border-box;margin-bottom:6px;display:block';
    const row = sel.closest('.num-service-row') || sel.parentNode;
    row.parentNode.insertBefore(inp, row);
  }

  // Fav button — insert inside the service row after the select
  if (!$('btnGatFavSvc')) {
    const btn = document.createElement('button');
    btn.id = 'btnGatFavSvc'; btn.title = 'Star this service as a favorite';
    btn.textContent = '☆';
    btn.style.cssText = 'background:none;border:1px solid var(--border);border-radius:4px;' +
      'cursor:pointer;color:var(--dim);font-size:15px;line-height:1;padding:4px 9px;' +
      'transition:color .15s,border-color .15s;flex-shrink:0';
    const row = sel.closest('.num-service-row') || sel.parentNode;
    sel.insertAdjacentElement('afterend', btn);
  }
}

function gatUpdateServiceMeta() {
  const stockEl = $('gatSvcStock');
  const priceEl = $('gatSvcPrice');
  if (!gatSelectedService) {
    if (stockEl) { stockEl.textContent = ''; stockEl.className = 'num-svc-stock'; }
    if (priceEl) priceEl.textContent = '';
    gatUpdateFavBtn();
    return;
  }
  const stock    = parseInt(gatSelectedService.stock) || 0;
  const stockCls = stock > 50 ? 'ok' : stock > 0 ? 'warn' : 'err';
  if (stockEl) { stockEl.textContent = stock + ' in stock'; stockEl.className = 'num-svc-stock ' + stockCls; }
  if (priceEl) priceEl.textContent = '$' + parseFloat(gatSelectedService.price || 0).toFixed(2);
  gatUpdateFavBtn();
}

function gatUpdateFavBtn() {
  const btn = $('btnGatFavSvc'); if (!btn) return;
  if (!gatSelectedService) {
    btn.textContent = '☆'; btn.classList.remove('num-fav-active');
    btn.style.color = ''; btn.style.borderColor = ''; return;
  }
  const isFav = gatFavorites.has(gatSelectedService.api_name);
  btn.textContent = isFav ? '★' : '☆';
  btn.classList.toggle('num-fav-active', isFav);
  // Also apply inline style for dynamically-created buttons (not covered by CSS class)
  btn.style.color       = isFav ? '#f5c518' : '';
  btn.style.borderColor = isFav ? '#f5c518' : '';
}

// Render service <select> with search filter and favorites optgroup
function gatRenderServiceSelect() {
  const sel = $('gatServiceSelect'); if (!sel) return;
  if (!gatServices.length) {
    sel.innerHTML = '<option value="">No services available</option>';
    return;
  }
  const q    = gatServiceFilter.toLowerCase().trim();
  const favs = gatServices.filter(s => gatFavorites.has(s.api_name) && (!q || s.service_name.toLowerCase().includes(q) || s.api_name.toLowerCase().includes(q)));
  const rest = gatServices.filter(s => !gatFavorites.has(s.api_name) && (!q || s.service_name.toLowerCase().includes(q) || s.api_name.toLowerCase().includes(q)));

  function optHtml(s) {
    const stock = s.stock;
    const tag   = stock > 50 ? '●' : stock > 0 ? '○' : '✕';
    return '<option value="' + esc(s.api_name) + '">' + esc(s.service_name) + '  ' + tag + '  $' + s.price.toFixed(2) + '</option>';
  }

  let html = '<option value="">— select service —</option>';
  if (favs.length) {
    html += '<optgroup label="★ Favorites">' + favs.map(optHtml).join('') + '</optgroup>';
  }
  if (rest.length) {
    const grpLabel = favs.length ? 'All Services' : 'Services';
    html += '<optgroup label="' + grpLabel + '">' + rest.map(optHtml).join('') + '</optgroup>';
  }
  if (!favs.length && !rest.length) {
    html += '<option value="" disabled>No match</option>';
  }
  sel.innerHTML = html;

  if (gatSelectedService) {
    sel.value = gatSelectedService.api_name;
    if (!sel.value) { /* selection filtered out — keep selectedService in memory */ }
  }
}

// ── Rent ──────────────────────────────────────────────────────────
async function gatRentClicked() {
  if (!gatSelectedService) { showToast('Select a service first'); return; }
  const btn = $('btnGatRent');
  if (btn) { btn.disabled = true; btn.textContent = 'renting…'; }
  gatStatus('Requesting number…', '');
  try {
    const body = { service: gatSelectedService.api_name };
    const mp = $('gatMaxPrice')?.value;                if (mp) body.max_price   = parseFloat(mp);
    const ca = $('gatCarrierSelect')?.value;           if (ca) body.carrier     = ca;
    const ac = $('gatAreaCodes')?.value;               if (ac) body.area_codes  = ac.replace(/\s/g, '');
    const raw = await gatCall('POST', '/rent', body);
    // Unwrap { data: {...} } if present
    const r   = (raw && raw.data && typeof raw.data === 'object') ? raw.data : raw;
    gatUpdateBalance(r.new_balance ?? raw.new_balance ?? null);
    gatStatus('Rented — waiting for SMS…', 'ok');
    gatAddRental(r);
    // Show rentals header
    const hdr = $('numRentalsHdr');
    if (hdr) hdr.style.display = 'flex';
  } catch(e) {
    gatStatus(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ rent number'; }
  }
}

// ── Rental lifecycle ──────────────────────────────────────────────
function gatAddRental(raw) {
  // Unwrap { data: {...} } if the caller hasn't already done so
  const r  = (raw && raw.data && typeof raw.data === 'object') ? raw.data : raw;
  const id = String(r.id || r.rental_id || r.order_id || '');
  if (!id) { gatStatus('Rent failed: no rental ID in response', 'err'); console.error('[numbers] gatAddRental: no id in', r); return; }
  const numStr = String(r.number || r.phone || r.phone_number || '');
  const rental = {
    id,
    number:       numStr,
    service_name: r.service_name || r.service || '',
    price:        r.price || r.cost || 0,
    end_time:     r.end_time || r.expires_at || r.expire_time || null,
    status: 'waiting', code: null, pollTimer: null, rentedAt: Date.now(),
  };
  gatRentals.set(id, rental);
  gatRenderRentals();
  rental.pollTimer = setInterval(() => gatPollRental(id), 3000);
}

async function gatPollRental(id) {
  const rental = gatRentals.get(id);
  if (!rental || rental.status !== 'waiting') return;
  if (rental._polling) return;  // prevent concurrent polls
  rental._polling = true;
  try {
    const raw = await gatCall('POST', '/status', { id });
    const r   = (raw && raw.data && typeof raw.data === 'object') ? raw.data : raw;
    // Check all common field names Getatext may use for the SMS code
    const code = r.code || r.sms_code || r.sms || r.otp || r.activation_code || null;
    if (code && code !== 'null') {
      rental.code = String(code); rental.status = 'received';
      clearInterval(rental.pollTimer); rental.pollTimer = null;
      gatRenderRentals();
      showToast('✓ Code: ' + rental.code);
      const numStr = rental.number ? (rental.number.startsWith('+') ? rental.number : '+' + rental.number) : '';
      gatAddLocal(numStr, rental.code, rental.service_name);
      dbg('Numbers: ' + rental.number + ' → ' + rental.code, 'debug-ok');
    } else {
      const st = r.status || r.rental_status || '';
      if (st === 'cancelled' || st === 'canceled' || st === 'expired') {
        rental.status = 'cancelled';
        clearInterval(rental.pollTimer); rental.pollTimer = null;
        gatRenderRentals();
      }
    }
    // Expiry check — robust against different time formats
    if (rental.end_time && rental.status === 'waiting') {
      let exp = null;
      try {
        const et = String(rental.end_time);
        exp = new Date(/[TZ+]/.test(et) ? et : et.replace(' ', 'T') + 'Z');
      } catch { exp = null; }
      if (exp && !isNaN(exp.getTime()) && Date.now() > exp.getTime() + 60000) {
        clearInterval(rental.pollTimer); rental.pollTimer = null;
        rental.status = 'expired'; gatRenderRentals();
      }
    }
  } catch(e) { console.warn('[numbers] poll', id, e.message); }
  finally { const r2 = gatRentals.get(id); if (r2) r2._polling = false; }
}

function gatRenderRentals() {
  const list = $('gatRentalList'); if (!list) return;
  const hdr  = $('numRentalsHdr');
  if (hdr) hdr.style.display = gatRentals.size ? 'flex' : 'none';
  if (!gatRentals.size) { list.innerHTML = ''; return; }
  list.innerHTML = '';
  for (const [id, r] of [...gatRentals.entries()].reverse()) {
    const card = document.createElement('div');
    card.className = 'gat-rental-card gat-rental-' + r.status;
    let timeLeft = '';
    if (r.end_time && r.status === 'waiting') {
      try {
        const et  = String(r.end_time);
        const exp = new Date(/[TZ+]/.test(et) ? et : et.replace(' ', 'T') + 'Z');
        if (!isNaN(exp.getTime())) {
          const secs = Math.max(0, Math.floor((exp - Date.now()) / 1000));
          timeLeft = secs > 0 ? Math.floor(secs/60) + 'm ' + (secs%60) + 's' : 'expired';
        }
      } catch(e2) { /* ignore bad date */ }
    }
    const displayNum = r.number ? (r.number.startsWith('+') ? r.number : '+' + r.number) : '?';
    card.innerHTML =
      '<div class="gat-rental-head">' +
        '<span class="gat-rental-num">' + esc(displayNum) + '</span>' +
        '<span class="gat-rental-svc">' + esc(r.service_name) + '</span>' +
        (timeLeft ? '<span class="gat-rental-time">' + esc(timeLeft) + '</span>' : '') +
        '<span class="gat-rental-price" style="margin-left:auto;color:var(--dim)">$' + parseFloat(r.price||0).toFixed(2) + '</span>' +
      '</div>' +
      (r.code ?
        '<div class="gat-code-row">' +
          '<span class="gat-code">' + esc(r.code) + '</span>' +
          '<button class="btn btn-sm gat-copy-code" data-code="' + esc(r.code) + '">copy</button>' +
          '<button class="btn btn-sm btn-go gat-send-acc-btn" data-id="' + id + '">→ account</button>' +
          '<button class="btn btn-sm gat-complete-btn" data-id="' + id + '">complete</button>' +
        '</div>' : '') +
      (r.status === 'waiting' ?
        '<div class="gat-rental-actions">' +
          '<div class="gat-poll-indicator"><span class="gat-pulse"></span> waiting for SMS</div>' +
          '<button class="btn btn-sm btn-danger gat-cancel-btn" data-id="' + id + '">cancel</button>' +
        '</div>' : '') +
      (r.status === 'expired' || r.status === 'cancelled' ?
        '<div class="gat-rental-actions"><button class="btn btn-sm gat-dismiss-btn" data-id="' + id + '">dismiss</button></div>' : '');
    list.appendChild(card);
  }

  // Buttons
  list.querySelectorAll('.gat-copy-code').forEach(b =>
    b.onclick = () => navigator.clipboard.writeText(b.dataset.code).then(() => showToast('Copied')).catch(() => showToast(b.dataset.code, 4000)));

  list.querySelectorAll('.gat-send-acc-btn').forEach(b =>
    b.onclick = () => {
      const rental = gatRentals.get(b.dataset.id);
      if (rental && rental.number) {
        const n = rental.number.startsWith('+') ? rental.number : '+' + rental.number;
        gatOpenAttachModal(null, n, rental.code);
      }
    });

  list.querySelectorAll('.gat-cancel-btn').forEach(b =>
    b.onclick = async () => {
      const rid = b.dataset.id;
      b.disabled = true; b.textContent = '…';
      try {
        await gatCall('POST', '/cancel', { id: rid });
        const r = gatRentals.get(rid);
        if (r) { clearInterval(r.pollTimer); r.status = 'cancelled'; }
        gatRenderRentals();
        gatUpdateBalance(gatExtractBalance(await gatCall('GET', '/balance')));
        showToast('Cancelled');
      } catch(e) { showToast(e.message); b.disabled = false; b.textContent = 'cancel'; }
    });

  list.querySelectorAll('.gat-complete-btn').forEach(b =>
    b.onclick = async () => {
      const rid = b.dataset.id;
      b.disabled = true; b.textContent = '…';
      try {
        await gatCall('POST', '/complete/' + rid, {});
        const r = gatRentals.get(rid);
        if (r) { r._completed = true; r.status = 'completed'; }
        gatRenderRentals();
        gatUpdateBalance(gatExtractBalance(await gatCall('GET', '/balance')));
        showToast('Completed');
      } catch(e) { showToast(e.message); b.disabled = false; b.textContent = 'complete'; }
    });

  list.querySelectorAll('.gat-dismiss-btn').forEach(b =>
    b.onclick = () => {
      const rid = b.dataset.id;
      const r   = gatRentals.get(rid); if (r) clearInterval(r.pollTimer);
      gatRentals.delete(rid); gatRenderRentals();
    });
}

setInterval(() => { if (gatRentals.size) gatRenderRentals(); }, 5000);

// Clean up all poll timers on page unload to prevent dangling intervals
window.addEventListener('beforeunload', function() {
  for (const r of gatRentals.values()) {
    if (r.pollTimer) { clearInterval(r.pollTimer); r.pollTimer = null; }
  }
});

// ── My Numbers list ───────────────────────────────────────────────
function gatRenderLocal() {
  const el = $('gatLocalNumbers'); if (!el) return;
  if (!gatLocalNumbers.length) {
    el.innerHTML = '<div class="num-empty">No numbers yet</div>';
    return;
  }
  el.innerHTML = '';
  gatLocalNumbers.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'gat-local-card' + (entry.attachedAccId ? ' gat-local-attached' : '');
    card.innerHTML =
      '<div class="gat-local-main">' +
        '<span class="gat-local-num">' + esc(entry.number) + '</span>' +
        (entry.code    ? '<span class="gat-local-code">' + esc(entry.code) + '</span>'    : '') +
        (entry.service ? '<span class="gat-local-svc">'  + esc(entry.service) + '</span>' : '') +
        (entry.attachedAccId ? '<span class="gat-local-tag ok">ACC ' + esc(entry._attachedAccNum||'?') + '</span>' : '') +
      '</div>' +
      '<div class="gat-local-actions">' +
        '<button class="btn btn-sm gat-copy-num" data-num="' + esc(entry.number) + '">copy</button>' +
        (entry.code ? '<button class="btn btn-sm gat-copy-code2" data-code="' + esc(entry.code) + '">copy code</button>' : '') +
        '<button class="btn btn-sm btn-go gat-attach-btn" data-id="' + entry.id + '">→ account</button>' +
        '<button class="btn btn-sm btn-danger gat-rm-local" data-id="' + entry.id + '">×</button>' +
      '</div>';
    el.appendChild(card);
  });

  el.querySelectorAll('.gat-copy-num').forEach(b =>
    b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.num).then(() => showToast('Copied')).catch(() => showToast(b.dataset.num, 4000))));
  el.querySelectorAll('.gat-copy-code2').forEach(b =>
    b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.code).then(() => showToast('Code copied')).catch(() => showToast(b.dataset.code, 4000))));
  el.querySelectorAll('.gat-rm-local').forEach(b =>
    b.addEventListener('click', () => {
      gatLocalNumbers = gatLocalNumbers.filter(e => e.id !== b.dataset.id);
      gatSyncNumsToHub();
      gatRenderLocal();
    }));
  el.querySelectorAll('.gat-attach-btn').forEach(b =>
    b.addEventListener('click', () => {
      const entry = gatLocalNumbers.find(e => e.id === b.dataset.id);
      if (entry) gatOpenAttachModal(entry.id, entry.number, entry.code);
    }));
}

// ── Attach to Account modal ───────────────────────────────────────
// Can be called from: rental card (localId=null) or local list (localId set)
function gatOpenAttachModal(localEntryId, number, code) {
  let accs = [];
  try { accs = (typeof tgAccs !== 'undefined' ? tgAccs : []).filter(a => !a._archived); } catch(e) {}

  document.getElementById('gatAttachModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'gatAttachModal';
  overlay.className = 'gat-modal-overlay';

  if (!accs.length) {
    overlay.innerHTML =
      '<div class="gat-modal">' +
        '<div class="gat-modal-hdr">Attach to Account</div>' +
        '<div style="padding:16px;color:var(--dim);font-size:12px">No accounts yet.<br>Send a proxy from the Proxies tab to create an account first.</div>' +
        '<div class="gat-modal-btns"><button class="btn" id="gatAttachCancel">close</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('gatAttachCancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  const opts = accs.map(a =>
    '<option value="' + a.id + '">ACC ' + a.accNum +
    (a.city ? ' — ' + a.city : '') +
    (a.phone ? ' ✓ has number' : '') + '</option>'
  ).join('');

  overlay.innerHTML =
    '<div class="gat-modal">' +
      '<div class="gat-modal-hdr">Attach Number to Account</div>' +
      '<div class="gat-modal-num">' + esc(number) + (code ? ' · <span style="color:var(--ok);font-family:monospace">' + esc(code) + '</span>' : '') + '</div>' +
      '<select class="gat-modal-select" id="gatAttachSelect">' + opts + '</select>' +
      '<div class="gat-modal-btns">' +
        '<button class="btn btn-go" id="gatAttachConfirm">attach</button>' +
        '<button class="btn" id="gatAttachCancel">cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('gatAttachConfirm').onclick = () => {
    const accId = document.getElementById('gatAttachSelect').value;
    const acc   = accs.find(a => a.id === accId);

    // Update local entry if we have one
    if (localEntryId) {
      const entry = gatLocalNumbers.find(e => e.id === localEntryId);
      if (entry) { entry.attachedAccId = accId; entry._attachedAccNum = acc ? acc.accNum : '?'; }
      gatRenderLocal();
    }

    // Direct call to telegram.js (fast path)
    let assigned = false;
    try {
      if (typeof window.tgAssignNumber === 'function') {
        window.tgAssignNumber(number, accId);
        assigned = true;
      }
    } catch(e) { console.warn('[numbers] tgAssignNumber:', e.message); }

    // Hub event (decoupled backup)
    try {
      if (typeof hub !== 'undefined') hub.pub('number:attach', { number, code: code || '', accId });
    } catch(e) {}

    overlay.remove();
    showToast(assigned
      ? '✓ Number attached to ACC ' + (acc ? acc.accNum : '')
      : 'Number saved — open Accounts tab to link');
    dbg('Numbers: ' + number + ' → ACC ' + (acc ? acc.accNum : accId), 'debug-ok');
  };

  document.getElementById('gatAttachCancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Listen for account-side number assignments to mark the number as attached
try {
  if (typeof hub !== 'undefined') {
    hub.sub('number:assign-to-acc', function(data) {
      try {
        const entry = gatLocalNumbers.find(function(n) { return n.number === data.number; });
        if (entry) { entry.attachedAccId = data.accId; gatSyncNumsToHub(); gatRenderLocal(); }
      } catch(e) {}
    });
  }
} catch(e) {}

dbg('Numbers: loaded', 'debug-ok');
