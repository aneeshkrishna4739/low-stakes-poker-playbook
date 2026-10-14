/* Practice tab, in three views:
   - Play: deals hands with sim.js, takes your decisions, shows the judge's verdict. Every finished hand
     is saved to the practice database (store.js).
   - History: the database, hand by hand, with export, import and delete.
   - Retrospect: retro.js reads the database for strengths, weaknesses and leaks.
   Claude (the `sample` capability) reviews a hand or writes a coaching report in the online version.
   It spends the viewer's own Claude usage after they allow it. The local file has no Claude access,
   so it offers "Copy for Claude" instead: the same request, ready to paste into a chat. */
(function () {
"use strict";
var PB = window.PB;
var root = document.getElementById("practice");
if (!root || !PB.newHand) return;

var store = PB.createStore();
var view = "play";
var st = null, fb = null, snap = null, sample = null;
var ai = blankAI(), aiCtl = null;            // Claude's review of one hand
var rai = blankAI(), raiCtl = null;          // Claude's coaching report
var hist = { filter: "all", shown: 25, confirm: false, msg: "", open: {} };
var retroScope = "all";

function blankAI() { return { status: "idle", text: "", note: "", copied: "", fallback: "" }; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
function pct(x) { return Math.round(x * 100) + "%"; }
function signed(x) { return (x > 0 ? "+" : "") + x; }
function cardsInText(s) {
  return esc(s).replace(/((?:[2-9TJQKA][♠♥♦♣])+)/g, function (m) {
    return '<span class="card">' + m.replace(/([2-9TJQKA])([♥♦])/g, '<span class="red">$1$2</span>') + "</span>";
  });
}
function card(c, big) {
  var r = PB.RANKS[c >> 2], red = (c & 3) === 1 || (c & 3) === 2;
  return '<span class="pc' + (red ? " red" : "") + (big ? " lg" : "") + '" aria-label="' + PB.cardText(c) + '"><b>' + (r === "T" ? "10" : r) + "</b><i>" + PB.SUITS[c & 3] + "</i></span>";
}
function back(big) { return '<span class="pc back' + (big ? " lg" : "") + '" aria-label="Hidden card"></span>'; }
function slot() { return '<span class="pc slot" aria-hidden="true"></span>'; }
function when(ts) {
  try { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch (e) { return new Date(ts).toISOString().slice(0, 16).replace("T", " "); }
}
function dayName(d) {
  try { return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return d; }
}
var VERDICT = { correct: "Correct", almost: "Almost", mistake: "Mistake" };
function optClass(id) { return id === "fold" ? " k-fold" : (id === "call" || id === "check") ? " k-pass" : " k-aggr"; }

/* ---------- header: views, totals, where hands are saved ---------- */
function totals() {
  var t = { hands: store.records.length, n: 0, correct: 0, almost: 0, mistake: 0, net: 0 };
  store.records.forEach(function (r) {
    t.net += r.net || 0;
    (r.decisions || []).forEach(function (d) { t.n++; t[d.verdict] = (t[d.verdict] || 0) + 1; });
  });
  t.net = Math.round(t.net * 10) / 10;
  return t;
}
function savedText() {
  if (store.kind === "loading") return "Opening your practice history…";
  if (store.kind === "cloud") return "Every hand is saved to your Claude account, private to you.";
  if (store.kind === "local") return "Every hand is saved in this browser. Export from History to keep a copy.";
  return "This browser blocks storage, so hands are kept only until you close the page. Export from History to keep them.";
}
function head() {
  var t = totals();
  var views = [["play", "Play"], ["history", "History"], ["retro", "Retrospect"]];
  var stats = store.kind === "loading" ? "" :
    "<b>" + plural(t.hands, "hand", "hands") + "</b> · " + plural(t.n, "decision", "decisions") +
    (t.n ? " · <b>" + pct((t.correct + 0.5 * t.almost) / t.n) + "</b> following the guide · <b>" + signed(t.net) + "bb</b>" : "");
  return '<div class="pr-head">' +
    '<div class="seg" role="group" aria-label="Practice view">' + views.map(function (v) {
      return '<button data-view="' + v[0] + '" aria-pressed="' + (view === v[0]) + '">' + v[1] + "</button>";
    }).join("") + "</div>" +
    '<div class="pr-meta"><span class="pr-stats">' + stats + '</span><span class="pr-saved' + (store.error ? " warn" : "") + '">' + esc(store.error || savedText()) + "</span></div>" +
  "</div>";
}

/* ---------- Play ---------- */
function deal() {
  if (aiCtl) { aiCtl.abort(); aiCtl = null; }
  st = PB.newHand({ players: PB.getPlayers ? PB.getPlayers() : 6 });
  fb = null; snap = null; ai = blankAI();
  render();
}
function choose(id) {
  if (!st || !st.prompt || fb) return;
  snap = { board: st.board.slice(), logLen: st.log.length, pot: PB.potOf(st), stack: PB.stackOf(st, "hero") };
  var d = PB.choose(st, id);
  if (!d) return;
  if (st.done && !st.saved) { st.saved = true; store.add(PB.toRecord(st)); }
  fb = d;
  render();
  var btn = root.querySelector('[data-act="continue"]');
  if (btn) btn.focus({ preventScroll: true });
}
function cont() {
  fb = null; snap = null;
  render();
  var first = root.querySelector(".opt, [data-act='deal']");
  if (first) first.focus({ preventScroll: true });
}

function table() {
  var showing = fb ? snap : null;
  var board = showing ? showing.board : st.board;
  var potNow = showing ? showing.pot : PB.potOf(st), stack = showing ? showing.stack : PB.stackOf(st, "hero");
  var boardHTML = "";
  for (var i = 0; i < 5; i++) boardHTML += i < board.length ? card(board[i]) : slot();
  var revealed = st.done && !fb && st.showdown;
  var villainCards = st.villainSeat ? (revealed ? card(st.villain[0], true) + card(st.villain[1], true) : back(true) + back(true)) : "";
  var who = st.players + "-handed · <b>You: " + esc(st.heroSeat) + "</b>" + (st.villainSeat ? " · Villain: " + esc(st.villainSeat) + " (" + esc(st.villainName) + ")" : "");
  return '<div class="felt">' +
    '<div class="felt-top"><span>' + who + "</span><span>Pot <b>" + PB.bbText(potNow) + "</b> · Your stack <b>" + PB.bbText(stack) + "</b></span></div>" +
    '<div class="board" aria-label="Board">' + boardHTML + "</div>" +
    '<div class="hands">' +
      '<div class="hand"><span class="k">Your hand</span><div class="cards">' + card(st.hero[0], true) + card(st.hero[1], true) + "</div></div>" +
      (villainCards ? '<div class="hand right"><span class="k">Villain' + (revealed ? " · " + esc(st.showdown.villain) : "") + '</span><div class="cards">' + villainCards + "</div></div>" : "") +
    "</div>" +
  "</div>";
}
function actionLog() {
  var logs = fb ? st.log.slice(0, snap.logLen) : st.log;
  return '<ol class="hlog">' + logs.map(function (l) {
    var street = /^(Flop|Turn|River): /.test(l.text);
    return '<li class="' + (street ? "street" : l.who) + '">' + cardsInText(l.text) + "</li>";
  }).join("") + "</ol>";
}
function prompt() {
  var p = st.prompt;
  return '<div class="decide"><p class="prompt">' + cardsInText(p.text) + '</p><div class="opts">' +
    p.options.map(function (o) {
      return '<button class="opt' + optClass(o.id) + '" data-choice="' + esc(o.id) + '"><span class="ol">' + esc(o.label) + "</span>" +
        (o.sub ? '<span class="os">' + esc(o.sub) + "</span>" : "") + (o.size ? '<span class="oz">' + esc(o.size) + "</span>" : "") + "</button>";
    }).join("") + "</div></div>";
}
function feedback() {
  var d = fb, same = d.verdict === "correct" && d.choice === d.best;
  var guideAnswer = d.bestLabel + (d.equalLabels && d.equalLabels.length ? " (or " + d.equalLabels.join(", ") + ")" : "");
  return '<div class="fb v-' + d.verdict + '">' +
    '<div class="fb-top"><span class="verdict">' + VERDICT[d.verdict] + '</span><span class="fb-street">' + cap(d.street) + "</span></div>" +
    '<dl class="fb-rows">' +
      "<div><dt>You chose</dt><dd>" + esc(d.choiceLabel) + "</dd></div>" +
      (same ? "" : "<div><dt>The guide</dt><dd>" + esc(guideAnswer) + "</dd></div>") +
      "<div><dt>Your hand</dt><dd>" + cardsInText(d.handText) + "</dd></div>" +
      (d.path ? '<div><dt>Guide entry</dt><dd><span class="path">' + esc(d.path) + "</span><br>" + cardsInText(d.guide) + "</dd></div>" : "<div><dt>Guide</dt><dd>" + cardsInText(d.guide) + "</dd></div>") +
      (d.why ? "<div><dt>Why</dt><dd>" + esc(d.why) + "</dd></div>" : "") +
    "</dl>" +
    '<div class="fb-actions"><button class="btn primary" data-act="continue">' + (st.done ? "See the result" : "Continue") + "</button></div>" +
  "</div>";
}
function summary() {
  var r = st.result, counts = { correct: 0, almost: 0, mistake: 0 };
  st.decisions.forEach(function (d) { counts[d.verdict]++; });
  var list = st.decisions.map(function (d) {
    return '<li><span class="chip c-' + d.verdict + '">' + VERDICT[d.verdict] + "</span><span><b>" + cap(d.street) + "</b> · you: " + esc(d.choiceLabel) +
      (d.verdict === "correct" && d.choice === d.best ? "" : " · guide: " + esc(d.bestLabel)) + "</span></li>";
  }).join("");
  return '<div class="summary">' +
    '<div class="sum-head"><span class="result ' + (r.net > 0 ? "win" : r.net < 0 ? "lose" : "") + '">' + esc(r.text.replace(/\.$/, "")) + "</span>" +
    '<span class="muted">' + counts.correct + " correct · " + counts.almost + " almost · " + plural(counts.mistake, "mistake", "mistakes") + "</span></div>" +
    (st.showdown ? '<p class="muted">Villain showed ' + cardsInText(PB.cardsText(st.villain)) + " (" + esc(st.showdown.villain) + "). You had " + esc(st.showdown.hero) + ".</p>" : "") +
    '<ol class="sum-list">' + list + "</ol>" +
    '<div class="ai" id="ai-box">' + aiBox(ai, "hand") + "</div>" +
    '<div class="fb-actions"><button class="btn primary" data-act="deal">Next hand</button></div>' +
  "</div>";
}
function playView() {
  var action = fb ? feedback() : st.done ? summary() : prompt();
  return '<div class="play-bar"><button class="btn" data-act="deal">Deal a new hand</button></div>' +
    '<div class="pr-grid"><div class="pr-table">' + table() + actionLog() + '</div><div class="pr-action">' + action + "</div></div>";
}

/* ---------- History ---------- */
function verdictSummary(r) {
  var c = { correct: 0, almost: 0, mistake: 0 };
  (r.decisions || []).forEach(function (d) { c[d.verdict]++; });
  if (!c.almost && !c.mistake) return '<span class="chip c-correct">All correct</span>';
  return (c.mistake ? '<span class="chip c-mistake">' + plural(c.mistake, "mistake", "mistakes") + "</span>" : "") +
    (c.almost ? '<span class="chip c-almost">' + c.almost + " almost</span>" : "");
}
function handRow(r) {
  var dec = (r.decisions || []).map(function (d) {
    var same = d.verdict === "correct" && d.choice === d.best;
    return '<li class="hd"><div class="hd-top"><span class="chip c-' + d.verdict + '">' + VERDICT[d.verdict] + "</span><b>" + cap(d.street) + "</b>" +
      (d.board && d.street !== "preflop" ? " · " + cardsInText(d.board) : "") + "</div>" +
      '<p class="hd-sit">' + cardsInText(d.situation || "") + "</p>" +
      '<p class="hd-pick">You: <b>' + esc(d.choiceLabel || d.choice) + "</b>" + (same ? "" : " · Guide: <b>" + esc(d.bestLabel || d.best) + "</b>") + "</p>" +
      (d.bucket ? '<p class="hd-meta">' + esc(PB.BUCKET_LABEL[d.bucket === "bad" ? "bad:" + (d.sub || "air") : d.bucket] || "") + (d.path ? " · " + esc(d.path.split(" › ").slice(0, 3).join(" › ")) : "") + "</p>" : "") +
      '<p class="hd-guide">' + cardsInText(d.guide || "") + "</p></li>";
  }).join("");
  var villain = r.villainSeat ? "Villain: " + esc(r.villainSeat) + " (" + esc((PB.VILLAINS || {})[r.villainType] || r.villainType) + ")" + (r.villainHole ? " with " + cardsInText(r.villainHole) : "") + (r.showdown ? ". Showdown: you had " + esc(r.showdown.hero) + ", villain " + esc(r.showdown.villain) + "." : ".") : "Nobody called.";
  return '<li><details data-hand="' + esc(r.id) + '"' + (hist.open[r.id] ? " open" : "") + ">" +
    '<summary><span class="hs-when">' + esc(when(r.ts)) + '</span><span class="hs-seat">' + esc(r.players + "-max · " + r.seat) + '</span><span class="hs-cards">' + cardsInText(r.hole) + (r.board ? ' <span class="hs-board">' + cardsInText(r.board) + "</span>" : "") +
    '</span><span class="hs-net ' + (r.net > 0 ? "win" : r.net < 0 ? "lose" : "") + '">' + signed(r.net) + 'bb</span><span class="hs-v">' + verdictSummary(r) + "</span></summary>" +
    '<div class="hand-body"><p class="muted">' + villain + '</p><ol class="hd-list">' + dec + "</ol></div></details></li>";
}
function historyView() {
  if (store.kind === "loading") return '<p class="muted">Opening your practice history…</p>';
  var all = store.records.slice().reverse();
  var withMistakes = all.filter(function (r) { return (r.decisions || []).some(function (d) { return d.verdict !== "correct"; }); });
  var list = hist.filter === "mistakes" ? withMistakes : all;
  var tools = '<div class="hist-tools"><div class="chips" role="group" aria-label="Show">' +
      '<button class="chip-btn" data-hfilter="all" aria-pressed="' + (hist.filter === "all") + '">All hands (' + all.length + ")</button>" +
      '<button class="chip-btn" data-hfilter="mistakes" aria-pressed="' + (hist.filter === "mistakes") + '">With mistakes (' + withMistakes.length + ")</button></div>" +
    '<div class="hist-actions"><button class="btn" data-act="export-json"' + (all.length ? "" : " disabled") + ">Export JSON</button>" +
    '<button class="btn" data-act="export-csv"' + (all.length ? "" : " disabled") + ">Export CSV</button>" +
    '<button class="btn" data-act="import">Import</button>' +
    '<button class="btn danger" data-act="delete-all"' + (all.length ? "" : " disabled") + ">Delete all</button>" +
    '<input type="file" id="import-file" accept=".json,application/json" hidden></div></div>';
  var confirm = hist.confirm ? '<div class="confirm" role="alert"><p>Delete all ' + plural(all.length, "hand", "hands") + "? This can't be undone. Export first if you want a copy.</p>" +
    '<div class="fb-actions"><button class="btn danger-solid" data-act="delete-yes">Delete everything</button><button class="btn" data-act="delete-no">Cancel</button></div></div>' : "";
  var msg = hist.msg ? '<p class="hist-msg" role="status">' + esc(hist.msg) + "</p>" : "";
  if (!all.length) return tools + msg + '<div class="empty"><p><b>No hands yet.</b> Every hand you finish in Play is saved here with each decision and the guide\'s verdict.</p><button class="btn primary" data-view="play">Play a hand</button></div>';
  var shown = list.slice(0, hist.shown);
  return tools + confirm + msg +
    '<ol class="hist-list">' + shown.map(handRow).join("") + "</ol>" +
    (list.length > shown.length ? '<div class="fb-actions"><button class="btn" data-act="more">Show ' + Math.min(25, list.length - shown.length) + " more</button></div>" : "");
}

function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportData(kind) {
  var recs = store.records, stamp = new Date().toISOString().slice(0, 10), data, filename, type;
  if (kind === "json") {
    data = JSON.stringify({ app: "low-stakes-poker-playbook", version: 1, exported: new Date().toISOString(), hands: recs }, null, 1);
    filename = "poker-practice-" + stamp + ".json"; type = "application/json";
  } else {
    var rows = [["hand_id", "time", "players", "seat", "villain_seat", "villain_type", "hole", "board", "result_bb", "decision", "street", "situation", "you_chose", "guide_answer", "verdict", "bucket", "guide_entry"]];
    recs.forEach(function (r) {
      (r.decisions || []).forEach(function (d, i) {
        rows.push([r.id, new Date(r.ts).toISOString(), r.players, r.seat, r.villainSeat, r.villainType, r.hole, r.board, r.net, i + 1, d.street, d.situation,
          d.choiceLabel || d.choice, d.bestLabel || d.best, d.verdict, d.bucket ? (PB.BUCKET_LABEL[d.bucket === "bad" ? "bad:" + (d.sub || "air") : d.bucket] || d.bucket) : (d.chart || ""), d.path || ""]);
      });
    });
    data = "﻿" + rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
    filename = "poker-practice-" + stamp + ".csv"; type = "text/csv";
  }
  function viaLink() {
    try {
      var url = URL.createObjectURL(new Blob([data], { type: type })), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      hist.msg = "Saved " + filename + " to your downloads.";
    } catch (e) { hist.msg = "Couldn't create the file here."; }
    render();
  }
  var c = window.claude;
  if (c && typeof c.use === "function") {
    c.use("downloads").then(function (dl) {
      if (!dl) return viaLink();
      dl.save({ filename: filename, data: data }).then(function () { hist.msg = "Saved " + filename + "."; render(); }, function (e) {
        hist.msg = e && e.code === "declined" ? "" : "Couldn't save the file here."; render();
      });
    }, viaLink);
  } else viaLink();
}
function importFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var list;
    try { var parsed = JSON.parse(String(reader.result)); list = Array.isArray(parsed) ? parsed : parsed && parsed.hands; } catch (e) { list = null; }
    if (!Array.isArray(list)) { hist.msg = "That file isn't a practice export. Choose a .json file made with Export JSON."; return render(); }
    var valid = list.filter(PB.isRecord);
    hist.msg = "Importing " + plural(valid.length, "hand", "hands") + "…"; render();
    store.importMany(valid).then(function (res) {
      hist.msg = "Imported " + plural(res.added, "hand", "hands") + (res.skipped ? " (" + res.skipped + " were already here)" : "") + "."; render();
    });
  };
  reader.onerror = function () { hist.msg = "Couldn't read that file."; render(); };
  reader.readAsText(file);
}

/* ---------- Retrospect ---------- */
function areaItem(a) {
  return '<li><span class="ai-label">' + esc(a.label) + ' <span class="muted">· ' + esc(a.group) + "</span></span>" +
    '<span class="ai-num"><b>' + pct(a.score) + "</b> of " + a.n + "</span></li>";
}
function meter(score) {
  return '<span class="meter" aria-hidden="true"><span style="width:' + Math.round(score * 100) + '%"></span></span>';
}
function retroView() {
  if (store.kind === "loading") return '<p class="muted">Opening your practice history…</p>';
  var rep = PB.retrospect(store.records, { scope: retroScope });
  var scopes = [["all", "All practice"], ["week", "Last 7 days"], ["last100", "Last 100 hands"]];
  var top = '<div class="retro-top"><div class="chips" role="group" aria-label="Period">' + scopes.map(function (s) {
    return '<button class="chip-btn" data-scope="' + s[0] + '" aria-pressed="' + (retroScope === s[0]) + '">' + s[1] + "</button>";
  }).join("") + "</div></div>";
  if (rep.hands < 5) {
    return top + '<div class="empty"><p><b>Not enough practice yet.</b> Retrospect needs at least 5 hands' + (retroScope === "all" ? "" : " in this period") +
      " to find patterns. You have " + plural(rep.hands, "hand", "hands") + ".</p><button class=\"btn primary\" data-view=\"play\">Play a hand</button></div>";
  }
  var span = rep.first ? when(rep.first).split(",")[0] + (rep.last && when(rep.last).split(",")[0] !== when(rep.first).split(",")[0] ? " – " + when(rep.last).split(",")[0] : "") : "";
  var kpis = '<div class="kpis">' +
    '<div class="kpi"><span class="k">Hands</span><span class="kv">' + rep.hands + '</span><span class="ks">' + esc(span) + "</span></div>" +
    '<div class="kpi"><span class="k">Following the guide</span><span class="kv">' + pct(rep.score) + '</span><span class="ks">' + rep.correct + " correct · " + rep.almost + " almost · " + plural(rep.mistake, "mistake", "mistakes") + "</span></div>" +
    '<div class="kpi"><span class="k">Decisions</span><span class="kv">' + rep.decisions + '</span><span class="ks">' + (rep.trend ? esc(rep.trend.recentLabel) + ": " + pct(rep.trend.recent.score) + " (was " + pct(rep.trend.earlier.score) + ")" : "Trend shows after 20 decisions") + "</span></div>" +
    '<div class="kpi"><span class="k">Result</span><span class="kv">' + signed(rep.net) + 'bb</span><span class="ks">' + signed(rep.bb100) + "bb per 100 hands. Small samples swing a lot.</span></div>" +
  "</div>";
  var sw = '<div class="sw-grid">' +
    '<section class="sw-col"><h3>Strengths</h3>' + (rep.strengths.length ? '<ul class="area-list">' + rep.strengths.map(areaItem).join("") + "</ul>" :
      '<p class="muted">No area yet with 5+ decisions at 80% or better.</p>') + "</section>" +
    '<section class="sw-col"><h3>Weaknesses</h3>' + (rep.weaknesses.length ? '<ul class="area-list">' + rep.weaknesses.map(areaItem).join("") + "</ul>" :
      '<p class="muted">No area with 4+ decisions below 70%. Nice.</p>') + "</section></div>";
  var leaks = rep.leaks.slice(0, 3).map(function (k, i) {
    var ex = k.example;
    return '<li class="leak"><div class="leak-top"><span class="leak-n">' + (i + 1) + '</span><h4>' + esc(k.title) + '</h4><span class="leak-count">' + k.count + " of " + plural(k.opps, "chance", "chances") + " (" + pct(k.rate) + ")</span></div>" +
      (k.detail ? '<p class="leak-detail">' + esc(k.detail) + "</p>" : "") +
      '<p><b>What to do:</b> ' + esc(k.advice) + "</p>" +
      '<p class="muted">Study: ' + esc(k.study) + "</p>" +
      '<div class="leak-ex"><span class="k">Example from ' + esc(when(ex.ts)) + "</span><p>" + esc(ex.seat) + " with " + cardsInText(ex.hole) + (ex.board && ex.street !== "preflop" ? ", board " + cardsInText(ex.board) : "") + ". " + cardsInText(ex.situation) + "</p>" +
      "<p>You: <b>" + esc(ex.choice) + "</b> · Guide: <b>" + esc(ex.best) + "</b>" + (ex.bucket ? " · " + esc(ex.bucket) : "") + "</p>" +
      '<p class="muted">' + cardsInText(ex.guide) + "</p></div></li>";
  }).join("");
  var others = rep.leaks.slice(3).map(function (k) { return "<li>" + esc(k.title) + ' <span class="muted">· ' + k.count + " of " + k.opps + "</span></li>"; }).join("");
  var improve = '<section class="improve"><h3>Areas to improve</h3>' +
    (rep.leaks.length ? '<ol class="leaks">' + leaks + "</ol>" + (others ? '<p class="muted">Smaller leaks:</p><ul class="small-leaks">' + others + "</ul>" : "") :
      '<p class="muted">No leaks found. Every decision in this period matched the guide.</p>') + "</section>";
  var days = rep.days.length > 1 ? '<section><h3>Progress by day</h3><div class="tablewrap"><table class="days"><thead><tr><th>Day</th><th>Hands</th><th>Decisions</th><th>Following the guide</th><th>Result</th></tr></thead><tbody>' +
    rep.days.map(function (d) { return "<tr><td>" + esc(dayName(d.day)) + '</td><td class="mono">' + d.hands + '</td><td class="mono">' + d.decisions + '</td><td class="mono">' + meter(d.score) + pct(d.score) + '</td><td class="mono">' + signed(d.net) + "bb</td></tr>"; }).join("") +
    "</tbody></table></div></section>" : "";
  var areaRows = rep.areas.map(function (a) {
    return "<tr><td>" + esc(a.group) + "</td><td>" + esc(a.label) + '</td><td class="mono">' + a.n + '</td><td class="mono">' + meter(a.score) + pct(a.score) + '</td><td class="mono">' + a.mistake + "</td></tr>";
  }).join("");
  var every = '<details class="every"><summary>Every area (' + rep.areas.length + ")</summary><div class=\"tablewrap\"><table><thead><tr><th>Group</th><th>Area</th><th>Decisions</th><th>Following the guide</th><th>Mistakes</th></tr></thead><tbody>" + areaRows + "</tbody></table></div></details>";
  return top + '<p class="retro-headline">' + esc(rep.headline) + "</p>" + kpis + sw + improve + days + every +
    '<div class="ai" id="rai-box">' + aiBox(rai, "retro") + "</div>";
}

/* ---------- Claude ---------- */
function guideRules() {
  var L = ["Postflop buckets, picked by counting the next cards that could beat you or kill your action:"];
  PB.BUCKETS.forEach(function (b) { L.push("- " + b.name + (b.badCards ? " (" + b.badCards + " bad next cards)" : "") + " = " + b.play + ". " + b.def); });
  L.push("- Sizes are % of the pot. Value bet bigger and bluff less than solver play, because this pool calls too much. Fold one pair to big turn and river raises. On the river nothing else can come, so re-bucket by whether the river card beat you.");
  L.push("- Preflop: opening, 3-bet, 4-bet and 5-bet ranges depend on how many players act after the opener. 3-bets are value-heavy. At 100bb never flat-call a 4-bet: jam or fold.");
  return L.join("\n");
}
function reviewPrompt() {
  var L = [];
  L.push("You are a poker coach. Review one practice hand played by someone learning low-stakes cash games.");
  L.push("Judge every decision only by the playbook rules below: an exploitative guide for loose, passive NL2–NL50 pools, not solver strategy.");
  L.push("A rule-based judge already graded each decision. Say whether you agree, and explain in plain language that a learning player understands.");
  L.push("");
  L.push("Write plain text: no markdown, no bold, no headings. For each decision write one line:");
  L.push("<number>. <street>: <Agree or Disagree> - <one or two short sentences naming the hand's bucket and bet type, and why that play is right>.");
  L.push("Then one last line that starts with \"Lesson:\" and gives the single most useful takeaway. Stay under 170 words.");
  L.push("");
  L.push("PLAYBOOK RULES");
  L.push(guideRules());
  L.push("");
  L.push("THE HAND");
  L.push("Table: " + st.players + "-handed, 100bb stacks. You: " + st.heroSeat + " with " + PB.cardsText(st.hero) + ". Villain: " + (st.villainSeat || "nobody called") + ", profile: " + st.villainName + ".");
  if (st.board.length) L.push("Final board: " + PB.cardsText(st.board) + ".");
  L.push("Action: " + st.log.map(function (l) { return l.text; }).join(" "));
  L.push("");
  L.push("DECISIONS AND THE JUDGE'S GRADES");
  st.decisions.forEach(function (d) {
    L.push(d.n + ". " + cap(d.street) + (d.board.length ? " (board " + PB.cardsText(d.board) + ")" : "") + ". " + d.situation);
    L.push("   Options: " + d.options.join(", ") + ". You chose: " + d.choiceLabel + ". Judge: " + d.verdict + ". Guide's answer: " + d.bestLabel + (d.equalLabels && d.equalLabels.length ? " (or " + d.equalLabels.join(", ") + ")" : "") + ".");
    if (d.street === "preflop") L.push("   Hand: " + d.handText + ". Guide: " + d.guide);
    else L.push("   Hand reading: " + d.handText + " Guide entry (" + d.path + "): " + d.guide + (d.why ? " Why: " + d.why : ""));
  });
  L.push("");
  L.push("RESULT: " + st.result.text + (st.showdown ? " Showdown: you had " + st.showdown.hero + "; villain had " + PB.cardsText(st.villain) + " (" + st.showdown.villain + ")." : ""));
  return L.join("\n");
}
function retroPrompt() {
  var rep = PB.retrospect(store.records, { scope: retroScope });
  return PB.coachPrompt(rep, store.records, guideRules());
}

var AI_COPY = {
  hand: { title: "Claude’s review", intro: "Claude checks each decision against this guide and sums up the lesson.", ask: "Ask Claude to review this hand",
    busy: "Claude is reviewing the hand…", copy: "Copy hand for Claude", local: "The online version asks Claude to review the hand right here. In this copy, copy the hand and paste it into a chat with Claude for the same review." },
  retro: { title: "Claude’s coaching report", intro: "Claude reads these numbers and your recent mistakes, then writes strengths, weaknesses, what to change and a plan for your next session.", ask: "Ask Claude for a coaching report",
    busy: "Claude is writing your coaching report…", copy: "Copy for Claude", local: "The online version asks Claude for a coaching report right here. In this copy, copy the summary and paste it into a chat with Claude for the same report." }
};
function formatReport(text) {
  return cardsInText(text).replace(/^(STRENGTHS|WEAKNESSES|AREAS TO IMPROVE|NEXT SESSION PLAN)[ \t]*:?[ \t]*\n+/gm, '<span class="ai-h">$1</span>');
}
function aiBox(s, kind) {
  var c = AI_COPY[kind], h = '<div class="ai-head"><span class="k">' + c.title + "</span></div>";
  var copyBtn = function (primary) { return '<button class="btn' + (primary ? " primary" : "") + '" data-act="copy-' + kind + '">' + c.copy + "</button>"; };
  if (sample) {
    if (s.status === "idle") h += '<p class="muted">' + c.intro + " It uses your Claude account and asks your permission the first time.</p>" +
      '<div class="ai-actions"><button class="btn primary" data-act="ask-' + kind + '">' + c.ask + "</button>" + copyBtn() + "</div>";
    else if (s.status === "thinking") h += '<p class="muted" aria-live="polite">' + c.busy + '</p><div class="ai-actions"><button class="btn" data-act="stop-' + kind + '">Stop</button></div>';
    else {
      h += '<div class="ai-out" aria-live="polite">' + formatReport(s.text) + "</div>";
      if (s.status === "streaming") h += '<div class="ai-actions"><button class="btn" data-act="stop-' + kind + '">Stop</button></div>';
      else h += '<div class="ai-actions"><button class="btn" data-act="ask-' + kind + '">Ask again</button>' + copyBtn() + "</div>";
    }
  } else h += '<p class="muted">' + c.local + '</p><div class="ai-actions">' + copyBtn(true) + "</div>";
  if (s.note) h += '<p class="ai-note">' + esc(s.note) + "</p>";
  if (s.copied) h += '<p class="ai-note">' + esc(s.copied) + "</p>";
  if (s.fallback) h += '<textarea class="ai-copy" id="ai-copy-' + kind + '" readonly rows="8" aria-label="Text to copy for Claude">' + esc(s.fallback) + "</textarea>";
  return h;
}
function renderAI(kind) {
  var box = document.getElementById(kind === "hand" ? "ai-box" : "rai-box");
  if (!box) return;
  box.innerHTML = aiBox(kind === "hand" ? ai : rai, kind);
  var ta = document.getElementById("ai-copy-" + kind);
  if (ta) { ta.focus(); ta.select(); }
}
function askClaude(kind) {
  if (!sample) return;
  var s = kind === "hand" ? ai : rai;
  if (kind === "hand" && (!st || !st.done)) return;
  var prev = kind === "hand" ? aiCtl : raiCtl;
  if (prev) prev.abort();
  var ctl = new AbortController();
  if (kind === "hand") aiCtl = ctl; else raiCtl = ctl;
  var current = function () { return (kind === "hand" ? aiCtl : raiCtl) === ctl; };
  var input = kind === "hand" ? reviewPrompt() : retroPrompt();
  s.status = "thinking"; s.text = ""; s.note = ""; s.copied = ""; s.fallback = "";
  renderAI(kind);
  var opts = { signal: ctl.signal, onText: function (u) { if (!current()) return; s.status = "streaming"; s.text = u.text; renderAI(kind); } };
  if (kind === "retro") opts.cache = false; // "Ask again" should write a fresh report
  sample(input, opts).then(function (res) {
    if (!current()) return;
    s.status = "done"; s.text = res.text; s.note = res.truncated ? "The answer was cut short." : "";
    if (kind === "hand") aiCtl = null; else raiCtl = null;
    renderAI(kind);
  }, function (e) {
    if (!current()) return;
    if (kind === "hand") aiCtl = null; else raiCtl = null;
    var code = e && e.code;
    s.text = (e && e.text) || "";
    s.status = s.text ? "done" : "idle";
    if (code === "cancelled") s.note = "Stopped.";
    else if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].indexOf(code) >= 0) {
      sample = null; s.note = "Claude isn't available on this page for your account. Use “" + AI_COPY[kind].copy + "” and paste it into a chat instead.";
    }
    else if (code === "rate_limited") s.note = "Claude is busy or you've reached a usage limit. Try again in a minute.";
    else if (code === "session_expired") s.note = "Sign in to Claude again, then try once more.";
    else if (code === "refused") { s.text = ""; s.status = "idle"; s.note = "Claude couldn't answer this one."; }
    else s.note = "The answer was interrupted. Try again.";
    renderAI(kind);
  });
}
function copyFor(kind) {
  var s = kind === "hand" ? ai : rai;
  if (kind === "hand" && (!st || !st.done)) return;
  var text = kind === "hand" ? reviewPrompt() : retroPrompt();
  function fallback() { s.copied = "Copying isn't allowed here. Select the text below and copy it."; s.fallback = text; renderAI(kind); }
  try {
    navigator.clipboard.writeText(text).then(function () {
      s.copied = "Copied. Paste it into a chat with Claude."; s.fallback = ""; renderAI(kind);
    }, fallback);
  } catch (e) { fallback(); }
}

