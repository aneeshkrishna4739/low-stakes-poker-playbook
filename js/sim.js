/* Practice hands. Deals a scenario at any seat, plays one opponent from the guide's own ranges
   and a loose-passive low-stakes profile, keeps the pot and stacks, and asks you for decisions.
   coach.js grades every decision. No page code here, so tests can play thousands of hands.

   const st = PB.newHand({players: 9});   // st.prompt = {kind, text, options}
   const d = PB.choose(st, "raise");       // d = the graded decision; st moves on to the next prompt or ends
   PB.expectedChoice(st)                  // the guide's answer for the current prompt (used by tests) */
(function (root) {
"use strict";
function need(key, file) { return (root.PB && root.PB[key]) ? root.PB : require(file); }
var K = need("evaluate", "./cards.js");
var E = need("analyze", "./engine.js");
var TB = need("seatsFor", "./table.js");
var D = need("PRE", "./data.js");
var C = need("judgePre", "./coach.js");

var STACK = 100;
var VILLAINS = { nit: "Nit", typ: "Unknown", agg: "Aggressive" };
var STREET_CARDS = { flop: 3, turn: 4, river: 5 };
var NEXT = { flop: "turn", turn: "river" };
var BET_FRAC = {
  flop:  { value: 0.42, light: 0.58, vp: 0.85, thin: 0.42, prot: 0.70, semi: 0.62, bluff: 0.33 },
  turn:  { value: 0.70, light: 0.70, vp: 0.85, thin: 0.58, prot: 0.70, semi: 0.70, bluff: 0.66 },
  river: { value: 0.85, light: 0.85, vp: 0.85, thin: 0.50, prot: 0.42, semi: 0.70, bluff: 0.70 }
};
var RAISE_MULT = { value: 3, vp: 3.5, semi: 3 };

function round(x) { return Math.max(1, Math.round(x * 2) / 2); }
function bb(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + "bb"; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function weighted(rng, items) { // [[value, weight], ...]
  var total = items.reduce(function (s, i) { return s + i[1]; }, 0), r = rng() * total;
  for (var i = 0; i < items.length; i++) { r -= items[i][1]; if (r <= 0) return items[i][0]; }
  return items[items.length - 1][0];
}

/* ---------- cards ---------- */
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
// Hero's hand: mostly from the hands that matter in this spot, sometimes borderline, sometimes random.
function dealHero(st, primary, near) {
  var r = st.rng();
  if (r < 0.6 && primary.size) return dealFromKeys(st, primary);
  if (r < 0.8 && near.size) return dealFromKeys(st, near);
  return take(st, [randomCard(st), randomCard(st)]);
}

/* ---------- money ---------- */
function deadMoney(st) {
  var d = 0;
  if (st.heroSeat !== "SB" && st.villainSeat !== "SB") d += 0.5;
  if (st.heroSeat !== "BB" && st.villainSeat !== "BB") d += 1;
  return d;
}
function pot(st) { return st.heroIn + st.villainIn + deadMoney(st); }
function left(st, who) { return STACK - st[who + "In"]; }
function blindOf(seat) { return seat === "SB" ? 0.5 : seat === "BB" ? 1 : 0; }

function log(st, text, who) { st.log.push({ street: st.street, who: who || "", text: text }); }

/* ---------- a new hand ---------- */
function openSpotId(st, seat) { return TB.tierOf(st.seats, seat); }

function newHand(cfg) {
  cfg = cfg || {};
  var rng = cfg.rng || Math.random, n = cfg.players || 6, seats = TB.seatsFor(n);
  var st = {
    rng: rng, players: n, seats: seats, used: new Set(), hero: null, villain: null,
    heroSeat: null, villainSeat: null, villainType: weighted(rng, [["nit", 1], ["typ", 2], ["agg", 1]]),
    heroIn: 0, villainIn: 0, street: "preflop", board: [], log: [], decisions: [],
    prompt: null, done: false, result: null, preAggressor: null, aggressor: null, heroIP: null,
    sb: { hero: 0, villain: 0 }, raises: 0, checks: 0, lastBettor: null, streetOver: false,
    prevCheckedThrough: false, villainBarrels: 0, villainChecked: {}, heroAn: null, villainAn: null, heroPrevAn: null, villainPrevAn: null
  };
  st.villainName = VILLAINS[st.villainType];
  var heroIdx = Math.floor(rng() * n);
  st.heroSeat = seats[heroIdx];
  st.heroIn = blindOf(st.heroSeat);
  var canRfi = st.heroSeat !== "BB", canFaceOpen = heroIdx > 0;
  var type = !canFaceOpen ? "rfi" : !canRfi ? "vsopen" : (rng() < 0.5 ? "rfi" : "vsopen");
  if (type === "rfi") setupRfi(st, heroIdx); else setupVsOpen(st, heroIdx);
  return st;
}

function setupRfi(st, heroIdx) {
  var tier = openSpotId(st, st.heroSeat), order = ["vep", "ep", "hj", "co", "sb", "btn"];
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
  var opener = weighted(st.rng, before.map(function (seat) {
    var spot = C.spotOf("open", openSpotId(st, seat));
    return [seat, Math.max(1, rangeKeys(spot.value).size)];
  }));
  st.villainSeat = opener;
  st.villain = dealFromKeys(st, rangeKeys(C.spotOf("open", openSpotId(st, opener)).value));
  st.openSize = opener === "SB" ? 3 : 2.5;
  st.villainIn = st.openSize;
  var id3 = TB.threeBetSpotId(st.seats, opener, st.heroSeat), spot = C.spotOf("3bet", id3);
  var primary = union(rangeKeys(spot.value), rangeKeys(spot.bluff), rangeKeys(C.callRangeOf(spot, st.heroSeat)));
  st.hero = dealHero(st, primary, minus(rangeKeys(C.spotOf("open", "btn").value), primary));
  var oIdx = st.seats.indexOf(opener);
  if (oIdx > 0) log(st, st.seats.slice(0, oIdx).join(", ") + (oIdx > 1 ? " fold." : " folds."));
  log(st, opener + " raises to " + bb(st.openSize) + ".", "villain");
  var between = st.seats.slice(oIdx + 1, heroIdx);
  if (between.length) log(st, between.join(", ") + (between.length > 1 ? " fold." : " folds."));
  var threeTo = threeBetSize(st, st.heroSeat, opener);
  st.prompt = {
    kind: "pre-vsopen",
    text: opener + " raises to " + bb(st.openSize) + ". It's on you in the " + st.heroSeat + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(st.openSize - st.heroIn) }, { id: "3bet", label: "3-bet to " + bb(threeTo) }],
    judge: { kind: "pre-vsopen", mode: "3bet", spotId: id3, seat: st.heroSeat, raiseId: "3bet", chart: "3-bet chart, " + st.heroSeat + " vs " + opener + " open" }
  };
  st.threeTo = threeTo;
}

function threeBetSize(st, threeBettor, opener) {
  if (threeBettor === "BB" && opener === "SB") return 3 * st.openSize;
  if (threeBettor === "SB" || threeBettor === "BB") return 4 * st.openSize;
  return 3 * st.openSize;
}
function postflopIP(st, a, b) { // is seat a in position against seat b after the flop?
  var order = ["SB", "BB"].concat(st.seats.filter(function (s) { return s !== "SB" && s !== "BB"; }));
  return order.indexOf(a) > order.indexOf(b);
}

/* ---------- preflop actions ---------- */
function heroPreflop(st, kind, choice) {
  if (choice === "fold") { log(st, "You fold.", "hero"); return finish(st, "villain", "fold"); }
  if (kind === "pre-rfi") {
    st.heroIn = st.openSize; log(st, "You raise to " + bb(st.openSize) + ".", "hero");
    return villainVsOpen(st);
  }
  if (kind === "pre-vsopen") {
    if (choice === "call") {
      st.heroIn = st.openSize; log(st, "You call.", "hero");
      st.preAggressor = "villain"; return startPostflop(st);
    }
    st.heroIn = st.threeTo; log(st, "You 3-bet to " + bb(st.threeTo) + ".", "hero");
    return villainVs3bet(st);
  }
  if (kind === "pre-vs3bet") {
    if (choice === "call") {
      st.heroIn = st.villainIn; log(st, "You call.", "hero");
      st.preAggressor = "villain"; return startPostflop(st);
    }
    var four = Math.round(st.villainIn * (postflopIP(st, st.heroSeat, st.villainSeat) ? 2.2 : 2.5) * 2) / 2;
    st.heroIn = four; log(st, "You 4-bet to " + bb(four) + ".", "hero");
    var jamRange = C.spotOf("5bet", st.villainType);
    var jams = union(rangeKeys(jamRange.value), rangeKeys(jamRange.bluff)).has(K.handKey(st.villain));
    if (!jams) { log(st, st.villainSeat + " folds.", "villain"); return finish(st, "hero", "fold"); }
    st.villainIn = STACK; log(st, st.villainSeat + " moves all-in (" + bb(STACK) + ").", "villain");
    st.prompt = {
      kind: "pre-vs5bet", text: st.villainSeat + " moves all-in for " + bb(STACK) + ".",
      options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call all-in" }],
      judge: { kind: "pre-vs5bet", mode: "5bet", spotId: "face5", raiseId: "call", chart: "facing a 5-bet" }
    };
    return;
  }
  if (kind === "pre-vs4bet") {
    if (choice === "call") {
      st.heroIn = STACK; st.villainIn = STACK;
      log(st, "You call. With so little behind, the rest goes in on the flop.", "hero");
      return runOut(st);
    }
    st.heroIn = STACK; log(st, "You move all-in.", "hero");
    var callRange = union(rangeKeys(C.spotOf("5bet", "face5").call), st.villainType === "agg" ? rangeKeys(C.spotOf("5bet", "agg").value) : new Set());
    if (!callRange.has(K.handKey(st.villain))) { log(st, st.villainSeat + " folds.", "villain"); return finish(st, "hero", "fold"); }
    st.villainIn = STACK; log(st, st.villainSeat + " calls.", "villain");
    return runOut(st);
  }
  if (kind === "pre-vs5bet") {
    st.heroIn = STACK; log(st, "You call.", "hero");
    return runOut(st);
  }
}

// You opened: one player behind you responds.
function villainVsOpen(st) {
  var heroIdx = st.seats.indexOf(st.heroSeat), behind = st.seats.slice(heroIdx + 1);
  if (st.rng() < 0.15) { log(st, "Everyone folds.", "villain"); return finish(st, "hero", "fold"); }
  st.villainSeat = weighted(st.rng, behind.map(function (s) {
    return [s, s === "BB" ? 3 : s === "SB" ? 1.6 : s === "BTN" ? 1.6 : s === "CO" ? 1.2 : 1];
  }));
  st.villainIn = blindOf(st.villainSeat);
  var spot = C.spotOf("3bet", TB.threeBetSpotId(st.seats, st.heroSeat, st.villainSeat));
  var callStr = C.callRangeOf(spot, st.villainSeat), threeBet = !callStr || st.rng() < 0.22;
  st.villain = dealFromKeys(st, threeBet ? union(rangeKeys(spot.value), rangeKeys(spot.bluff)) : rangeKeys(callStr));
  var folded = behind.slice(0, behind.indexOf(st.villainSeat));
  if (folded.length) log(st, folded.join(", ") + (folded.length > 1 ? " fold." : " folds."));
  if (!threeBet) {
    st.villainIn = st.openSize; log(st, st.villainSeat + " calls.", "villain");
    st.preAggressor = "hero"; return startPostflop(st);
  }
  var to = threeBetSize(st, st.villainSeat, st.heroSeat);
  st.villainIn = to; log(st, st.villainSeat + " 3-bets to " + bb(to) + ".", "villain");
  var ip = postflopIP(st, st.heroSeat, st.villainSeat);
  var four = Math.round(to * (ip ? 2.2 : 2.5) * 2) / 2;
  st.prompt = {
    kind: "pre-vs3bet", text: st.villainSeat + " 3-bets to " + bb(to) + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(to - st.heroIn) }, { id: "4bet", label: "4-bet to " + bb(four) }],
    judge: { kind: "pre-vs3bet", mode: "4bet", spotId: TB.fourBetSpotId(st.seats, st.heroSeat), raiseId: "4bet", chart: "4-bet chart, you opened " + st.heroSeat }
  };
}

