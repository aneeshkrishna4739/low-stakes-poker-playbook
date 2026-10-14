/* Retrospect: reads the practice database and finds what you do well, what you do badly, and why.
   Pure functions on the records store.js keeps, so tests can feed it simulated players.

   PB.retrospect(records, {scope}) → {
     hands, decisions, correct, almost, mistake, score, net, bb100, headline,
     areas: [{id, group, label, n, correct, almost, mistake, score}],
     strengths: [area], weaknesses: [area],
     leaks: [{id, title, count, opps, rate, advice, study, detail, example}],   // most common first
     trend, days }
   Score = share of decisions that follow the guide, counting an "almost" as half. */
(function (root) {
"use strict";

var MIN_STRENGTH = 5, MIN_WEAKNESS = 4;
var RAISES = ["raise", "3bet", "4bet", "jam"];
var VALUE_BETS = ["bet:value", "bet:light", "bet:vp", "bet:thin", "bet:prot"];
var VALUE_RAISES = ["raise:value", "raise:vp", "jam"];
var BLUFFS = ["bet:bluff", "bet:semi", "raise:semi"];
var NUTTED = ["nnv", "nsv", "nvv"];
var TYPE_RANK = { "bet:thin": 1, "bet:value": 1, "bet:light": 2, "bet:prot": 2.5, "bet:vp": 3, "raise:value": 1, "raise:vp": 3, "jam": 3 };

var BUCKET_LABEL = {
  nnv: "Nutted · non-vulnerable", nsv: "Nutted · slightly vulnerable", nvv: "Nutted · very vulnerable",
  gsv: "Good · slightly vulnerable", gvv: "Good · very vulnerable",
  "bad:strong": "Bad hand · strong draw", "bad:draw": "Bad hand · draw", "bad:weak": "Bad hand · weak showdown",
  "bad:air": "Bad hand · air", "bad:missed": "Bad hand · missed draw"
};
var OPTION_LABEL = {
  fold: "Fold", call: "Call", check: "Check", raise: "Raise", "3bet": "3-bet", "4bet": "4-bet", jam: "All-in",
  "bet:value": "Value bet", "bet:light": "Value bet, light protection", "bet:vp": "Value + protection bet",
  "bet:thin": "Thin value bet", "bet:prot": "Protection bet", "bet:semi": "Semi-bluff", "bet:bluff": "Bluff",
  "raise:value": "Raise for value", "raise:vp": "Value + protection raise", "raise:semi": "Semi-bluff raise"
};
function labelOf(id) { return OPTION_LABEL[id] || id; }

function isPre(d) { return d.street === "preflop"; }
function facing(d) { return d.kind === "vsBet" || d.kind === "vsRaise"; }
function ok(d) { return d.verdict === "correct"; }
function bucketKey(d) { return d.bucket === "bad" ? "bad:" + (d.sub || "air") : d.bucket; }
function inList(x, list) { return list.indexOf(x) >= 0; }
function good(d) { return [d.best].concat(d.also || []); }

/* ---------- areas: where you play well or badly ---------- */
var AREAS = [
  { id: "pre-rfi", group: "Preflop", label: "Opening when it folds to you", test: function (d) { return d.kind === "pre-rfi"; } },
  { id: "pre-vsopen", group: "Preflop", label: "Facing an open", test: function (d) { return d.kind === "pre-vsopen"; } },
  { id: "pre-vs3bet", group: "Preflop", label: "Facing a 3-bet", test: function (d) { return d.kind === "pre-vs3bet"; } },
  { id: "pre-vs4bet", group: "Preflop", label: "Facing a 4-bet or all-in", test: function (d) { return d.kind === "pre-vs4bet" || d.kind === "pre-vs5bet"; } },
  { id: "open", group: "Postflop", label: "Betting first or checked to", test: function (d) { return d.kind === "open"; } },
  { id: "vsBet", group: "Postflop", label: "Facing a bet", test: function (d) { return d.kind === "vsBet"; } },
  { id: "vsRaise", group: "Postflop", label: "Facing a raise", test: function (d) { return d.kind === "vsRaise"; } },
  { id: "pot-hu", group: "Pot", label: "Heads-up pots", test: function (d) { return !isPre(d) && !d.multiway; } },
  { id: "pot-mw", group: "Pot", label: "Multiway pots (3+ players)", test: function (d) { return !!d.multiway; } },
  { id: "flop", group: "Street", label: "Flop", test: function (d) { return d.street === "flop"; } },
  { id: "turn", group: "Street", label: "Turn", test: function (d) { return d.street === "turn"; } },
  { id: "river", group: "Street", label: "River", test: function (d) { return d.street === "river"; } },
  { id: "agg-ip", group: "Role", label: "Aggressor in position", test: function (d) { return d.role === "agg" && d.pos === "ip"; } },
  { id: "agg-oop", group: "Role", label: "Aggressor out of position", test: function (d) { return d.role === "agg" && d.pos === "oop"; } },
  { id: "def-ip", group: "Role", label: "Defender in position", test: function (d) { return d.role === "def" && d.pos === "ip"; } },
  { id: "def-oop", group: "Role", label: "Defender out of position", test: function (d) { return d.role === "def" && d.pos === "oop"; } }
].concat(Object.keys(BUCKET_LABEL).map(function (k) {
  return { id: "b-" + k, group: "Hand bucket", label: BUCKET_LABEL[k], test: function (d) { return !isPre(d) && bucketKey(d) === k; } };
}));

/* ---------- leaks: the patterns behind the mistakes ---------- */
var LEAKS = [
  { id: "preflop_loose", title: "Playing hands the chart folds",
    opp: function (d) { return isPre(d) && d.best === "fold"; },
    test: function (d) { return d.choice !== "fold"; },
    advice: "The charts are tight on purpose. Hands outside the range for your seat lose money at low stakes, and calling with them is the costliest leak preflop.",
    study: "Preflop ranges › Open and 3-bet, for your seat" },
  { id: "preflop_tight", title: "Folding hands the chart plays",
    opp: function (d) { return isPre(d) && d.best !== "fold"; },
    test: function (d) { return d.choice === "fold"; },
    advice: "Late seats and the blinds play much wider than early seats. Check the chart for your exact seat and the opener's seat before folding.",
    study: "Preflop ranges › Open, 3-bet and 4-bet" },
  { id: "preflop_passive", title: "Calling when the chart raises",
    opp: function (d) { return isPre(d) && inList(d.best, RAISES); },
    test: function (d) { return d.choice === "call"; },
    advice: "Value hands want a raise: flat-calling lets weaker hands see a cheap flop. At 100bb, never flat a 4-bet: jam or fold.",
    study: "Preflop ranges › 3-bet and 4-bet" },
  { id: "preflop_overraise", title: "Raising hands the chart just calls",
    opp: function (d) { return isPre(d) && d.best === "call"; },
    test: function (d) { return inList(d.choice, RAISES); },
    advice: "Hands in the call range play well in position and in multiway pots, but they can't stand a re-raise. Raise only the value and bluff hands the chart marks.",
    study: "Preflop ranges › 3-bet and 4-bet" },
  { id: "missed_value", title: "Checking hands the guide bets for value",
    opp: function (d) { return d.kind === "open" && inList(d.best, VALUE_BETS); },
    test: function (d) { return d.choice === "check"; },
    advice: "With a Nutted or Good hand, bet. This pool calls too much, so checking gives away value and hands your opponent a free card.",
    study: "Postflop tree › Nutted and Good buckets" },
  { id: "slowplay", title: "Just calling with nutted hands",
    opp: function (d) { return facing(d) && inList(d.bucket, NUTTED) && inList(d.best, VALUE_RAISES); },
    test: function (d) { return d.choice === "call"; },
    advice: "When you face a bet with a Nutted hand, raise. Low-stakes players pay off raises with top pair, and a vulnerable nut hand needs protection.",
    study: "Postflop tree › Defender › Nutted buckets" },
  { id: "wrong_type", title: "Right idea, wrong bet type",
    opp: function (d) { return inList(d.best, VALUE_BETS) || (facing(d) && inList(d.best, VALUE_RAISES)); },
    test: function (d) { return (inList(d.choice, VALUE_BETS) || inList(d.choice, VALUE_RAISES) || inList(d.choice, BLUFFS)) && !inList(d.choice, good(d)); },
    advice: "Count the bad next cards before you size: Nutted 0–4 is a value bet, 5–9 a value bet with light protection, 10+ value + protection. A Good hand is a thin value bet, or a protection bet at 10+.",
    study: "Buckets & rules › Hand buckets" },
  { id: "bet_when_check", title: "Betting hands the guide checks",
    opp: function (d) { return d.kind === "open" && d.best === "check"; },
    test: function (d) { return d.choice.indexOf("bet:") === 0 && !inList(d.choice, good(d)) && !(d.bucket === "bad" && inList(d.choice, BLUFFS)); },
    advice: "When the guide checks, worse hands won't call a bet. Second pair, underpairs and ace high are Bad · weak showdown: check and take a cheap showdown. A Good hand checks back when the river completes a draw.",
    study: "Postflop tree › Bad hand · weak showdown, and the river" },
  { id: "over_bluff", title: "Bluffing when the guide gives up",
    opp: function (d) { return !isPre(d) && d.bucket === "bad"; },
    test: function (d) { return inList(d.choice, BLUFFS) && !inList(d.choice, good(d)); },
    advice: "This pool calls too much. Bluff only where the guide allows it (dry A, K or Q-high flops, good turn cards, nits on the river), and semi-bluff only with 8 or more outs.",
    study: "Postflop tree › Bad hand" },
  { id: "missed_semi", title: "Passing up semi-bluffs and bluff spots",
    opp: function (d) { return inList(d.best, BLUFFS); },
    test: function (d) { return !inList(d.choice, BLUFFS) && !inList(d.choice, good(d)); },
    advice: "With a strong draw, bet or raise: you win when they fold and when you hit. On dry high-card flops the guide also takes a small stab with air.",
    study: "Postflop tree › Bad hand · strong draw" },
  { id: "calling_station", title: "Calling bets the guide folds",
    opp: function (d) { return facing(d) && d.best === "fold"; },
    test: function (d) { return d.choice === "call"; },
    advice: "Check the size limit in the guide entry (for example “bets ≤ 33%”). Big turn and river bets at low stakes are value: fold one pair and weak draws.",
    study: "Postflop tree › Defender, and Pot odds in Buckets & rules" },
  { id: "raise_light", title: "Raising hands that should call or fold",
    opp: function (d) { return facing(d) && !inList(d.bucket, NUTTED) && !inList(d.best, VALUE_RAISES) && d.best !== "raise:semi"; },
    test: function (d) { return (inList(d.choice, VALUE_RAISES) || d.choice === "raise:semi") && !inList(d.choice, good(d)) && !(d.bucket === "bad" && d.choice === "raise:semi"); },
    advice: "Facing a bet, a Good hand is a bluff catcher. Raising folds out worse hands and gets called by better ones.",
    study: "Postflop tree › Good buckets, facing a bet" },
  { id: "overfold", title: "Folding hands the guide continues with",
    opp: function (d) { return facing(d) && d.best !== "fold"; },
    test: function (d) { return d.choice === "fold"; },
    advice: "Good hands call bets up to the guide's size limit, and draws call when the price is right. Folding too often lets aggressive players run you over.",
    study: "Postflop tree › Defender, and Outs in Buckets & rules" }
];

function pct(x) { return Math.round(x * 100) + "%"; }
function day(ts) { var d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate(); }
function tally(list) {
  var t = { n: list.length, correct: 0, almost: 0, mistake: 0 };
  list.forEach(function (d) { t[d.verdict] = (t[d.verdict] || 0) + 1; });
  t.score = t.n ? (t.correct + 0.5 * t.almost) / t.n : 0;
  return t;
}

function filterScope(records, scope, now) {
  var sorted = records.slice().sort(function (a, b) { return a.ts - b.ts; });
  if (scope === "week") { var from = (now || Date.now()) - 7 * 864e5; return sorted.filter(function (r) { return r.ts >= from; }); }
  if (scope === "last100") return sorted.slice(-100);
  return sorted;
}

function retrospect(records, opts) {
  opts = opts || {};
  var hands = filterScope(records || [], opts.scope, opts.now);
  var flat = [];
  hands.forEach(function (r) { (r.decisions || []).forEach(function (d) { flat.push({ d: d, r: r }); }); });
  var all = flat.map(function (x) { return x.d; });
  var total = tally(all);
  var net = Math.round(hands.reduce(function (s, r) { return s + (r.net || 0); }, 0) * 10) / 10;

  var areas = AREAS.map(function (a) {
    var t = tally(all.filter(a.test));
    return { id: a.id, group: a.group, label: a.label, n: t.n, correct: t.correct, almost: t.almost, mistake: t.mistake, score: t.score };
  }).filter(function (a) { return a.n > 0; });

  var strengths = areas.filter(function (a) { return a.n >= MIN_STRENGTH && a.score >= 0.8 && a.group !== "Street"; })
    .sort(function (a, b) { return b.score - a.score || b.n - a.n; }).slice(0, 4);
  var weaknesses = areas.filter(function (a) { return a.n >= MIN_WEAKNESS && a.score < 0.7 && a.group !== "Street"; })
    .sort(function (a, b) { return (b.mistake + 0.5 * b.almost) - (a.mistake + 0.5 * a.almost) || a.score - b.score; }).slice(0, 4);

  var leaks = LEAKS.map(function (L) {
    var opps = flat.filter(function (x) { return L.opp(x.d); });
    var hits = opps.filter(function (x) { return !ok(x.d) && L.test(x.d); });
    if (!hits.length) return null;
    var ex = hits[hits.length - 1], detail = "";
    if (L.id === "wrong_type") {
      var mix = {}, under = 0;
      hits.forEach(function (x) {
        var k = labelOf(x.d.choice) + " instead of " + labelOf(x.d.best);
        mix[k] = (mix[k] || 0) + 1;
        if ((TYPE_RANK[x.d.choice] || 0) < (TYPE_RANK[x.d.best] || 0)) under++;
      });
      var top = Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; })[0];
      detail = "Most often: " + top + " (" + mix[top] + "×). " + (under * 2 >= hits.length ? "You tend to bet too small for how vulnerable the hand is." : "You tend to bet bigger than the hand needs.");
    }
    return {
      id: L.id, title: L.title, count: hits.length, opps: opps.length, rate: hits.length / opps.length,
      advice: L.advice, study: L.study, detail: detail,
      example: { handId: ex.r.id, ts: ex.r.ts, hole: ex.r.hole, seat: ex.r.seat, board: ex.d.board, street: ex.d.street, situation: ex.d.situation,
        choice: ex.d.choiceLabel || labelOf(ex.d.choice), best: ex.d.bestLabel || labelOf(ex.d.best), guide: ex.d.guide, bucket: ex.d.bucket ? BUCKET_LABEL[bucketKey(ex.d)] : "" }
    };
  }).filter(Boolean).sort(function (a, b) { return b.count - a.count || b.rate - a.rate; });

  var misses = flat.filter(function (x) { return !ok(x.d); });
  var explained = misses.filter(function (x) { return LEAKS.some(function (L) { return L.opp(x.d) && L.test(x.d); }); }).length;

  var trend = null;
  if (all.length >= 60) trend = { earlier: tally(all.slice(0, all.length - 50)), recent: tally(all.slice(-50)), recentLabel: "Last 50 decisions", earlierLabel: "Before that" };
  else if (all.length >= 20) { var h = Math.floor(all.length / 2); trend = { earlier: tally(all.slice(0, h)), recent: tally(all.slice(h)), recentLabel: "Second half", earlierLabel: "First half" }; }

  var byDay = {};
  hands.forEach(function (r) {
    var k = day(r.ts), e = byDay[k] || (byDay[k] = { day: k, hands: 0, decisions: [], net: 0 });
    e.hands++; e.net += r.net || 0; e.decisions = e.decisions.concat(r.decisions || []);
  });
  var days = Object.keys(byDay).sort().slice(-7).reverse().map(function (k) {
    var e = byDay[k], t = tally(e.decisions);
    return { day: k, hands: e.hands, decisions: t.n, score: t.score, net: Math.round(e.net * 10) / 10 };
  });

  var headline = "";
  if (total.n) {
    headline = "You follow the guide on " + pct(total.score) + " of your decisions";
    if (strengths[0]) headline += ". Best area: " + strengths[0].label.toLowerCase() + " (" + pct(strengths[0].score) + ")";
    if (leaks[0]) headline += ". Biggest leak: " + leaks[0].title.toLowerCase() + " (" + leaks[0].count + (leaks[0].count === 1 ? " time" : " times") + ")";
    headline += ".";
  }

  return {
    scope: opts.scope || "all", hands: hands.length, decisions: total.n, correct: total.correct, almost: total.almost, mistake: total.mistake,
    score: total.score, net: net, bb100: hands.length ? Math.round(net / hands.length * 1000) / 10 : 0,
    first: hands.length ? hands[0].ts : null, last: hands.length ? hands[hands.length - 1].ts : null,
    headline: headline, areas: areas, strengths: strengths, weaknesses: weaknesses, leaks: leaks,
    explained: misses.length ? explained / misses.length : 1, trend: trend, days: days
  };
}

