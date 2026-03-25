/**
 * telegram.js — ACC account management and Telegram copy tab
 *
 * ACCs are created by sending a proxy from the Proxy tab ("→ TG").
 * Numbers are assigned from the Number tab ("→ TG" on a number).
 * Each ACC is numbered permanently — numbers never reassign on delete.
 * Deleted ACCs go to archive. Persisted via localStorage.
 */
'use strict';

// ── State ────────────────────────────────────────────────────────
const TG_STORAGE_KEY  = 'imagescrub_tg_accs';
const TG_COUNTER_KEY  = 'imagescrub_tg_counter';
const TG_ARCHIVE_KEY  = 'imagescrub_tg_archive';
const STALE_HOURS     = 24;

let tgAccs    = [];   // active accounts
let tgArchive = [];   // archived accounts

// ── Persistence ──────────────────────────────────────────────────
function tgSave() {
  try {
    const accsJson    = JSON.stringify(tgAccs);
    const archiveJson = JSON.stringify(tgArchive);
    // Warn if approaching localStorage limit (~5MB)
    const totalBytes = (accsJson.length + archiveJson.length) * 2; // UTF-16 estimate
    if (totalBytes > 3 * 1024 * 1024) {
      console.warn('[accounts] localStorage usage high (' + Math.round(totalBytes/1024) + 'KB) — consider clearing archive');
      showToast('Storage nearly full — clear archive to free space', 5000);
    }
    localStorage.setItem(TG_STORAGE_KEY,  accsJson);
    localStorage.setItem(TG_ARCHIVE_KEY,  archiveJson);
  } catch(e) {
    console.warn('[accounts] save failed:', e.message);
    if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
      showToast('Storage full — clear archive to continue saving', 6000);
    }
  }
}

function tgLoad() {
  try {
    const accs    = localStorage.getItem(TG_STORAGE_KEY);
    const archive = localStorage.getItem(TG_ARCHIVE_KEY);
    // Remove legacy ever-incrementing counter — numbering now position-based
    try { localStorage.removeItem(TG_COUNTER_KEY); } catch(e) {}
    if (accs)    tgAccs    = JSON.parse(accs);
    if (archive) tgArchive = JSON.parse(archive);
    // accNums renumbered after load (tgRenumber called below)
  } catch(e) { console.warn('[accounts] load failed:', e.message); }
}

// ── ACC creation ─────────────────────────────────────────────────
// ── Renumber all ACCs by position ────────────────────────────────
function tgRenumber() {
  tgAccs.forEach(function(a, i) { a.accNum = i + 1; });
}

function tgCreateAcc(proxyEntry) {
  const accNum = tgAccs.length + 1;
  const acc = {
    accNum:    accNum,
    id:        'acc_' + accNum + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now(),
    lastUsed:  null,
    status:    'active',   // active | warming | dead
    notes:     '',
    // proxy data
    city:      proxyEntry.geoCity    || '',
    region:    proxyEntry.geoRegion  || '',
    country:   proxyEntry.geoCountry || '',
    ip:        proxyEntry.exitIp     || '',
    username:  proxyEntry.username   || '',
    lat:       proxyEntry.geoLat     != null ? proxyEntry.geoLat  : null,
    lng:       proxyEntry.geoLng     != null ? proxyEntry.geoLng  : null,
    proxyAge:  Date.now(),
    latencyMs: proxyEntry.latencyMs  || null,
    proxyHost: proxyEntry.host       || 'v2.proxyempire.io',
    proxyPort: proxyEntry.port       || '5000',
    proxyProto: proxyEntry.proto     || 'http',
    // number data (assigned later)
    phone:     '',
    numStatus: 'pending',  // pending | verified | burned
    carrier:   proxyEntry.geoIsp || '',
  };
  tgAccs.unshift(acc);  // newest first
  tgSave();
  return acc;
}

// ── Status cycle ─────────────────────────────────────────────────
const STATUS_CYCLE = ['active', 'warming', 'dead'];
function tgNextStatus(current) {
  const i = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}