// You 3-bet the opener: they 4-bet, call or fold according to the 4-bet chart.
function villainVs3bet(st) {
  var spot = C.spotOf("4bet", TB.fourBetSpotId(st.seats, st.villainSeat)), cat = C.catOf(spot, K.handKey(st.villain));
  if (cat === "f") { log(st, st.villainSeat + " folds.", "villain"); return finish(st, "hero", "fold"); }
  if (cat === "c") {
    st.villainIn = st.heroIn; log(st, st.villainSeat + " calls.", "villain");
    st.preAggressor = "hero"; return startPostflop(st);
  }
  var ip = postflopIP(st, st.villainSeat, st.heroSeat);
  var four = Math.round(st.heroIn * (ip ? 2.2 : 2.5) * 2) / 2;
  st.villainIn = four; log(st, st.villainSeat + " 4-bets to " + bb(four) + ".", "villain");
  st.prompt = {
    kind: "pre-vs4bet", text: st.villainSeat + " 4-bets to " + bb(four) + ". Villain profile: " + st.villainName + ".",
    options: [{ id: "fold", label: "Fold" }, { id: "call", label: "Call " + bb(four - st.heroIn) }, { id: "jam", label: "5-bet all-in" }],
    judge: { kind: "pre-vs4bet", mode: "5bet", spotId: st.villainType, raiseId: "jam", chart: "5-bet chart vs " + st.villainName.toLowerCase() + " player" }
  };
}

