/**
 * cleaner.js — Image cleaner GUI
 *
 * QoL additions (this version):
 *   - Drag-to-reorder queue (#4)
 *   - Skip already-cleaned files (#18)
 *   - Per-image time estimate (#6)
 *   - Persist preset + advanced slider/toggle positions (#3)
 *   - File size reduction shown in result header
 */
'use strict';

// ── State ────────────────────────────────────────────────────────
let files = [], blobURLs = [], resultURLs = [];
const RASTER = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/gif'];

// Feature 18: fingerprints of files already cleaned this session
const cleanedFingerprints = new Set();

// ── Worker setup ─────────────────────────────────────────────────
let worker = null;
let workerReady = false;
const pendingJobs = new Map();
let jobCounter = 0;

function onWorkerMessage(e) {
  const { id, ok, error, ...data } = e.data;
  const job = pendingJobs.get(id);
  if (!job) return;
  pendingJobs.delete(id);
  if (ok) {
    const blob = new Blob([data.blobBuf], { type: data.blobType });
    job.resolve({ blob, ...data });
  } else {
    job.reject(new Error(error));
  }
}

function onWorkerError(e) {
  console.warn('[worker] Error:', e.message);
  workerReady = false;
  pendingJobs.forEach(job => job.reject(new Error('Worker crashed: ' + e.message)));
  pendingJobs.clear();
  dbg('Worker crashed — attempting restart...', 'debug-warn');
  setTimeout(() => {
    try {
      worker = new Worker('js/worker.js');
      workerReady = true;
      worker.onmessage = onWorkerMessage;
      worker.onerror   = onWorkerError;
      dbg('Worker restarted successfully', 'debug-ok');
      showToast('Processing engine restarted');
    } catch (restartErr) {
      dbg('Worker restart failed — using main thread: ' + restartErr.message, 'debug-err');
    }
  }, 1000);
}

try {
  worker = new Worker('js/worker.js');
  workerReady = true;
  worker.onmessage = onWorkerMessage;
  worker.onerror   = onWorkerError;
  dbg('Worker ready — processing off main thread', 'debug-ok');
} catch (e) {
  console.warn('[worker] Could not create Worker:', e.message);
  dbg('Worker unavailable — processing on main thread', 'debug-warn');
}

async function processImage(file, cfg, onProgress) {
  if (workerReady) {
    onProgress(0, 9, 'sending to worker');
    const rawBytes = await file.arrayBuffer();
    const id = ++jobCounter;
    return new Promise((resolve, reject) => {
      worker.postMessage({ id, rawBytes, fileType: file.type, fileName: file.name, config: cfg }, [rawBytes]);
      let step = 1;
      const ticker = setInterval(() => {
        if (step <= 8) onProgress(step++, 9, 'processing');
        else clearInterval(ticker);
      }, 200);
      const cleanup = () => clearInterval(ticker);
      const jobTimeout = setTimeout(() => {
        if (pendingJobs.has(id)) {
          pendingJobs.get(id).reject(new Error('Worker timeout — file may be corrupted'));
          pendingJobs.delete(id);
        }
        cleanup();
      }, 60000);
      pendingJobs.set(id, {
        resolve: (r) => { cleanup(); clearTimeout(jobTimeout); onProgress(9, 9, 'done'); resolve({ ...r, file }); },
        reject:  (e2) => { cleanup(); clearTimeout(jobTimeout); reject(e2); },
      });
    });
  }
  const rawBytes = await file.arrayBuffer();
  onProgress(0, 9, 'loading');
  const result = await processImageData(rawBytes, file.type, file.name, cfg);
  onProgress(9, 9, 'done');
  return { ...result, file };
}

// ── Feature 3: persist preset & advanced settings ─────────────────
const CLN_PERSIST_KEY = 'imagescrub_cleaner_cfg';

function saveCleanerSettings() {
  try {
    const preset = document.querySelector('input[name="clnPreset"]:checked')?.value || 'shield';
    const sliders = {};
    document.querySelectorAll('.cln-slider').forEach(s => { sliders[s.id] = s.value; });
    const toggles = {};
    document.querySelectorAll('#clnAdvancedPanel input[type="checkbox"]').forEach(cb => { toggles[cb.id] = cb.checked; });
    localStorage.setItem(CLN_PERSIST_KEY, JSON.stringify({ mode: clnMode, preset, sliders, toggles }));
  } catch {}
}