function tgStatusClass(status) {
  return status === 'active' ? 'tg-dot-active'
       : status === 'warming' ? 'tg-dot-warming'
       : 'tg-dot-dead';
}
function tgStatusLabel(status) {
  return status === 'active' ? 'ACTIVE'
       : status === 'warming' ? 'WARMING'
       : 'DEAD';
}

// ── Num status cycle ─────────────────────────────────────────────
const NUM_STATUS_CYCLE = ['pending', 'verified', 'burned'];
function tgNextNumStatus(current) {
  const i = NUM_STATUS_CYCLE.indexOf(current);
  return NUM_STATUS_CYCLE[(i + 1) % NUM_STATUS_CYCLE.length];
}
function tgNumStatusClass(s) {
  return s === 'verified' ? 'tg-num-verified'
       : s === 'burned'   ? 'tg-num-burned'
       : 'tg-num-pending';
}

// ── Stale check ──────────────────────────────────────────────────
function tgIsStale(acc) {
  if (!acc.proxyAge) return false;
  return (Date.now() - acc.proxyAge) > STALE_HOURS * 3600 * 1000;
}

// ── Format helpers ───────────────────────────────────────────────
function tgFmtAge(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60)   return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24)   return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function tgLocationStr(acc) {
  return [acc.city, acc.region, acc.country].filter(Boolean).join(', ');
}

// ── Copy helper ──────────────────────────────────────────────────
function tgCopy(text, label) {
  navigator.clipboard.writeText(text)
    .then(() => showToast(label ? label + ' copied' : 'copied'))
    .catch(() => showToast(text, 4000));
}