/* ---------- postflop ---------- */
function startPostflop(st) {
  st.heroIP = postflopIP(st, st.heroSeat, st.villainSeat);
  st.aggressor = st.preAggressor;
  st.street = "flop";
  st.board = take(st, [randomCard(st), randomCard(st), randomCard(st)]);
  beginStreet(st);
}

function beginStreet(st) {
  st.sb = { hero: 0, villain: 0 }; st.raises = 0; st.checks = 0; st.lastBettor = null; st.streetOver = false;
  st.toAct = st.heroIP ? "villain" : "hero";
  var prevBoard = st.street === "flop" ? null : st.board.slice(0, st.board.length - 1);
  st.heroPrevAn = st.heroAn; st.villainPrevAn = st.villainAn;
  st.heroAn = E.analyze(st.hero, st.board, {
    prevBoard: prevBoard, prevInfo: st.heroPrevAn && st.heroPrevAn.info,
    hadDraw: !!(st.heroPrevAn && (st.heroPrevAn.sub === "strong" || st.heroPrevAn.sub === "draw"))
  });
  st.villainAn = E.analyze(st.villain, st.board, {
    prevBoard: prevBoard, prevInfo: st.villainPrevAn && st.villainPrevAn.info,
    hadDraw: !!(st.villainPrevAn && (st.villainPrevAn.sub === "strong" || st.villainPrevAn.sub === "draw"))
  });
  log(st, cap(st.street) + ": " + K.cardsText(st.street === "flop" ? st.board : st.board.slice(-1)) + " · pot " + bb(pot(st)));
  advance(st);
}

