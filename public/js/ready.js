/**
 * ready.js — Ready Pictures tab
 *
 * Cleaned images land here in named groups (sorted by filename).
 * 6 thumbnails per row always. Click to select, drag to Accounts.
 * Groups persist for the session — no localStorage (binary blobs
 * can't be serialised). Individual remove buttons + group delete.
 */
'use strict';

// ── State ────────────────────────────────────────────────────────
// rdyGroups: [{ id, name, items: [{ id, blob, filename, url }] }]
let rdyGroups   = [];
let rdySelected = new Set(); // item ids
let rdyGrpId    = 0;
let rdyItemId   = 0;

// ── Name extraction ──────────────────────────────────────────────
// Priority: split on __ (Instagram format: username__timestamp_id)
// Fallback: split on first number sequence (DSC_0042 → DSC, beach_001 → beach)
function rdyExtractPrefix(filename) {
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  // Instagram: username__timestamp → username
  if (base.includes('__')) return base.split('__')[0];
  // Camera sequential: split on first digit block
  const m = base.match(/^(.*?)[-_]?\d+$/);
  if (m && m[1]) return m[1].replace(/[-_]+$/, '');
  return base;
}

// ── Add a batch of cleaned results ───────────────────────────────
// Called from cleaner.js after cleaning completes.
// Groups by filename prefix — 100 pics from 10 shoots = 10 collapsed groups.
window.rdyAddBatch = function(results) {
  if (!results || !results.length) return;

  // Sort by filename
  const sorted = results.slice().sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

  // Bucket by prefix — each unique prefix becomes a group
  const buckets = new Map();
  sorted.forEach(function(r) {
    const key = rdyExtractPrefix(r.filename);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  });

  // Create a group per bucket, prepend newest first
  const newGroups = [];
  buckets.forEach(function(items, name) {
    const groupItems = items.map(function(r) {
      const url = URL.createObjectURL(r.blob);
      return { id: 'ri_' + (++rdyItemId), blob: r.blob, filename: r.filename, url, selected: false };
    });
    newGroups.push({ id: 'rg_' + (++rdyGrpId), name: name, items: groupItems, collapsed: false });
  });
  // Newest batch first
  newGroups.reverse().forEach(function(g) { rdyGroups.unshift(g); });
  rdyRenderAll();

  // Switch to ready tab
  if (typeof switchTab === 'function') { switchTab('images'); if(typeof switchSubTab==='function')switchSubTab('ready'); }
  const firstGroupName = newGroups.length ? newGroups[0].name : '';
  const groupSuffix = newGroups.length > 1 ? ' (' + newGroups.length + ' groups)' : (firstGroupName ? ' in "' + firstGroupName + '"' : '');
  showToast(results.length + ' images ready' + groupSuffix);
  dbg('Ready: ' + results.length + ' images, ' + newGroups.length + ' group(s)', 'debug-ok');
};

// ── Selection ────────────────────────────────────────────────────
function rdyToggleItem(itemId) {
  if (rdySelected.has(itemId)) rdySelected.delete(itemId);
  else rdySelected.add(itemId);
  rdyUpdateItemEl(itemId);
  rdyUpdateSelBar();
}

function rdySelectGroup(groupId) {
  const g = rdyGroups.find(g => g.id === groupId);
  if (!g) return;
  const allSel = g.items.every(it => rdySelected.has(it.id));
  g.items.forEach(it => {
    if (allSel) rdySelected.delete(it.id);
    else rdySelected.add(it.id);
    rdyUpdateItemEl(it.id);
  });
  rdyUpdateSelBar();
}

function rdyUpdateItemEl(itemId) {
  const el = document.getElementById('rdyitem_' + itemId);
  const item = rdyFindItem(itemId);
  if (el && item) el.classList.toggle('rdy-selected', rdySelected.has(itemId));
}

function rdyFindItem(itemId) {
  for (const g of rdyGroups) {
    const it = g.items.find(i => i.id === itemId);
    if (it) return it;
  }
  return null;
}

function rdyUpdateSelBar() {
  const n   = rdySelected.size;
  const bar = $('rdySelBar');
  const txt = $('rdySelCount');
  if (bar) bar.style.display = n ? 'flex' : 'none';
  if (txt) txt.textContent   = n + ' selected';
}

