/* Practice hands. Deals a scenario at any seat against one to three opponents, each holding a hand from the
   chart range his preflop action implies, and plays them with the opponent model in villain.js.
   Keeps the pot and stacks, asks you for decisions, and grades each one (coach.js) with a range read (reads.js).
   No page code here, so tests can play thousands of hands.

   const st = PB.newHand({players: 9});   // st.prompt = {kind, text, options}
   const d = PB.choose(st, "raise");       // d = the graded decision; st moves on to the next prompt or ends
   PB.expectedChoice(st)                  // the guide's answer for the current prompt (used by tests)
   newHand({reads: false}) skips range reads (faster bulk tests). */
(function (root) {
"use strict";
function need(key, file) { return (root.PB && root.PB[key]) ? root.PB : require(file); }
var K = need("evaluate", "./cards.js");
var E = need("analyze", "./engine.js");
var TB = need("seatsFor", "./table.js");
var D = need("PRE", "./data.js");
var C = need("judgePre", "./coach.js");
var V = need("villainPolicy", "./villain.js");
var RD = need("readHand", "./reads.js");

var STACK = 100;
var VILLAINS = V.VILLAIN_TYPES;
var NEXT = { flop: "turn", turn: "river" };
var BET_FRAC = {
  flop:  { value: 0.42, light: 0.58, vp: 0.85, thin: 0.42, prot: 0.70, semi: 0.62, bluff: 0.33 },
  turn:  { value: 0.70, light: 0.70, vp: 0.85, thin: 0.58, prot: 0.70, semi: 0.70, bluff: 0.66 },
  river: { value: 0.85, light: 0.85, vp: 0.85, thin: 0.50, prot: 0.42, semi: 0.70, bluff: 0.70 }
};
var RAISE_MULT = { value: 3, vp: 3.5, semi: 3 };
// Calling stations call with their chart's call range plus these.
var LOOSE_EXTRA = "22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, ATo+, KTo+, QTo+, JTo";

function round(x) { return Math.max(1, Math.round(x * 2) / 2); }
function bb(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + "bb"; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function weighted(rng, items) { // [[value, weight], ...]
  var total = items.reduce(function (s, i) { return s + i[1]; }, 0), r = rng() * total;
  for (var i = 0; i < items.length; i++) { r -= items[i][1]; if (r <= 0) return items[i][0]; }
  return items[items.length - 1][0];
}
function listText(seats, verb1, verbN) { return seats.join(", ") + (seats.length > 1 ? verbN : verb1); }

/* ---------- cards and ranges ---------- */
function take(st, cards) { cards.forEach(function (c) { st.used.add(c); }); return cards; }
function randomCard(st) {
  var c;
  do { c = Math.floor(st.rng() * 52); } while (st.used.has(c));
  st.used.add(c);
  return c;
}
function dealFromKeys(st, keys) {
  var combos = [];
  keys.forEach(function (k) { combos.push.apply(combos, K.combosOf(k, st.used)); });
  if (!combos.length) return take(st, [randomCard(st), randomCard(st)]);
  return take(st, pick(st.rng, combos).slice());
}
function rangeKeys(str) { return C.rangeSet(str); }
function union() {
  var out = new Set();
  for (var i = 0; i < arguments.length; i++) arguments[i].forEach(function (k) { out.add(k); });
  return out;
}
function minus(a, b) { var out = new Set(); a.forEach(function (k) { if (!b.has(k)) out.add(k); }); return out; }
function intersect(a, b) { var out = new Set(); a.forEach(function (k) { if (b.has(k)) out.add(k); }); return out; }
function combosIn(keys) { var n = 0; keys.forEach(function (k) { n += k.length === 2 ? 6 : k[2] === "s" ? 4 : 12; }); return n; }
function pctOfHands(keys) { return Math.round(combosIn(keys) / 1326 * 100); }
// Your hand: mostly from the hands that matter in this spot, sometimes borderline, sometimes random.
function dealHero(st, primary, near) {
  var r = st.rng();
  if (r < 0.6 && primary.size) return dealFromKeys(st, primary);
  if (r < 0.8 && near.size) return dealFromKeys(st, near);
  return take(st, [randomCard(st), randomCard(st)]);
}

/* ---------- players ---------- */
function blindOf(seat) { return seat === "SB" ? 0.5 : seat === "BB" ? 1 : 0; }
function randomType(st) { return weighted(st.rng, [["nit", 1], ["typ", 2], ["agg", 1], ["loose", 1.2]]); }
function addOpp(st, seat) {
  var type = randomType(st);
  var v = { id: "v" + st.opps.length, seat: seat, type: type, name: VILLAINS[type], cards: null, in: blindOf(seat), folded: false,
    prior: null, priorText: "", priorPct: 0, obs: [], cls: null };
  st.opps.push(v);
  syncMain(st);
  return v;
}
function setRange(v, keys, text) { v.prior = keys; v.priorText = text; v.priorPct = pctOfHands(keys); }
function dealOpp(st, v, keys, text) { setRange(v, keys, text); v.cards = dealFromKeys(st, keys); }
function callKeys(v, spot) {
  var keys = rangeKeys(C.callRangeOf(spot, v.seat) || "");
  if (v.type === "loose") keys = minus(union(keys, rangeKeys(LOOSE_EXTRA)), union(rangeKeys(spot.value), rangeKeys(spot.bluff)));
  return keys;
}
function active(st) { return st.opps.filter(function (v) { return !v.folded; }); }
function oppById(st, id) { return st.opps.filter(function (v) { return v.id === id; })[0]; }
// The "main" opponent, for the parts of the page and the record that show one villain.
function syncMain(st) {
  var m = active(st)[0] || st.opps[0];
  if (!m) return;
  st.villain = m.cards; st.villainSeat = m.seat; st.villainType = m.type; st.villainName = m.name;
}
function typeFor5(type) { return type === "loose" ? "typ" : type; }

/* ---------- money ---------- */
function deadBlinds(st) {
  var seats = [st.heroSeat].concat(st.opps.map(function (v) { return v.seat; })), d = 0;
  if (st.seats.indexOf("SB") >= 0 && seats.indexOf("SB") < 0) d += 0.5;
  if (seats.indexOf("BB") < 0) d += 1;
  return d;
}
function pot(st) { return st.heroIn + st.opps.reduce(function (s, v) { return s + v.in; }, 0) + deadBlinds(st); }
function inOf(st, id) { return id === "hero" ? st.heroIn : oppById(st, id).in; }
function addIn(st, id, x) { if (id === "hero") st.heroIn += x; else oppById(st, id).in += x; }
function left(st, id) { return STACK - inOf(st, id); }
function seatOf(st, id) { return id === "hero" ? st.heroSeat : oppById(st, id).seat; }
function postOrder(st) { return ["SB", "BB"].concat(st.seats.filter(function (s) { return s !== "SB" && s !== "BB"; })); }
function postflopIP(st, a, b) { var o = postOrder(st); return o.indexOf(a) > o.indexOf(b); }

function log(st, text, who) { st.log.push({ street: st.street, who: who || "", text: text }); }

/* ---------- a new hand ---------- */
function newHand(cfg) {
  cfg = cfg || {};
  var rng = cfg.rng || Math.random, n = cfg.players || 6, seats = TB.seatsFor(n);
  var st = {
    rng: rng, readRng: K.seededRandom(Math.floor(rng() * 2147483647)), reads: cfg.reads !== false,
    players: n, seats: seats, used: new Set(), hero: null, heroSeat: null, heroIn: 0, opps: [],
    villain: null, villainSeat: null, villainType: null, villainName: "",
    street: "preflop", board: [], log: [], decisions: [], prompt: null, done: false, result: null,
    preAggressor: null, aggressor: null, heroIP: null, round: null, order: [], queue: [],
    prevCheckedThrough: false, villainBarrels: 0, villainChecked: {}, heroAn: null, heroPrevAn: null, sawFlop: 0
  };
  var heroIdx = Math.floor(rng() * n);
  st.heroSeat = seats[heroIdx];
  st.heroIn = blindOf(st.heroSeat);
  var canRfi = st.heroSeat !== "BB", canFaceOpen = heroIdx > 0;
  var type = !canFaceOpen ? "rfi" : !canRfi ? "vsopen" : (rng() < 0.5 ? "rfi" : "vsopen");
  if (type === "rfi") setupRfi(st, heroIdx); else setupVsOpen(st, heroIdx);
  return st;
}
function openTier(st, seat) { return TB.tierOf(st.seats, seat); }

function setupRfi(st, heroIdx) {
  var tier = openTier(st, st.heroSeat), order = ["vep", "ep", "hj", "co", "sb", "btn"];
  var primary = rangeKeys(C.spotOf("open", tier).value);
  var looser = order[order.indexOf(tier) + 1];
  var near = looser ? minus(rangeKeys(C.spotOf("open", looser).value), primary) : new Set();
  st.hero = dealHero(st, primary, near);
  st.openSize = st.heroSeat === "SB" ? 3 : 2.5;
  log(st, heroIdx === 0 ? "You are first to act." : "Everyone folds to you.");
  st.prompt = {
    kind: "pre-rfi",
    text: (heroIdx === 0 ? "You are first to act" : "Folds to you") + " in the " + st.heroSeat + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "raise", label: "Raise to " + bb(st.openSize) }],
    judge: { kind: "pre-rfi", mode: "open", spotId: tier, raiseId: "raise", chart: st.heroSeat + " opening range, " + D.TIERS[tier] + " position" }
  };
}

function setupVsOpen(st, heroIdx) {
  var before = st.seats.slice(0, heroIdx);
  var opener = weighted(st.rng, before.map(function (seat) { return [seat, Math.max(1, rangeKeys(C.spotOf("open", openTier(st, seat)).value).size)]; }));
  var o = addOpp(st, opener);
  st.openSize = opener === "SB" ? 3 : 2.5;
  dealOpp(st, o, rangeKeys(C.spotOf("open", openTier(st, opener)).value), opener + " opening range (" + D.TIERS[openTier(st, opener)] + " position)");
  o.in = st.openSize;
  var oIdx = st.seats.indexOf(opener), between = st.seats.slice(oIdx + 1, heroIdx);
  // Sometimes a player between the opener and you calls first: multiway, and a squeeze spot for you.
  var caller = null;
  if (between.length && st.rng() < 0.35) {
    var cands = between.filter(function (s) { return s !== "SB" && s !== "BB"; });
    if (cands.length) {
      var seat = pick(st.rng, cands), spot = C.spotOf("3bet", TB.threeBetSpotId(st.seats, opener, seat));
      caller = addOpp(st, seat);
      var keys = callKeys(caller, spot);
      if (!keys.size) { st.opps.pop(); caller = null; syncMain(st); }
      else { dealOpp(st, caller, keys, seat + " calling range vs a " + opener + " open"); caller.in = st.openSize; }
    }
  }
  var id3 = TB.threeBetSpotId(st.seats, opener, st.heroSeat), spot3 = C.spotOf("3bet", id3);
  var primary = union(rangeKeys(spot3.value), rangeKeys(spot3.bluff), rangeKeys(C.callRangeOf(spot3, st.heroSeat)));
  st.hero = dealHero(st, primary, minus(rangeKeys(C.spotOf("open", "btn").value), primary));
  if (oIdx > 0) log(st, listText(st.seats.slice(0, oIdx), " folds.", " fold."));
  log(st, opener + " raises to " + bb(st.openSize) + ".", "villain");
  between.forEach(function (s) { log(st, s + (caller && caller.seat === s ? " calls." : " folds."), caller && caller.seat === s ? "villain" : ""); });
  var ncall = caller ? 1 : 0;
  st.squeeze = ncall > 0;
  st.threeTo = threeBetSize(st, st.heroSeat, opener) + ncall * st.openSize;
  st.prompt = {
    kind: "pre-vsopen",
    text: opener + " raises to " + bb(st.openSize) + (caller ? " and " + caller.seat + " calls" : "") + ". It's on you in the " + st.heroSeat + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(st.openSize - st.heroIn) }, { id: "3bet", label: (caller ? "Squeeze to " : "3-bet to ") + bb(st.threeTo) }],
    judge: { kind: "pre-vsopen", mode: "3bet", spotId: id3, seat: st.heroSeat, raiseId: "3bet", callers: ncall, chart: "3-bet chart, " + st.heroSeat + " vs " + opener + " open" }
  };
}