function advance(st) {
  var guard = 0;
  while (!st.done && guard++ < 50) {
    if (st.streetOver) { nextStreet(st); return; }
    if (st.toAct === "hero") { st.prompt = makePrompt(st); return; }
    villainActs(st);
  }
}

function nextStreet(st) {
  if (st.heroIn >= STACK || st.villainIn >= STACK) return runOut(st);
  if (st.street === "river") return showdown(st);
  st.street = NEXT[st.street];
  st.board.push(randomCard(st));
  beginStreet(st);
}

function endStreet(st, bettor) {
  if (bettor) {
    st.aggressor = bettor; st.prevCheckedThrough = false;
    if (bettor === "villain") st.villainBarrels++;
  } else st.prevCheckedThrough = true;
  st.streetOver = true;
}

function act(st, who, type, to) {
  var opp = who === "hero" ? "villain" : "hero", name = who === "hero" ? "You" : "Villain";
  if (type === "check") {
    st.checks++;
    if (who === "villain") st.villainChecked[st.street] = true;
    log(st, name + (who === "hero" ? " check." : " checks."), who);
    if (st.checks >= 2) endStreet(st, null); else st.toAct = opp;
    return;
  }
  if (type === "fold") { log(st, name + (who === "hero" ? " fold." : " folds."), who); return finish(st, opp, "fold"); }
  if (type === "call") {
    var need = Math.min(st.sb[opp] - st.sb[who], left(st, who));
    st.sb[who] += need; st[who + "In"] += need;
    log(st, name + (who === "hero" ? " call " : " calls ") + bb(need) + ".", who);
    return endStreet(st, st.lastBettor);
  }
  // bet or raise, `to` = this player's total on this street
  to = Math.min(to, st.sb[who] + left(st, who));
  var potBefore = pot(st), add = to - st.sb[who];
  st.sb[who] = to; st[who + "In"] += add;
  var allIn = left(st, who) <= 0;
  if (type === "raise") st.raises++;
  st.lastBettor = who; st.checks = 0;
  var verb = type === "bet" ? (who === "hero" ? " bet " : " bets ") : (who === "hero" ? " raise to " : " raises to ");
  log(st, name + verb + bb(to) + (allIn ? " (all-in)" : "") + (type === "bet" ? " into " + bb(potBefore) : "") + ".", who);
  st.toAct = opp;
}