/* The request for Claude's coaching report: the numbers above plus a few recent mistakes. */
function coachPrompt(rep, records, guideRules) {
  var L = [];
  L.push("You are a poker coach. A student practices low-stakes cash games (NL2–NL50, 100bb) with a playbook built to exploit loose, passive player pools.");
  L.push("A rule-based judge graded every practice decision against the playbook. Below are the totals, the areas, the leak patterns and recent mistakes.");
  L.push("Write a short coaching retrospective in plain text: no markdown, no asterisks. Use exactly these four headings, each on its own line in capitals:");
  L.push("STRENGTHS, WEAKNESSES, AREAS TO IMPROVE, NEXT SESSION PLAN.");
  L.push("Under each heading write 2 to 4 lines starting with \"- \". Be specific: name the spot, the hand bucket or bet type, and cite the numbers. In AREAS TO IMPROVE, say what to do differently, using the playbook's rules. The plan should be concrete drills for the next 30 to 50 hands. Stay under 280 words. Results in bb are a small sample and swing a lot: judge decisions, not results.");
  if (guideRules) { L.push(""); L.push("PLAYBOOK RULES"); L.push(guideRules); }
  L.push("");
  L.push("TOTALS (" + (rep.scope === "week" ? "last 7 days" : rep.scope === "last100" ? "last 100 hands" : "all practice") + ")");
  L.push(rep.hands + " hands, " + rep.decisions + " decisions. Correct " + rep.correct + ", almost " + rep.almost + ", mistakes " + rep.mistake + ". Score " + pct(rep.score) + " (almost counts half). Result " + rep.net + "bb (" + rep.bb100 + "bb per 100 hands).");
  if (rep.trend) L.push("Trend: " + rep.trend.earlierLabel + " " + pct(rep.trend.earlier.score) + " over " + rep.trend.earlier.n + " decisions; " + rep.trend.recentLabel.toLowerCase() + " " + pct(rep.trend.recent.score) + ".");
  L.push("");
  L.push("AREAS (decisions, score)");
  rep.areas.forEach(function (a) { L.push("- " + a.group + " · " + a.label + ": " + a.n + ", " + pct(a.score) + " (" + a.mistake + " mistakes, " + a.almost + " almost)"); });
  L.push("");
  L.push("LEAK PATTERNS (times / chances)");
  if (!rep.leaks.length) L.push("- none found");
  rep.leaks.forEach(function (k) { L.push("- " + k.title + ": " + k.count + " / " + k.opps + (k.detail ? ". " + k.detail : "")); });
  var recent = [];
  (records || []).slice().sort(function (a, b) { return b.ts - a.ts; }).some(function (r) {
    (r.decisions || []).forEach(function (d) { if (d.verdict !== "correct" && recent.length < 8) recent.push({ r: r, d: d }); });
    return recent.length >= 8;
  });
  if (recent.length) {
    L.push("");
    L.push("RECENT MISTAKES");
    recent.forEach(function (x, i) {
      var d = x.d, r = x.r;
      L.push((i + 1) + ". " + r.seat + " with " + r.hole + (d.board ? ", board " + d.board : "") + ". " + d.situation + " Chose " + (d.choiceLabel || labelOf(d.choice)) + "; guide: " + (d.bestLabel || labelOf(d.best)) + " (" + d.verdict + ")." + (d.bucket ? " Bucket: " + BUCKET_LABEL[bucketKey(d)] + "." : "") + " Guide said: " + d.guide);
    });
  }
  return L.join("\n");
}

var api = { retrospect: retrospect, coachPrompt: coachPrompt, AREAS: AREAS, LEAKS: LEAKS, BUCKET_LABEL: BUCKET_LABEL, optionLabelShort: labelOf };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
