/* Hand reading for practice mode, following the guide's own rules:
   1. What you hold (set, top pair, flush draw …).
   2. How many of the hands an opponent could hold beat you right now.
   3. Bad next cards: the most outs that any hand currently behind you has. This is the guide's vulnerability count.
   4. The bucket that puts you in, and for a bad hand, which kind (strong draw, draw, weak showdown, air, missed draw).
   Opponent hands are all two-card combinations of the unseen cards, so the count matches what you can do at the table. */
(function (root) {
"use strict";
var K = (root.PB && root.PB.evaluate) ? root.PB : require("./cards.js");
var evaluate = K.evaluate;

var NUT_MAX_BEATEN = 0.025;  // Nutted: two pair or better, and at most 2.5% of hands beat you
var GOOD_MAX_BEATEN = 0.30;  // Good: top pair or better, and at most 30% of hands beat you
var STRONG_PAIR_MAX_BEATEN = 0.12; // …or any pair that at most 12% of hands beat (JJ on A-A-5, 88 on K-K-2)

var BUCKET_NAME = {
  nnv: "Nutted · non-vulnerable", nsv: "Nutted · slightly vulnerable", nvv: "Nutted · very vulnerable",
  gsv: "Good · slightly vulnerable", gvv: "Good · very vulnerable", bad: "Bad hand"
};
var SUB_NAME = { strong: "strong draw", draw: "draw", weak: "weak showdown", air: "air", missed: "missed draw" };

function bucketLabel(bucket, sub) { return BUCKET_NAME[bucket] + (bucket === "bad" && sub ? " · " + SUB_NAME[sub] : ""); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function unseen(dead) {
  var used = new Uint8Array(52), out = [];
  for (var i = 0; i < dead.length; i++) used[dead[i]] = 1;
  for (var c = 0; c < 52; c++) if (!used[c]) out.push(c);
  return out;
}
function rankCounts(cards) { var n = new Array(13).fill(0); cards.forEach(function (c) { n[c >> 2]++; }); return n; }
function boardRanks(board) {
  var out = [];
  board.map(function (c) { return c >> 2; }).sort(function (a, b) { return b - a; })
    .forEach(function (r) { if (out.indexOf(r) < 0) out.push(r); });
  return out;
}
function hasAce(hole) { return (hole[0] >> 2) === 12 || (hole[1] >> 2) === 12; }

// What your own cards add. `eff` is the category that counts: a pair on the board is not your pair.
function made(hole, board) {
  var score = evaluate(hole.concat(board)), cat = score >> 20;
  var bc = rankCounts(board), br = boardRanks(board), top = br[0];
  var h1 = hole[0] >> 2, h2 = hole[1] >> 2;
  var info = { score: score, cat: cat, eff: cat, kind: "", pairRank: -1 };
  if (board.length === 5 && score === evaluate(board)) { info.eff = 0; info.kind = "playing the board"; return info; }
  function pairKind(p) {
    if (h1 === h2) {
      if (p > top) return "overpair";
      if (p < br[br.length - 1]) return "underpair";
      return "pocket pair below the top card";
    }
    var idx = br.indexOf(p);
    if (idx === 0) return "top pair";
    if (idx === 1) return "second pair";
    return idx === br.length - 1 ? "bottom pair" : "third pair";
  }
  if (cat === 1) {
    var p = (score >> 16) & 15;
    if (bc[p] >= 2) { info.eff = 0; info.kind = "board pair"; }
    else { info.eff = 1; info.pairRank = p; info.kind = pairKind(p); }
  } else if (cat === 2) {
    var p1 = (score >> 16) & 15, p2 = (score >> 12) & 15;
    var mine = [p1, p2].filter(function (r) { return bc[r] < 2; });
    if (mine.length === 2) info.kind = (p1 === br[0] && p2 === br[1]) ? "top two pair" : "two pair";
    else if (mine.length === 1) { info.eff = 1; info.pairRank = mine[0]; info.kind = pairKind(mine[0]); }
    else { info.eff = 0; info.kind = "board pairs"; }
  } else if (cat === 3) {
    var t = (score >> 16) & 15;
    if (bc[t] >= 3) { info.eff = 0; info.kind = "board trips"; }
    else info.kind = bc[t] === 2 ? "trips" : "set";
  }
  return info;
}
function topPairPlus(info) { return info.eff >= 2 || (info.eff === 1 && (info.kind === "top pair" || info.kind === "overpair")); }

function drawsOf(hole, board) {
  var out = { flush: false, straightRanks: 0 };
  if (board.length >= 5) return out;
  var all = hole.concat(board), mask = 0, bmask = 0, s;
  for (s = 0; s < 4; s++) {
    var n = 0, mine = 0;
    all.forEach(function (c) { if ((c & 3) === s) n++; });
    hole.forEach(function (c) { if ((c & 3) === s) mine++; });
    if (n === 4 && mine >= 1) out.flush = true;
  }
  all.forEach(function (c) { mask |= 1 << (c >> 2); });
  board.forEach(function (c) { bmask |= 1 << (c >> 2); });
  if (K.straightHigh(mask) < 0) {
    for (var r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      if (K.straightHigh(mask | (1 << r)) >= 0 && K.straightHigh(bmask | (1 << r)) < 0) out.straightRanks++;
    }
  }
  return out;
}
function drawText(d) {
  var parts = [];
  if (d.flush) parts.push("flush draw");
  if (d.straightRanks >= 2) parts.push("open-ended straight draw");
  else if (d.straightRanks === 1) parts.push("gutshot");
  return parts.join(" + ");
}

function describe(info, hole, board) {
  var R = K.RANK_NAME, P = K.RANK_PLURAL, h1 = hole[0] >> 2, h2 = hole[1] >> 2, hi = Math.max(h1, h2);
  var a = (info.score >> 16) & 15, b = (info.score >> 12) & 15;
  switch (info.eff) {
    case 0:
      if (info.kind === "playing the board") return "Playing the board";
      return cap(R[hi]) + " high";
    case 1:
      if (info.cat === 2) { // a pair on the board plus your own pair
        var boardPair = a === info.pairRank ? b : a;
        return "Two pair (" + P[boardPair] + " on the board, your " + P[info.pairRank] + ")";
      }
      if (h1 === h2) return cap(info.kind) + " (" + P[info.pairRank] + ")";
      var kick = h1 === info.pairRank ? h2 : h1;
      return cap(info.kind) + " (" + P[info.pairRank] + "), " + R[kick] + " kicker";
    case 2: return cap(info.kind) + ", " + P[a] + " and " + P[b];
    case 3: return info.kind === "set" ? "Set of " + P[a] : "Trips, " + P[a];
    default: return K.handName(info.score);
  }
}

function countBeaters(score, board, rest) {
  var buf = [0, 0].concat(board), n = 0, total = 0;
  for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++) {
    buf[0] = rest[i]; buf[1] = rest[j]; total++;
    if (evaluate(buf) > score) n++;
  }
  return { n: n, total: total };
}

// The guide's vulnerability count: the most next-card outs held by any hand that is behind you now.
function worstDraw(hole, board, rest, score) {
  var hb = hole.concat(board, [0]), L = hb.length - 1, heroNext = new Int32Array(52), k;
  for (k = 0; k < rest.length; k++) { hb[L] = rest[k]; heroNext[rest[k]] = evaluate(hb); }
  var vb = [0, 0].concat(board), vn = [0, 0].concat(board, [0]), M = vn.length - 1;
  var best = 0, holding = null;
  for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++) {
    var a = rest[i], b = rest[j];
    vb[0] = a; vb[1] = b;
    if (evaluate(vb) >= score) continue; // already ahead or tied: not a draw
    vn[0] = a; vn[1] = b;
    var outs = 0;
    for (k = 0; k < rest.length; k++) {
      var c = rest[k];
      if (c === a || c === b) continue;
      vn[M] = c;
      if (evaluate(vn) > heroNext[c]) outs++;
    }
    if (outs > best) { best = outs; holding = [a, b]; }
  }
  return { outs: best, holding: holding };
}

// Next cards that turn a bad hand into a good one (top pair or better that few hands beat).
function improvingCards(hole, board, rest) {
  var outs = [];
  for (var k = 0; k < rest.length; k++) {
    var c = rest[k], b2 = board.concat([c]), info = made(hole, b2);
    if (!topPairPlus(info)) continue;
    var bt = countBeaters(info.score, b2, rest.filter(function (x) { return x !== c; }));
    if (bt.n / bt.total <= GOOD_MAX_BEATEN) outs.push(c);
  }
  return outs;
}

// How many rank pairs make a straight with this board.
function straightCombos(board) {
  var bm = 0, n = 0;
  board.forEach(function (c) { bm |= 1 << (c >> 2); });
  for (var x = 0; x < 13; x++) for (var y = x; y < 13; y++) if (K.straightHigh(bm | (1 << x) | (1 << y)) >= 0) n++;
  return n;
}

// Why a new turn or river card is a scare card.
function scare(prevBoard, card, prevInfo) {
  var reasons = [], board = prevBoard.concat([card]);
  var sameSuit = prevBoard.filter(function (c) { return (c & 3) === (card & 3); }).length;
  if (sameSuit === 2) reasons.push("completes a flush draw");
  else if (sameSuit >= 3) reasons.push("puts four of a suit on the board");
  if (straightCombos(board) > straightCombos(prevBoard)) reasons.push("completes a straight draw");
  if (prevInfo && prevInfo.eff === 1 && (card >> 2) > prevInfo.pairRank) reasons.push("is an overcard to your pair");
  if (prevInfo && prevInfo.eff >= 2 && prevBoard.some(function (c) { return (c >> 2) === (card >> 2); })) reasons.push("pairs the board");
  return reasons;
}

/* analyze(hole, board, {prevBoard, prevInfo, hadDraw}) → everything the judge needs.
   prevBoard/prevInfo: the board and your made hand one street earlier (for scare cards).
   hadDraw: you had a draw on the turn (so a busted hand on the river is a missed draw). */
function analyze(hole, board, opts) {
  opts = opts || {};
  var street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  var rest = unseen(hole.concat(board));
  var info = made(hole, board);
  var bt = countBeaters(info.score, board, rest), share = bt.n / bt.total;
  var group = (info.eff >= 2 && share <= NUT_MAX_BEATEN) ? "nutted"
    : ((topPairPlus(info) && share <= GOOD_MAX_BEATEN) || (info.eff >= 1 && share <= STRONG_PAIR_MAX_BEATEN)) ? "good" : "bad";
  var draws = drawsOf(hole, board), dtxt = drawText(draws);
  var res = {
    street: street, info: info, group: group, beatShare: share, draws: draws,
    desc: describe(info, hole, board) + (dtxt ? " + " + dtxt : ""),
    badCards: null, worst: null, outs: null, sub: null, scare: [], bucket: null
  };
  if (street !== "flop" && opts.prevBoard) res.scare = scare(opts.prevBoard, board[board.length - 1], opts.prevInfo || made(hole, opts.prevBoard));
  if (group !== "bad" && street !== "river") {
    var w = worstDraw(hole, board, rest, info.score);
    res.badCards = w.outs; res.worst = w.holding;
  }
  if (group === "nutted") res.bucket = street === "river" ? "nnv" : res.badCards <= 4 ? "nnv" : res.badCards <= 9 ? "nsv" : "nvv";
  else if (group === "good") res.bucket = street === "river" ? (res.scare.length ? "gvv" : "gsv") : (res.badCards <= 9 ? "gsv" : "gvv");
  else {
    res.bucket = "bad";
    if (street !== "river") {
      res.outs = improvingCards(hole, board, rest).length;
      res.sub = res.outs >= 12 ? "strong" : res.outs >= 8 ? "draw" : (info.eff >= 1 || hasAce(hole)) ? "weak" : "air";
    } else {
      res.sub = info.eff >= 1 ? "weak" : opts.hadDraw ? "missed" : hasAce(hole) ? "weak" : "air";
    }
  }
  res.label = bucketLabel(res.bucket, res.sub);
  return res;
}

function pct(x) { var v = Math.round(x * 1000) / 10; return (v >= 99.95 ? "99.9" : String(v)) + "%"; }

// One plain-language line on why the hand is in its bucket.
function explain(an) {
  var parts = [an.desc + "."];
  if (an.group !== "bad") {
    parts.push("It beats " + pct(1 - an.beatShare) + " of the hands an opponent could hold.");
    if (an.street === "river") parts.push(an.scare.length ? "The river " + an.scare.join(" and ") + "." : "No cards to come, so nothing else can beat it.");
    else if (!an.badCards) parts.push("No next card can beat it.");
    else parts.push("Worst draw against it: " + K.cardsText(an.worst) + " with " + an.badCards + " outs, so " + an.badCards + " bad next cards.");
  } else if (an.street !== "river") {
    parts.push(an.outs === 0 ? "No next card makes it a good hand." : an.outs === 1 ? "1 card improves it to a good hand." : an.outs + " cards improve it to a good hand.");
  }
  parts.push("That makes it " + an.label + ".");
  return parts.join(" ");
}

/* ---------- fast hand classes, for opponents and ranges ----------
   The exact bucket above checks every possible opponent hand, which is too slow to run for every hand in a range.
   quickClass gives the same seven classes the opponent model plays by, using one sorted table per board:
   nut, good, goodv (good but vulnerable), strong (12+ outs), draw (8+), weak (a pair or ace high), air. */
function rankTable(board) {
  var rest = unseen(board), buf = [0, 0].concat(board), out = [];
  for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++) { buf[0] = rest[i]; buf[1] = rest[j]; out.push(evaluate(buf)); }
  return Int32Array.from(out).sort();
}
function shareAbove(table, score) { // share of all two-card hands that beat `score`
  var lo = 0, hi = table.length;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (table[mid] <= score) lo = mid + 1; else hi = mid; }
  return (table.length - lo) / table.length;
}
function wetBoard(board) {
  var suits = [0, 0, 0, 0], close = 0, i, j;
  board.forEach(function (c) { suits[c & 3]++; });
  for (i = 0; i < board.length; i++) for (j = i + 1; j < board.length; j++) {
    var d = Math.abs((board[i] >> 2) - (board[j] >> 2)); if (d > 0 && d <= 3) close++;
  }
  return Math.max.apply(null, suits) >= (board.length === 3 ? 2 : 3) || close >= 2;
}
function quickClass(hole, board, table) {
  var info = made(hole, board), share = shareAbove(table, info.score);
  if (info.eff >= 2 && share <= NUT_MAX_BEATEN) return "nut";
  if ((topPairPlus(info) && share <= GOOD_MAX_BEATEN) || (info.eff >= 1 && share <= STRONG_PAIR_MAX_BEATEN)) return board.length < 5 && wetBoard(board) ? "goodv" : "good";
  if (board.length < 5) {
    var d = drawsOf(hole, board), outs = (d.flush ? 9 : 0) + (d.straightRanks >= 2 ? 8 : d.straightRanks === 1 ? 4 : 0);
    if (d.flush && d.straightRanks) outs -= 2;
    var top = Math.max.apply(null, board.map(function (c) { return c >> 2; }));
    if (info.eff === 0 && (hole[0] >> 2) > top && (hole[1] >> 2) > top) outs += 6;
    if (outs >= 12) return "strong";
    if (outs >= 8) return "draw";
  }
  return info.eff >= 1 || hasAce(hole) ? "weak" : "air";
}
var CLASS_NAME = { nut: "Nutted", good: "Good", goodv: "Good, vulnerable", strong: "Strong draw", draw: "Draw", weak: "Weak pair or ace high", air: "Nothing" };

var api = {
  NUT_MAX_BEATEN: NUT_MAX_BEATEN, GOOD_MAX_BEATEN: GOOD_MAX_BEATEN, BUCKET_NAME: BUCKET_NAME, SUB_NAME: SUB_NAME,
  bucketLabel: bucketLabel, unseen: unseen, made: made, describe: describe, drawsOf: drawsOf, countBeaters: countBeaters,
  worstDraw: worstDraw, improvingCards: improvingCards, straightCombos: straightCombos, scare: scare,
  analyze: analyze, explain: explain, pct: pct,
  rankTable: rankTable, shareAbove: shareAbove, quickClass: quickClass, wetBoard: wetBoard, CLASS_NAME: CLASS_NAME
};
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