function makePrompt(st) {
  var owe = st.sb.villain - st.sb.hero, kind = owe <= 0 ? "open" : st.raises === 0 ? "vsBet" : "vsRaise";
  var opts = C.OPTIONS[C.optionKey(kind, st.street)].map(function (o) { return Object.assign({}, o); });
  var p = pot(st), streetStart = p - st.sb.villain - st.sb.hero, text, betFrac = 0;
  if (kind === "open") {
    var first = !st.heroIP && st.checks === 0;
    text = cap(st.street) + ", pot " + bb(p) + ". " + (first ? "You act first." : "Villain checks to you.");
    opts.forEach(function (o) {
      if (o.id.indexOf("bet:") === 0) o.size = sizeHint(st, BET_FRAC[st.street][o.id.slice(4)], p);
    });
  } else {
    betFrac = st.sb.villain / Math.max(1, streetStart + st.sb.hero); // their bet as a share of the pot it went into
    text = kind === "vsBet"
      ? "Villain bets " + bb(st.sb.villain) + " into " + bb(streetStart) + " (" + Math.round(betFrac * 100) + "% of the pot). You need " + bb(owe) + " to call."
      : "Villain raises to " + bb(st.sb.villain) + ". You need " + bb(owe) + " more to call.";
    if (left(st, "villain") <= 0 || left(st, "hero") <= owe) opts = opts.filter(function (o) { return o.id === "fold" || o.id === "call"; });
    opts.forEach(function (o) {
      if (o.id === "call") o.size = bb(Math.min(owe, left(st, "hero")));
      if (o.id.indexOf("raise:") === 0) o.size = "to " + bb(Math.min(round(RAISE_MULT[o.id.slice(6)] * st.sb.villain), st.sb.hero + left(st, "hero")));
      if (o.id === "jam") o.size = bb(st.sb.hero + left(st, "hero"));
    });
  }
  return {
    kind: kind, text: text, options: opts,
    ctx: {
      kind: kind, street: st.street, role: st.aggressor === "hero" ? "agg" : "def", pos: st.heroIP ? "ip" : "oop",
      an: st.heroAn, board: st.board.slice(), villainType: st.villainType, prevCheckedThrough: st.prevCheckedThrough,
      betFrac: betFrac, villainBarrels: st.villainBarrels, villainCheckedTurn: !!st.villainChecked.turn,
      canRaise: kind === "open" ? true : opts.some(function (o) { return o.id === "jam" || o.id.indexOf("raise:") === 0; })
    }
  };
}
function sizeHint(st, frac, p) {
  var amt = Math.min(round(frac * p), left(st, "hero"));
  return "≈" + Math.round(frac * 100) + "% · " + bb(amt);
}