// ── Remove ───────────────────────────────────────────────────────
function rdyRemoveItem(itemId) {
  for (let gi = 0; gi < rdyGroups.length; gi++) {
    const g   = rdyGroups[gi];
    const idx = g.items.findIndex(i => i.id === itemId);
    if (idx === -1) continue;
    URL.revokeObjectURL(g.items[idx].url);
    g.items.splice(idx, 1);
    rdySelected.delete(itemId);
    if (g.items.length === 0) rdyGroups.splice(gi, 1);
    break;
  }
  rdyRenderAll();
  rdyUpdateSelBar();
}

function rdyRemoveGroup(groupId) {
  const idx = rdyGroups.findIndex(g => g.id === groupId);
  if (idx === -1) return;
  rdyGroups[idx].items.forEach(it => {
    URL.revokeObjectURL(it.url);
    rdySelected.delete(it.id);
  });
  rdyGroups.splice(idx, 1);
  rdyRenderAll();
  rdyUpdateSelBar();
}

function rdyRemoveSelected() {
  const ids = Array.from(rdySelected);
  ids.forEach(id => rdySelected.delete(id));
  for (const g of rdyGroups) {
    g.items = g.items.filter(it => {
      if (ids.includes(it.id)) { URL.revokeObjectURL(it.url); return false; }
      return true;
    });
  }
  rdyGroups = rdyGroups.filter(g => g.items.length > 0);
  rdyRenderAll();
  rdyUpdateSelBar();
}

// ── Drag support ─────────────────────────────────────────────────
// Dragging a selected item drags ALL selected items.
// Each item sets its blob as a File on the dataTransfer so the
// Desktop receives it as an image file.
function rdySetupDrag(el, itemId) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', function(e) {
    // If not selected, select only this item — but DO NOT re-render (kills drag)
    if (!rdySelected.has(itemId)) {
      rdySelected.clear();
      rdySelected.add(itemId);
      // Update visual without full re-render
      document.querySelectorAll('.rdy-cell').forEach(function(c) {
        const cid = c.id.replace('rdyitem_', '');
        c.classList.toggle('rdy-selected', rdySelected.has(cid));
      });
      rdyUpdateSelBar();
    }

    // Collect all selected items
    const selItems = Array.from(rdySelected).map(rdyFindItem).filter(Boolean);
    // Always include the dragged item even if selection update was async
    if (!selItems.find(function(it) { return it.id === itemId; })) {
      const me = rdyFindItem(itemId);
      if (me) selItems.unshift(me);
    }

    // Add each as a File to dataTransfer — the drag target accepts these
    if (e.dataTransfer.items && selItems.length) {
      selItems.forEach(function(it) {
        try {
          const file = new File([it.blob], it.filename, { type: it.blob.type || 'image/jpeg' });
          e.dataTransfer.items.add(file);
        } catch(err) {}
      });
    }

    e.dataTransfer.effectAllowed = 'copy';
    el.classList.add('rdy-dragging');
    dbg('Drag: ' + selItems.length + ' image(s)', '');
  });

  el.addEventListener('dragend', function() {
    el.classList.remove('rdy-dragging');
  });
}