function restoreCleanerSettings() {
  try {
    const raw = localStorage.getItem(CLN_PERSIST_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.mode === 'normal' || saved.mode === 'advanced') {
      clnMode = saved.mode;
      document.querySelectorAll('.cln-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === clnMode));
      $('clnNormalPanel').style.display   = clnMode === 'normal'   ? 'block' : 'none';
      $('clnAdvancedPanel').style.display = clnMode === 'advanced' ? 'block' : 'none';
    }
    if (saved.preset) {
      const radio = document.querySelector(`input[name="clnPreset"][value="${saved.preset}"]`);
      if (radio) radio.checked = true;
    }
    if (saved.sliders) {
      Object.entries(saved.sliders).forEach(([id, val]) => {
        const el = $(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
      });
    }
    if (saved.toggles) {
      Object.entries(saved.toggles).forEach(([id, checked]) => {
        const el = $(id); if (el) el.checked = checked;
      });
    }
  } catch {}
}

// ── Mode toggle ──────────────────────────────────────────────────
let clnMode = 'normal';
document.querySelectorAll('.cln-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    clnMode = btn.dataset.mode;
    document.querySelectorAll('.cln-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === clnMode));
    $('clnNormalPanel').style.display   = clnMode === 'normal'   ? 'block' : 'none';
    $('clnAdvancedPanel').style.display = clnMode === 'advanced' ? 'block' : 'none';
    saveCleanerSettings();
  });
});

// ── Slider colour feedback ────────────────────────────────────────
const SLIDER_LABELS = ['Off','Light','Light','Medium','Medium','Strong','Strong','Extreme','Extreme','Extreme'];
function sliderLabel(v) {
  const idx = Math.round(v / 100 * (SLIDER_LABELS.length - 1));
  return SLIDER_LABELS[Math.max(0, Math.min(idx, SLIDER_LABELS.length - 1))];
}
function sliderColor(v) {
  if (v < 34) return 'var(--ok)';
  if (v < 67) return 'var(--warn)';
  return 'var(--err)';
}
document.querySelectorAll('.cln-slider').forEach(slider => {
  const layer = slider.dataset.layer;
  const valEl = $('val' + layer);
  function update() {
    const v = parseInt(slider.value);
    if (valEl) { valEl.textContent = sliderLabel(v); valEl.style.color = sliderColor(v); }
    slider.style.setProperty('--fill', sliderColor(v));
  }
  slider.addEventListener('input', update);
  slider.addEventListener('change', saveCleanerSettings);
  update();
});
document.querySelectorAll('#clnAdvancedPanel input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', saveCleanerSettings);
});
document.querySelectorAll('input[name="clnPreset"]').forEach(r => {
  r.addEventListener('change', saveCleanerSettings);
});

// ── Config builder ───────────────────────────────────────────────
function getCleanerConfig() {
  if (clnMode === 'normal') {
    const preset = document.querySelector('input[name="clnPreset"]:checked')?.value || 'shield';
    return { preset };
  }
  function sliderVal(id) { const el = $(id); return el ? parseInt(el.value) / 100 : 0; }
  function tog(id) { const el = $(id); return el ? el.checked : false; }
  return {
    L1:  tog('advL1'),  L2:  tog('advL2'),
    L3:  sliderVal('advL3'),  L4:  sliderVal('advL4'),
    L5:  sliderVal('advL5'),  L6:  sliderVal('advL6'),
    L7:  tog('advL7'),  L8:  tog('advL8'),  L9: true,
    L10: sliderVal('advL10'), L11: sliderVal('advL11'),
    L13: sliderVal('advL13'), L14: tog('advL1'),
    L15: sliderVal('advL15'), L16: tog('advL16'),
    L17: tog('advL17'),       L18: sliderVal('advL18'),
    deTarget: 2.5,
  };
}