/* ---------- the villain: a loose, passive low-stakes player, adjusted by profile ---------- */
var STYLE = { nit: { bluff: 0.4, raise: 0.6, call: 0.75 }, typ: { bluff: 1, raise: 1, call: 1 }, agg: { bluff: 1.7, raise: 1.5, call: 1 } };
function strength(an) {
  if (an.group === "nutted") return "nut";
  if (an.group === "good") return an.bucket === "gvv" ? "goodv" : "good";
  return an.sub === "strong" ? "strong" : an.sub === "draw" ? "draw" : an.sub === "weak" ? "weak" : "air";
}
function villainActs(st) {
  var an = st.villainAn, g = strength(an), s = st.street, t = STYLE[st.villainType], r = st.rng();
  var owe = st.sb.hero - st.sb.villain, p = pot(st);
  if (owe <= 0) {
    var role = st.aggressor === "villain" ? "agg" : "def", first = st.heroIP && st.checks === 0, prob;
    if (role === "agg") prob = { nut: 0.8, good: 0.75, goodv: 0.8, strong: 0.75, draw: 0.5, weak: 0.2, air: s === "flop" ? 0.45 : s === "turn" ? 0.25 : 0.12 }[g];
    else if (first) prob = { nut: 0.3, good: 0.1, goodv: 0.15, strong: 0.15, draw: 0.08, weak: 0.03, air: 0.03 }[g];
    else prob = { nut: 0.75, good: 0.6, goodv: 0.65, strong: 0.55, draw: 0.35, weak: 0.15, air: s === "river" ? 0.25 : 0.3 }[g];
    if (g === "air" || g === "draw" || g === "strong") prob *= t.bluff;
    if (r < Math.min(prob, 0.95)) {
      var frac = { nut: s === "river" ? 0.8 : 0.66, good: 0.5, goodv: 0.66, strong: 0.66, draw: 0.55, weak: 0.33, air: st.villainType === "agg" ? 0.66 : 0.45 }[g];
      return act(st, "villain", "bet", round(frac * p));
    }
    return act(st, "villain", "check");
  }
  var potBefore = p - st.sb.hero - st.sb.villain, betFrac = st.sb.hero / Math.max(1, potBefore + st.sb.villain);
  var reply;
  if (st.raises === 0) {
    switch (g) {
      case "nut": reply = r < (s === "river" ? 0.3 : 0.4) * t.raise ? "raise" : "call"; break;
      case "good": reply = (s === "river" && betFrac >= 0.75 && r > 0.7 * t.call) ? "fold" : "call"; break;
      case "goodv": reply = (s !== "flop" && betFrac >= 0.66 && r > 0.6 * t.call) ? "fold" : "call"; break;
      case "strong": reply = s === "river" ? "fold" : (r < 0.15 * t.raise ? "raise" : "call"); break;
      case "draw": reply = s === "river" ? "fold" : (r < (betFrac <= (s === "flop" ? 0.7 : 0.5) ? 0.85 : 0.35) ? "call" : "fold"); break;
      case "weak":
        var base = s === "flop" ? (betFrac <= 0.5 ? 0.65 : 0.35) : s === "turn" ? (betFrac <= 0.5 ? 0.4 : 0.2) : (betFrac <= 0.5 ? 0.35 : 0.15);
        reply = r < base * t.call ? "call" : "fold"; break;
      default:
        if (st.villainType === "agg" && s !== "river" && r < 0.06) reply = "raise";
        else reply = r < (s === "flop" ? 0.15 : s === "turn" ? 0.08 : 0.03) ? "call" : "fold";
    }
  } else {
    if (g === "nut") reply = (st.raises < 2 && r < 0.5) ? "jam" : "call";
    else if (g === "good") reply = r < (st.villainType === "nit" ? 0.25 : 0.45) ? "call" : "fold";
    else if (g === "goodv") reply = r < 0.3 ? "call" : "fold";
    else if (g === "strong" && s !== "river") reply = r < 0.6 ? "call" : "fold";
    else reply = "fold";
  }
  if (reply === "raise" && st.raises >= 2) reply = "call";
  if ((reply === "raise" || reply === "jam") && left(st, "villain") <= owe) reply = "call";
  if (reply === "fold" || reply === "call") return act(st, "villain", reply);
  var to = reply === "jam" ? st.sb.villain + left(st, "villain") : round(3 * st.sb.hero);
  if (to - st.sb.villain >= 0.7 * left(st, "villain")) to = st.sb.villain + left(st, "villain");
  return act(st, "villain", "raise", to);
}

