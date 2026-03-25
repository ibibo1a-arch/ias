/**
 * proxyempire.js — ProxyEmpire proxy generator
 * v7.1 improvements:
 *   - Full-width card layout, larger and more readable
 *   - Real geo city/ISP from ipwho.is after IP resolves
 *   - Auth string large + bright, click-to-copy username
 *   - Copy all usernames button
 *   - Delete all button
 *   - Export as .txt
 *   - Proxy count badge
 *   - Always resolves IP+MS even without Scamalytics config
 */
'use strict';

(function initProxyTab() {

// ── Scam config helpers — local fallbacks so this tab is independent ─
// The real implementations live in settings.js. These fallbacks ensure
// the proxy tab works even if settings.js fails or loads out of order.
function _peScamLoadCfg() {
  if (typeof scamLoadCfg === 'function') return scamLoadCfg();
  try { return JSON.parse(localStorage.getItem('scam_cfg') || 'null'); } catch { return null; }
}
function _peScamHasCfg() {
  if (typeof scamHasCfg === 'function') return scamHasCfg();
  const c = _peScamLoadCfg(); return !!(c && c.k && c.user);
}

// ── State ────────────────────────────────────────────────────────
let peUser        = null;
let peResults     = [];
let _peIdCounter  = 0;
let peActiveType  = 'mobile';
let peActiveHost  = 'v2.proxyempire.io';
let peActiveProto = 'http';

// ── Persist ──────────────────────────────────────────────────────
function peSaveCreds(u, p) { try { localStorage.setItem('pe_creds', JSON.stringify({ u, p })); } catch {} }
function peLoadCreds() { try { return JSON.parse(localStorage.getItem('pe_creds') || 'null'); } catch { return null; } }

// ── Country list ─────────────────────────────────────────────────
const PE_COUNTRIES = [
  ['','worldwide'],['af','Afghanistan'],['al','Albania'],['dz','Algeria'],
  ['ar','Argentina'],['am','Armenia'],['au','Australia'],['at','Austria'],
  ['az','Azerbaijan'],['bh','Bahrain'],['bd','Bangladesh'],['by','Belarus'],
  ['be','Belgium'],['br','Brazil'],['bg','Bulgaria'],['ca','Canada'],
  ['cl','Chile'],['cn','China'],['co','Colombia'],['hr','Croatia'],
  ['cz','Czech Republic'],['dk','Denmark'],['eg','Egypt'],['ee','Estonia'],
  ['fi','Finland'],['fr','France'],['ge','Georgia'],['de','Germany'],
  ['gh','Ghana'],['gr','Greece'],['hk','Hong Kong'],['hu','Hungary'],
  ['in','India'],['id','Indonesia'],['ir','Iran'],['iq','Iraq'],
  ['ie','Ireland'],['il','Israel'],['it','Italy'],['jp','Japan'],
  ['jo','Jordan'],['kz','Kazakhstan'],['ke','Kenya'],['kr','South Korea'],
  ['kw','Kuwait'],['lv','Latvia'],['lb','Lebanon'],['lt','Lithuania'],
  ['my','Malaysia'],['mx','Mexico'],['nl','Netherlands'],['nz','New Zealand'],
  ['ng','Nigeria'],['no','Norway'],['pk','Pakistan'],['ph','Philippines'],
  ['pl','Poland'],['pt','Portugal'],['qa','Qatar'],['ro','Romania'],
  ['ru','Russia'],['sa','Saudi Arabia'],['rs','Serbia'],['sg','Singapore'],
  ['sk','Slovakia'],['za','South Africa'],['es','Spain'],['se','Sweden'],
  ['ch','Switzerland'],['tw','Taiwan'],['th','Thailand'],['tr','Turkey'],
  ['ua','Ukraine'],['ae','UAE'],['gb','United Kingdom'],['us','United States'],
  ['vn','Vietnam'],['ye','Yemen'],
];

function pePopulateCountries() {
  const sel = $('peCountry'); if (!sel) return;
  sel.innerHTML = '';
  PE_COUNTRIES.forEach(([code, name]) => {
    const o = document.createElement('option'); o.value = code; o.textContent = name; sel.appendChild(o);
  });
}

// ── Build proxy strings ──────────────────────────────────────────
function peMakeSid() {
  // 8-char lowercase alphanumeric session ID (matches ProxyEmpire format)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr   = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

function peBuildUsername(opts, sid) {
  // ProxyEmpire format: username-country-us-region-arkansas-city-little+rock-isp-verizon+wireless-sid-eco3brs0
  // All segments must be lowercase with spaces replaced by +
  const clean = v => v.trim().toLowerCase().replace(/\s+/g, '+');
  let u = peUser.username;
  if (opts.country)              u += `-country-${opts.country.toLowerCase()}`;
  if (opts.region && opts.region.trim()) u += `-region-${clean(opts.region)}`;
  if (opts.city   && opts.city.trim())   u += `-city-${clean(opts.city)}`;
  if (opts.isp    && opts.isp.trim())    u += `-isp-${clean(opts.isp)}`;
  u += `-sid-${sid}`;
  return u;
}

function peGetOpts() {
  return {
    country: $('peCountry')?.value || '',
    region:  $('peRegion')?.value  || '',
    city:    $('peCity')?.value    || '',
    isp:     $('peIsp')?.value     || '',
  };
}

function peBuildEntryWith(opts, sid, type, host, proto, port) {
  const uname = peBuildUsername(opts, sid);
  return {
    id:        'pe_' + (++_peIdCounter) + '_' + sid,
    type, host, port, proto,
    country: opts.country, region: opts.region, city: opts.city, isp: opts.isp,
    sid, username: uname, password: peUser.password,
    urlStr:    `${proto}://${encodeURIComponent(uname)}:${encodeURIComponent(peUser.password)}@${host}:${port}`,
    listStr:   `${host}:${port}:${uname}:${peUser.password}`,
    exitIp:      null,
    latencyMs:   null,
    geoCity:     null,
    geoRegion:   null,
    geoCountry:  null,
    geoLat:      null,
    geoLng:      null,
    geoIsp:      null,
    scamState:   'skipped',
    _expanded:   false,
    scamData:  null,
    scamError: null,
  };
}

function peBuildEntry(opts, sid) {
  const port = $('pePort')?.value || '5000';
  return peBuildEntryWith(opts, sid, peActiveType, peActiveHost, peActiveProto, port);
}

// ── Scamalytics + IP resolve ─────────────────────────────────────
async function scamLookup(entry) {
  // IP + geo already resolved by peResolveOne before this is called.
  // This function ONLY handles fraud scoring.
  if (!entry.exitIp) return; // safety guard

  const cfg = _peScamLoadCfg();
  const hasScamCfg = !!(cfg && cfg.k && cfg.user);
  if (!hasScamCfg) {
    entry.scamState = 'skipped';
    peUpdateCard(entry.id);
    return;
  }

  entry.scamState = 'checking';
  peUpdateCard(entry.id);
  dbg(`PE [${entry.sid}]: checking fraud score for ${entry.exitIp}…`, '');

  try {
    const r = await fetch('/api/scam/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: entry.exitIp, key: cfg.k, user: cfg.user, host: cfg.host || 'api11.scamalytics.com' }),
    });
    const d = await r.json();
    const scamData = d.scamalytics || d;

    if (scamData && (scamData.status === 'ok' || scamData.scamalytics_score !== undefined)) {
      entry.scamData  = scamData;
      entry.scamState = 'done';
      const rem = scamData.credits?.remaining;
      if (rem !== undefined) {
        const txt = `scamalytics: ${Number(rem).toLocaleString()} credits left`;
        const el1 = $('peScamCredits'), el2 = $('peRandScamCredits');
        if (el1) el1.textContent = txt;
        if (el2) el2.textContent = txt;
      }
      const score = scamData.scamalytics_score ?? scamData.score ?? '?';
      const risk  = scamData.scamalytics_risk  ?? scamData.risk  ?? '?';
      dbg(`PE scam ${entry.exitIp}: score=${score} risk=${risk}`, score > 59 ? 'debug-warn' : 'debug-ok');
    } else {
      entry.scamState = 'error';
      entry.scamError = scamData?.error || scamData?.status || d.error || 'unexpected response';
      dbg(`PE [${entry.sid}]: scam API error — ${entry.scamError}`, 'debug-err');
    }
  } catch (e) {
    entry.scamState = 'error';
    entry.scamError = e.message;
    dbg(`PE [${entry.sid}]: scam fetch error — ${e.message}`, 'debug-err');
  }
  peUpdateCard(entry.id);
}

// ── Card badges ──────────────────────────────────────────────────
function peStatusDot(entry) {
  if (entry.exitIp && (entry.scamState === 'done' || entry.scamState === 'skipped')) return 'pe-dot-ok';
  if (entry.scamState === 'error')   return 'pe-dot-err';
  return 'pe-dot-wait';
}

function peMsBadge(entry) {
  if (entry.latencyMs === null || entry.latencyMs === undefined) return '';
  const ms  = entry.latencyMs;
  const cls = ms < 500 ? 'pe-badge-ms-ok' : ms < 1200 ? 'pe-badge-ms-warn' : 'pe-badge-ms-err';
  return `<span class="pe-badge pe-badge-ms ${cls}">${ms}MS</span>`;
}

function peScoreBadge(entry) {
  if (entry.scamState === 'skipped') return '';
  if (entry.scamState === 'pending' || entry.scamState === 'checking') {
    return `<span class="pe-badge pe-badge-score pe-badge-score-wait">${entry.exitIp ? 'scoring\u2026' : 'resolving\u2026'}</span>`;
  }
  if (entry.scamState === 'error') {
    const short = (entry.scamError || 'error').split(':').pop().trim().slice(0, 30);
    return `<span class="pe-badge pe-badge-score pe-badge-score-err" title="${esc(entry.scamError || '')}">${esc(short)}</span>`;
  }
  if (entry.scamState === 'done' && entry.scamData) {
    const d     = entry.scamData;
    const score = d.scamalytics_score ?? d.score ?? '?';
    const risk  = (d.scamalytics_risk ?? d.risk ?? 'unknown').toString().toLowerCase();
    const cls   = risk === 'low' ? 'pe-badge-score-ok' : risk === 'medium' ? 'pe-badge-score-warn' : 'pe-badge-score-err';
    return `<span class="pe-badge pe-badge-score ${cls}" title="risk: ${esc(risk)}">${score}/100</span>`;
  }
  return '';
}

// ── Card rendering ───────────────────────────────────────────────
// ROW1: [dot] [city] [MS] [score] [type] [expand ▾] [del]
// ROW2: [auth string full] [copy]
// DETAIL (hidden, expand on click):
//   IP ADDRESS + copy
//   LOCATION
//   LATITUDE + copy
//   LONGITUDE + copy

function peCardInner(entry) {
  const city    = entry.geoCity   || (entry.city   ? entry.city.replace(/\+/g, ' ')   : '');
  const region  = entry.geoRegion || (entry.region ? entry.region.replace(/\+/g, ' ') : '');
  const locLabel = [city, region].filter(Boolean).join(', ') || 'Worldwide';
  const fullStr  = entry.listStr;
  const expanded = !!entry._expanded;

  var detail = '';
  if (entry.exitIp || entry.geoLat != null) {
    var rows = '';
    if (entry.exitIp) {
      rows += '<div class="pe-detail-row">' +
        '<span class="pe-detail-label">IP ADDRESS</span>' +
        '<span class="pe-detail-val">' + esc(entry.exitIp) + '</span>' +
        '<button class="btn btn-sm pe-detail-copy" data-copy="' + esc(entry.exitIp) + '">copy</button>' +
        '</div>';
    }
    if (locLabel) {
      var fullLoc = locLabel + (entry.geoCountry ? ', ' + entry.geoCountry : '');
      rows += '<div class="pe-detail-row">' +
        '<span class="pe-detail-label">LOCATION</span>' +
        '<span class="pe-detail-val">' + esc(fullLoc) + '</span>' +
        '</div>';
    }
    if (entry.geoLat != null) {
      rows += '<div class="pe-detail-row">' +
        '<span class="pe-detail-label">LATITUDE</span>' +
        '<span class="pe-detail-val">' + entry.geoLat.toFixed(6) + '</span>' +
        '<button class="btn btn-sm pe-detail-copy" data-copy="' + entry.geoLat.toFixed(6) + '">copy</button>' +
        '</div>';
    }
    if (entry.geoLng != null) {
      rows += '<div class="pe-detail-row">' +
        '<span class="pe-detail-label">LONGITUDE</span>' +
        '<span class="pe-detail-val">' + entry.geoLng.toFixed(6) + '</span>' +
        '<button class="btn btn-sm pe-detail-copy" data-copy="' + entry.geoLng.toFixed(6) + '">copy</button>' +
        '</div>';
    }
    detail = '<div class="pe-detail" style="display:' + (expanded ? 'block' : 'none') + '">' + rows + '</div>';
  }

  return '<div class="pe-card-row1">' +
      '<span class="pe-dot ' + peStatusDot(entry) + '"></span>' +
      '<span class="pe-city">' + esc(locLabel) + '</span>' +
      peMsBadge(entry) +
      peScoreBadge(entry) +
      '<span class="pe-row1-spacer"></span>' +
      '<span class="pe-type-pill ' + entry.type + '">' + entry.type + '</span>' +
      '<button class="btn btn-sm pe-tg-btn" data-id="' + entry.id + '" title="send to Accounts tab">\u2192 ACC</button>' +
      '<button class="btn btn-sm pe-card-expand" data-id="' + entry.id + '" title="details">' + (expanded ? '\u25b4' : '\u25be') + '</button>' +
      '<button class="btn btn-sm pe-card-del" data-id="' + entry.id + '" title="remove">\u00D7</button>' +
    '</div>' +
    detail +
    '<div class="pe-card-row3">' +
      '<span class="pe-auth-str" data-id="' + entry.id + '" title="' + esc(fullStr) + '">' + esc(fullStr) + '</span>' +
      '<button class="btn btn-sm pe-card-copy" data-id="' + entry.id + '" title="copy">\u29C9</button>' +
    '</div>';
}


function peRenderCard(entry) {
  const card = document.createElement('div');
  card.className = 'pe-card'; card.id = 'pecard_' + entry.id;
  card.innerHTML = peCardInner(entry);
  return card;
}

function peUpdateCard(entryId) {
  const card  = $('pecard_' + entryId);
  const entry = peResults.find(function(e) { return e.id === entryId; });
  if (!card || !entry) return;
  card.innerHTML = peCardInner(entry);
}

function peRenderAll() {
  const list = $('peCardList');
  const bulk = $('peBulkBar');
  if (!list) return;
  list.innerHTML = '';
  if (!peResults.length) { if (bulk) bulk.style.display = 'none'; return; }
  peResults.forEach(function(e) { list.appendChild(peRenderCard(e)); });
  if (bulk) bulk.style.display = 'flex';
  peUpdateCount();
}

function peUpdateCount() {
  const el = $('peProxyCount');
  if (el) el.textContent = peResults.length ? peResults.length + ' proxies' : '';
}

// ── Card click delegation ────────────────────────────────────────
$('peCardList')?.addEventListener('click', e => {
  // Copy button — copies username
  const copyBtn = e.target.closest('.pe-card-copy');
  if (copyBtn) {
    const entry = peResults.find(x => x.id === copyBtn.dataset.id);
    if (entry) navigator.clipboard.writeText(entry.listStr).then(() => showToast('auth string copied')).catch(() => showToast(entry.listStr, 5000));
    return;
  }
  // Click on auth string — same
  const authStr = e.target.closest('.pe-auth-str');
  if (authStr) {
    const entry = peResults.find(x => x.id === authStr.dataset.id);
    if (entry) navigator.clipboard.writeText(entry.listStr).then(() => showToast('auth string copied')).catch(() => {});
    return;
  }
  // Click on IP badge — copies just the IP
  const ipBadge = e.target.closest('.pe-ip-badge');
  if (ipBadge && ipBadge.dataset.id) {
    const entry = peResults.find(x => x.id === ipBadge.dataset.id);
    if (entry?.exitIp) navigator.clipboard.writeText(entry.exitIp).then(() => showToast('IP copied')).catch(() => showToast(entry.exitIp, 4000));
    return;
  }
  // Send to Accounts tab
  const tgBtn = e.target.closest('.pe-tg-btn');
  if (tgBtn) {
    const entry = peResults.find(x => x.id === tgBtn.dataset.id);
    if (entry) {
      if (typeof tgCreateAcc === 'function') {
        const acc = tgCreateAcc(entry);
        tgRenderAll();
        showToast('ACC ' + acc.accNum + ' created — go to Accounts tab');
        dbg('Sent to TG: ACC ' + acc.accNum, 'debug-ok');
      } else {
        showToast('Accounts tab not loaded');
      }
    }
    return;
  }

  // Expand button
  const expBtn = e.target.closest('.pe-card-expand');
  if (expBtn) {
    const entry = peResults.find(x => x.id === expBtn.dataset.id);
    if (entry) { entry._expanded = !entry._expanded; peUpdateCard(entry.id); }
    return;
  }
  // Detail copy buttons
  const detCopy = e.target.closest('.pe-detail-copy');
  if (detCopy) {
    const val = detCopy.dataset.copy;
    if (val) navigator.clipboard.writeText(val).then(() => showToast('copied')).catch(() => showToast(val, 4000));
    return;
  }
  // Delete button
  const delBtn = e.target.closest('.pe-card-del');
  if (delBtn) { peResults = peResults.filter(x => x.id !== delBtn.dataset.id); peRenderAll(); }
});

// ── Credential handlers ──────────────────────────────────────────
function peApplyCreds(username, password) {
  if (!username || !password) { showToast('enter username and password'); return; }
  peUser = { username: username.trim(), password: password.trim() };
  peSaveCreds(peUser.username, peUser.password);
  const badge = $('peSavedBadge'), label = $('peSavedLabel');
  if (badge) badge.style.display = 'flex';
  if (label) label.textContent = peUser.username;
  showToast('credentials saved');
  dbg('PE creds set: ' + peUser.username, 'debug-ok');
}

$('btnPeSave')?.addEventListener('click', () => peApplyCreds($('peUsername')?.value, $('pePassword')?.value));
$('peUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('pePassword')?.focus(); });
$('pePassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btnPeSave')?.click(); });
$('btnPePassToggle')?.addEventListener('click', () => {
  const inp = $('pePassword'); if (!inp) return;
  const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
  $('btnPePassToggle').textContent = show ? 'hide' : 'show';
});

// ── Type / proto toggles ─────────────────────────────────────────
$('peTypeGroup')?.addEventListener('click', e => {
  const btn = e.target.closest('.pe-type-btn[data-type]'); if (!btn) return;
  $('peTypeGroup').querySelectorAll('.pe-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); peActiveType = btn.dataset.type; peActiveHost = btn.dataset.host;
});
$('peProtoGroup')?.addEventListener('click', e => {
  const btn = e.target.closest('.pe-type-btn[data-proto]'); if (!btn) return;
  $('peProtoGroup').querySelectorAll('.pe-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); peActiveProto = btn.dataset.proto;
});

// ── Manual generate ──────────────────────────────────────────────
// ── Generate with retry — only show working proxies ──────────────
// Max attempts = 5x requested count. Geo + fraud score only on success.
// Shows loading bar. Cards appear one by one as they resolve.

let peGenerating = false;

function peSetGenerating(busy) {
  peGenerating = busy;
  const btns = [$('btnPeGenerate'), $('btnPeRandGenerate')];
  btns.forEach(b => { if (b) b.disabled = busy; });
  const bar = $('peLoadBar');
  if (bar) bar.style.display = busy ? 'block' : 'none';
}

function peSetProgress(done, total) {
  const fill = $('peLoadBarFill');
  const txt  = $('peLoadBarTxt');
  if (fill) fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  if (txt)  txt.textContent  = 'found ' + done + ' / ' + total + ' working proxies…';
}

async function peResolveOne(entry) {
  // Returns true if IP resolved successfully, false if failed
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000); // 30s client-side timeout
    let r;
    try {
      r = await fetch('/api/pe/resolve-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyUrl: entry.urlStr }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    const d = await r.json();
    if (!r.ok || !d.ip) return false;
    entry.exitIp     = d.ip;
    entry.latencyMs  = typeof d.ms === 'number' ? d.ms : null;
    entry.geoCity    = d.city    || null;
    entry.geoRegion  = d.region  || null;
    entry.geoCountry = d.country || null;
    entry.geoLat     = d.latitude  != null ? parseFloat(d.latitude)  : null;
    entry.geoLng     = d.longitude != null ? parseFloat(d.longitude) : null;
    entry.geoIsp     = d.isp     || null;
    return true;
  } catch (e) {
    return false;
  }
}

async function peGenerateWorking(buildFn, count, label) {
  if (peGenerating) { showToast('already generating…'); return; }
  peSetGenerating(true);
  peSetProgress(0, count);

  const MAX_ATTEMPTS = count * 5;
  const CONCURRENCY  = Math.min(3, count); // run up to 3 resolves in parallel
  let found = 0, attempts = 0, done = false;

  // Worker function — resolves one proxy attempt
  async function tryOne() {
    while (!done && found < count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const entry = buildFn();
      dbg('PE attempt ' + attempts + '/' + MAX_ATTEMPTS + ': ' + entry.username.slice(-20), '');
      const ok = await peResolveOne(entry);
      if (!ok) {
        dbg('PE attempt ' + attempts + ': IP resolve failed — skipping', 'debug-warn');
        continue;
      }
      found++;
      if (found > count) { found--; done = true; return; }
      entry.scamState = _peScamHasCfg() ? 'pending' : 'skipped';
      peResults.unshift(entry);
      peRenderAll();
      peSetProgress(found, count);
      dbg('PE attempt ' + attempts + ': ' + entry.exitIp + ' — working (' + found + '/' + count + ')', 'debug-ok');
      if (_peScamHasCfg()) {
        scamLookup(entry).catch(function(e) { dbg('scamLookup error: ' + e.message, 'debug-err'); });
      }
      if (found >= count) { done = true; return; }
    }
  }

  // Launch CONCURRENCY workers in parallel
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(tryOne());
  await Promise.all(workers);

  done = true;
  peSetGenerating(false);
  const bar = $('peLoadBar');
  if (bar) bar.style.display = 'none';

  if (found === 0) {
    showToast('no working proxies found after ' + attempts + ' attempts', 5000);
    dbg('PE generate: 0/' + count + ' working after ' + attempts + ' attempts', 'debug-err');
  } else if (found < count) {
    showToast('found ' + found + '/' + count + ' working proxies (' + attempts + ' attempts)');
    dbg('PE generate: ' + found + '/' + count + ' after ' + attempts + ' attempts', 'debug-warn');
  } else {
    showToast(found + ' ' + label + ' prox' + (found === 1 ? 'y' : 'ies') + ' ready');
    dbg('PE generate: all ' + found + ' working (' + attempts + ' attempts)', 'debug-ok');
  }
}

$('btnPeGenerate')?.addEventListener('click', () => {
  if (!peUser) { showToast('save credentials first'); return; }
  const opts  = peGetOpts();
  const count = Math.max(1, Math.min(100, parseInt($('peCount')?.value) || 1));
  peGenerateWorking(
    () => peBuildEntry(opts, peMakeSid()),
    count,
    peActiveType
  );
});

// ── Bulk actions ─────────────────────────────────────────────────
$('btnPeCopyAll')?.addEventListener('click', () => {
  if (!peResults.length) return;
  const text = peResults.map(p => p.listStr).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast(peResults.length + ' auth strings copied')).catch(() => showToast('copy failed'));
});

$('btnPeClearResults')?.addEventListener('click', () => {
  peResults = [];
  const list = $('peCardList'); if (list) list.innerHTML = '';
  const bulk = $('peBulkBar'); if (bulk) bulk.style.display = 'none';
  peUpdateCount();
  showToast('cleared');
});

// ── Mode switcher ────────────────────────────────────────────────
function peSwitchMode(mode) {
  const rp = $('peRandomPanel'); if (rp) rp.style.display = mode === 'random' ? 'block' : 'none';
  const mp = $('peManualPanel'); if (mp) mp.style.display = mode === 'manual' ? 'block' : 'none';
  const cp = $('peCityPanel');   if (cp) cp.style.display = mode === 'city'   ? 'block' : 'none';
  const br = $('btnModeRandom'); if (br) br.classList.toggle('active', mode === 'random');
  const bm = $('btnModeManual'); if (bm) bm.classList.toggle('active', mode === 'manual');
  const bc = $('btnModeCity');   if (bc) bc.classList.toggle('active', mode === 'city');
}

$('btnModeRandom')?.addEventListener('click', () => peSwitchMode('random'));
$('btnModeManual')?.addEventListener('click', () => peSwitchMode('manual'));
$('btnModeCity')?.addEventListener('click',   () => peSwitchMode('city'));

// ── Random type toggle ───────────────────────────────────────────
let peRandType = 'mobile', peRandHost = 'v2.proxyempire.io';

$('btnRandMobile')?.addEventListener('click', () => {
  $('btnRandMobile').classList.add('active'); $('btnRandResidential').classList.remove('active');
  peRandType = 'mobile'; peRandHost = 'v2.proxyempire.io';
});
$('btnRandResidential')?.addEventListener('click', () => {
  $('btnRandResidential').classList.add('active'); $('btnRandMobile').classList.remove('active');
  peRandType = 'residential'; peRandHost = 'rp.proxyempire.io';
});

// ── Random USA city pool ─────────────────────────────────────────
const USA_CITIES = [
  'new+york','los+angeles','chicago','houston','phoenix','philadelphia',
  'san+antonio','san+diego','dallas','san+jose','austin','jacksonville',
  'fort+worth','columbus','charlotte','indianapolis','san+francisco',
  'seattle','denver','washington','nashville','oklahoma+city','el+paso',
  'boston','portland','las+vegas','memphis','louisville','baltimore',
  'milwaukee','albuquerque','tucson','fresno','mesa','sacramento',
  'atlanta','kansas+city','omaha','colorado+springs','raleigh','miami',
  'virginia+beach','long+beach','minneapolis','tampa','tulsa','arlington',
  'new+orleans','wichita','cleveland','bakersfield','aurora','anaheim',
  'honolulu','santa+ana','corpus+christi','riverside','lexington',
  'st+louis','pittsburgh','anchorage','stockton','cincinnati','st+paul',
  'toledo','greensboro','newark','plano','henderson','lincoln','buffalo',
  'fort+wayne','jersey+city','chula+vista','orlando','st+petersburg',
  'norfolk','chandler','laredo','madison','durham','lubbock','winston-salem',
  'garland','glendale','hialeah','reno','baton+rouge','irvine','chesapeake',
  'scottsdale','north+las+vegas','fremont','gilbert','san+bernardino',
];

function peRandCity() { return USA_CITIES[Math.floor(Math.random() * USA_CITIES.length)]; }

// ── Random generate ──────────────────────────────────────────────
$('btnPeRandGenerate')?.addEventListener('click', () => {
  if (!peUser) { showToast('save ProxyEmpire credentials first'); return; }
  const count = Math.max(1, Math.min(50, parseInt($('peRandCount')?.value) || 1));
  peGenerateWorking(
    () => {
      const city = peRandCity();
      const opts = { country: 'us', region: '', city, isp: '' };
      return peBuildEntryWith(opts, peMakeSid(), peRandType, peRandHost, peActiveProto, '5000');
    },
    count,
    'random USA ' + peRandType
  );
});

// ── City mode wiring ─────────────────────────────────────────────
let peCityType  = 'mobile', peCityHost = 'v2.proxyempire.io';
let peCityProto = 'http';

document.querySelectorAll('#peCityTypeGroup .pe-type-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#peCityTypeGroup .pe-type-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    peCityType = this.dataset.ctype;
    peCityHost = this.dataset.chost;
  });
});