// ── Card HTML ────────────────────────────────────────────────────
function tgAccCardHtml(acc) {
  const loc     = tgLocationStr(acc);
  const stale   = tgIsStale(acc);
  const age     = tgFmtAge(acc.createdAt);
  const lastU   = acc.lastUsed ? tgFmtAge(acc.lastUsed) : 'never';
  const latStr  = acc.lat != null ? acc.lat.toFixed(6) : '';
  const lngStr  = acc.lng != null ? acc.lng.toFixed(6) : '';

  // copy-all assembles all fields
  // Newlines encoded as sentinel — HTML attributes strip raw newlines
  const copyAll = [
    'ACC ' + acc.accNum,
    loc,
    acc.ip,
    acc.username,
    latStr,
    lngStr,
    acc.phone,
  ].filter(Boolean).join('\n'); // will be encoded for HTML attr below

  function row(label, val, extraClass) {
    if (!val) return '';
    return '<div class="tg-row">' +
      '<span class="tg-row-label">' + esc(label) + '</span>' +
      '<span class="tg-row-val' + (extraClass ? ' ' + extraClass : '') + '">' + esc(val) + '</span>' +
      '<button class="btn btn-sm tg-copy-btn" data-val="' + esc(val) + '" data-label="' + esc(label) + '">copy</button>' +
    '</div>';
  }

  return '<div class="tg-card" id="tgcard_' + acc.id + '" data-id="' + acc.id + '">' +

    // Header
    '<div class="tg-card-hdr">' +
      '<button class="tg-status-btn" data-id="' + acc.id + '" title="click to cycle status">' +
        '<span class="tg-dot ' + tgStatusClass(acc.status) + '"></span>' +
        '<span class="tg-status-lbl">' + tgStatusLabel(acc.status) + '</span>' +
      '</button>' +
      '<span class="tg-acc-num">ACC ' + acc.accNum + '</span>' +
      (stale ? '<span class="tg-stale-badge">STALE</span>' : '') +
      '<span class="tg-age">' + esc(age) + '</span>' +
      '<button class="btn btn-sm tg-copy-all-btn" data-id="' + acc.id + '" data-val="' + esc(copyAll.replace(/\n/g, '\\n')) + '">copy all</button>' +
      '<button class="btn btn-sm tg-retest-btn" data-id="' + acc.id + '" title="re-test proxy IP">re-test</button>' +
      '<button class="btn btn-sm tg-archive-btn" data-id="' + acc.id + '" title="archive">archive</button>' +
    '</div>' +

    // Rows
    '<div class="tg-rows">' +
      // LOCATION + IP: shown as separate rows but single copy button
      (loc || acc.ip ? (
        '<div class="tg-row">' +
          '<span class="tg-row-label">LOCATION</span>' +
          '<div class="tg-locip-vals">' +
            (loc ? '<span class="tg-row-val">' + esc(loc) + '</span>' : '') +
            (acc.ip ? '<span class="tg-row-val tg-val-ip">' + esc(acc.ip) + '</span>' : '') +
          '</div>' +
          '<button class="btn btn-sm tg-copy-btn" data-val="' + esc([loc, acc.ip].filter(Boolean).join('\n').replace(/\n/g, '\\n')) + '" data-label="location + IP" data-multiline="1">copy</button>' +
        '</div>'
      ) : '') +
      '<div class="tg-section-div"></div>' +
      row('PROXY', acc.username, 'tg-val-auth') +
      '<div class="tg-section-div"></div>' +
      row('LATITUDE',  latStr, 'tg-val-coord') +
      row('LONGITUDE', lngStr, 'tg-val-coord') +
      '<div class="tg-section-div"></div>' +
      // Phone row with status toggle
      '<div class="tg-row tg-phone-row">' +
        '<span class="tg-row-label">PHONE</span>' +
        (acc.phone
          ? '<span class="tg-row-val">' + esc(acc.phone) + '</span>' +
            '<button class="tg-num-status-btn ' + tgNumStatusClass(acc.numStatus) + '" data-id="' + acc.id + '">' + esc(acc.numStatus) + '</button>' +
            '<button class="btn btn-sm tg-copy-btn" data-val="' + esc(acc.phone) + '" data-label="phone">copy</button>'
          : '<span class="tg-row-val tg-no-phone">— assign from Numbers tab</span>'
        ) +
      '</div>' +
      '<div class="tg-section-div"></div>' +
      // Image bundles
      (function() {
        let bundleHtml = '';
        try {
          if (typeof hub !== 'undefined') {
            const bundles = hub.store.get('bundles:' + acc.id, []);
            if (bundles.length) {
              bundleHtml = '<div class="tg-row"><span class="tg-row-label">IMAGES</span><span class="tg-row-val">' + bundles.length + ' bundle' + (bundles.length !== 1 ? 's' : '') + ' (' + bundles.reduce(function(s,b){return s+b.items.length;},0) + ' images)</span></div><div class="tg-section-div"></div>';
            }
          }
        } catch(e) {}
        return bundleHtml;
      })() +
      // Notes
      '<div class="tg-notes-row">' +
        '<span class="tg-row-label">NOTES</span>' +
        '<input class="tg-notes-input" data-id="' + acc.id + '" type="text" placeholder="e.g. fresh, banned, warming..." value="' + esc(acc.notes) + '" spellcheck="false">' +
      '</div>' +
      // Meta
      '<div class="tg-meta-row">' +
        '<span class="tg-meta">created ' + esc(age) + '</span>' +
        '<span class="tg-meta">last used: ' + esc(lastU) + '</span>' +
        (acc.latencyMs ? '<span class="tg-meta">' + acc.latencyMs + 'ms</span>' : '') +
        (acc.carrier   ? '<span class="tg-meta">' + esc(acc.carrier) + '</span>' : '') +
      '</div>' +
    '</div>' +

  '</div>';
}

// ── Render active list ───────────────────────────────────────────
function tgRenderAll() {
  const list = $('tgAccList');
  if (!list) return;
  if (!tgAccs.length) {
    list.innerHTML = '<div class="tg-empty">No accounts yet — send a proxy here from the Proxies tab.</div>';
    return;
  }
  list.innerHTML = tgAccs.map(tgAccCardHtml).join('');
  tgUpdateCount();
  tgWireDrag(list);
}

