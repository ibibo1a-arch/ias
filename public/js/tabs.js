/**
 * tabs.js — Tab system, sub-tabs, accordion, debug panel
 */
'use strict';

// ── Main tab switching ────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  const tab   = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = $('panel-' + tabName);
  if (tab)   tab.classList.add('active');
  if (panel) panel.classList.add('active');
  try { localStorage.setItem('imagescrub_tab', tabName); } catch {}

  // Show/hide sub-tab bar seamlessly under the main tabs
  const subBar = $('imageSubTabs');
  if (subBar) subBar.classList.toggle('visible', tabName === 'images');
}

// ── Sub-tab switching ─────────────────────────────────────────────
function switchSubTab(subTabName) {
  document.querySelectorAll('.subtab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.subpanel').forEach(x => x.classList.remove('active'));
  const sub   = document.querySelector(`[data-subtab="${subTabName}"]`);
  const panel = $('subpanel-' + subTabName);
  if (sub)   sub.classList.add('active');
  if (panel) panel.classList.add('active');
  try { localStorage.setItem('imagescrub_subtab', subTabName); } catch {}
}

// Wire main tabs
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// Wire sub-tabs
document.querySelectorAll('.subtab').forEach(t => {
  t.addEventListener('click', () => switchSubTab(t.dataset.subtab));
});

// ── Restore last active tab ───────────────────────────────────────
function restoreTab() {
  try {
    let lt = localStorage.getItem('imagescrub_tab');
    if (lt === 'cleaner' || lt === 'ready' || lt === 'analyzer') lt = 'images';
    if (lt === 'cookies' || lt === 'endpoints' || lt === 'proxy') lt = 'settings';
    if (lt === 'telegram') lt = 'accounts';
    if (lt === 'scraper') lt = 'images';
    if (lt && document.querySelector(`[data-tab="${lt}"]`)) switchTab(lt);
    else switchTab('images');

    let lst = localStorage.getItem('imagescrub_subtab');
    if (lst && document.querySelector(`[data-subtab="${lst}"]`)) switchSubTab(lst);
  } catch {}
}

// ── Ctrl+D debug panel ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'd') { e.preventDefault(); $('debugPanel').classList.toggle('open'); }
});
document.addEventListener('click', e => {
  if (e.target.closest('#btnDebugClose')) $('debugPanel').classList.remove('open');
});

// ── Accordion ─────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const hdr = e.target.closest('.acc-hdr[data-acc]');
  if (hdr) toggleAcc(hdr.dataset.acc);
});
function toggleAcc(key) {
  const row = document.getElementById('acc-' + key);
  if (row) { row.classList.toggle('open'); saveAccordionState(); }
}

const ACC_STATE_KEY = 'imagescrub_acc_state';
function saveAccordionState() {
  try {
    const state = {};
    document.querySelectorAll('.acc-row[id]').forEach(row => {
      state[row.id] = row.classList.contains('open');
    });
    localStorage.setItem(ACC_STATE_KEY, JSON.stringify(state));
  } catch {}
}
function restoreAccordionState() {
  try {
    const raw = localStorage.getItem(ACC_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    Object.entries(state).forEach(([id, open]) => {
      const row = document.getElementById(id);
      if (row) row.classList.toggle('open', !!open);
    });
  } catch {}
}
window.restoreAccordionState = restoreAccordionState;
window.switchSubTab = switchSubTab;