// ── Render ───────────────────────────────────────────────────────
function rdyRenderAll() {
  const container = $('rdyContainer');
  if (!container) return;

  if (!rdyGroups.length) {
    container.innerHTML = '<div class="rdy-empty">No cleaned images yet — clean images in the Cleaner tab and they will appear here.</div>';
    rdyUpdateCount();
    return;
  }

  container.innerHTML = '';

  rdyGroups.forEach(function(group) {
    const groupEl = document.createElement('div');
    groupEl.className = 'rdy-group';
    groupEl.id = 'rdygrp_' + group.id;

    // Group header — click to collapse/expand
    const collapsed = !!group.collapsed;
    const hdr = document.createElement('div');
    hdr.className = 'rdy-group-hdr';
    hdr.innerHTML =
      '<button class="rdy-collapse-btn" data-gid="' + group.id + '" title="collapse/expand">' + (collapsed ? '▸' : '▾') + '</button>' +
      '<span class="rdy-group-name">' + esc(group.name) + '</span>' +
      '<span class="rdy-group-count">' + group.items.length + ' image' + (group.items.length !== 1 ? 's' : '') + '</span>' +
      '<button class="btn btn-sm rdy-sel-group-btn" data-gid="' + group.id + '">select all</button>' +
      '<button class="btn btn-sm rdy-del-group-btn" data-gid="' + group.id + '">delete group</button>';
    groupEl.appendChild(hdr);

    // Grid — always 6 per row via CSS grid, hidden when collapsed
    const grid = document.createElement('div');
    grid.className = 'rdy-grid';
    if (collapsed) grid.style.display = 'none';

    group.items.forEach(function(item) {
      const cell = document.createElement('div');
      cell.className = 'rdy-cell' + (rdySelected.has(item.id) ? ' rdy-selected' : '');
      cell.id = 'rdyitem_' + item.id;

      const img = document.createElement('img');
      img.src = item.url;
      img.className = 'rdy-thumb';
      img.alt = item.filename;
      // Make the IMG itself draggable — drag target accepts img drags,
      // not div drags. This matches what the cleaner tab does.
      img.setAttribute('draggable', 'true');
      img.style.cursor = 'grab';

      // Drag on the img element — same logic as cleaner tab
      img.addEventListener('dragstart', function(e) {
        // Select this item if not already selected (no re-render)
        if (!rdySelected.has(item.id)) {
          rdySelected.clear();
          rdySelected.add(item.id);
          document.querySelectorAll('.rdy-cell').forEach(function(cell2) {
            const cid = cell2.id.replace('rdyitem_', '');
            cell2.classList.toggle('rdy-selected', rdySelected.has(cid));
          });
          rdyUpdateSelBar();
        }
        // Collect selected items
        const selItems = Array.from(rdySelected).map(rdyFindItem).filter(Boolean);
        if (!selItems.find(function(it) { return it.id === item.id; })) {
          const me = rdyFindItem(item.id);
          if (me) selItems.unshift(me);
        }
        // Attach each as a File — drag target reads these from img drag
        if (e.dataTransfer.items && selItems.length) {
          selItems.forEach(function(it) {
            try {
              const file = new File([it.blob], it.filename, { type: it.blob.type || 'image/jpeg' });
              e.dataTransfer.items.add(file);
            } catch(err) {}
          });
        }
        e.dataTransfer.effectAllowed = 'copy';
        cell.classList.add('rdy-dragging');
        dbg('Ready drag: ' + selItems.length + ' image(s)', '');
      });
      img.addEventListener('dragend', function() {
        cell.classList.remove('rdy-dragging');
      });

      const nameEl = document.createElement('div');
      nameEl.className = 'rdy-cell-name';
      nameEl.textContent = item.filename;
      // Prevent name label from intercepting drag events on the img below it
      nameEl.style.pointerEvents = 'none';

      const rmBtn = document.createElement('button');
      rmBtn.className = 'rdy-rm-btn';
      rmBtn.textContent = '×';
      rmBtn.title = 'remove';
      rmBtn.dataset.iid = item.id;
      rmBtn.style.pointerEvents = 'auto';

      // → analyzer button per cell
      const azBtn = document.createElement('button');
      azBtn.className = 'rdy-az-btn';
      azBtn.textContent = '⊕';
      azBtn.title = 'send to analyzer';
      azBtn.style.pointerEvents = 'auto';
      azBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        (async function() {
          try {
            const ab = await item.blob.arrayBuffer();
            window.azFile1Buf  = ab;
            window.azFile1Name = item.filename;
            const n1 = document.getElementById('azName1');
            const t1 = document.getElementById('azThumb1');
            const rs = document.getElementById('azRunSingle');
            if (n1) n1.textContent = item.filename;
            if (t1) { t1.src = item.url; t1.style.display = 'block'; }
            if (rs) rs.disabled = false;
            if (typeof switchTab === 'function') switchTab('images');
            if (typeof switchSubTab === 'function') switchSubTab('analyzer');
            if (typeof showToast === 'function') showToast('loaded in analyzer — click analyze');
          } catch(e2) { if (typeof showToast === 'function') showToast('could not load into analyzer'); }
        })();
      });

      cell.appendChild(img);
      cell.appendChild(nameEl);
      cell.appendChild(azBtn);
      cell.appendChild(rmBtn);

      // Click = select/deselect (not on rmBtn)
      cell.addEventListener('click', function(e) {
        if (e.target.closest('.rdy-rm-btn')) return;
        rdyToggleItem(item.id);
      });

      grid.appendChild(cell);
    });

    groupEl.appendChild(grid);
    container.appendChild(groupEl);
  });

  rdyUpdateCount();
}

