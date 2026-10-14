/* The judge: what the guide says to do in a spot, and how close a choice was.
   Preflop answers come from the range charts in data.js (PRE). Postflop answers come from the tree (T)
   for the bucket that engine.js reads from your hand. Verdicts: "correct", "almost", "mistake". */
(function (root) {
"use strict";
function need(key, file) { return (root.PB && root.PB[key]) ? root.PB : require(file); }
var E = need("analyze", "./engine.js");
var RG = need("parseRange", "./ranges.js");
var D = need("PRE", "./data.js");

var STREET_NAME = { flop: "Flop", turn: "Turn", river: "River" };
var ROLE_NAME = { agg: "Aggressor", def: "Defender" };
var POS_NAME = { ip: "In position", oop: "Out of position" };

/* ---------- decision options (shared by the simulator and the page) ---------- */
var OPTIONS = {
  "pre-rfi": [{ id: "fold", label: "Fold" }, { id: "raise", label: "Raise" }],
  "pre-vsopen": [{ id: "fold", label: "Fold" }, { id: "call", label: "Call" }, { id: "3bet", label: "3-bet" }],
  "pre-vs3bet": [{ id: "fold", label: "Fold" }, { id: "call", label: "Call" }, { id: "4bet", label: "4-bet" }],
  "pre-vs4bet": [{ id: "fold", label: "Fold" }, { id: "call", label: "Call" }, { id: "jam", label: "5-bet all-in" }],
  "pre-vs5bet": [{ id: "fold", label: "Fold" }, { id: "call", label: "Call all-in" }],
  "open": [
    { id: "check", label: "Check", sub: "Pot control · free card · give up" },
    { id: "bet:value", label: "Value bet", sub: "Nutted · non-vulnerable" },
    { id: "bet:light", label: "Value bet, light protection", sub: "Nutted · slightly vulnerable" },
    { id: "bet:vp", label: "Value + protection bet", sub: "Nutted · very vulnerable" },
    { id: "bet:thin", label: "Thin value bet", sub: "Good · slightly vulnerable" },
    { id: "bet:prot", label: "Protection bet", sub: "Good · very vulnerable" },
    { id: "bet:semi", label: "Semi-bluff", sub: "Bad hand · draw" },
    { id: "bet:bluff", label: "Bluff", sub: "Bad hand · air" }
  ],
  "open-river": [
    { id: "check", label: "Check", sub: "Pot control · showdown · give up" },
    { id: "bet:value", label: "Value bet", sub: "Nutted, still best" },
    { id: "bet:thin", label: "Thin value bet", sub: "Good" },
    { id: "bet:bluff", label: "Bluff", sub: "Missed draw · air" }
  ],
  "vsBet": [
    { id: "fold", label: "Fold", sub: "Give up" },
    { id: "call", label: "Call", sub: "Bluff catch · drawing with odds" },
    { id: "raise:value", label: "Raise for value", sub: "Nutted · non- or slightly vulnerable" },
    { id: "raise:vp", label: "Value + protection raise", sub: "Nutted · very vulnerable" },
    { id: "raise:semi", label: "Semi-bluff raise", sub: "Bad hand · strong draw" }
  ],
  "vsBet-river": [
    { id: "fold", label: "Fold", sub: "Give up" },
    { id: "call", label: "Call", sub: "Bluff catch" },
    { id: "raise:value", label: "Raise for value", sub: "Nutted, still best" }
  ],
  "vsRaise": [
    { id: "fold", label: "Fold", sub: "Let it go" },
    { id: "call", label: "Call", sub: "Bluff catch · drawing with odds" },
    { id: "jam", label: "Re-raise all-in", sub: "Nutted · strong draw" }
  ]
};
function optionKey(kind, street) {
  if (kind === "open" || kind === "vsBet") return street === "river" ? kind + "-river" : kind;
  return kind;
}
function optionLabel(id) {
  for (var k in OPTIONS) for (var i = 0; i < OPTIONS[k].length; i++) if (OPTIONS[k][i].id === id) return OPTIONS[k][i].label;
  return id;
}

/* ---------- preflop ---------- */
var rangeCache = {};
function rangeSet(str) { if (!rangeCache[str]) rangeCache[str] = RG.parseRange(str); return rangeCache[str]; }
function spotOf(mode, id) { return D.PRE[mode].spots.filter(function (s) { return s.id === id; })[0]; }
// The SB mostly 3-bets or folds: in spots the blinds share, it calls only its own smaller range.
function callRangeOf(spot, seat) { return (seat === "SB" && spot.sbCall !== undefined) ? spot.sbCall : spot.call; }
function catOf(spot, key, seat) {
  if (rangeSet(spot.value).has(key)) return "v";
  if (rangeSet(spot.bluff).has(key)) return "b";
  if (rangeSet(callRangeOf(spot, seat)).has(key)) return "c";
  return "f";
}
var OPEN_ORDER = ["vep", "ep", "hj", "co", "sb", "btn"]; // tightest to loosest opening range

/* judgePre({kind, mode, spotId, key, choice, raiseId, chart})
   kind: pre-rfi | pre-vsopen | pre-vs3bet | pre-vs4bet | pre-vs5bet; raiseId: the option that means "raise" here. */
function judgePre(o) {
  var spot = spotOf(o.mode, o.spotId), cat = catOf(spot, o.key, o.seat), labels = D.PRE[o.mode].labels;
  var best = (cat === "v" || cat === "b") ? o.raiseId : cat === "c" ? "call" : "fold";
  var verdict;
  if (o.choice === best) verdict = "correct";
  else if (o.kind === "pre-rfi") {
    var i = OPEN_ORDER.indexOf(o.spotId);
    var tighter = i > 0 ? spotOf("open", OPEN_ORDER[i - 1]) : null, looser = i < OPEN_ORDER.length - 1 ? spotOf("open", OPEN_ORDER[i + 1]) : null;
    var edge = cat === "v" ? !(tighter && catOf(tighter, o.key) === "v") : !!(looser && catOf(looser, o.key) === "v");
    verdict = edge ? "almost" : "mistake";
  }
  else if (o.kind === "pre-vs4bet" && o.choice === "call") verdict = "mistake";
  else if (cat === "b" && o.choice === "fold") verdict = "almost";
  else if (cat === "c" && (o.choice === "fold" || o.choice === o.raiseId)) verdict = "almost";
  else if (cat === "v" && o.choice === "call" && o.kind !== "pre-vs5bet") verdict = "almost";
  else verdict = "mistake";

  var where = o.chart || "";
  var text;
  if (cat === "f") text = o.key + " is not in any " + (o.kind === "pre-rfi" ? "opening" : "continuing") + " range here, so the guide folds" + (where ? " (" + where + ")" : "") + ".";
  else text = o.key + " is in the “" + labels[cat] + "” range" + (where ? " (" + where + ")" : "") + ".";
  if (cat === "f" && o.seat === "SB" && spot.sbCall !== undefined && rangeSet(spot.call).has(o.key)) text = o.key + " is a call from the BB, but from the SB the guide 3-bets or folds and flat-calls only " + spot.sbCall + ".";
  if (o.kind === "pre-vs4bet" && o.choice === "call") text += " At 100bb the guide never flat-calls a 4-bet: jam or fold.";
  if (cat === "b" && o.choice === "fold") text += " Bluffs are optional, so folding is only a small leak.";
  return { verdict: verdict, best: best, cat: cat, text: text, note: spot.note || "", size: spot.size };
}

/* ---------- postflop ---------- */
var SUBS = { flop: ["strong", "draw", "weak", "air"], turn: ["strong", "draw", "weak", "air"], river: ["missed", "weak", "air"] };
function leafOf(node, sub, street) {
  if (!node.bad) return node;
  var i = SUBS[street].indexOf(sub);
  if (i < 0) i = SUBS[street].length - 1;
  return node.subs[i];
}
function row(leaf, re) {
  var rs = leaf.rows || [];
  for (var i = 0; i < rs.length; i++) if (re.test(rs[i][0])) return rs[i];
  return null;
}
function sent(s) { s = String(s).trim(); return /[.!?]$/.test(s) ? s : s + "."; }
function line(leaf) { return leaf.act + (leaf.size ? " " + leaf.size : "") + " (" + leaf.term + ")"; }
function withNote(leaf) { return sent(line(leaf)) + (leaf.t ? " " + sent(leaf.t) : ""); }

function betTypeFor(an, street) {
  if (an.bucket === "bad") return (an.sub === "strong" || an.sub === "draw") ? "semi" : "bluff";
  if (street === "river") return (an.bucket === "gsv" || an.bucket === "gvv") ? "thin" : "value";
  return { nnv: "value", nsv: "light", nvv: "vp", gsv: "thin", gvv: "prot" }[an.bucket];
}
function raiseTypeFor(an, street) {
  if (an.bucket === "bad") return "semi";
  return (an.bucket === "nvv" && street !== "river") ? "vp" : "value";
}

function boardTop(cards) { return Math.max.apply(null, cards.map(function (c) { return c >> 2; })); }
// Dry flop: rainbow, and at most one pair of cards within 4 ranks of each other.
function isDry(board) {
  var f = board.slice(0, 3), suits = [0, 0, 0, 0], close = 0;
  f.forEach(function (c) { suits[c & 3]++; });
  if (Math.max.apply(null, suits) >= 2) return false;
  for (var i = 0; i < 3; i++) for (var j = i + 1; j < 3; j++) if (Math.abs((f[i] >> 2) - (f[j] >> 2)) <= 4) close++;
  return close <= 1;
}
// When the guide allows a pure bluff with air.
function airBluffOK(x) {
  if (x.street === "flop") return isDry(x.board) && boardTop(x.board) >= (x.pos === "ip" ? 10 : 11); // Q+ in position, K+ out of position
  if (x.street === "turn") {
    var tr = x.board[3] >> 2;
    if (x.pos === "oop") return tr >= 11;
    return tr >= 10 || (x.an.scare || []).some(function (s) { return /completes/.test(s); });
  }
  return x.villainType === "nit" && (x.an.scare || []).length > 0;
}

function ans(best, equal, close, guide, path, why) {
  return { best: best, equal: equal || [], close: close || [], guide: guide, path: path, why: why || "" };
}
function pathOf(x, role, pos) { return STREET_NAME[x.street] + " › " + ROLE_NAME[role] + " › " + POS_NAME[pos] + " › " + x.an.label; }

function answerOpen(x) {
  var s = x.street, an = x.an, b = an.bucket, bt = "bet:" + betTypeFor(an, s), T = D.T;
  if (x.role === "agg") {
    var node = T[s].agg[x.pos][b], leaf = leafOf(node, an.sub, s), path = pathOf(x, "agg", x.pos), g = withNote(leaf);
    if (b === "bad" && (an.sub === "air" || an.sub === "missed")) {
      return airBluffOK(x) ? ans("bet:bluff", [], ["check"], g, path, node.why) : ans("check", [], [], g, path, node.why);
    }
    if (leaf.k === "bet") return / or /.test(leaf.term) ? ans(bt, ["check"], [], g, path, node.why) : ans(bt, [], [], g, path, node.why);
    if (leaf.k === "mix") {
      if (s === "river" && b === "gvv") return ans("check", [], [bt], g + " The river completed a draw, so check back.", path, node.why);
      return ans(bt, ["check"], [], g, path, node.why);
    }
    if (s === "turn" && an.sub === "draw") return ans("check", [], ["bet:semi"], g, path, node.why);
    return ans("check", [], [], g, path, node.why);
  }
  if (x.pos === "ip") { // defender in position, villain checked
    var n2 = T[s].def.ip[b], path2 = pathOf(x, "def", "ip");
    if (!n2.bad) {
      var r = row(n2, /^If they check$/), g2 = sent("If they check: " + (r ? r[1] : line(n2)));
      if (s === "river" && b === "gvv") return ans("check", [], [bt], g2 + " The river completed a draw, so check back.", path2, n2.why);
      if (r && /^Check back/i.test(r[1])) return ans("check", [], [], g2, path2, n2.why);
      return ans(bt, [], ["check"], g2, path2, n2.why);
    }
    var l2 = leafOf(n2, an.sub, s), g3 = withNote(l2);
    if (an.sub === "strong" || an.sub === "draw") return ans("bet:semi", ["check"], [], "Villain checked: semi-bluff, or take the free card. " + g3, path2, n2.why);
    if (an.sub === "weak") return ans("check", [], [], "Villain checked: check back and take your showdown. " + g3, path2, n2.why);
    if (an.sub === "air") {
      if (s === "river") return x.villainCheckedTurn ? ans("bet:bluff", ["check"], [], g3, path2, n2.why) : ans("check", [], [], g3, path2, n2.why);
      return ans("bet:bluff", [], ["check"], g3, path2, n2.why);
    }
    return x.villainType === "nit" ? ans("bet:bluff", ["check"], [], g3, path2, n2.why) : ans("check", [], [], g3, path2, n2.why);
  }
  // defender out of position, first to act
  var n3 = T[s].def.oop[b], l3 = leafOf(n3, an.sub, s), path3 = pathOf(x, "def", "oop");
  if (!n3.bad && x.prevCheckedThrough && s !== "flop") {
    var prev = s === "turn" ? "flop" : "turn";
    var r3 = row(n3, new RegExp("^If they checked back the " + prev)) || row(T[prev].def.oop[b], /^If they check back$/);
    if (r3 && /^(Lead|Probe)/.test(r3[1])) return ans(bt, [], ["check"], sent(r3[0] + ": " + r3[1]), path3, n3.why);
  }
  if (!n3.bad && /^Lead/.test(l3.act)) {
    var ra = row(l3, /^Vs an aggressive/);
    if (x.villainType === "agg" && ra) return ans(bt, ["check"], [], sent(line(l3)) + " " + sent(ra[0] + ": " + ra[1]), path3, n3.why);
    return ans(bt, [], ["check"], sent(line(l3)), path3, n3.why);
  }
  var rp = !n3.bad && row(l3, /^Vs a passive player/);
  if (rp && x.villainType !== "agg") return ans(bt, ["check"], [], sent(rp[0] + ": " + rp[1]), path3, n3.why);
  return ans("check", [], [], sent(line(l3)) + " Check first, then respond.", path3, n3.why);
}

function sizeLimit(size) {
  var m = /≤\s*([\d–-]+)%/.exec(size || "");
  if (!m) return null;
  return Math.max.apply(null, m[1].split(/[–-]/).map(Number));
}

function answerVsBet(x) {
  var s = x.street, an = x.an, b = an.bucket, rt = "raise:" + raiseTypeFor(an, s), T = D.T;
  var node = null, leaf = null, role = "def";
  if (x.role === "agg") {
    var aNode = T[s].agg[x.pos][b], aLeaf = leafOf(aNode, an.sub, s);
    if (/^Check-(call|fold|raise)/.test(aLeaf.act)) { node = aNode; leaf = aLeaf; role = "agg"; }
  }
  if (!leaf) { node = T[s].def[x.pos][b]; leaf = leafOf(node, an.sub, s); }
  var path = pathOf(x, role, x.pos), g = withNote(leaf), act = leaf.act;
  if (/^Call or raise|^Check-raise or call/.test(act)) return ans("raise:semi", ["call"], [], g, path, node.why);
  if (/^(Raise|Check-raise|Lead)/.test(act)) {
    var slow = row(leaf, /^Very dry board/);
    if (slow && s === "flop" && isDry(x.board)) return ans(rt, ["call"], [], g + " " + sent(slow[1]), path, node.why);
    return ans(rt, [], ["call"], g, path, node.why);
  }
  if (/^(Call|Check-call)/.test(act)) {
    var lim = sizeLimit(leaf.size), pct = Math.round(x.betFrac * 100);
    var big = lim !== null && pct > lim + 2;
    var oneOnly = /^one bet/.test(leaf.size || "") && x.villainBarrels > 0;
    var dc = row(leaf, /^(Draw completed|Big bet on a scary river)/);
    var drawDone = (/blanks/.test(act) || !!dc) && (an.scare || []).length > 0 && x.betFrac >= 0.6;
    if (big || oneOnly || drawDone) {
      var reason = big ? "The bet is " + pct + "% of the pot and the guide calls only up to " + lim + "%."
        : oneOnly ? "The guide calls one small bet, not a second barrel."
        : "This card " + an.scare[0] + " and the bet is big.";
      return ans("fold", [], ["call"], g + " " + reason, path, node.why);
    }
    return ans("call", [], [], g, path, node.why);
  }
  if (x.villainType === "agg" && /only against (aggressive players|known bluffers)/.test(leaf.t || "") && x.betFrac <= 0.35) {
    return ans("fold", ["call"], [], g + " This villain is aggressive and the bet is small, so a call is fine too.", path, node.why);
  }
  return ans("fold", [], [], g, path, node.why);
}

function answerVsRaise(x) {
  var s = x.street, an = x.an, b = an.bucket, T = D.T;
  var node = T[s][x.role][x.pos][b], leaf = leafOf(node, an.sub, s), path = pathOf(x, x.role, x.pos);
  var r = row(leaf, /^If (check-)?raised$|^If they (re-raise|jam)$/);
  var g = sent(r ? r[0] + ": " + r[1] : (leaf.t || line(leaf)));
  var why = "Big raises at low stakes are value-heavy, so continue only with the hands the guide names.";
  if (b === "nnv" || b === "nsv" || b === "nvv") {
    if (s !== "river") return ans("jam", [], ["call"], g, path, why);
    if (b === "nnv") return ans("jam", ["call"], [], g, path, why);
    return an.beatShare <= 0.01 ? ans("call", ["jam"], [], g, path, why) : ans("fold", [], ["call"], g, path, why);
  }
  if (b === "gsv") {
    if (s === "flop") return x.villainType === "nit" ? ans("fold", [], ["call"], g + " This villain is a nit.", path, why) : ans("call", [], ["fold"], g, path, why);
    return ans("fold", [], ["call"], g, path, why);
  }
  if (b === "gvv") {
    var canContinue = s === "flop" && (an.info.kind === "overpair" || an.draws.flush || an.draws.straightRanks >= 2);
    return canContinue ? ans("call", [], ["fold"], g, path, why) : ans("fold", [], ["call"], g, path, why);
  }
  if (an.sub === "strong" && s !== "river") return ans("jam", ["call"], [], g, path, why);
  if (an.sub === "draw" && s === "flop") return ans("call", [], ["fold"], g, path, why);
  return ans("fold", [], [], g, path, why);
}

/* postAnswer(ctx): ctx = {kind: "open"|"vsBet"|"vsRaise", street, role, pos, an, board, villainType,
   prevCheckedThrough, betFrac, villainBarrels, villainCheckedTurn} */
function postAnswer(x) {
  var a = x.kind === "open" ? answerOpen(x) : x.kind === "vsBet" ? answerVsBet(x) : answerVsRaise(x);
  if (x.canRaise === false) { // someone is all-in: a raise is not possible, so the guide's raise becomes a call
    var isRaise = function (id) { return id === "jam" || id.indexOf("raise:") === 0; };
    if (isRaise(a.best)) a = ans("call", [], [], a.guide + " Raising isn't possible here because a player is all-in, so call.", a.path, a.why);
    else { a.equal = a.equal.filter(function (e) { return !isRaise(e); }); a.close = a.close.filter(function (e) { return !isRaise(e); }); }
  }
  return a;
}
function classOf(id) { return id.split(":")[0]; }
function grade(a, choice) {
  if (choice === a.best || a.equal.indexOf(choice) >= 0) return "correct";
  if (a.close.indexOf(choice) >= 0) return "almost";
  var c = classOf(choice);
  if ((c === "bet" || c === "raise") && [a.best].concat(a.equal).some(function (e) { return classOf(e) === c; })) return "almost";
  return "mistake";
}

var api = {
  OPTIONS: OPTIONS, optionKey: optionKey, optionLabel: optionLabel,
  judgePre: judgePre, catOf: catOf, callRangeOf: callRangeOf, spotOf: spotOf, rangeSet: rangeSet,
  postAnswer: postAnswer, grade: grade, betTypeFor: betTypeFor, raiseTypeFor: raiseTypeFor, isDry: isDry, sizeLimit: sizeLimit
};
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