function threeBetSize(st, threeBettor, opener) {
  if (threeBettor === "BB" && opener === "SB") return 3 * st.openSize;
  if (threeBettor === "SB" || threeBettor === "BB") return 4 * st.openSize;
  return 3 * st.openSize;
}
function respondWeight(s) { return s === "BB" ? 3 : s === "SB" ? 1.6 : s === "BTN" ? 1.6 : s === "CO" ? 1.2 : 1; }

/* ---------- preflop actions ---------- */
function heroPreflop(st, kind, choice) {
  var v = active(st)[0];
  if (choice === "fold") { log(st, "You fold.", "hero"); return finish(st, active(st).map(function (x) { return x.id; }), "fold"); }
  if (kind === "pre-rfi") {
    st.heroIn = st.openSize; log(st, "You raise to " + bb(st.openSize) + ".", "hero");
    return respondToOpen(st);
  }
  if (kind === "pre-vsopen") {
    if (choice === "call") {
      st.heroIn = st.openSize; log(st, "You call.", "hero");
      blindsOverCall(st);
      st.preAggressor = st.opps[0].id; return startPostflop(st);
    }
    st.heroIn = st.threeTo; log(st, (st.squeeze ? "You squeeze to " : "You 3-bet to ") + bb(st.threeTo) + ".", "hero");
    st.opps.slice(1).forEach(function (c) { c.folded = true; log(st, c.seat + " folds.", "villain"); });
    syncMain(st);
    return villainVs3bet(st);
  }
  if (kind === "pre-vs3bet") {
    if (choice === "call") {
      addIn(st, "hero", v.in - st.heroIn); log(st, "You call.", "hero");
      st.preAggressor = v.id; return startPostflop(st);
    }
    var four = Math.round(v.in * (postflopIP(st, st.heroSeat, v.seat) ? 2.2 : 2.5) * 2) / 2;
    st.heroIn = four; log(st, "You 4-bet to " + bb(four) + ".", "hero");
    var jamRange = C.spotOf("5bet", typeFor5(v.type));
    if (!union(rangeKeys(jamRange.value), rangeKeys(jamRange.bluff)).has(K.handKey(v.cards))) { v.folded = true; log(st, v.seat + " folds.", "villain"); return finish(st, ["hero"], "fold"); }
    v.in = STACK; log(st, v.seat + " moves all-in (" + bb(STACK) + ").", "villain");
    st.prompt = {
      kind: "pre-vs5bet", text: v.seat + " moves all-in for " + bb(STACK) + ".",
      options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call all-in" }],
      judge: { kind: "pre-vs5bet", mode: "5bet", spotId: "face5", raiseId: "call", chart: "facing a 5-bet" }
    };
    return;
  }
  if (kind === "pre-vs4bet") {
    if (choice === "call") {
      st.heroIn = STACK; v.in = STACK;
      log(st, "You call. With so little behind, the rest goes in on the flop.", "hero");
      return runOut(st);
    }
    st.heroIn = STACK; log(st, "You move all-in.", "hero");
    var callRange = union(rangeKeys(C.spotOf("5bet", "face5").call), v.type === "agg" ? rangeKeys(C.spotOf("5bet", "agg").value) : new Set());
    if (!callRange.has(K.handKey(v.cards))) { v.folded = true; log(st, v.seat + " folds.", "villain"); return finish(st, ["hero"], "fold"); }
    v.in = STACK; log(st, v.seat + " calls.", "villain");
    return runOut(st);
  }
  if (kind === "pre-vs5bet") {
    st.heroIn = STACK; log(st, "You call.", "hero");
    return runOut(st);
  }
}

