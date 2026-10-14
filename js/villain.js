/* The opponent model: how a low-stakes player acts with each class of hand (engine.js quickClass).
   Written as probabilities, so the simulator samples an action from it and the range reader (reads.js)
   runs it backwards: given what an opponent did, which hands were likely.

   PB.villainPolicy(cls, x) → { check, bet, fold, call, raise } probabilities that sum to 1
   PB.betSizes(cls, x)      → [[fraction of pot, probability], …]   bet sizes carry information: stronger hands bet bigger
   x = { street, owe (facing a bet?), role ("agg" if he made the last bet on an earlier street or preflop, else "def"),
         first (no one has acted yet this street), raises (raises this street), betFrac (the bet he faces, share of the pot),
         type (nit | typ | agg | loose), multi (3+ players still in the hand), canRaise } */
(function (root) {
"use strict";

var TYPES = { nit: "Nit", typ: "Unknown", agg: "Aggressive", loose: "Calling station" };
var STYLE = {
  nit:   { bluff: 0.4, raise: 0.6, call: 0.75 },
  typ:   { bluff: 1,   raise: 1,   call: 1 },
  agg:   { bluff: 1.7, raise: 1.5, call: 1 },
  loose: { bluff: 0.7, raise: 0.7, call: 1.5 }
};
var SIZES = [0.33, 0.5, 0.66, 0.8];
var BLUFFY = { air: 1, draw: 1, strong: 1 };

function clamp(p) { return Math.max(0, Math.min(0.97, p)); }

function villainPolicy(cls, x) {
  var t = STYLE[x.type] || STYLE.typ, s = x.street, out = { check: 0, bet: 0, fold: 0, call: 0, raise: 0 };
  if (!x.owe) {
    var p;
    if (x.role === "agg") p = { nut: 0.8, good: 0.75, goodv: 0.8, strong: 0.75, draw: 0.5, weak: 0.2, air: s === "flop" ? 0.45 : s === "turn" ? 0.25 : 0.12 }[cls];
    else if (x.first) p = { nut: 0.3, good: 0.1, goodv: 0.15, strong: 0.15, draw: 0.08, weak: 0.03, air: 0.03 }[cls];
    else p = { nut: 0.75, good: 0.6, goodv: 0.65, strong: 0.55, draw: 0.35, weak: 0.15, air: s === "river" ? 0.25 : 0.3 }[cls];
    if (BLUFFY[cls]) p *= t.bluff;
    if (x.multi) p *= BLUFFY[cls] ? 0.4 : cls === "weak" ? 0.5 : cls === "good" ? 0.85 : 1;
    out.bet = clamp(p); out.check = 1 - out.bet;
    return out;
  }
  var f = x.betFrac || 0.5, call = 0, raise = 0;
  if (!x.raises) {
    switch (cls) {
      case "nut": raise = (s === "river" ? 0.3 : 0.4) * t.raise; call = 1 - raise; break;
      case "good": call = (s === "river" && f >= 0.75) ? 0.7 * t.call : 1; break;
      case "goodv": call = (s !== "flop" && f >= 0.66) ? 0.6 * t.call : 1; break;
      case "strong": if (s !== "river") { raise = 0.15 * t.raise; call = 1 - raise; } break;
      case "draw": if (s !== "river") call = f <= (s === "flop" ? 0.7 : 0.5) ? 0.85 : 0.35; break;
      case "weak":
        call = (s === "flop" ? (f <= 0.5 ? 0.65 : 0.35) : s === "turn" ? (f <= 0.5 ? 0.4 : 0.2) : (f <= 0.5 ? 0.35 : 0.15)) * t.call; break;
      default:
        if (x.type === "agg" && s !== "river") raise = 0.06;
        call = (s === "flop" ? 0.15 : s === "turn" ? 0.08 : 0.03) * t.call;
    }
    if (x.multi) {
      if (cls === "weak" || cls === "air") call *= 0.6;
      if (cls === "draw") call *= 0.8;
      if (cls !== "nut") raise *= 0.5;
    }
  } else {
    if (cls === "nut") { raise = x.raises < 2 ? 0.5 : 0; call = 1 - raise; }
    else if (cls === "good") call = x.type === "nit" ? 0.25 : 0.45;
    else if (cls === "goodv") call = 0.3;
    else if (cls === "strong" && s !== "river") call = 0.6;
  }
  if (x.raises >= 2 || x.canRaise === false) { call += raise; raise = 0; }
  call = clamp(call); raise = Math.min(raise, 1 - call);
  out.call = call; out.raise = raise; out.fold = Math.max(0, 1 - call - raise);
  return out;
}

function betSizes(cls, x) {
  switch (cls) {
    case "nut": return x.street === "river" ? [[0.8, 0.5], [0.66, 0.3], [0.5, 0.2]] : [[0.66, 0.5], [0.8, 0.2], [0.5, 0.3]];
    case "good": return [[0.5, 0.5], [0.33, 0.25], [0.66, 0.25]];
    case "goodv": case "strong": return [[0.66, 0.5], [0.5, 0.3], [0.8, 0.2]];
    case "draw": return [[0.5, 0.5], [0.33, 0.3], [0.66, 0.2]];
    case "weak": return [[0.33, 0.6], [0.5, 0.4]];
    default: return x.type === "agg" ? [[0.66, 0.5], [0.5, 0.3], [0.8, 0.2]] : [[0.5, 0.4], [0.33, 0.4], [0.66, 0.2]];
  }
}
function nearestSize(frac) {
  var best = SIZES[0];
  SIZES.forEach(function (s) { if (Math.abs(s - frac) < Math.abs(best - frac)) best = s; });
  return best;
}
// Probability that a hand of class `cls` takes `action` (and, for a bet, the size closest to `size`) in situation x.
function actionProb(cls, x, action, size) {
  var p = villainPolicy(cls, x)[action] || 0;
  if (action === "bet" && size) {
    var near = nearestSize(size), q = 0;
    betSizes(cls, x).forEach(function (s) { if (s[0] === near) q += s[1]; });
    p *= q;
  }
  return p;
}

var api = { villainPolicy: villainPolicy, betSizes: betSizes, actionProb: actionProb, nearestSize: nearestSize, VILLAIN_TYPES: TYPES, VILLAIN_STYLE: STYLE };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
