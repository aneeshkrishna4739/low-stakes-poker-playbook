// Checks the practice database and the Retrospect analysis.
//  1. Hand records: valid, compact, and a full batch document stays under the platform's 256 KB limit.
//  2. Retrospect on simulated players with known habits: each habit must come out as the top leak,
//     and a player who follows the guide must score 100% with no leaks.
//  3. Almost every non-correct decision is explained by some leak pattern.
//  4. The browser store and the cloud store (against a stand-in for the platform db) save, reload,
//     page through, skip duplicates, roll batches over, fall back when writes are refused, and clear.
// Run: node tests/check-retro.js
const path = require("path");
const js = (f) => path.join(__dirname, "..", "js", f);
const K = require(js("cards.js"));
require(js("engine.js")); require(js("ranges.js")); require(js("table.js")); require(js("data.js")); require(js("coach.js"));
const S = require(js("sim.js"));
const ST = require(js("store.js"));
const R = require(js("retro.js"));

let problems = 0;
const fail = (msg) => { console.log("FAIL  " + msg); problems++; };

/* ---------- players ---------- */
const VALUE_BETS = ["bet:value", "bet:light", "bet:vp", "bet:thin", "bet:prot"];
const policies = {
  guide: (st, ids, best) => best,
  station: (st, ids, best) => (st.prompt.kind === "vsBet" || st.prompt.kind === "vsRaise") && ids.includes("call") ? "call" : best,
  bluffer: (st, ids, best) => st.prompt.kind === "open" && st.heroAn.bucket === "bad" && ids.includes("bet:bluff") ? "bet:bluff" : best,
  nit: (st, ids, best) => st.prompt.kind.startsWith("pre-") ? "fold" : best,
  loose: (st, ids, best) => st.prompt.kind.startsWith("pre-") && best === "fold" ? (ids.includes("call") ? "call" : ids.find((i) => i !== "fold")) : best,
  small: (st, ids, best) => VALUE_BETS.includes(best) && best !== "bet:thin" && ids.includes("bet:thin") ? "bet:thin" : best,
  passive: (st, ids, best) => st.prompt.kind === "open" ? "check" : best,
  random: (st, ids, best, rng) => ids[Math.floor(rng() * ids.length)]
};
function play(policy, seed, ts) {
  const rng = K.seededRandom(seed);
  const st = S.newHand({ players: 5 + Math.floor(rng() * 7), rng });
  let guard = 0;
  while (!st.done && guard++ < 30) {
    const ids = st.prompt.options.map((o) => o.id);
    let best = S.expectedChoice(st);
    if (!ids.includes(best)) best = ids.includes("call") ? "call" : ids[0];
    let c = policies[policy](st, ids, best, rng);
    if (!ids.includes(c)) c = best;
    S.choose(st, c);
  }
  return S.toRecord(st, ts);
}
function session(policy, n, seed0, t0) { const out = []; for (let i = 0; i < n; i++) out.push(play(policy, seed0 + i, (t0 || 1.7e12) + i * 45000)); return out; }

/* ---------- 1. records ---------- */
const guideHands = session("guide", 600, 1);
let maxBytes = 0, sum = 0;
for (const r of guideHands.concat(session("random", 300, 9000))) {
  if (!ST.isRecord(r)) fail("record failed isRecord: " + JSON.stringify(r).slice(0, 120));
  const b = Buffer.byteLength(JSON.stringify(r)); maxBytes = Math.max(maxBytes, b); sum += b;
  for (const d of r.decisions) {
    if (!d.street || !d.kind || !d.choice || !d.best || !d.verdict || !d.guide) fail("decision missing fields in " + r.id);
    if (d.street !== "preflop" && (!d.bucket || !d.role || !d.pos)) fail("postflop decision without bucket/role/pos in " + r.id);
  }
  try { K.parseCards(r.hole); if (r.board) K.parseCards(r.board); } catch (e) { fail("cards don't parse back: " + r.hole + " " + r.board); }
}
console.log(`Record size: average ${Math.round(sum / 900)} bytes, largest ${maxBytes} bytes; batches close at ${ST.BATCH_BYTES / 1024} KB or ${ST.HANDS_PER_BATCH} hands (document limit 256 KB)`);
if (ST.BATCH_BYTES + maxBytes * 4 > 250 * 1024) fail("a batch could exceed the 256 KB document limit");

/* ---------- 2. retrospect on known habits ---------- */
const g = R.retrospect(guideHands);
console.log(`guide     score ${(g.score * 100).toFixed(1)}%  leaks: ${g.leaks.length}  strengths: ${g.strengths.map((a) => a.label).join(", ")}`);
if (g.score !== 1) fail("a guide-following player should score 100%");
if (g.leaks.length) fail("a guide-following player should have no leaks: " + g.leaks.map((l) => l.id).join(","));
if (!g.strengths.length) fail("a guide-following player should have strengths");
if (g.weaknesses.length) fail("a guide-following player should have no weaknesses");