// You opened. The players behind you fold, call (one to three of them) or one 3-bets.
function respondToOpen(st) {
  var heroIdx = st.seats.indexOf(st.heroSeat), behind = st.seats.slice(heroIdx + 1);
  var spotFor = function (s) { return C.spotOf("3bet", TB.threeBetSpotId(st.seats, st.heroSeat, s)); };
  var scenario = weighted(st.rng, [["fold", 0.1], ["call1", 0.45], ["call2", 0.22], ["call3", 0.06], ["threebet", 0.17]]);
  if (scenario === "threebet") {
    var seat = weighted(st.rng, behind.map(function (s) { return [s, respondWeight(s)]; }));
    var v = addOpp(st, seat), spot = spotFor(seat);
    dealOpp(st, v, union(rangeKeys(spot.value), rangeKeys(spot.bluff)), seat + " 3-bet range vs your " + st.heroSeat + " open");
    var folded = behind.slice(0, behind.indexOf(seat));
    if (folded.length) log(st, listText(folded, " folds.", " fold."));
    var to = threeBetSize(st, seat, st.heroSeat);
    v.in = to; log(st, seat + " 3-bets to " + bb(to) + ".", "villain");
    var rest = behind.slice(behind.indexOf(seat) + 1);
    if (rest.length) log(st, listText(rest, " folds.", " fold."));
    var four = Math.round(to * (postflopIP(st, st.heroSeat, seat) ? 2.2 : 2.5) * 2) / 2;
    st.prompt = {
      kind: "pre-vs3bet", text: seat + " 3-bets to " + bb(to) + ".",
      options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(to - st.heroIn) }, { id: "4bet", label: "4-bet to " + bb(four) }],
      judge: { kind: "pre-vs3bet", mode: "4bet", spotId: TB.fourBetSpotId(st.seats, st.heroSeat), raiseId: "4bet", chart: "4-bet chart, you opened " + st.heroSeat }
    };
    return;
  }
  var want = scenario === "fold" ? 0 : +scenario.slice(4);
  var cands = behind.filter(function (s) { return C.callRangeOf(spotFor(s), s); });
  var callers = [];
  while (callers.length < want && cands.length) {
    var c = weighted(st.rng, cands.map(function (s) { return [s, respondWeight(s)]; }));
    callers.push(c); cands = cands.filter(function (s) { return s !== c; });
  }
  if (!callers.length) { log(st, "Everyone folds.", "villain"); return finish(st, ["hero"], "fold"); }
  behind.forEach(function (s) {
    if (callers.indexOf(s) < 0) { log(st, s + " folds."); return; }
    var v = addOpp(st, s);
    dealOpp(st, v, callKeys(v, spotFor(s)), s + " calling range vs your " + st.heroSeat + " open");
    v.in = st.openSize;
    log(st, s + " calls.", "villain");
  });
  st.preAggressor = "hero";
  startPostflop(st);
}