// ── File management ──────────────────────────────────────────────
$('btnSettings').onclick  = () => $('settingsPanel').classList.toggle('open');
$('dropzone').onclick     = () => $('fileInput').click();
$('dropzone').ondragover  = e => {
  // Only intercept if this is a file-system drop (not an internal queue drag)
  if (_dragSrcIdx !== null) return;
  e.preventDefault(); $('dropzone').classList.add('over');
};
$('dropzone').ondragleave = () => $('dropzone').classList.remove('over');
$('dropzone').ondrop = e => {
  if (_dragSrcIdx !== null) return; // internal queue reorder — let it bubble
  e.preventDefault(); $('dropzone').classList.remove('over');
  if (e.dataTransfer.items) {
    function traverseEntry(entry) {
      return new Promise(resolve => {
        if (entry.isFile) {
          entry.file(f => resolve([f]), () => resolve([]));
        } else if (entry.isDirectory) {
          const reader = entry.createReader(); const results = [];
          function readAll() {
            reader.readEntries(function(entries) {
              if (!entries.length) { resolve(results.flat ? results.flat() : [].concat.apply([], results)); }
              else { Promise.all(entries.map(traverseEntry)).then(function(sf) { results.push(sf.flat ? sf.flat() : [].concat.apply([], sf)); readAll(); }); }
            }, function() { resolve(results.flat ? results.flat() : []); });
          }
          readAll();
        } else resolve([]);
      });
    }
    const items = Array.from(e.dataTransfer.items).filter(i => i.kind === 'file');
    Promise.all(items.map(i => {
      const entry = i.webkitGetAsEntry ? i.webkitGetAsEntry() : null;
      if (entry) return traverseEntry(entry);
      const f = i.getAsFile(); return Promise.resolve(f ? [f] : []);
    })).then(all => addFiles(all.flat()));
  } else {
    addFiles(e.dataTransfer.files);
  }
};
$('fileInput').onchange   = () => { addFiles($('fileInput').files); $('fileInput').value = ''; };
$('btnFolder').onclick    = e => { e.stopPropagation(); $('folderInput').click(); };
$('folderInput').onchange = () => { addFiles($('folderInput').files); $('folderInput').value = ''; };

// ── Feature 18: skip already-cleaned files ────────────────────────
function isAlreadyCleaned(file) {
  if (cleanedFingerprints.has(file.name + '|' + file.size)) return true;
  const stem = file.name.replace(/\.[^.]+$/, '');
  if (cleanedFingerprints.has('stem|' + stem)) return true;
  return false;
}

function addFiles(nf) {
  const ex = new Set(files.map(f => f.name + '|' + f.size));
  let skipped = 0;
  for (const f of nf) {
    const k = f.name + '|' + f.size;
    if (ex.has(k)) continue;
    if (!RASTER.includes(f.type) && !(f.type.startsWith('image/') && !f.type.includes('svg'))) continue;
    if (isAlreadyCleaned(f)) { skipped++; continue; }
    files.push(f); ex.add(k);
  }
  if (skipped) showToast(`${skipped} already-cleaned file${skipped !== 1 ? 's' : ''} skipped`);
  renderCleaner();
}

$('fileList').addEventListener('click', e => {
  const btn = e.target.closest('.rm');
  if (!btn) return;
  const i = parseInt(btn.dataset.index, 10);
  if (!isNaN(i) && i >= 0 && i < files.length) { files.splice(i, 1); renderCleaner(); }
});

// ── Feature 4: drag-to-reorder queue ─────────────────────────────
let _dragSrcIdx = null;

function setupQueueDrag(el, idx) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', e => {
    _dragSrcIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    el.classList.add('f-dragging');
  });
  el.addEventListener('dragend', () => {
    _dragSrcIdx = null;
    el.classList.remove('f-dragging');
    document.querySelectorAll('.f-item').forEach(c => c.classList.remove('f-drag-over'));
  });
  el.addEventListener('dragover', e => {
    if (_dragSrcIdx === null) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.f-item').forEach(c => c.classList.remove('f-drag-over'));
    el.classList.add('f-drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('f-drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('f-drag-over');
    if (_dragSrcIdx === null || _dragSrcIdx === idx) return;
    const moved = files.splice(_dragSrcIdx, 1)[0];
    files.splice(idx, 0, moved);
    _dragSrcIdx = null;
    renderCleaner();
  });
}

function renderCleaner() {
  const toRevoke = blobURLs.slice(); blobURLs = [];
  $('fileList').innerHTML = '';
  files.forEach((f, i) => {
    const u = URL.createObjectURL(f); blobURLs.push(u);
    const d = document.createElement('div'); d.className = 'f-item';
    d.innerHTML = `<span class="f-drag-handle" title="drag to reorder">⠿</span><img class="thumb" src="${u}"><span class="name">${esc(f.name)}</span><span class="size">${fmt(f.size)}</span><button class="rm" data-index="${i}">x</button>`;
    $('fileList').appendChild(d);
    setupQueueDrag(d, i);
  });
  setTimeout(() => toRevoke.forEach(u => URL.revokeObjectURL(u)), 0);
  updateCleanerMeta();
}

