/* The practice database: every finished hand, as the plain record sim.js toRecord() builds.

   Where hands are kept:
   - Online (claude.ai): the artifact's `db` store, under the viewer's private subtree
       data/users/<id>/practice/batches/<batch>
     Hands are grouped into one document per hour (at most HANDS_PER_BATCH hands each), as a map
     { key, v, hands: { <handId>: record } }. A new hand is merged in with update({hands: {id: record}}),
     so two open tabs never overwrite each other's hands. The platform keeps documents under 256 KB
     and caps an artifact at 25,000 documents, which is why hands are grouped.
   - Local file, or online when the store isn't available: browser localStorage, key LOCAL_KEY.
   - If neither works: memory only, until the page closes (export to keep it).

   const store = PB.createStore();        // starts connecting at once
   store.onChange(fn)                     // called after load and after every change
   store.records                          // all hands, oldest first
   store.kind                             // "loading" | "cloud" | "local" | "memory"
   await store.add(record) / importMany(records) / clear() */
(function (root) {
"use strict";

var LOCAL_KEY = "ls-playbook-hands-v1";
var HANDS_PER_BATCH = 100;
var BATCH_BYTES = 180 * 1024; // a batch also starts fresh before it passes this size (documents max out at 256 KB)
var PAGE = 500;

function isRecord(r) {
  return r && typeof r === "object" && typeof r.id === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(r.id) &&
    typeof r.ts === "number" && isFinite(r.ts) && Array.isArray(r.decisions);
}
function sortByTime(list) { return list.sort(function (a, b) { return a.ts - b.ts || (a.id < b.id ? -1 : 1); }); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function hourKey(ts) {
  var d = new Date(ts);
  return "b-" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours());
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function bytesOf(x) {
  var s = JSON.stringify(x);
  try { return new TextEncoder().encode(s).length; } catch (e) { return s.length * 3; }
}

/* ---------- browser storage ---------- */
function localBackend(ls) {
  return {
    kind: "local",
    load: function () {
      var raw = ls.getItem(LOCAL_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Promise.resolve(Array.isArray(list) ? list.filter(isRecord) : []);
    },
    // The whole list is rewritten each time: simple, and fine for thousands of hands.
    save: function (all) {
      try { ls.setItem(LOCAL_KEY, JSON.stringify(all)); return Promise.resolve(); }
      catch (e) { return Promise.reject({ code: "quota_exceeded", message: "Browser storage is full." }); }
    },
    addMany: function (all) { return this.save(all); },
    clear: function () { try { ls.removeItem(LOCAL_KEY); } catch (e) {} return Promise.resolve(); }
  };
}
function memoryBackend() {
  return { kind: "memory", load: function () { return Promise.resolve([]); }, addMany: function () { return Promise.resolve(); }, clear: function () { return Promise.resolve(); } };
}

/* ---------- the artifact's db store ---------- */
function cloudBackend(db, uid, pageSize) {
  var col = db.doc("data/users/" + uid + "/practice").collection("batches");
  var counts = {}, sizes = {};   // batch id → hands in it and their bytes, as far as this page knows
  pageSize = pageSize || PAGE;

  function retryOnce(fn) {
    return fn().catch(function (e) {
      if (e && e.code === "unavailable") return sleep(300 + Math.random() * 600).then(fn);
      throw e;
    });
  }
  function batchFor(ts, bytes) {
    var base = hourKey(ts), id = base, n = 1;
    while ((counts[id] || 0) >= HANDS_PER_BATCH || (counts[id] && (sizes[id] || 0) + bytes > BATCH_BYTES)) { n++; id = base + "-" + n; }
    return id;
  }
  // Merge hands into a batch document, creating it if it doesn't exist yet.
  function write(id, hands) {
    var ref = col.doc(id);
    return retryOnce(function () { return ref.update({ hands: hands }); }).catch(function (e) {
      if (!e || e.code !== "invalid_argument") throw e;
      return retryOnce(function () { return ref.set({ key: id, v: 1, hands: hands }); });
    }).then(function () {
      Object.keys(hands).forEach(function (k) { counts[id] = (counts[id] || 0) + 1; sizes[id] = (sizes[id] || 0) + bytesOf(hands[k]); });
    });
  }

  return {
    kind: "cloud",
    load: function () {
      var out = [];
      function page(after) {
        var q = after ? col.where("key", ">", after).orderBy("key").limit(pageSize) : col.orderBy("key").limit(pageSize);
        return retryOnce(function () { return q.get(); }).then(function (snap) {
          var last = null;
          snap.docs.forEach(function (doc) {
            var body = doc.data() || {}, hands = body.hands || {}, ids = Object.keys(hands);
            counts[doc.id] = ids.length; sizes[doc.id] = 0;
            ids.forEach(function (k) { sizes[doc.id] += bytesOf(hands[k]); if (isRecord(hands[k])) out.push(plain(hands[k])); });
            last = typeof body.key === "string" ? body.key : doc.id;
          });
          return snap.docs.length === pageSize && last ? page(last) : out;
        });
      }
      return page(null);
    },
    addMany: function (all, added) {
      var groups = {}, held = {};
      sortByTime(added.slice()).forEach(function (r) {
        var b = bytesOf(r), id = batchFor(r.ts, b);
        (groups[id] = groups[id] || {})[r.id] = r;
        counts[id] = (counts[id] || 0) + 1; sizes[id] = (sizes[id] || 0) + b;   // reserve space while grouping
        held[id] = (held[id] || 0) + b;
      });
      Object.keys(groups).forEach(function (id) { counts[id] -= Object.keys(groups[id]).length; sizes[id] -= held[id]; });
      var chain = Promise.resolve();
      Object.keys(groups).forEach(function (id) { chain = chain.then(function () { return write(id, groups[id]); }); });
      return chain;
    },
    clear: function () {
      var chain = Promise.resolve();
      Object.keys(counts).forEach(function (id) {
        chain = chain.then(function () { return retryOnce(function () { return col.doc(id).delete(); }); }).then(function () { delete counts[id]; delete sizes[id]; });
      });
      return chain;
    }
  };
}

function connectCloud(claude) {
  if (!claude || typeof claude.use !== "function") return Promise.resolve(null);
  return Promise.all([claude.use("db"), claude.use("user")]).then(function (r) {
    var db = r[0], user = r[1];
    if (!db || !user || typeof user.id !== "function") return null;
    return user.id().then(function (uid) { return uid ? { db: db, uid: uid } : null; });
  }).catch(function () { return null; });
}

function createStore(opts) {
  opts = opts || {};
  var g = typeof window !== "undefined" ? window : globalThis;
  var ls = opts.localStorage !== undefined ? opts.localStorage : (function () { try { return g.localStorage || null; } catch (e) { return null; } })();
  var claude = opts.claude !== undefined ? opts.claude : g.claude;
  var listeners = [];
  var store = { kind: "loading", records: [], error: "", ready: null };
  var backend = null, queue = Promise.resolve();

  function emit() { listeners.forEach(function (fn) { try { fn(store); } catch (e) {} }); }
  function useLocal(reason) {
    var local = null;
    if (ls) { try { ls.getItem(LOCAL_KEY); local = localBackend(ls); } catch (e) {} }
    backend = local || memoryBackend();
    store.kind = backend.kind;
    if (reason) store.error = reason;
    return backend.load().catch(function () { return []; }).then(function (list) {
      var have = {};
      store.records.forEach(function (r) { have[r.id] = 1; });
      list.forEach(function (r) { if (!have[r.id]) store.records.push(r); });
      sortByTime(store.records);
    });
  }

  store.ready = connectCloud(claude).then(function (c) {
    if (!c) return useLocal();
    backend = cloudBackend(c.db, c.uid, opts.pageSize);
    return backend.load().then(function (list) {
      store.kind = "cloud"; store.records = sortByTime(list);
    }, function () { return useLocal("Couldn't open your saved practice, so hands are saved in this browser for now."); });
  }).then(emit, function () { return useLocal().then(emit); });

  function run(job) { queue = queue.then(function () { return store.ready; }).then(job); return queue; }

  store.onChange = function (fn) { listeners.push(fn); };

  // Saves hands not already in the database. Resolves {added, skipped}; never rejects.
  store.importMany = function (list) {
    return run(function () {
      var have = {}, fresh = [];
      store.records.forEach(function (r) { have[r.id] = 1; });
      (list || []).forEach(function (r) { if (isRecord(r) && !have[r.id]) { have[r.id] = 1; fresh.push(plain(r)); } });
      if (!fresh.length) return { added: 0, skipped: (list || []).length };
      var next = sortByTime(store.records.concat(fresh));
      return backend.addMany(next, fresh).then(function () {
        store.records = next; store.error = ""; emit();
        return { added: fresh.length, skipped: list.length - fresh.length };
      }, function (e) {
        var code = e && e.code;
        if (backend.kind === "cloud" && code === "invalid_argument") {
          // This account can't write here (for example a view-only share). Keep going in this browser.
          return useLocal("Your Claude account can't save here, so hands are saved in this browser instead.").then(function () {
            return backend.addMany(sortByTime(store.records.concat(fresh)), fresh).catch(function () {});
          }).then(function () {
            store.records = sortByTime(store.records.concat(fresh)); emit();
            return { added: fresh.length, skipped: list.length - fresh.length };
          });
        }
        store.records = next;
        store.error = code === "quota_exceeded"
          ? "Storage is full, so this hand is kept only until you close the page. Export your history, then delete old hands."
          : "Couldn't save the last hand. It stays on this page until you close it; export to keep it.";
        emit();
        return { added: fresh.length, skipped: list.length - fresh.length, unsaved: true };
      });
    });
  };
  store.add = function (record) { return store.importMany([record]); };
  store.clear = function () {
    return run(function () {
      return backend.clear().then(function () { store.records = []; store.error = ""; emit(); }, function () {
        store.error = "Couldn't delete everything. Try again."; emit();
      });
    });
  };
  return store;
}

var api = { createStore: createStore, isRecord: isRecord, hourKey: hourKey, LOCAL_KEY: LOCAL_KEY, HANDS_PER_BATCH: HANDS_PER_BATCH, BATCH_BYTES: BATCH_BYTES };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