// You called an open: the blinds behind you sometimes come along.
function blindsOverCall(st) {
  var opener = st.opps[0].seat, heroIdx = st.seats.indexOf(st.heroSeat);
  st.seats.slice(heroIdx + 1).forEach(function (s) {
    var chance = s === "BB" ? 0.4 : s === "SB" ? 0.12 : 0;
    var spot = C.spotOf("3bet", TB.threeBetSpotId(st.seats, opener, s));
    if (s !== opener && chance && C.callRangeOf(spot, s) && st.rng() < chance) {
      var v = addOpp(st, s);
      var keys = callKeys(v, spot);
      if (keys.size) { dealOpp(st, v, keys, s + " calling range vs a " + opener + " open"); v.in = st.openSize; log(st, s + " calls.", "villain"); return; }
      st.opps.pop(); syncMain(st);
    }
    log(st, s + " folds.");
  });
}

// You 3-bet the opener: he 4-bets, calls or folds according to the 4-bet chart.
function villainVs3bet(st) {
  var v = active(st)[0];
  var spot = C.spotOf("4bet", TB.fourBetSpotId(st.seats, v.seat)), cat = C.catOf(spot, K.handKey(v.cards));
  if (cat === "f") { v.folded = true; log(st, v.seat + " folds.", "villain"); return finish(st, ["hero"], "fold"); }
  if (cat === "c") {
    v.in = st.heroIn; log(st, v.seat + " calls.", "villain");
    setRange(v, intersect(v.prior, rangeKeys(spot.call)), v.seat + " opened and called your 3-bet");
    st.preAggressor = "hero"; return startPostflop(st);
  }
  var four = Math.round(st.heroIn * (postflopIP(st, v.seat, st.heroSeat) ? 2.2 : 2.5) * 2) / 2;
  v.in = four; log(st, v.seat + " 4-bets to " + bb(four) + ".", "villain");
  st.prompt = {
    kind: "pre-vs4bet", text: v.seat + " 4-bets to " + bb(four) + ". Villain profile: " + v.name + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(four - st.heroIn) }, { id: "jam", label: "5-bet all-in" }],
    judge: { kind: "pre-vs4bet", mode: "5bet", spotId: typeFor5(v.type), raiseId: "jam", chart: "5-bet chart vs " + v.name.toLowerCase() + " player" }
  };
}

