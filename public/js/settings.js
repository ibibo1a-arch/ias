/**
 * settings.js — Endpoints, delay, fetcher proxy, scamalytics config
 */

// ══════════════════════════════════════════════════════════════════
//  SCAMALYTICS CONFIG
// ══════════════════════════════════════════════════════════════════
function scamSaveKey(k, user, host) {
  try { localStorage.setItem('scam_cfg', JSON.stringify({ k, user, host })); } catch {}
}
function scamLoadCfg() {
  try { return JSON.parse(localStorage.getItem('scam_cfg') || 'null'); } catch { return null; }
}
function scamHasCfg() {
  const c = scamLoadCfg(); return !!(c && c.k && c.user);
}

(function initScamSettings() {
  const btnSave = $('btnScamSave');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const k    = ($('scamKey')?.value  || '').trim();
      const user = ($('scamUser')?.value || '').trim();
      const host = $('scamHost')?.value  || 'api11.scamalytics.com';
      if (!k || !user) { showToast('enter both key and username'); return; }
      // Save to localStorage (for UI restore) AND server (for security)
      scamSaveKey(k, user, host);
      try {
        const r = await fetch('/api/scam/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: k, user, host }),
        });
        const d = await r.json();
        if (!d.ok) { showToast('server save failed: ' + (d.error || '?'), 4000); return; }
      } catch (e) { showToast('could not save to server: ' + e.message, 4000); return; }
      const dot = $('scamDot'); if (dot) dot.className = 's-dot acc-dot ok';
      const sub = $('accSub-scamalytics'); if (sub) sub.textContent = user + ' // ' + host.replace('.scamalytics.com', '');
      showToast('scamalytics config saved');
      dbg('Scamalytics saved to server: ' + user + ' @ ' + host, 'debug-ok');
    });
  }

  const btnToggle = $('btnScamKeyToggle');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      const inp = $('scamKey'); if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btnToggle.textContent = inp.type === 'password' ? 'show' : 'hide';
    });
  }

  const btnTest = $('btnScamTest');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const k    = ($('scamKey')?.value  || '').trim();
      const user = ($('scamUser')?.value || '').trim();
      const host = $('scamHost')?.value  || 'api11.scamalytics.com';
      const result = $('scamTestResult');
      if (!k || !user) { if (result) { result.textContent = 'enter key and username first'; result.style.color = 'var(--warn)'; } return; }
      btnTest.disabled = true; btnTest.textContent = 'testing…';
      if (result) result.textContent = '';
      try {
        const r = await fetch('/api/scam/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '8.8.8.8', key: k, user, host }) });
        const d = await r.json();
        // API returns flat response; proxy may wrap it under .scamalytics — handle both
        const scamData = d.scamalytics || d;
        if (scamData && (scamData.status === 'ok' || scamData.scamalytics_score !== undefined)) {
          const score = scamData.scamalytics_score ?? scamData.score ?? '?';
          const credits = scamData.credits?.remaining;
          if (result) { result.textContent = `✓ working — score for 8.8.8.8: ${score}${credits !== undefined ? ' // ' + Number(credits).toLocaleString() + ' credits remaining' : ''}`; result.style.color = 'var(--ok)'; }
          const dot = $('scamDot'); if (dot) dot.className = 's-dot acc-dot ok';
          dbg(`Scamalytics test OK: score=${score} credits=${credits}`, 'debug-ok');
        } else {
          const msg = scamData?.error || scamData?.status || d.error || 'unknown error';
          if (result) { result.textContent = '✗ ' + msg; result.style.color = 'var(--err)'; }
          dbg('Scamalytics test failed: ' + msg, 'debug-warn');
        }
      } catch (e) { if (result) { result.textContent = '✗ ' + e.message; result.style.color = 'var(--err)'; } }
      finally { btnTest.disabled = false; btnTest.textContent = 'test credentials'; }
    });
  }

  // Restore saved config
  const c = scamLoadCfg();
  if (c?.k) {
    if ($('scamKey'))  $('scamKey').value  = c.k;
    if ($('scamUser')) $('scamUser').value = c.user || '';
    if ($('scamHost')) $('scamHost').value = c.host || 'api11.scamalytics.com';
    const dot = $('scamDot'); if (dot) dot.className = 's-dot acc-dot ok';
    const sub = $('accSub-scamalytics');
    if (sub) sub.textContent = (c.user || '') + ' // ' + (c.host || 'api11').replace('.scamalytics.com', '');
    dbg('Scamalytics config restored: ' + (c.user || '?'), 'debug-ok');
  }
})();