function rdyUpdateCount() {
  const total = rdyGroups.reduce((s, g) => s + g.items.length, 0);
  const el = $('rdyCount');
  if (el) el.textContent = total ? total + ' image' + (total !== 1 ? 's' : '') + ' in ' + rdyGroups.length + ' group' + (rdyGroups.length !== 1 ? 's' : '') : '';
}

// ── Event delegation ─────────────────────────────────────────────
document.addEventListener('click', function(e) {
  // Remove single item
  const rmBtn = e.target.closest('.rdy-rm-btn');
  if (rmBtn && rmBtn.dataset.iid) { rdyRemoveItem(rmBtn.dataset.iid); return; }

  // Collapse/expand group
  const colBtn = e.target.closest('.rdy-collapse-btn');
  if (colBtn && colBtn.dataset.gid) {
    const g = rdyGroups.find(function(g) { return g.id === colBtn.dataset.gid; });
    if (g) {
      g.collapsed = !g.collapsed;
      // Clear selection for items being hidden — avoids ghost selections in drag
      if (g.collapsed) {
        g.items.forEach(function(it) { rdySelected.delete(it.id); });
      }
      rdyRenderAll();
      rdyUpdateSelBar();
    }
    return;
  }
  // Delete group
  const delGrp = e.target.closest('.rdy-del-group-btn');
  if (delGrp && delGrp.dataset.gid) { rdyRemoveGroup(delGrp.dataset.gid); return; }

  // Select group
  const selGrp = e.target.closest('.rdy-sel-group-btn');
  if (selGrp && selGrp.dataset.gid) { rdySelectGroup(selGrp.dataset.gid); return; }

  // Select all button
  const selAll = e.target.closest('#rdyBtnSelAll');
  if (selAll) {
    rdyGroups.forEach(g => g.items.forEach(it => rdySelected.add(it.id)));
    document.querySelectorAll('.rdy-cell').forEach(function(cell) {
      const cid = cell.id.replace('rdyitem_', '');
      cell.classList.toggle('rdy-selected', rdySelected.has(cid));
    });
    rdyUpdateSelBar(); return;
  }

  // Deselect all
  const deselAll = e.target.closest('#rdyBtnDeselAll');
  if (deselAll) {
    rdySelected.clear();
    document.querySelectorAll('.rdy-cell').forEach(function(cell) { cell.classList.remove('rdy-selected'); });
    rdyUpdateSelBar(); return;
  }

  // Send selected to accounts tab
  const sendAcc = e.target.closest('#rdyBtnSendAcc');
  if (sendAcc) { rdyOpenSendToAccountModal(); return; }

  // Remove selected
  const rmSel = e.target.closest('#rdyBtnRmSel');
  if (rmSel) { rdyRemoveSelected(); return; }

  // Download selected as ZIP
  const dlZip = e.target.closest('#rdyBtnDlZip');
  if (dlZip) {
    const selItems = Array.from(rdySelected).map(rdyFindItem).filter(Boolean);
    if (!selItems.length) { showToast('select images first'); return; }
    if (selItems.length === 1) { dl(selItems[0].blob, selItems[0].filename); return; }
    dlZip.disabled = true; dlZip.textContent = 'building...';
    buildZip(selItems.map(it => ({ name: it.filename, blob: it.blob })))
      .then(zip => { dl(zip, 'ready_' + Date.now() + '.zip'); showToast(selItems.length + ' images zipped'); })
      .catch(() => { selItems.forEach(it => dl(it.blob, it.filename)); showToast('ZIP failed — downloading individually'); })
      .finally(() => { dlZip.disabled = false; dlZip.textContent = 'download ZIP'; });
    return;
  }

  // Clear all
  const clearAll = e.target.closest('#rdyBtnClearAll');
  if (clearAll) {
    rdyGroups.forEach(g => g.items.forEach(it => URL.revokeObjectURL(it.url)));
    rdyGroups = []; rdySelected.clear();
    rdyRenderAll(); rdyUpdateSelBar(); return;
  }
});

// ── Send selected images to Accounts modal ────────────────────────
// Centered modal, multi-select checkboxes, keyboard-accessible (Escape).
// Images stay in Ready if attach fails — no destructive side-effects.
function rdyOpenSendToAccountModal() {
  const selItems = Array.from(rdySelected).map(rdyFindItem).filter(Boolean);
  if (!selItems.length) { showToast('Select images first'); return; }

  let accs = [];
  try { accs = (typeof tgAccs !== 'undefined' ? tgAccs : []).filter(function(a) { return !a._archived; }); } catch(e) {}

  document.getElementById('rdySendAccModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rdySendAccModal';
  overlay.className = 'gat-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Send images to accounts');

  // ── Empty state ───────────────────────────────────────────────
  if (!accs.length) {
    overlay.innerHTML =
      '<div class="gat-modal">' +
        '<div class="gat-modal-hdr">Send to Account</div>' +
        '<div class="rdy-acc-warning">' +
          '<span class="rdy-acc-warn-icon">⚠</span>' +
          '<span>No active accounts found.<br>Create an account first by sending a proxy from the Proxies tab.</span>' +
        '</div>' +
        '<div class="gat-modal-btns"><button class="btn" id="rdySendAccClose">close</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('rdySendAccClose').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    _rdyModalKey(overlay);
    return;
  }

  // ── Thumbnail strip (up to 6) ─────────────────────────────────
  const thumbs = selItems.slice(0, 6).map(function(it) {
    return '<img src="' + it.url + '" class="rdy-send-thumb" title="' + esc(it.filename) + '" alt="">';
  }).join('');
  const more = selItems.length > 6 ? '<span class="rdy-send-more">+' + (selItems.length - 6) + ' more</span>' : '';

  // ── Checkbox rows per account ─────────────────────────────────
  const rows = accs.map(function(a) {
    const loc = [a.city, a.country].filter(Boolean).join(', ');
    let imgCount = 0;
    try {
      const b = typeof hub !== 'undefined' ? hub.store.get('bundles:' + a.id, []) : [];
      imgCount = b.reduce(function(s, bn) { return s + bn.items.length; }, 0);
    } catch(e) {}
    return '<label class="rdy-acc-check-row">' +
      '<input type="checkbox" class="rdy-acc-cb" value="' + esc(a.id) + '">' +
      '<span class="rdy-acc-check-label">' +
        '<span class="rdy-acc-check-num">ACC ' + a.accNum + '</span>' +
        (loc      ? '<span class="rdy-acc-check-loc">'   + esc(loc)     + '</span>' : '') +
        (a.phone  ? '<span class="rdy-acc-check-phone">' + esc(a.phone) + '</span>' : '') +
        (imgCount ? '<span class="rdy-acc-check-img">📷 ' + imgCount + '</span>' : '') +
      '</span>' +
    '</label>';
  }).join('');

  const n = selItems.length;
  overlay.innerHTML =
    '<div class="gat-modal">' +
      '<div class="gat-modal-hdr">Send ' + n + ' Image' + (n !== 1 ? 's' : '') + ' to Account' + (accs.length > 1 ? 's' : '') + '</div>' +
      '<div class="rdy-send-thumbs">' + thumbs + more + '</div>' +
      '<div class="rdy-modal-subhdr">Select account' + (accs.length > 1 ? 's' : '') + '</div>' +
      '<div class="rdy-acc-check-list">' + rows + '</div>' +
      '<div class="rdy-modal-footer">' +
        '<span class="rdy-modal-sel-count" id="rdySendAccCount">0 selected</span>' +
        (accs.length > 1 ? '<button class="btn btn-sm" id="rdySendAccSelAll">select all</button>' : '') +
      '</div>' +
      '<div class="gat-modal-btns">' +
        '<button class="btn btn-go" id="rdySendAccConfirm" disabled>attach images</button>' +
        '<button class="btn" id="rdySendAccCancel">cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Auto-check when only one account
  if (accs.length === 1) {
    const cb = overlay.querySelector('.rdy-acc-cb');
    if (cb) cb.checked = true;
  }

  function _updateState() {
    const checked = overlay.querySelectorAll('.rdy-acc-cb:checked');
    const k = checked.length;
    const countEl = document.getElementById('rdySendAccCount');
    const confirmBtn = document.getElementById('rdySendAccConfirm');
    if (countEl) countEl.textContent = k + ' account' + (k !== 1 ? 's' : '') + ' selected';
    if (confirmBtn) confirmBtn.disabled = k === 0;
  }
  _updateState();

  overlay.querySelectorAll('.rdy-acc-cb').forEach(function(cb) {
    cb.addEventListener('change', _updateState);
  });

  const selAllBtn = document.getElementById('rdySendAccSelAll');
  if (selAllBtn) {
    selAllBtn.addEventListener('click', function() {
      const cbs = overlay.querySelectorAll('.rdy-acc-cb');
      const allOn = Array.from(cbs).every(function(c) { return c.checked; });
      cbs.forEach(function(c) { c.checked = !allOn; });
      selAllBtn.textContent = allOn ? 'select all' : 'deselect all';
      _updateState();
    });
  }

  // ── Confirm — attach to each selected account independently ───
  document.getElementById('rdySendAccConfirm').onclick = function() {
    const selectedIds = Array.from(overlay.querySelectorAll('.rdy-acc-cb:checked')).map(function(c) { return c.value; });
    if (!selectedIds.length) { showToast('Select at least one account'); return; }

    let ok = 0, fail = 0;
    selectedIds.forEach(function(accId) {
      try {
        if (typeof hub !== 'undefined') {
          const key = 'bundles:' + accId;
          const existing = hub.store.get(key, []);
          const bundle = {
            id:        'rdy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            items:     selItems.map(function(it) {
              return { id: it.id, blob: it.blob, filename: it.filename, url: it.url, attachedAt: Date.now() };
            }),
            createdAt: Date.now(),
            source:    'ready',
          };
          existing.push(bundle);
          hub.store.set(key, existing);
          hub.pub('bundle:attached', { accId, bundleId: bundle.id, bundle });
          ok++;
        } else { fail++; }
      } catch(e) {
        fail++;
        console.warn('[ready] attach to acc ' + accId + ' failed:', e.message);
      }
    });

    overlay.remove();
    if (ok) {
      const labels = selectedIds.map(function(id) {
        const a = accs.find(function(a) { return a.id === id; });
        return a ? 'ACC ' + a.accNum : id;
      }).join(', ');
      showToast('✓ ' + n + ' image' + (n !== 1 ? 's' : '') + ' → ' + labels);
      dbg('Ready → ' + ok + ' account(s): ' + n + ' images attached', 'debug-ok');
    }
    if (fail) showToast(fail + ' account(s) failed — images remain in Ready', 4000);
  };

  document.getElementById('rdySendAccCancel').onclick = function() { overlay.remove(); };
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  _rdyModalKey(overlay);

  // Focus first checkbox for keyboard navigation
  try { overlay.querySelector('.rdy-acc-cb')?.focus(); } catch(e) {}
}