// ── Drag to reorder (visual only — ACC numbers stay fixed) ────────
var _dragSrcId = null;
function tgWireDrag(list) {
  list.querySelectorAll('.tg-card').forEach(function(card) {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', function(e) {
      _dragSrcId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('tg-dragging');
    });
    card.addEventListener('dragend', function() {
      card.classList.remove('tg-dragging');
      list.querySelectorAll('.tg-card').forEach(function(c) { c.classList.remove('tg-drag-over'); });
    });
    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.tg-card').forEach(function(c) { c.classList.remove('tg-drag-over'); });
      card.classList.add('tg-drag-over');
    });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      if (!_dragSrcId || _dragSrcId === card.dataset.id) return;
      var srcIdx = tgAccs.findIndex(function(a) { return a.id === _dragSrcId; });
      var dstIdx = tgAccs.findIndex(function(a) { return a.id === card.dataset.id; });
      if (srcIdx === -1 || dstIdx === -1) return;
      var moved = tgAccs.splice(srcIdx, 1)[0];
      tgAccs.splice(dstIdx, 0, moved);
      tgRenumber();
      tgSave();
      tgRenderAll();
    });
  });
}

function tgUpdateCount() {
  const el = $('tgAccCount');
  if (el) el.textContent = tgAccs.length + ' account' + (tgAccs.length !== 1 ? 's' : '');
}

// ── Render archive ───────────────────────────────────────────────
function tgRenderArchive() {
  const list = $('tgArchiveList');
  if (!list) return;
  if (!tgArchive.length) {
    list.innerHTML = '<div class="tg-empty">No archived accounts.</div>';
    return;
  }
  list.innerHTML = '';
  tgArchive.forEach(acc => {
    const loc     = tgLocationStr(acc);
    const stale   = tgIsStale(acc);
    const latStr  = acc.lat != null ? acc.lat.toFixed(6) : '';
    const lngStr  = acc.lng != null ? acc.lng.toFixed(6) : '';
    const expanded = !!acc._archExpanded;

    const card = document.createElement('div');
    card.className = 'tg-archive-card';
    card.dataset.id = acc.id;

    // ── Header row (always visible) ──────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'tg-archive-card-hdr';
    hdr.innerHTML =
      '<button class="tg-archive-expand-btn" data-id="' + acc.id + '" title="expand">' + (expanded ? '▾' : '▸') + '</button>' +
      '<span class="tg-acc-num">ACC ' + acc.accNum + '</span>' +
      (stale ? '<span class="tg-stale-badge">STALE</span>' : '') +
      '<span class="tg-archive-loc">' + esc(loc || '—') + '</span>' +
      '<span class="tg-age">' + tgFmtAge(acc.createdAt) + '</span>' +
      '<button class="btn btn-sm tg-restore-btn" data-id="' + acc.id + '">restore</button>' +
      '<button class="btn btn-sm tg-permdelete-btn" data-id="' + acc.id + '" style="color:var(--err);border-color:rgba(220,50,50,.3)">delete</button>';

    // ── Detail body (expandable) ─────────────────────────────────
    const body = document.createElement('div');
    body.className = 'tg-archive-body';
    body.style.display = expanded ? 'block' : 'none';

    function archRow(label, val, cls) {
      if (!val) return '';
      return '<div class="tg-row">' +
        '<span class="tg-row-label">' + esc(label) + '</span>' +
        '<span class="tg-row-val' + (cls ? ' ' + cls : '') + '">' + esc(val) + '</span>' +
        '<button class="btn btn-sm tg-copy-btn" data-val="' + esc(val) + '" data-label="' + esc(label) + '">copy</button>' +
      '</div>';
    }

    body.innerHTML =
      archRow('PROXY',     acc.username, 'tg-val-auth') +
      archRow('IP',        acc.ip) +
      archRow('LOCATION',  loc) +
      archRow('LATITUDE',  latStr, 'tg-val-coord') +
      archRow('LONGITUDE', lngStr, 'tg-val-coord') +
      archRow('PHONE',     acc.phone) +
      archRow('NOTES',     acc.notes) +
      (acc.latencyMs ? '<div class="tg-meta-row"><span class="tg-meta">' + acc.latencyMs + 'ms</span>' + (acc.carrier ? '<span class="tg-meta">' + esc(acc.carrier) + '</span>' : '') + '</div>' : '') +
      '<div class="tg-meta-row"><span class="tg-meta">created ' + tgFmtAge(acc.createdAt) + '</span><span class="tg-meta">status: ' + esc(acc.status || 'active') + '</span></div>';

    card.appendChild(hdr);
    card.appendChild(body);
    list.appendChild(card);
  });
}