/* ---------- render and events ---------- */
function render() {
  var body = view === "history" ? historyView() : view === "retro" ? retroView() : (st ? playView() : "");
  root.innerHTML = head() + '<div class="pr-body">' + body + "</div>";
}
function setView(v) {
  if (v === view) return;
  view = v; hist.confirm = false; hist.msg = "";
  if (v !== "retro") { if (raiCtl) raiCtl.abort(); rai = blankAI(); }
  render();
  var btn = root.querySelector('[data-view="' + v + '"]');
  if (btn) btn.focus({ preventScroll: true });
}

root.addEventListener("click", function (e) {
  var c = e.target.closest("[data-choice]");
  if (c) return choose(c.dataset.choice);
  var v = e.target.closest("[data-view]");
  if (v) return setView(v.dataset.view);
  var hf = e.target.closest("[data-hfilter]");
  if (hf) { hist.filter = hf.dataset.hfilter; hist.shown = 25; return render(); }
  var sc = e.target.closest("[data-scope]");
  if (sc) { retroScope = sc.dataset.scope; if (raiCtl) raiCtl.abort(); rai = blankAI(); return render(); }
  var a = e.target.closest("[data-act]");
  if (!a) return;
  var act = a.dataset.act;
  if (act === "continue") cont();
  else if (act === "deal") deal();
  else if (act === "ask-hand") askClaude("hand");
  else if (act === "ask-retro") askClaude("retro");
  else if (act === "stop-hand") { if (aiCtl) aiCtl.abort(); }
  else if (act === "stop-retro") { if (raiCtl) raiCtl.abort(); }
  else if (act === "copy-hand") copyFor("hand");
  else if (act === "copy-retro") copyFor("retro");
  else if (act === "more") { hist.shown += 25; render(); }
  else if (act === "export-json") exportData("json");
  else if (act === "export-csv") exportData("csv");
  else if (act === "import") { var f = document.getElementById("import-file"); if (f) f.click(); }
  else if (act === "delete-all") { hist.confirm = true; hist.msg = ""; render(); }
  else if (act === "delete-no") { hist.confirm = false; render(); }
  else if (act === "delete-yes") {
    hist.confirm = false; hist.msg = "Deleting…"; render();
    store.clear().then(function () { hist.msg = store.error || "All hands deleted."; render(); });
  }
});
root.addEventListener("change", function (e) {
  if (e.target && e.target.id === "import-file") { importFile(e.target.files && e.target.files[0]); e.target.value = ""; }
});
root.addEventListener("toggle", function (e) {
  var d = e.target;
  if (d && d.dataset && d.dataset.hand) { if (d.open) hist.open[d.dataset.hand] = 1; else delete hist.open[d.dataset.hand]; }
}, true);
// A new table size takes effect at once if the hand hasn't started, otherwise from the next hand.
document.addEventListener("pb:players", function () { if (st && !st.decisions.length && !fb) deal(); });
// Reloads when the database loads or changes; the Play view keeps its place.
store.onChange(function () {
  if (view === "play") {
    var h = root.querySelector(".pr-head");
    if (h) h.outerHTML = head();
  } else render();
});

if (window.claude && typeof window.claude.use === "function") {
  try {
    window.claude.use("sample").then(function (fn) {
      sample = typeof fn === "function" ? fn : null;
      if (st && st.done && !fb) renderAI("hand");
      if (view === "retro") renderAI("retro");
    }, function () { sample = null; });
  } catch (e) { sample = null; }
}

deal();
})();