/* ---------- postflop ---------- */
function startPostflop(st) {
  st.aggressor = st.preAggressor;
  st.street = "flop";
  st.sawFlop = active(st).length;
  st.board = take(st, [randomCard(st), randomCard(st), randomCard(st)]);
  beginStreet(st);
}
function liveIds(st) {
  var po = postOrder(st);
  return ["hero"].concat(active(st).map(function (v) { return v.id; }))
    .sort(function (a, b) { return po.indexOf(seatOf(st, a)) - po.indexOf(seatOf(st, b)); });
}

function beginStreet(st) {
  st.round = { sb: {}, cur: 0, raises: 0, checks: 0, lastBettor: null, bettor: null, betFrac: 0, callers: [] };
  st.order = liveIds(st);
  st.order.forEach(function (id) { st.round.sb[id] = 0; });
  st.queue = st.order.filter(function (id) { return left(st, id) > 0; });
  st.heroIP = st.order[st.order.length - 1] === "hero";
  var prevBoard = st.street === "flop" ? null : st.board.slice(0, st.board.length - 1);
  st.heroPrevAn = st.heroAn;
  st.heroAn = E.analyze(st.hero, st.board, {
    prevBoard: prevBoard, prevInfo: st.heroPrevAn && st.heroPrevAn.info,
    hadDraw: !!(st.heroPrevAn && (st.heroPrevAn.sub === "strong" || st.heroPrevAn.sub === "draw"))
  });
  var table = E.rankTable(st.board);
  active(st).forEach(function (v) { v.cls = E.quickClass(v.cards, st.board, table); });
  var n = st.order.length;
  log(st, cap(st.street) + ": " + K.cardsText(st.street === "flop" ? st.board : st.board.slice(-1)) + " · pot " + bb(pot(st)) + (n > 2 ? " · " + n + " players" : ""));
  advance(st);
}

function advance(st) {
  var guard = 0;
  while (!st.done && guard++ < 80) {
    if (!st.queue.length) { endStreet(st); return nextStreet(st); }
    var id = st.queue[0];
    if (id === "hero") { st.prompt = makePrompt(st); return; }
    villainActs(st, oppById(st, id));
  }
}

function endStreet(st) {
  var b = st.round.lastBettor;
  if (b) { st.aggressor = b; st.prevCheckedThrough = false; if (b !== "hero") st.villainBarrels++; }
  else st.prevCheckedThrough = true;
}
function nextStreet(st) {
  var canAct = st.order.filter(function (id) { return id === "hero" || !oppById(st, id).folded; }).filter(function (id) { return left(st, id) > 0; });
  if (canAct.length <= 1) return runOut(st);
  if (st.street === "river") return showdown(st);
  st.street = NEXT[st.street];
  st.board.push(randomCard(st));
  beginStreet(st);
}

function act(st, id, type, to) {
  var r = st.round, name = id === "hero" ? "You" : seatOf(st, id), you = id === "hero";
  if (type === "check") {
    st.queue.shift(); r.checks++;
    if (!you) st.villainChecked[st.street] = true;
    return log(st, name + (you ? " check." : " checks."), you ? "hero" : "villain");
  }
  if (type === "fold") {
    st.queue.shift();
    log(st, name + (you ? " fold." : " folds."), you ? "hero" : "villain");
    if (you) return finish(st, active(st).map(function (v) { return v.id; }), "fold");
    oppById(st, id).folded = true; syncMain(st);
    st.order = st.order.filter(function (x) { return x !== id; });
    if (!active(st).length) return finish(st, ["hero"], "fold");
    return;
  }
  if (type === "call") {
    st.queue.shift();
    var need = Math.min(r.cur - r.sb[id], left(st, id));
    r.sb[id] += need; addIn(st, id, need);
    if (r.bettor) r.callers.push(id);
    return log(st, name + (you ? " call " : " calls ") + bb(need) + (left(st, id) <= 0 ? " (all-in)" : "") + ".", you ? "hero" : "villain");
  }
  // bet or raise; `to` = this player's total on this street
  to = Math.min(to, r.sb[id] + left(st, id));
  var potBefore = pot(st), add = to - r.sb[id];
  r.betFrac = (to - r.cur) / Math.max(1, potBefore + (r.cur - r.sb[id]));
  r.sb[id] = to; addIn(st, id, add);
  if (type === "raise") r.raises++;
  r.cur = to; r.lastBettor = id; r.bettor = id; r.callers = []; r.potBefore = potBefore;
  var i = st.order.indexOf(id);
  st.queue = st.order.slice(i + 1).concat(st.order.slice(0, i)).filter(function (x) { return left(st, x) > 0; });
  var verb = type === "bet" ? (you ? " bet " : " bets ") : (you ? " raise to " : " raises to ");
  log(st, name + verb + bb(to) + (left(st, id) <= 0 ? " (all-in)" : "") + (type === "bet" ? " into " + bb(potBefore) : "") + ".", you ? "hero" : "villain");
}