const expectations = { station: "calling_station", bluffer: "over_bluff", nit: "preflop_tight", loose: "preflop_loose", small: "wrong_type", passive: "missed_value" };
for (const [pol, leak] of Object.entries(expectations)) {
  const rep = R.retrospect(session(pol, 400, 20000 + pol.length * 1000));
  const top = rep.leaks[0];
  console.log(`${pol.padEnd(9)} score ${(rep.score * 100).toFixed(1)}%  top leak: ${top ? top.id + " (" + top.count + "/" + top.opps + ")" : "none"}  weakest: ${rep.weaknesses.slice(0, 2).map((a) => a.label).join(", ")}`);
  if (!top || top.id !== leak) fail(`${pol}: expected top leak ${leak}, got ${top && top.id}`);
  if (top && !top.example.situation) fail(`${pol}: leak has no example`);
  if (!rep.weaknesses.length) fail(`${pol}: expected at least one weakness`);
  if (pol === "small" && top && !/too small/.test(top.detail)) fail("small bettor: detail should say the bets are too small: " + top.detail);
}

/* ---------- 3. coverage ---------- */
const rnd = R.retrospect(session("random", 800, 50000));
console.log(`random    score ${(rnd.score * 100).toFixed(1)}%  leaks explain ${(rnd.explained * 100).toFixed(1)}% of non-correct decisions`);
if (rnd.explained < 0.97) fail("leak patterns should explain at least 97% of non-correct decisions");
const scoped = R.retrospect(session("random", 150, 70000), { scope: "last100" });
if (scoped.hands !== 100) fail("scope last100 should keep 100 hands, got " + scoped.hands);
const prompt = R.coachPrompt(rnd, session("random", 50, 80000), "rules here");
if (Buffer.byteLength(prompt) > 60000 || !/STRENGTHS/.test(prompt) || !/RECENT MISTAKES/.test(prompt)) fail("coach prompt malformed or too large");

/* ---------- 4. stores ---------- */
function fakeLocalStorage(opts) {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (opts && opts.full) throw new Error("QuotaExceededError"); m.set(k, String(v)); }, removeItem: (k) => m.delete(k), _m: m };
}
// A stand-in for the platform db, following db.d.ts: path parity, update requires an existing doc and merges
// nested objects, where/orderBy/limit, 256 KB documents.
function mockDb(opts) {
  opts = opts || {};
  const docs = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const err = (code) => Promise.reject({ code, message: code });
  const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = clone(b[k]); } return a; };
  const segs = (p) => p.split("/").length;
  function docRef(p) {
    if (segs(p) % 2) throw new TypeError("document path needs an even number of segments: " + p);
    return {
      id: p.split("/").pop(), path: p,
      get: () => Promise.resolve({ id: p.split("/").pop(), exists: docs.has(p), data: () => (docs.has(p) ? clone(docs.get(p)) : undefined) }),
      set: (data) => { if (opts.readOnly) return err("invalid_argument"); if (Buffer.byteLength(JSON.stringify(data)) > 256 * 1024) return err("invalid_argument"); docs.set(p, clone(data)); return Promise.resolve(); },
      update: (data) => { if (opts.readOnly || !docs.has(p)) return err("invalid_argument"); const next = merge(clone(docs.get(p)), data); if (Buffer.byteLength(JSON.stringify(next)) > 256 * 1024) return err("invalid_argument"); docs.set(p, next); return Promise.resolve(); },
      delete: () => { docs.delete(p); return Promise.resolve(); },
      collection: (sub) => colRef(p + "/" + sub)
    };
  }
  function colRef(p) {
    if (segs(p) % 2 === 0) throw new TypeError("collection path needs an odd number of segments: " + p);
    const q = (filters, order, lim) => ({
      where: (f, op, v) => q(filters.concat([[f, op, v]]), order, lim),
      orderBy: (f) => q(filters, f, lim),
      limit: (n) => { if (n < 1 || n > 1000) throw new Error("limit"); return q(filters, order, n); },
      get: () => {
        let list = [...docs.entries()].filter(([k]) => k.startsWith(p + "/") && segs(k) === segs(p) + 1).map(([k, v]) => ({ id: k.split("/").pop(), body: v }));
        for (const [f, op, v] of filters) list = list.filter((x) => (op === ">" ? x.body[f] > v : true));
        list.sort((a, b) => (order ? (a.body[order] < b.body[order] ? -1 : 1) : (a.id < b.id ? -1 : 1)));
        list = list.slice(0, lim || 1000);
        return Promise.resolve({ docs: list.map((x) => ({ id: x.id, exists: true, data: () => clone(x.body) })), size: list.length, empty: !list.length });
      }
    });
    return Object.assign(q([], null, null), { path: p, doc: (id) => docRef(p + "/" + id) });
  }
  return { doc: docRef, collection: colRef, _docs: docs };
}
const fakeClaude = (db, uid) => ({ use: (n) => Promise.resolve(n === "db" ? db : n === "user" ? { id: () => Promise.resolve(uid === undefined ? "u_test" : uid) } : null) });