// Shared Escape-key handler for all ready.js modals
function _rdyModalKey(overlay) {
  function _onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _onKey); }
  }
  document.addEventListener('keydown', _onKey);
  // Clean up if overlay is removed by other means (confirm/cancel)
  const _origRemove = overlay.remove.bind(overlay);
  overlay.remove = function() { document.removeEventListener('keydown', _onKey); _origRemove(); };
}


// ─────────────────────────────────────────────────────────────────
// BUNDLE SYSTEM — groups of exactly 6 images sent to Accounts tab
// ─────────────────────────────────────────────────────────────────
let rdyBundles = [];   // [{id, items[6], createdAt, attachedAccId}]
let _rdyBundleId = 0;

// Open bundle modal
function rdyOpenBundleModal() {
  const allItems = [];
  rdyGroups.forEach(g => g.items.forEach(it => allItems.push(it)));

  document.getElementById('rdyBundleModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rdyBundleModal';
  overlay.className = 'gat-modal-overlay';  // reuse modal overlay style

  if (allItems.length < 6) {
    overlay.innerHTML =
      '<div class="gat-modal">' +
        '<div class="gat-modal-hdr">Bundle Images</div>' +
        '<div class="gat-modal-body" style="padding:16px;color:var(--dim)">Need at least 6 images. You have ' + allItems.length + '.</div>' +
        '<div class="gat-modal-btns"><button class="btn" id="rdyBundleCancel">close</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('rdyBundleCancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  // Build thumbnail grid — user picks exactly 6
  let bundleSelected = new Set();

  function renderPicker() {
    const grid = overlay.querySelector('.rdy-bundle-grid');
    if (!grid) return;
    grid.innerHTML = '';
    allItems.forEach(item => {
      const cell = document.createElement('div');
      const sel  = bundleSelected.has(item.id);
      cell.className = 'rdy-bundle-cell' + (sel ? ' selected' : '');
      cell.innerHTML =
        '<img src="' + item.url + '" alt="' + esc(item.filename) + '">' +
        (sel ? '<span class="rdy-bundle-check">✓</span>' : '');
      cell.addEventListener('click', () => {
        if (bundleSelected.has(item.id)) {
          bundleSelected.delete(item.id);
        } else {
          if (bundleSelected.size >= 6) { showToast('Select exactly 6 images'); return; }
          bundleSelected.add(item.id);
        }
        renderPicker();
        const confirmBtn = overlay.querySelector('#rdyBundleConfirm');
        if (confirmBtn) confirmBtn.disabled = bundleSelected.size !== 6;
        const countEl = overlay.querySelector('.rdy-bundle-count');
        if (countEl) countEl.textContent = bundleSelected.size + ' / 6 selected';
      });
      grid.appendChild(cell);
    });
  }

  overlay.innerHTML =
    '<div class="gat-modal rdy-bundle-modal">' +
      '<div class="gat-modal-hdr">Bundle Images <span class="rdy-bundle-count" style="font-size:12px;color:var(--dim);font-weight:400">0 / 6 selected</span></div>' +
      '<div class="rdy-bundle-instructions">Select exactly 6 images to bundle together for an account.</div>' +
      '<div class="rdy-bundle-grid"></div>' +
      '<div class="gat-modal-btns">' +
        '<button class="btn btn-go" id="rdyBundleConfirm" disabled>Create Bundle</button>' +
        '<button class="btn" id="rdyBundleCancel">cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  renderPicker();

  overlay.querySelector('#rdyBundleConfirm').onclick = () => {
    if (bundleSelected.size !== 6) { showToast('Select exactly 6 images'); return; }
    const selectedItems = allItems.filter(it => bundleSelected.has(it.id));
    const bundle = {
      id: 'bundle_' + (++_rdyBundleId),
      items: selectedItems.map(it => ({ id: it.id, blob: it.blob, filename: it.filename, url: it.url })),
      createdAt: Date.now(),
      attachedAccId: null,
    };
    rdyBundles.push(bundle);
    rdyRenderBundles();
    overlay.remove();
    showToast('Bundle created — ' + bundle.items.length + ' images');
    // Publish to hub
    try {
      if (typeof hub !== 'undefined') hub.pub('bundle:created', { bundle });
    } catch(e) {}
    dbg('Ready: bundle created ' + bundle.id + ' (' + bundle.items.length + ' images)', 'debug-ok');
  };

  overlay.querySelector('#rdyBundleCancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function rdyRenderBundles() {
  const el = document.getElementById('rdyBundleList');
  if (!el) return;
  // Show/hide section header
  const hdr = document.getElementById('rdyBundleHdr');
  if (hdr) hdr.style.display = rdyBundles.length ? 'flex' : 'none';
  if (!rdyBundles.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '';
  rdyBundles.forEach(bundle => {
    const card = document.createElement('div');
    card.className = 'rdy-bundle-card' + (bundle.attachedAccId ? ' rdy-bundle-attached' : '');
    const thumbs = bundle.items.slice(0, 6).map(it =>
      '<img class="rdy-bundle-thumb" src="' + it.url + '" alt="' + esc(it.filename) + '">'
    ).join('');
    const tag = bundle.attachedAccId
      ? '<span class="gat-local-tag ok">attached to ACC ' + esc(bundle._attachedAccNum || '?') + '</span>'
      : '';
    card.innerHTML =
      '<div class="rdy-bundle-thumbs">' + thumbs + '</div>' +
      '<div class="rdy-bundle-info">' +
        '<span class="rdy-bundle-label">Bundle ' + bundle.id + '</span>' +
        tag +
      '</div>' +
      '<div class="rdy-bundle-actions">' +
        '<button class="btn btn-sm btn-go rdy-attach-bundle-btn" data-bid="' + bundle.id + '">→ account</button>' +
        '<button class="btn btn-sm btn-danger rdy-rm-bundle-btn" data-bid="' + bundle.id + '">remove</button>' +
      '</div>';
    el.appendChild(card);
  });

  el.querySelectorAll('.rdy-attach-bundle-btn').forEach(btn => {
    btn.addEventListener('click', () => rdyOpenBundleAttachModal(btn.dataset.bid));
  });
  el.querySelectorAll('.rdy-rm-bundle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      rdyBundles = rdyBundles.filter(b => b.id !== btn.dataset.bid);
      rdyRenderBundles();
    });
  });
}

function rdyOpenBundleAttachModal(bundleId) {
  const bundle = rdyBundles.find(b => b.id === bundleId);
  if (!bundle) return;
  let accs = [];
  try { accs = (typeof tgAccs !== 'undefined' ? tgAccs : []).filter(a => !a._archived); } catch(e) { accs = []; }

  document.getElementById('rdyBundleAttachModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rdyBundleAttachModal';
  overlay.className = 'gat-modal-overlay';

  if (!accs.length) {
    overlay.innerHTML = '<div class="gat-modal"><div class="gat-modal-hdr">Attach Bundle</div><div class="gat-modal-body" style="padding:16px;color:var(--dim)">No accounts found. Create one from the Proxies tab first.</div><div class="gat-modal-btns"><button class="btn" id="rdyBundleAttachCancel">close</button></div></div>';
    document.body.appendChild(overlay);
    document.getElementById('rdyBundleAttachCancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  const opts = accs.map(a =>
    '<option value="' + a.id + '">ACC ' + a.accNum + (a.city ? ' — ' + a.city : '') + '</option>'
  ).join('');

  overlay.innerHTML =
    '<div class="gat-modal">' +
      '<div class="gat-modal-hdr">Attach Bundle to Account</div>' +
      '<div style="font-size:12px;color:var(--dim);padding:8px 0">Bundle of ' + bundle.items.length + ' images</div>' +
      '<select class="gat-modal-select" id="rdyBundleAccSelect">' + opts + '</select>' +
      '<div class="gat-modal-btns">' +
        '<button class="btn btn-go" id="rdyBundleAttachConfirm">attach</button>' +
        '<button class="btn" id="rdyBundleAttachCancel">cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('rdyBundleAttachConfirm').onclick = () => {
    const accId  = document.getElementById('rdyBundleAccSelect').value;
    const acc    = accs.find(a => a.id === accId);
    bundle.attachedAccId    = accId;
    bundle._attachedAccNum  = acc ? acc.accNum : '?';

    // Store bundle reference on the account via hub
    try {
      if (typeof hub !== 'undefined') {
        hub.pub('bundle:attached', { bundleId: bundle.id, accId, bundle });
        // Store in hub store for Accounts tab to retrieve
        const key = 'bundles:' + accId;
        const existing = hub.store.get(key, []);
        existing.push({ id: bundle.id, items: bundle.items, createdAt: bundle.createdAt });
        hub.store.set(key, existing);
      }
    } catch(e) {}

    rdyRenderBundles();
    overlay.remove();
    showToast('Bundle attached to ACC ' + (acc ? acc.accNum : ''));
    dbg('Ready: bundle ' + bundle.id + ' attached to ACC ' + (acc ? acc.accNum : accId), 'debug-ok');
  };

  document.getElementById('rdyBundleAttachCancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Wire bundle button
document.addEventListener('click', function(e) {
  if (e.target.closest('#rdyBtnBundle')) {
    rdyOpenBundleModal();
  }
});

// Subscribe to hub events — keep bundles display in sync
try {
  if (typeof hub !== 'undefined') {
    hub.sub('bundle:attached', function(data) {
      rdyRenderBundles();
    });
  }
} catch(e) {}

try {
  rdyRenderAll();
  dbg('Ready Pictures: initialised', 'debug-ok');
} catch(e) { console.error('[ready] init failed:', e); }