function makePrompt(st) {
  var r = st.round, owe = r.cur - r.sb.hero, kind = owe <= 0 ? "open" : r.raises === 0 ? "vsBet" : "vsRaise";
  var opps = active(st), multi = opps.length >= 2;
  var opts = C.OPTIONS[C.optionKey(kind, st.street)].map(function (o) { return Object.assign({}, o); });
  var p = pot(st), text, bettor = r.bettor ? oppById(st, r.bettor) : null;
  if (kind === "open") {
    var first = r.checks === 0;
    var checked = st.order.slice(0, st.order.indexOf("hero")).map(function (id) { return seatOf(st, id); });
    text = cap(st.street) + ", pot " + bb(p) + (multi ? ", " + (opps.length + 1) + " players" : "") + ". " +
      (first ? "You act first." : checked.length === 1 ? checked[0] + " checks to you." : "It's checked to you.");
    opts.forEach(function (o) { if (o.id.indexOf("bet:") === 0) o.size = sizeHint(st, BET_FRAC[st.street][o.id.slice(4)], p); });
  } else {
    var callers = r.callers.filter(function (x) { return x !== "hero"; }).map(function (x) { return seatOf(st, x); });
    text = kind === "vsBet"
      ? bettor.seat + " bets " + bb(r.cur) + " into " + bb(r.potBefore) + " (" + Math.round(r.betFrac * 100) + "% of the pot)."
      : bettor.seat + " raises to " + bb(r.cur) + ".";
    if (callers.length) text += " " + listText(callers, " calls.", " call.");
    text += " You need " + bb(Math.min(owe, left(st, "hero"))) + (kind === "vsBet" ? " to call." : " more to call.");
    if (left(st, bettor.id) <= 0 || left(st, "hero") <= owe) opts = opts.filter(function (o) { return o.id === "fold" || o.id === "call"; });
    opts.forEach(function (o) {
      if (o.id === "call") o.size = bb(Math.min(owe, left(st, "hero")));
      if (o.id.indexOf("raise:") === 0) o.size = "to " + bb(Math.min(round(RAISE_MULT[o.id.slice(6)] * r.cur), r.sb.hero + left(st, "hero")));
      if (o.id === "jam") o.size = bb(r.sb.hero + left(st, "hero"));
    });
  }
  return {
    kind: kind, text: text, options: opts,
    ctx: {
      kind: kind, street: st.street, role: st.aggressor === "hero" ? "agg" : "def", pos: st.heroIP ? "ip" : "oop",
      an: st.heroAn, board: st.board.slice(), villainType: (bettor || opps[0]).type, prevCheckedThrough: st.prevCheckedThrough,
      betFrac: kind === "open" ? 0 : r.betFrac, villainBarrels: st.villainBarrels, villainCheckedTurn: !!st.villainChecked.turn,
      canRaise: kind === "open" ? true : opts.some(function (o) { return o.id === "jam" || o.id.indexOf("raise:") === 0; }),
      opponents: opps.length, multiway: multi, owe: Math.max(0, Math.min(owe, left(st, "hero"))), pot: p
    }
  };
}
function sizeHint(st, frac, p) {
  var amt = Math.min(round(frac * p), left(st, "hero"));
  return "≈" + Math.round(frac * 100) + "% · " + bb(amt);
}

/* ---------- the opponents ---------- */
function situation(st, v) {
  var r = st.round, owe = r.cur - r.sb[v.id];
  return {
    street: st.street, owe: owe > 0, role: st.aggressor === v.id ? "agg" : "def", first: r.cur === 0 && r.checks === 0,
    raises: r.raises, betFrac: owe > 0 ? Math.round(r.betFrac * 100) / 100 : 0, type: v.type,
    multi: st.order.length >= 3, canRaise: left(st, v.id) > owe && r.raises < 2
  };
}
function sample(rng, probs) {
  var r = rng(), keys = Object.keys(probs), last = null;
  for (var i = 0; i < keys.length; i++) { if (!probs[keys[i]]) continue; last = keys[i]; r -= probs[keys[i]]; if (r <= 0) return keys[i]; }
  return last;
}
function villainActs(st, v) {
  var x = situation(st, v), probs = V.villainPolicy(v.cls, x), action = sample(st.rng, probs), size = 0, r = st.round;
  if (action === "bet") {
    size = weighted(st.rng, V.betSizes(v.cls, x));
    var amt = round(size * pot(st));
    if (amt >= 0.7 * left(st, v.id)) amt = left(st, v.id);
    act(st, v.id, "bet", amt);
  } else if (action === "raise") {
    var to = round(3 * r.cur);
    if (to - r.sb[v.id] >= 0.7 * left(st, v.id)) to = r.sb[v.id] + left(st, v.id);
    act(st, v.id, "raise", to);
  } else act(st, v.id, action);
  v.obs.push({ street: st.street, board: st.board.slice(), x: x, action: action, size: size });
}

/* ---------- your decisions ---------- */
function heroPostflop(st, choice) {
  var p = pot(st), r = st.round;
  if (choice === "check" || choice === "fold" || choice === "call") return act(st, "hero", choice);
  if (choice === "jam") return act(st, "hero", "raise", r.sb.hero + left(st, "hero"));
  if (choice.indexOf("bet:") === 0) {
    var amt = round(BET_FRAC[st.street][choice.slice(4)] * p);
    if (amt >= 0.7 * left(st, "hero")) amt = left(st, "hero");
    return act(st, "hero", "bet", amt);
  }
  var to = round(RAISE_MULT[choice.slice(6)] * r.cur);
  if (to - r.sb.hero >= 0.7 * left(st, "hero")) to = r.sb.hero + left(st, "hero");
  return act(st, "hero", "raise", to);
}

function expectedChoice(st) {
  var p = st.prompt;
  if (!p) return null;
  if (p.kind.indexOf("pre-") === 0) return C.judgePre(Object.assign({}, p.judge, { key: K.handKey(st.hero), choice: "__" })).best;
  return C.postAnswer(p.ctx).best;
}

// What kind of play a choice is, for matching it against the range read.
function playClass(id) {
  if (id === "fold" || id === "call" || id === "check") return id;
  if (id === "bet:bluff" || id === "bet:semi" || id === "raise:semi") return "bluff";
  return "value";
}

function choose(st, id) {
  var p = st.prompt;
  if (!p || st.done) return null;
  if (!p.options.some(function (o) { return o.id === id; })) throw new Error("Not an option here: " + id);
  var label = p.options.filter(function (o) { return o.id === id; })[0].label;
  var d = { n: st.decisions.length + 1, street: st.street, kind: p.kind, situation: p.text, choice: id, choiceLabel: label,
    options: p.options.map(function (o) { return o.label; }), board: st.board.slice(), pot: pot(st) };
  if (p.kind.indexOf("pre-") === 0) {
    var j = C.judgePre(Object.assign({}, p.judge, { key: K.handKey(st.hero), choice: id }));
    d.verdict = j.verdict; d.best = j.best;
    var bestOpt = p.options.filter(function (o) { return o.id === j.best; })[0];
    d.bestLabel = bestOpt ? bestOpt.label : C.optionLabel(j.best);
    d.guide = j.text; d.why = j.note; d.handText = K.handKey(st.hero) + " (" + K.cardsText(st.hero) + ")";
    d.equal = []; d.handKey = K.handKey(st.hero); d.chartCat = j.cat; d.chart = p.judge.mode + ":" + p.judge.spotId;
    st.prompt = null;
    heroPreflop(st, p.kind, id);
  } else {
    var a = C.postAnswer(p.ctx);
    d.verdict = C.grade(a, id); d.best = a.best; d.bestLabel = C.optionLabel(a.best);
    d.equalLabels = a.equal.map(C.optionLabel);
    d.guide = a.guide; d.path = a.path; d.why = a.why;
    d.handText = E.explain(st.heroAn); d.bucket = st.heroAn.label;
    d.equal = a.equal.slice(); d.bucketId = st.heroAn.bucket; d.sub = st.heroAn.sub;
    d.role = p.ctx.role; d.pos = p.ctx.pos; d.betPct = Math.round(p.ctx.betFrac * 100);
    d.opponents = p.ctx.opponents; d.multiway = p.ctx.multiway;
    if (st.reads) {
      var testId = a.best.indexOf("bet:") === 0 ? a.best : id.indexOf("bet:") === 0 ? id : "bet:thin";
      d.read = RD.readHand(st, { betFrac: BET_FRAC[st.street][testId.slice(4)] || 0.5 });
      // The guide is the standard, but a play the range read clearly supports is never a plain mistake.
      if (d.verdict === "mistake" && d.read.supports[playClass(id)]) { d.verdict = "almost"; d.rangeBacked = true; }
    }
    st.prompt = null;
    heroPostflop(st, id);
    if (!st.done) advance(st);
  }
  st.decisions.push(d);
  return d;
}

