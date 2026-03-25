/**
 * hub.js — Cross-tab event bus + shared state store
 *
 * Provides a minimal, decoupled message-passing layer.
 * Each module publishes and subscribes independently.
 * No module holds a direct reference to another module's functions.
 *
 * Isolation guarantee: subscribe() never throws — bad handlers are caught
 * and reported without taking down the bus or other subscribers.
 *
 * API:
 *   hub.pub(event, payload)        — publish an event
 *   hub.sub(event, handler)        — subscribe; returns unsubscribe fn
 *   hub.store.set(key, val)        — shared in-memory store (no localStorage)
 *   hub.store.get(key, fallback)   — read from store
 *   hub.store.del(key)             — delete from store
 *
 * Known events (convention, not enforced):
 *   'number:attach'   { number, code, service }
 *   'bundle:created'  { bundle: { id, items[{blob,filename,url}] } }
 *   'bundle:attached' { bundleId, accId }
 *   'accounts:ready'  { count }
 */
'use strict';

(function() {
  const _subs = {};   // event → [handlers]
  const _store = {};  // key → value

  const hub = {
    pub(event, payload) {
      (_subs[event] || []).forEach(function(fn) {
        try { fn(payload); }
        catch(e) { console.warn('[hub] handler error on "' + event + '":', e.message); }
      });
    },
    sub(event, handler) {
      if (!_subs[event]) _subs[event] = [];
      _subs[event].push(handler);
      return function() {                          // returns unsub fn
        _subs[event] = (_subs[event] || []).filter(function(f) { return f !== handler; });
      };
    },
    store: {
      set(key, val)      { _store[key] = val; },
      get(key, fallback) { return key in _store ? _store[key] : (fallback !== undefined ? fallback : null); },
      del(key)           { delete _store[key]; },
    },
  };

  window.hub = hub;
})();