// ── ACC number phone assignment modal ────────────────────────────
// Called from numbers.js when user hits "→ TG" on a number
window.tgAssignNumber = function(formattedNumber, preselectedAccId) {
  if (!tgAccs.length) { showToast('no ACC slots — send a proxy to Accounts first'); return; }

  // Build a simple modal overlay
  const existing = document.getElementById('tgNumModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'tgNumModal';
  modal.className = 'tg-modal-overlay';

  const accOptions = tgAccs.map(a =>
    '<option value="' + a.id + '"' + (a.id === preselectedAccId ? ' selected' : '') + '>ACC ' + a.accNum + (tgLocationStr(a) ? ' — ' + tgLocationStr(a) : '') + (a.phone ? ' [has number]' : '') + '</option>'
  ).join('');

  modal.innerHTML =
    '<div class="tg-modal">' +
      '<div class="tg-modal-hdr">Assign number to account</div>' +
      '<div class="tg-modal-num">' + esc(formattedNumber) + '</div>' +
      '<select class="tg-modal-select" id="tgNumModalSelect">' + accOptions + '</select>' +
      '<div class="tg-modal-btns">' +
        '<button class="btn btn-go" id="tgNumModalConfirm">assign</button>' +
        '<button class="btn" id="tgNumModalCancel">cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);

  document.getElementById('tgNumModalConfirm').onclick = () => {
    const selId = document.getElementById('tgNumModalSelect').value;
    const acc   = tgAccs.find(a => a.id === selId);
    if (acc) {
      acc.phone     = formattedNumber;
      acc.numStatus = 'pending';
      tgSave();
      tgRenderAll();
      showToast('number assigned to ACC ' + acc.accNum);
      dbg('Accounts: number assigned to ACC ' + acc.accNum, 'debug-ok');
    }
    modal.remove();
  };
  document.getElementById('tgNumModalCancel').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

// ── Re-test proxy ────────────────────────────────────────────────
async function tgRetestProxy(acc) {
  if (!acc.username) { showToast('no proxy data on this ACC'); return; }
  // Reconstruct proxy URL from username + known defaults
  // Get password from saved creds — warn if missing
  let retestPass = '';
  try { retestPass = JSON.parse(localStorage.getItem('pe_creds') || '{}').p || ''; } catch {}
  if (!retestPass) { showToast('save ProxyEmpire credentials first'); return; }
  const retestHost  = acc.proxyHost  || 'v2.proxyempire.io';
  const retestPort  = acc.proxyPort  || '5000';
  const retestProto = acc.proxyProto || 'http';
  const proxyUrl = retestProto + '://' + encodeURIComponent(acc.username) + ':' + encodeURIComponent(retestPass) + '@' + retestHost + ':' + retestPort;

  showToast('re-testing ACC ' + acc.accNum + '...');
  dbg('TG retest ACC ' + acc.accNum, '');

  try {
    const r = await fetch('/api/pe/resolve-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxyUrl }),
    });
    const d = await r.json();
    if (r.ok && d.ip) {
      acc.ip        = d.ip;
      acc.latencyMs = d.ms || null;
      acc.proxyAge  = Date.now();
      if (d.city)      acc.city    = d.city;
      if (d.region)    acc.region  = d.region;
      if (d.country)   acc.country = d.country;
      if (d.latitude  != null) acc.lat = parseFloat(d.latitude);
      if (d.longitude != null) acc.lng = parseFloat(d.longitude);
      if (d.isp)       acc.carrier = d.isp;
      tgSave();
      tgRenderAll();
      showToast('ACC ' + acc.accNum + ' re-tested: ' + d.ip);
      dbg('TG retest ACC ' + acc.accNum + ': ' + d.ip + ' (' + d.ms + 'ms)', 'debug-ok');
    } else {
      showToast('re-test failed: ' + (d.error || 'unknown'), 4000);
      dbg('TG retest ACC ' + acc.accNum + ' failed: ' + (d.error || '?'), 'debug-err');
    }
  } catch(e) {
    showToast('re-test error: ' + e.message, 4000);
    dbg('TG retest error: ' + e.message, 'debug-err');
  }
}

// ── Event delegation ─────────────────────────────────────────────
document.addEventListener('click', e => {

  // Expand/collapse archived ACC detail
  const archExpandBtn = e.target.closest('.tg-archive-expand-btn');
  if (archExpandBtn) {
    const acc = tgArchive.find(a => a.id === archExpandBtn.dataset.id);
    if (acc) {
      acc._archExpanded = !acc._archExpanded;
      tgRenderArchive();
    }
    return;
  }

  // Copy individual field
  const copyBtn = e.target.closest('.tg-copy-btn');
  if (copyBtn) {
    // Decode \n sentinels (used for multiline values like location+IP)
    const raw   = copyBtn.dataset.val || '';
    const val   = copyBtn.dataset.multiline ? raw.replace(/\\n/g, '\n') : raw;
    const label = copyBtn.dataset.label;
    if (val) {
      const card = copyBtn.closest('[data-id]');
      const acc  = card ? tgAccs.find(a => a.id === card.dataset.id) : null;
      if (acc) { acc.lastUsed = Date.now(); tgSave(); tgRenderAll(); }
      tgCopy(val, label);
    }
    return;
  }

  // Copy all
  const copyAll = e.target.closest('.tg-copy-all-btn');
  if (copyAll) {
    // Decode \n sentinels back to real newlines
    const val = (copyAll.dataset.val || '').replace(/\\n/g, '\n');
    const acc = tgAccs.find(a => a.id === copyAll.dataset.id);
    if (acc) { acc.lastUsed = Date.now(); tgSave(); tgRenderAll(); }
    if (val) tgCopy(val, 'ACC ' + (acc ? acc.accNum : ''));
    return;
  }

  // Status cycle
  const statusBtn = e.target.closest('.tg-status-btn');
  if (statusBtn) {
    const acc = tgAccs.find(a => a.id === statusBtn.dataset.id);
    if (acc) { acc.status = tgNextStatus(acc.status); tgSave(); tgRenderAll(); }
    return;
  }

  // Num status cycle
  const numStatusBtn = e.target.closest('.tg-num-status-btn');
  if (numStatusBtn) {
    const acc = tgAccs.find(a => a.id === numStatusBtn.dataset.id);
    if (acc) { acc.numStatus = tgNextNumStatus(acc.numStatus); tgSave(); tgRenderAll(); }
    return;
  }

  // Archive
  const archiveBtn = e.target.closest('.tg-archive-btn');
  if (archiveBtn) {
    const idx = tgAccs.findIndex(a => a.id === archiveBtn.dataset.id);
    if (idx !== -1) {
      tgArchive.unshift(tgAccs.splice(idx, 1)[0]);
      tgSave(); tgRenderAll(); tgRenderArchive();
      showToast('ACC archived');
    }
    return;
  }

  // Restore from archive
  const restoreBtn = e.target.closest('.tg-restore-btn');
  if (restoreBtn) {
    const idx = tgArchive.findIndex(a => a.id === restoreBtn.dataset.id);
    if (idx !== -1) {
      tgAccs.unshift(tgArchive.splice(idx, 1)[0]);
      tgRenumber();
      tgSave(); tgRenderAll(); tgRenderArchive();
      showToast('ACC restored');
    }
    return;
  }

  // Permanent delete from archive
  const permBtn = e.target.closest('.tg-permdelete-btn');
  if (permBtn) {
    tgArchive = tgArchive.filter(a => a.id !== permBtn.dataset.id);
    tgSave(); tgRenderArchive();
    showToast('deleted');
    return;
  }

  // Re-test proxy
  const retestBtn = e.target.closest('.tg-retest-btn');
  if (retestBtn) {
    const acc = tgAccs.find(a => a.id === retestBtn.dataset.id);
    if (acc) tgRetestProxy(acc);
    return;
  }

  // Archive toggle
  const archToggle = e.target.closest('#tgArchiveToggle');
  if (archToggle) {
    const panel = $('tgArchivePanel');
    if (panel) {
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      archToggle.textContent = open ? 'show archive' : 'hide archive';
      if (!open) tgRenderArchive();
    }
    return;
  }
});

// Notes input — debounced save (don't write localStorage on every keystroke)
let _notesTimer = null;
document.addEventListener('input', e => {
  const inp = e.target.closest('.tg-notes-input');
  if (inp) {
    const acc = tgAccs.find(a => a.id === inp.dataset.id);
    if (acc) {
      acc.notes = inp.value;
      clearTimeout(_notesTimer);
      _notesTimer = setTimeout(function() { tgSave(); }, 600);
    }
  }
});

// ── Export ACCs as .txt ───────────────────────────────────────────
function tgFormatAcc(acc) {
  const loc = tgLocationStr(acc);
  const lat  = acc.lat  != null ? acc.lat.toFixed(6)  : '';
  const lng  = acc.lng  != null ? acc.lng.toFixed(6)  : '';
  const age  = tgFmtAge(acc.createdAt);
  const lines = [
    'ACC ' + acc.accNum + ' — ' + (acc.status || 'active').toUpperCase(),
  ];
  if (loc)          lines.push('Location:  ' + loc);
  if (acc.ip)       lines.push('IP:        ' + acc.ip);
  if (lat && lng)   lines.push('Latitude:  ' + lat);
  if (lat && lng)   lines.push('Longitude: ' + lng);
  if (acc.username) lines.push('Proxy:     ' + acc.username);
  if (acc.carrier)  lines.push('ISP:       ' + acc.carrier);
  if (acc.latencyMs)lines.push('Latency:   ' + acc.latencyMs + 'ms');
  if (acc.phone)    lines.push('Phone:     ' + acc.phone + ' [' + (acc.numStatus || 'pending') + ']');
  if (acc.notes)    lines.push('Notes:     ' + acc.notes);
  lines.push('Created:   ' + age);
  return lines.join('\n');
}

if ($('btnTgExport')) {
  $('btnTgExport').addEventListener('click', function() {
    if (!tgAccs.length) { showToast('no accounts to export'); return; }
    const sections = tgAccs.map(tgFormatAcc);
    const text = sections.join('\n' + '─'.repeat(40) + '\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain' });
    dl(blob, 'accounts_' + new Date().toISOString().slice(0,10) + '.txt');
    showToast(tgAccs.length + ' accounts exported');
    dbg('Accounts: exported ' + tgAccs.length + ' ACCs as .txt', 'debug-ok');
  });
}