/* ---------- the end ---------- */
function runOut(st) {
  if (st.street === "preflop") { st.street = "flop"; st.sawFlop = active(st).length; }
  var before = st.board.length;
  while (st.board.length < 5) st.board.push(randomCard(st));
  if (st.board.length > before) log(st, "Board runs out: " + K.cardsText(st.board) + ".");
  showdown(st);
}
function showdown(st) {
  var players = ["hero"].concat(active(st).map(function (v) { return v.id; }));
  var score = {}, names = {}, best = -1;
  players.forEach(function (id) {
    score[id] = K.evaluate((id === "hero" ? st.hero : oppById(st, id).cards).concat(st.board));
    names[id] = K.handName(score[id]);
    if (score[id] > best) best = score[id];
  });
  players.forEach(function (id) {
    var same = players.some(function (o) { return o !== id && names[o] === names[id]; });
    if (same) names[id] = K.handName(score[id], true);
  });
  var winners = players.filter(function (id) { return score[id] === best; });
  var main = active(st)[0];
  st.showdown = { hero: names.hero, villain: main ? names[main.id] : "",
    all: active(st).map(function (v) { return { seat: v.seat, name: v.name, cards: K.cardsText(v.cards), hand: names[v.id] }; }) };
  active(st).forEach(function (v) { log(st, v.seat + " shows " + K.cardsText(v.cards) + " (" + names[v.id] + ")."); });
  log(st, "You have " + names.hero + ".");
  finish(st, winners, "showdown");
}
function finish(st, winners, how) {
  st.done = true; st.prompt = null;
  var p = pot(st), heroWins = winners.indexOf("hero") >= 0;
  var share = heroWins ? p / winners.length : 0, net = share - st.heroIn;
  var text = heroWins && winners.length > 1 ? "Split pot: you get back " + bb(share) + "." : heroWins ? "You win " + bb(net) + "." : "You lose " + bb(st.heroIn) + ".";
  if (heroWins && winners.length > 1 && Math.abs(net) < 0.05) text = "Split pot.";
  st.result = { winner: heroWins ? (winners.length > 1 ? "split" : "hero") : "villain", how: how, net: Math.round(net * 10) / 10, text: text };
  log(st, text);
}

/* ---------- the database record for a finished hand ----------
   Plain JSON, about 1 KB per hand. Cards are text such as "A♥K♦" (cards.js parseCards reads them back).
   Each decision keeps what the judge saw: the guide's answer (best, plus `also` for equally good answers),
   the verdict, the chart (preflop) or the bucket, role, position and number of opponents (postflop),
   the guide's text, and the range read's key numbers. */
function newId(ts) { return "h" + ts.toString(36) + Math.floor(Math.random() * 1679616).toString(36); }
function toRecord(st, ts) {
  ts = ts || Date.now();
  var r1 = function (x) { return Math.round(x * 10) / 10; }, r2 = function (x) { return Math.round(x * 100) / 100; };
  var main = st.opps[0];
  return {
    id: newId(ts), v: 2, ts: ts, players: st.players,
    seat: st.heroSeat, villainSeat: main ? main.seat : "", villainType: main ? main.type : "",
    hole: K.cardsText(st.hero), villainHole: main && main.cards ? K.cardsText(main.cards) : "", board: K.cardsText(st.board),
    villains: st.opps.map(function (v) { return { seat: v.seat, type: v.type, hole: v.cards ? K.cardsText(v.cards) : "", folded: v.folded, range: v.priorText }; }),
    sawFlop: st.sawFlop + (st.sawFlop ? 1 : 0),
    net: st.result.net, winner: st.result.winner, how: st.result.how,
    showdown: st.showdown ? { hero: st.showdown.hero, villain: st.showdown.villain } : null,
    decisions: st.decisions.map(function (d) {
      var o = {
        street: d.street, kind: d.kind, choice: d.choice, choiceLabel: d.choiceLabel, best: d.best, bestLabel: d.bestLabel,
        also: d.equal || [], verdict: d.verdict, board: K.cardsText(d.board), pot: r1(d.pot), situation: d.situation, guide: d.guide
      };
      if (d.street === "preflop") { o.handKey = d.handKey; o.chartCat = d.chartCat; o.chart = d.chart; }
      else {
        o.bucket = d.bucketId; if (d.sub) o.sub = d.sub;
        o.role = d.role; o.pos = d.pos; o.path = d.path; o.opponents = d.opponents; o.multiway = !!d.multiway;
        if (d.kind !== "open") o.betPct = d.betPct;
        if (d.read) {
          o.read = { equity: r2(d.read.equity), ahead: r2(d.read.ahead), insight: d.read.insight };
          if (d.read.needed != null) o.read.needed = r2(d.read.needed);
          if (d.read.bet) { o.read.fold = r2(d.read.bet.allFold); o.read.worseCalls = r2(d.read.bet.worse); o.read.betterContinues = r2(d.read.bet.better); }
        }
        if (d.rangeBacked) o.rangeBacked = true;
      }
      return o;
    })
  };
}

var api = { newHand: newHand, choose: choose, expectedChoice: expectedChoice, toRecord: toRecord, potOf: pot, stackOf: left, bbText: bb, VILLAINS: VILLAINS, BET_FRAC: BET_FRAC };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