document.querySelectorAll('#peCityProtoGroup .pe-type-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#peCityProtoGroup .pe-type-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    peCityProto = this.dataset.cproto;
  });
});

if ($('btnPeCityGenerate')) {
  $('btnPeCityGenerate').addEventListener('click', function() {
    if (!peUser) { showToast('save ProxyEmpire credentials first'); return; }
    const citySelEl = $('peCitySelect');
    const cityVal    = citySelEl?.value || 'new+york';
    const cityLabel  = citySelEl?.options[citySelEl.selectedIndex]?.text || cityVal;
    const count   = Math.max(1, Math.min(50, parseInt($('peCityCount')?.value) || 1));
    const port    = $('peCityPort')?.value || '5000';
    peGenerateWorking(
      function() {
        const opts = { country: 'us', region: '', city: cityVal, isp: '' };
        return peBuildEntryWith(opts, peMakeSid(), peCityType, peCityHost, peCityProto, port);
      },
      count,
      cityLabel + ' ' + peCityType
    );
  });
}

// ── Init ─────────────────────────────────────────────────────────
pePopulateCountries();
peSwitchMode('random');
const _saved = peLoadCreds();
if (_saved) {
  peUser = { username: _saved.u, password: _saved.p };
  if ($('peUsername')) $('peUsername').value = _saved.u;
  if ($('pePassword')) $('pePassword').value = _saved.p;
  const badge = $('peSavedBadge'), label = $('peSavedLabel');
  if (badge) badge.style.display = 'flex';
  if (label) label.textContent = _saved.u;
  dbg('PE creds restored: ' + _saved.u, 'debug-ok');
}

})();