(async () => {
  // Browser store
  const ls = fakeLocalStorage();
  const s1 = ST.createStore({ claude: null, localStorage: ls });
  await s1.ready;
  if (s1.kind !== "local") fail("expected the browser store without Claude, got " + s1.kind);
  const some = session("random", 30, 90000);
  for (const r of some.slice(0, 20)) await s1.add(r);
  const imp = await s1.importMany(some);
  if (imp.added !== 10 || imp.skipped !== 20) fail("browser import should add 10 and skip 20: " + JSON.stringify(imp));
  const s2 = ST.createStore({ claude: null, localStorage: ls });
  await s2.ready;
  if (s2.records.length !== 30) fail("browser store should reload 30 hands, got " + s2.records.length);
  await s2.clear();
  if (ST.createStore({ claude: null, localStorage: ls }).records.length !== 0 || ls.getItem(ST.LOCAL_KEY)) fail("browser clear should remove the data");
  const sFull = ST.createStore({ claude: null, localStorage: fakeLocalStorage({ full: true }) });
  await sFull.ready; await sFull.add(some[0]);
  if (!sFull.error || sFull.records.length !== 1) fail("a full browser store should keep the hand on the page and say so");

  // Cloud store: 250 hands in one hour roll over into 3 batches; reload pages through them 2 at a time.
  const db = mockDb();
  const c1 = ST.createStore({ claude: fakeClaude(db), localStorage: fakeLocalStorage(), pageSize: 2 });
  await c1.ready;
  if (c1.kind !== "cloud") fail("expected the cloud store, got " + c1.kind);
  const many = session("random", 250, 100000, Date.UTC(2026, 9, 14, 15, 0, 0)).map((r, i) => Object.assign(r, { ts: Date.UTC(2026, 9, 14, 15, 0, 0) + i * 1000 }));
  for (const r of many.slice(0, 120)) await c1.add(r);
  await c1.importMany(many);
  const batches = [...db._docs.keys()];
  const sizes = batches.map((k) => Object.keys(db._docs.get(k).hands).length);
  console.log(`Cloud store: ${batches.length} batch documents (${sizes.join(", ")} hands) at ${batches[0]}`);
  if (!batches.every((k) => k.startsWith("data/users/u_test/practice/batches/b-2026101415"))) fail("batch paths wrong: " + batches.join(" "));
  if (Math.max(...sizes) > ST.HANDS_PER_BATCH || sizes.reduce((a, b) => a + b, 0) !== 250) fail("batches should hold all 250 hands, at most " + ST.HANDS_PER_BATCH + " each");
  const c2 = ST.createStore({ claude: fakeClaude(db), localStorage: fakeLocalStorage(), pageSize: 2 });
  await c2.ready;
  if (c2.records.length !== 250) fail("cloud store should reload 250 hands across pages, got " + c2.records.length);
  if (c2.records.some((r, i) => i && r.ts < c2.records[i - 1].ts)) fail("reloaded hands should be oldest first");
  await c2.add(session("random", 1, 123456, Date.UTC(2026, 9, 14, 16, 5))[0]);
  if (![...db._docs.keys()].some((k) => k.endsWith("b-2026101416"))) fail("a hand in a new hour should start a new batch");
  await c2.clear();
  if (db._docs.size !== 0 || c2.records.length) fail("cloud clear should delete every batch");

  // Big hands: batches close by size before the 256 KB limit (the stand-in rejects bigger documents).
  const bigDb = mockDb();
  const c5 = ST.createStore({ claude: fakeClaude(bigDb), localStorage: fakeLocalStorage() });
  await c5.ready;
  const big = session("random", 100, 300000).map((r, i) => Object.assign(r, { ts: Date.UTC(2026, 9, 14, 18, 0, 0) + i * 1000, decisions: r.decisions.map((d) => Object.assign({}, d, { guide: d.guide + " ".repeat(2500) })) }));
  await c5.importMany(big);
  const bigSizes = [...bigDb._docs.values()].map((v) => Buffer.byteLength(JSON.stringify(v)));
  console.log(`Big hands: ${bigSizes.length} batches, largest ${Math.round(Math.max(...bigSizes) / 1024)} KB`);
  if (c5.kind !== "cloud" || c5.error || bigSizes.length < 2 || Math.max(...bigSizes) > 256 * 1024) fail("big hands should split into batches under 256 KB");
  if ([...bigDb._docs.values()].reduce((s, v) => s + Object.keys(v.hands).length, 0) !== 100) fail("all big hands should be saved");

  // Refused writes (for example a view-only share): fall back to this browser and keep the hand.
  const roLs = fakeLocalStorage();
  const c3 = ST.createStore({ claude: fakeClaude(mockDb({ readOnly: true })), localStorage: roLs });
  await c3.ready; await c3.add(some[1]);
  if (c3.kind !== "local" || !c3.error || c3.records.length !== 1 || !roLs.getItem(ST.LOCAL_KEY)) fail("refused cloud writes should fall back to the browser store");
  // No signed-in id: browser store.
  const c4 = ST.createStore({ claude: fakeClaude(mockDb(), null), localStorage: fakeLocalStorage() });
  await c4.ready;
  if (c4.kind !== "local") fail("without a user id the store should use the browser");

  if (problems) { console.log(`${problems} problem(s) found`); process.exit(1); }
  console.log("All checks passed");
})().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });
