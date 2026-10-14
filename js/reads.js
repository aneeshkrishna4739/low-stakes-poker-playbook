/* Range reads: what each opponent can hold, given everything he has done in the hand.
   1. Preflop: the chart range his action implies (his opening, calling or 3-bet range), dealt from by sim.js.
   2. Every postflop action, with its size, re-weights each hand in that range by how likely the opponent model
      (villain.js) is to act that way with it. A check makes strong hands less likely; a big bet makes them more likely.
   From the weighted range: what he holds now by class, how often you're ahead, your equity with cards to come,
   and for your own bet, how often he folds and how often worse or better hands continue.

   PB.readHand(st, {betFrac}) → { opps: [...], equity, ahead, needed, bet, insight, supports } */
(function (root) {
"use strict";
function need(key, file) { return (root.PB && root.PB[key]) ? root.PB : require(file); }
var K = need("evaluate", "./cards.js");
var E = need("quickClass", "./engine.js");
var V = need("villainPolicy", "./villain.js");

var GROUPS = [["nut", "Nutted"], ["good", "Good"], ["draw", "Draws"], ["weak", "Weak pairs, ace high"], ["air", "Nothing"]];
var GROUP_OF = { nut: "nut", good: "good", goodv: "good", strong: "draw", draw: "draw", weak: "weak", air: "air" };
var MC = 1200;

function pct(x) { return Math.round(x * 100) + "%"; }
function sizeText(f) { return Math.round(f * 100) + "%"; }

function obsText(o) {
  var s = o.street.charAt(0).toUpperCase() + o.street.slice(1) + ": ";
  if (o.action === "bet") return s + "bet " + sizeText(o.size) + " of the pot";
  if (o.action === "check") return s + "checked";
  if (o.action === "call") return s + "called";
  if (o.action === "raise") return s + "raised";
  return s + o.action;
}

function readOpp(v, hero, board, tableFor) {
  var dead = new Set(hero.concat(board)), list = [];
  v.prior.forEach(function (k) { K.combosOf(k, dead).forEach(function (c) { list.push(c); }); });
  var w = new Float64Array(list.length).fill(1), clsAt = {};
  function cls(i, b) {
    var key = b.length, m = clsAt[key] || (clsAt[key] = new Array(list.length));
    if (m[i] === undefined) m[i] = E.quickClass(list[i], b, tableFor(b));
    return m[i];
  }
  v.obs.forEach(function (o) {
    for (var i = 0; i < list.length; i++) if (w[i] > 0) w[i] *= V.actionProb(cls(i, o.board), o.x, o.action, o.size);
  });
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += w[i];
  if (!(total > 0)) { w.fill(1); total = list.length; }
  for (i = 0; i < list.length; i++) w[i] /= total;
  var now = list.map(function (c, j) { return cls(j, board); });
  var scores = list.map(function (c) { return K.evaluate(c.concat(board)); });
  return { v: v, list: list, w: w, now: now, scores: scores };
}

// Hero's share of the pot, sampling each opponent's hand from his weighted range and the cards to come.
function equity(rng, hero, board, reads) {
  var cum = reads.map(function (r) { var a = new Float64Array(r.w.length), s = 0; for (var i = 0; i < r.w.length; i++) { s += r.w[i]; a[i] = s; } return a; });
  function draw(ri) {
    var a = cum[ri], x = rng() * a[a.length - 1], lo = 0, hi = a.length - 1;
    while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
    return reads[ri].list[lo];
  }
  var won = 0, n = 0, base = hero.concat(board);
  for (var it = 0; it < MC; it++) {
    var used = new Set(base), hands = [], ok = true;
    for (var ri = 0; ri < reads.length && ok; ri++) {
      var c = null;
      for (var t = 0; t < 12; t++) { var cand = draw(ri); if (!used.has(cand[0]) && !used.has(cand[1])) { c = cand; break; } }
      if (!c) ok = false; else { hands.push(c); used.add(c[0]); used.add(c[1]); }
    }
    if (!ok) continue;
    var full = board.slice();
    while (full.length < 5) { var card = Math.floor(rng() * 52); if (!used.has(card)) { used.add(card); full.push(card); } }
    var hs = K.evaluate(hero.concat(full)), best = hs, ties = 1, beaten = false;
    for (var h = 0; h < hands.length; h++) {
      var s = K.evaluate(hands[h].concat(full));
      if (s > best) { beaten = true; break; }
      if (s === best) ties++;
    }
    won += beaten ? 0 : 1 / ties; n++;
  }
  return n ? won / n : 0;
}

function readHand(st, opts) {
  opts = opts || {};
  var hero = st.hero, board = st.board, tables = {};
  var tableFor = function (b) { return tables[b.length] || (tables[b.length] = E.rankTable(b)); };
  var heroScore = K.evaluate(hero.concat(board));
  var opps = st.opps.filter(function (v) { return !v.folded; });
  var reads = opps.map(function (v) { return readOpp(v, hero, board, tableFor); });
  var ctx = st.prompt && st.prompt.ctx, facing = ctx && ctx.kind !== "open";
  var multi = st.order ? st.order.length >= 3 : opps.length >= 2;

  var out = { opps: [], equity: 0, ahead: 1, needed: null, bet: null, insight: "", supports: {} };
  reads.forEach(function (r) {
    var groups = {}, ahead = 0;
    GROUPS.forEach(function (g) { groups[g[0]] = 0; });
    for (var i = 0; i < r.list.length; i++) {
      groups[GROUP_OF[r.now[i]]] += r.w[i];
      ahead += r.w[i] * (heroScore > r.scores[i] ? 1 : heroScore === r.scores[i] ? 0.5 : 0);
    }
    out.ahead *= ahead;
    out.opps.push({
      id: r.v.id, seat: r.v.seat, name: r.v.name, type: r.v.type, range: r.v.priorText, rangePct: r.v.priorPct,
      actions: r.v.obs.map(obsText), groups: GROUPS.map(function (g) { return { key: g[0], label: g[1], share: groups[g[0]] }; }), ahead: ahead
    });
  });
  out.equity = equity(st.readRng || Math.random, hero, board, reads);

  var many = opps.length > 1, whose = many ? "their" : "his";
  var aheadText = function (x, only) {
    return many ? "You're ahead of " + (opps.length === 2 ? "both opponents" : "all " + opps.length + " opponents") + (only ? " only" : "") + " about " + pct(x) + " of the time"
                : "You're ahead of " + (only ? "only " : "") + pct(x) + " of his range";
  };
  if (facing) {
    var owe = ctx.owe, potNow = ctx.pot;
    out.needed = owe / (potNow + owe);
    var eq = out.equity, nd = out.needed;
    out.insight = "Your equity against " + whose + " range is " + pct(eq) + (board.length < 5 ? " with cards to come" : "") + ", and calling needs " + pct(nd) + ". " +
      (eq >= nd + 0.05 ? "Calling makes money." : eq < nd - 0.05 ? "Folding is better." : "It's close.");
    out.supports.call = eq >= nd + 0.08;
    out.supports.fold = eq < nd - 0.05;
  } else {
    var frac = opts.betFrac || 0.5, allFold = 1, noWorse = 1, noBetter = 1;
    reads.forEach(function (r) {
      var fold = 0, worse = 0, better = 0, v = r.v;
      var x = { street: st.street, owe: true, role: st.aggressor === v.id ? "agg" : "def", first: false, raises: 0, betFrac: frac, type: v.type, multi: multi, canRaise: true };
      var memo = {};
      for (var i = 0; i < r.list.length; i++) {
        var pol = memo[r.now[i]] || (memo[r.now[i]] = V.villainPolicy(r.now[i], x)), cont = pol.call + pol.raise;
        fold += r.w[i] * pol.fold;
        if (heroScore > r.scores[i]) worse += r.w[i] * cont; else better += r.w[i] * cont;
      }
      allFold *= fold; noWorse *= 1 - worse; noBetter *= 1 - better;
    });
    var be = frac / (1 + frac);
    out.bet = { frac: frac, allFold: allFold, worse: 1 - noWorse, better: 1 - noBetter, breakEven: be };
    var b = out.bet;
    if (out.ahead >= 0.55) {
      out.insight = aheadText(out.ahead) + ". A bet of about " + sizeText(frac) + " gets called by a worse hand " + pct(b.worse) +
        " of the time and by a better one " + pct(b.better) + ". " + (b.worse >= 0.25 ? "Bet for value." : "Few worse hands call, so a check is fine too.");
      out.supports.value = b.worse >= 0.3 && b.worse > b.better;
      out.supports.check = b.worse < 0.15;
    } else {
      out.insight = aheadText(out.ahead, true) + ". A bet of about " + sizeText(frac) + " folds " + (many ? "everyone " : "him ") + pct(b.allFold) +
        " of the time; a bluff needs " + pct(be) + ". " + (b.allFold >= be + 0.1 ? "A bet makes money." : b.allFold < be ? "Don't bluff: " + (many ? "someone calls" : "he calls") + " too often." : "It's close.");
      out.supports.bluff = b.allFold >= be + 0.1;
      out.supports.check = b.allFold < be;
    }
  }
  if (opts.raw) out.raw = reads;
  return out;
}

var api = { readHand: readHand, READ_GROUPS: GROUPS };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