/* ---------- your decisions ---------- */
function heroPostflop(st, choice) {
  var p = pot(st);
  if (choice === "check" || choice === "fold" || choice === "call") return act(st, "hero", choice);
  if (choice === "jam") return act(st, "hero", "raise", st.sb.hero + left(st, "hero"));
  if (choice.indexOf("bet:") === 0) {
    var amt = round(BET_FRAC[st.street][choice.slice(4)] * p);
    if (amt >= 0.7 * left(st, "hero")) amt = left(st, "hero");
    return act(st, "hero", "bet", amt);
  }
  var to = round(RAISE_MULT[choice.slice(6)] * st.sb.villain);
  if (to - st.sb.hero >= 0.7 * left(st, "hero")) to = st.sb.hero + left(st, "hero");
  return act(st, "hero", "raise", to);
}

function expectedChoice(st) {
  var p = st.prompt;
  if (!p) return null;
  if (p.kind.indexOf("pre-") === 0) return C.judgePre(Object.assign({}, p.judge, { key: K.handKey(st.hero), choice: "__" })).best;
  return C.postAnswer(p.ctx).best;
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
    st.prompt = null;
    heroPostflop(st, id);
    if (!st.done) advance(st);
  }
  st.decisions.push(d);
  return d;
}

/* ---------- the end ---------- */
function runOut(st) {
  if (st.street === "preflop") st.street = "flop";
  var before = st.board.length;
  while (st.board.length < 5) st.board.push(randomCard(st));
  if (st.board.length > before) log(st, "Board runs out: " + K.cardsText(st.board) + ".");
  showdown(st);
}
function showdown(st) {
  var h = K.evaluate(st.hero.concat(st.board)), v = K.evaluate(st.villain.concat(st.board));
  var m = Math.min(st.heroIn, st.villainIn); st.heroIn = m; st.villainIn = m; // an unmatched bet goes back
  var same = K.handName(h) === K.handName(v);
  st.showdown = { hero: K.handName(h, same), villain: K.handName(v, same) };
  log(st, "Showdown: villain shows " + K.cardsText(st.villain) + " (" + st.showdown.villain + "). You have " + st.showdown.hero + ".");
  finish(st, h > v ? "hero" : h < v ? "villain" : "split", "showdown");
}
function finish(st, winner, how) {
  st.done = true; st.prompt = null;
  var dead = deadMoney(st), net;
  if (winner === "hero") net = st.villainIn + dead;
  else if (winner === "villain") net = -st.heroIn;
  else net = dead / 2;
  var text = winner === "split" ? "Split pot." : (winner === "hero" ? "You win " + bb(net) + "." : "You lose " + bb(-net) + ".");
  st.result = { winner: winner, how: how, net: Math.round(net * 10) / 10, text: text };
  log(st, text);
}

/* ---------- the database record for a finished hand ----------
   Plain JSON, about 1 KB per hand. Cards are text such as "A♥K♦" (cards.js parseCards reads them back).
   Each decision keeps what the judge saw: the guide's answer (best, plus `also` for equally good answers),
   the verdict, the chart (preflop) or the bucket, role and position (postflop), and the guide's text. */
function newId(ts) { return "h" + ts.toString(36) + Math.floor(Math.random() * 1679616).toString(36); }
function toRecord(st, ts) {
  ts = ts || Date.now();
  var r1 = function (x) { return Math.round(x * 10) / 10; };
  return {
    id: newId(ts), v: 1, ts: ts, players: st.players,
    seat: st.heroSeat, villainSeat: st.villainSeat || "", villainType: st.villainType,
    hole: K.cardsText(st.hero), villainHole: st.villain ? K.cardsText(st.villain) : "", board: K.cardsText(st.board),
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
        o.role = d.role; o.pos = d.pos; o.path = d.path;
        if (d.kind !== "open") o.betPct = d.betPct;
      }
      return o;
    })
  };
}

var api = { newHand: newHand, choose: choose, expectedChoice: expectedChoice, toRecord: toRecord, potOf: pot, stackOf: left, bbText: bb, VILLAINS: VILLAINS };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