function updateCleanerMeta() {
  const has = files.length > 0;
  $('actions').style.display  = has ? 'flex' : 'none';
  $('fileCount').textContent  = files.length + ' file' + (files.length !== 1 ? 's' : '');
  $('statCount').textContent  = files.length;
  $('statSize').textContent   = fmt(files.reduce((s, f) => s + f.size, 0));
  $('summaryBar').classList.toggle('vis', has);
  $('hdrStat').textContent    = has ? files.length + ' queued' : '';
}

$('btnClear').onclick = () => {
  files = [];
  resultURLs.forEach(u => URL.revokeObjectURL(u)); resultURLs = [];
  renderCleaner();
  $('results').innerHTML = '';
  $('progress').classList.remove('on');
  $('progressText').textContent = '';
  $('progressBar').style.width = '0%';
  $('hdrStat').textContent = '';
  $('settingsPanel').classList.remove('open');
};

// ── Feature 6: rolling time estimate ─────────────────────────────
let _timeSamples = [];
function fmtRemaining(ms) {
  if (ms < 60000) return Math.ceil(ms / 1000) + 's remaining';
  return Math.ceil(ms / 60000) + 'm remaining';
}

// ── Run pipeline ─────────────────────────────────────────────────
$('btnClean').onclick = async () => {
  if (!files.length) return;
  $('btnClean').disabled = $('btnClear').disabled = $('btnFolder').disabled = true;
  $('settingsPanel').classList.remove('open');
  $('progress').classList.add('on');
  resultURLs.forEach(u => URL.revokeObjectURL(u)); resultURLs = [];
  $('results').innerHTML = '';
  _timeSamples = [];
  const cfg = getCleanerConfig(), all = [], t0 = performance.now();
  try {
    for (let i = 0; i < files.length; i++) {
      const imgT0 = performance.now();
      $('progressBar').style.width = (i / files.length * 100).toFixed(0) + '%';

      let etaStr = '';
      if (_timeSamples.length > 0) {
        const avg = _timeSamples.reduce((s, v) => s + v, 0) / _timeSamples.length;
        etaStr = ' — ' + fmtRemaining(avg * (files.length - i));
      }

      try {
        const r = await processImage(files[i], cfg, (s, t, m) => {
          $('progressBar').style.width = ((i + s / t) / files.length * 100).toFixed(0) + '%';
          $('progressText').textContent = `[${i + 1}/${files.length}] ${m}${etaStr}`;
        });
        if (!r.blob) throw new Error('encoding failed');

        _timeSamples.push(performance.now() - imgT0);
        if (_timeSamples.length > 5) _timeSamples.shift();

        all.push(r); renderResult(r);

        // Register as cleaned so re-adding is skipped
        cleanedFingerprints.add(files[i].name + '|' + files[i].size);
        cleanedFingerprints.add('stem|' + r.filename.replace(/\.[^.]+$/, ''));

        dbg(`cleaned ${r.filename} ΔE=${r.delta_e} ${r.elapsed}s`, 'debug-ok');
      } catch (e) {
        console.error(e); renderError(files[i].name, e.message);
        dbg(`clean error: ${e.message}`, 'debug-err');
      }
    }
    const tt = ((performance.now() - t0) / 1000).toFixed(1);
    $('progressBar').style.width = '100%';
    $('progressText').textContent = `done // ${all.length} cleaned // ${tt}s`;
    $('hdrStat').textContent = `${all.length} cleaned`;
    if (all.length > 1) {
      const b = document.createElement('button'); b.className = 'btn btn-ok'; b.style.marginTop = '8px';
      b.textContent = `download all as ZIP (${all.length})`;
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'building ZIP...';
        try {
          const zip = await buildZip(all.map(r => ({ name: r.filename, blob: r.blob })));
          dl(zip, 'cleaned_' + Date.now() + '.zip');
        } catch(e) { showToast('ZIP failed — downloading individually'); all.forEach(r => dl(r.blob, r.filename)); }
        finally { b.disabled = false; b.textContent = `download all as ZIP (${all.length})`; }
      };
      $('results').appendChild(b);

      // Send all to ready
      const sendAllRdy = document.createElement('button');
      sendAllRdy.className = 'btn btn-ok'; sendAllRdy.style.marginTop = '8px';
      sendAllRdy.textContent = '→ send all to ready (' + all.length + ')';
      sendAllRdy.onclick = function() {
        if (typeof window.rdyAddBatch === 'function') {
          window.rdyAddBatch(all.slice());
          showToast(all.length + ' images sent to Ready tab');
        } else { showToast('Ready tab not loaded'); }
      };
      $('results').appendChild(sendAllRdy);

      // Send all to analyzer (first image only — analyzer is single-image)
      const sendAllAz = document.createElement('button');
      sendAllAz.className = 'btn'; sendAllAz.style.marginTop = '8px';
      sendAllAz.textContent = '→ analyze first result';
      sendAllAz.onclick = async function() {
        if (!all.length) return;
        try {
          const r = all[0];
          const ab = await r.blob.arrayBuffer();
          window.azFile1Buf  = ab;
          window.azFile1Name = r.filename;
          const n1 = $('azName1'), t1 = $('azThumb1'), rs = $('azRunSingle');
          if (n1) n1.textContent = r.filename + ' (' + fmt(r.blob.size) + ')';
          if (t1) { t1.src = URL.createObjectURL(r.blob); t1.style.display = 'block'; }
          if (rs) rs.disabled = false;
          if (typeof switchTab === 'function') switchTab('images');
          if (typeof switchSubTab === 'function') switchSubTab('analyzer');
          showToast('loaded in analyzer — click analyze');
        } catch(e) { showToast('could not load into analyzer'); }
      };
      $('results').appendChild(sendAllAz);
    }
    if ($('optAutoSave').checked && all.length) {
      if (all.length === 1) {
        dl(all[0].blob, all[0].filename);
      } else {
        buildZip(all.map(r => ({ name: r.filename, blob: r.blob }))).then(zip => dl(zip, 'cleaned_' + Date.now() + '.zip')).catch(() => all.forEach(r => dl(r.blob, r.filename)));
      }
      showToast(`${all.length} saved`);
    }
    // Manual send to ready — via "→ ready" button added below results
    // (no auto-send: user controls when images go to ready tab)
  } finally {
    $('btnClean').disabled = $('btnClear').disabled = $('btnFolder').disabled = false;
    files = [];
    blobURLs.forEach(u => URL.revokeObjectURL(u)); blobURLs = [];
    renderCleaner();
  }
};