// ── Expose globals needed by proxyempire.js ──────────────────────
window.tgCreateAcc = tgCreateAcc;
window.tgRenderAll = tgRenderAll;
// tgAssignNumber already on window (set above)

// ── Stale timer — refresh every 30 min so badge appears without interaction ──
setInterval(function() { tgRenderAll(); }, 30 * 60 * 1000);

// ── Init ─────────────────────────────────────────────────────────
try {
  tgLoad(); tgRenumber();
  tgRenderAll();
  tgRenderArchive();
  dbg('Accounts: loaded ' + tgAccs.length + ' ACCs (archive: ' + tgArchive.length + ')', 'debug-ok');
} catch(e) { console.error('[accounts] init failed:', e); dbg('Accounts init error: ' + e.message, 'debug-err'); }

// ── Hub subscriptions — decoupled integration ─────────────────────
try {
  if (typeof hub !== 'undefined') {
    // Number attached from Numbers tab
    hub.sub('number:attach', function(data) {
      try {
        if (data.accId) {
          const acc = tgAccs.find(function(a) { return a.id === data.accId; });
          if (acc && !acc.phone) {
            acc.phone = data.number;
            acc.numStatus = 'pending';
            tgSave();
            tgRenderAll();
            dbg('Accounts: number ' + data.number + ' received via hub → ACC ' + acc.accNum, 'debug-ok');
          }
        }
      } catch(e) { console.warn('[accounts] hub number:attach error:', e.message); }
    });
    // Bundle attached from Ready tab — refresh cards to show bundle count
    hub.sub('bundle:attached', function(data) {
      try { tgRenderAll(); } catch(e) {}
    });
    // Publish accounts:ready so other tabs know accounts are loaded
    hub.pub('accounts:ready', { count: tgAccs.length });
  }
} catch(e) { console.warn('[accounts] hub setup failed:', e.message); }