// ── Result rendering ─────────────────────────────────────────────
function renderResult(r) {
  const d = document.createElement('div'); d.className = 'r-item';
  const rid = 'r_' + Math.random().toString(36).slice(2);
  const cu = URL.createObjectURL(r.blob); resultURLs.push(cu);

  const head = document.createElement('div'); head.className = 'r-head r-head-collapsed';
  const diamond = document.createElement('span'); diamond.style.color = 'var(--ok)'; diamond.textContent = '◆';
  const nameSpan = document.createElement('span'); nameSpan.className = 'name'; nameSpan.textContent = r.filename;
  const tags = document.createElement('div'); tags.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-left:auto';

  // File size reduction tag (original → output)
  const origSize = r.file ? r.file.size : 0;
  const outSize  = r.blob ? r.blob.size  : 0;
  if (origSize && outSize) {
    const pct = Math.round((1 - outSize / origSize) * 100);
    const sizeTag = fmt(origSize) + ' → ' + fmt(outSize) + (pct !== 0 ? ' (' + (pct > 0 ? '−' : '+') + Math.abs(pct) + '%)' : '');
    tags.appendChild(makeTag('tag-ok', sizeTag));
  }

  tags.appendChild(makeTag(r.delta_e < 1.0 ? 'tag-ok' : 'tag-err', 'ΔE ' + r.delta_e));
  tags.appendChild(makeTag(r.phash_dist >= 8 ? 'tag-ok' : 'tag-warn', 'pH Δ' + r.phash_dist));
  tags.appendChild(makeTag('tag-ok', r.elapsed + 's'));
  tags.appendChild(makeTag('tag-ok', r.width + 'x' + r.height));
  const expandBtn = document.createElement('button');
  expandBtn.className = 'r-expand-btn'; expandBtn.textContent = '▾'; expandBtn.title = 'expand';
  head.appendChild(diamond); head.appendChild(nameSpan); head.appendChild(tags); head.appendChild(expandBtn);

  const body = document.createElement('div'); body.className = 'r-body'; body.style.display = 'none';
  const prevRow = document.createElement('div'); prevRow.className = 'prev-row prev-row-single';
  const col = document.createElement('div'); col.className = 'prev-col';
  const img = document.createElement('img'); img.src = cu;
  img.setAttribute('draggable', 'true'); img.style.cursor = 'grab';
  img.addEventListener('dragstart', function(e) {
    try {
      const file = new File([r.blob], r.filename, { type: r.blob.type || 'image/jpeg' });
      if (e.dataTransfer.items) e.dataTransfer.items.add(file);
      e.dataTransfer.effectAllowed = 'copy';
    } catch(err) { e.dataTransfer.setData('text/uri-list', cu); }
  });
  const lbl = document.createElement('div'); lbl.className = 'prev-lbl'; lbl.textContent = 'cleaned — drag to Accounts';
  col.appendChild(img); col.appendChild(lbl); prevRow.appendChild(col);

  const toggle = document.createElement('button'); toggle.className = 'r-toggle'; toggle.textContent = '+ report';
  const reportDiv = document.createElement('div'); reportDiv.className = 'r-report'; reportDiv.id = rid;
  reportDiv.textContent = Array.isArray(r.report) ? r.report.join('\n') : String(r.report || '');
  toggle.onclick = () => { reportDiv.classList.toggle('open'); toggle.textContent = reportDiv.classList.contains('open') ? '- report' : '+ report'; };

  const dlWrap = document.createElement('div'); dlWrap.style.cssText = 'margin-top:6px;display:flex;gap:8px;flex-wrap:wrap';
  const dlBtn = document.createElement('button'); dlBtn.className = 'btn btn-sm btn-ok'; dlBtn.textContent = 'download';
  dlBtn.onclick = () => dl(r.blob, r.filename);
  dlWrap.appendChild(dlBtn);

  const rdyBtn = document.createElement('button'); rdyBtn.className = 'btn btn-sm'; rdyBtn.textContent = '→ ready';
  rdyBtn.onclick = () => {
    if (typeof window.rdyAddBatch === 'function') {
      window.rdyAddBatch([{ blob: r.blob, filename: r.filename }]);
      showToast('sent to Ready tab');
    } else { showToast('Ready tab not loaded'); }
  };
  dlWrap.appendChild(rdyBtn);

  const azBtn = document.createElement('button'); azBtn.className = 'btn btn-sm'; azBtn.textContent = '→ analyzer';
  azBtn.onclick = async () => {
    try {
      const ab = await r.blob.arrayBuffer();
      window.azFile1Buf  = ab;
      window.azFile1Name = r.filename;
      const n1 = $('azName1'), t1 = $('azThumb1'), rs = $('azRunSingle');
      if (n1) n1.textContent = r.filename + ' (' + fmt(r.blob.size) + ')';
      if (t1) { t1.src = cu; t1.style.display = 'block'; }
      if (rs) rs.disabled = false;
      if (typeof switchTab === 'function') switchTab('images');
      if (typeof switchSubTab === 'function') switchSubTab('analyzer');
      showToast('loaded in analyzer — click analyze');
    } catch(e) { showToast('could not load into analyzer'); }
  };
  dlWrap.appendChild(azBtn);

  body.appendChild(prevRow); body.appendChild(toggle); body.appendChild(reportDiv); body.appendChild(dlWrap);

  const rmBtn = document.createElement('button');
  rmBtn.className = 'btn btn-sm r-del-btn'; rmBtn.textContent = '✕'; rmBtn.title = 'remove this result';
  rmBtn.onclick = () => {
    URL.revokeObjectURL(cu);
    const iC = resultURLs.indexOf(cu); if (iC !== -1) resultURLs.splice(iC, 1);
    d.remove();
  };
  head.appendChild(rmBtn);

  let expanded = false;
  function toggleExpand() {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    expandBtn.textContent = expanded ? '▴' : '▾';
    head.classList.toggle('r-head-expanded', expanded);
  }
  head.addEventListener('click', function(e) { if (!e.target.closest('.r-del-btn')) toggleExpand(); });
  expandBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleExpand(); });

  d.appendChild(head); d.appendChild(body);
  $('results').appendChild(d);
}

function renderError(name, msg) {
  const d = document.createElement('div'); d.className = 'r-item';
  d.innerHTML = `<div class="r-head"><span style="color:var(--err)">&#x25C6;</span><span class="name">${esc(name)}</span></div><div class="r-report open" style="color:var(--err)">${esc(msg)}</div>`;
  $('results').appendChild(d);
}

// ── Init: restore persisted settings ─────────────────────────────
restoreCleanerSettings();
