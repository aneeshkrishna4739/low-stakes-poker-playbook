/* Page behaviour: player count, tabs, range grids, postflop tree and rules.
   Needs ranges.js, table.js and data.js loaded first. */
(function () {
"use strict";
var PB = window.PB;
var parseRange = PB.parseRange, keyAt = PB.keyAt;
var seatsFor = PB.seatsFor, tierOf = PB.tierOf, threeBetSpotId = PB.threeBetSpotId, fourBetSpotId = PB.fourBetSpotId;
var TIERS = PB.TIERS, PRE = PB.PRE, SIZES = PB.SIZES, SIZE_NOTES = PB.SIZE_NOTES, BUCKETS = PB.BUCKETS, TERMS = PB.TERMS;
var CTX = PB.CTX, STREETNOTE = PB.STREETNOTE, T = PB.T, ADJUST = PB.ADJUST, ODDS = PB.ODDS, OUTS = PB.OUTS;

/* ---------- state ---------- */
var state = { tab:"preflop", pre:"open", players:6, openSeat:"BTN", opener:"BTN", hero:"BB", opened4:"BTN", spot5:"typ", street:"flop", pot:"hu", role:"agg", pos:"ip", bucket:"gsv", hand:null };
try {
  var saved = JSON.parse(localStorage.getItem("ls-playbook-v2") || "null");
  if (saved && typeof saved === "object") {
    ["tab","pre","openSeat","opener","hero","opened4","spot5","street","pot","role","pos","bucket"].forEach(function(k){ if (typeof saved[k] === "string") state[k] = saved[k]; });
    if (typeof saved.players === "number" && saved.players >= 5 && saved.players <= 11) state.players = saved.players;
  }
} catch(e){}
var hashTab = (location.hash || "").replace("#","");
if (["preflop","postflop","practice","rules"].indexOf(hashTab) > -1) state.tab = hashTab;
function save(){ try { localStorage.setItem("ls-playbook-v2", JSON.stringify(state)); } catch(e){} }

function seats(){ return seatsFor(state.players); }
function fixSeats(){
  var s = seats(), openers = s.slice(0, -1);
  if (openers.indexOf(state.opener) < 0) state.opener = "BTN";
  if (openers.indexOf(state.openSeat) < 0) state.openSeat = "BTN";
  var after = s.slice(s.indexOf(state.opener) + 1);
  if (after.indexOf(state.hero) < 0) state.hero = after[after.length - 1];
  if (state.opened4 !== "cold" && openers.indexOf(state.opened4) < 0) state.opened4 = "BTN";
}
fixSeats();
PB.getPlayers = function () { return state.players; }; // the Practice tab deals at this table size

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function cards(s){
  return esc(s).replace(/((?:[2-9TJQKA][♠♥♦♣])+)/g, function(m){
    return '<span class="card">' + m.replace(/([2-9TJQKA])([♥♦])/g,'<span class="red">$1$2</span>') + '</span>';
  });
}
function findSpot(mode, id){ return mode.spots.filter(function(s){ return s.id === id; })[0] || mode.spots[0]; }

/* ---------- tabs ---------- */
var tabs = document.querySelectorAll(".tab");
function showTab(){
  tabs.forEach(function(t){
    var on = t.dataset.tab === state.tab;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    document.getElementById("panel-" + t.dataset.tab).hidden = !on;
  });
}
tabs.forEach(function(t){ t.addEventListener("click", function(){ state.tab = t.dataset.tab; save(); showTab(); }); });

/* ---------- player count ---------- */
var playersEl = document.getElementById("players");
function renderPlayers(){
  var html = "";
  for (var n = 5; n <= 11; n++) html += '<button class="chip num" data-n="' + n + '" aria-pressed="' + (n === state.players) + '">' + n + "</button>";
  playersEl.innerHTML = html;
  document.getElementById("seatList").textContent = seats().join(" · ");
  document.getElementById("eyebrow").textContent = state.players + "-handed · 100bb cash · NL2–NL50";
  try { document.dispatchEvent(new CustomEvent("pb:players", { detail: state.players })); } catch (e) {}
}
playersEl.addEventListener("click", function(e){
  var b = e.target.closest("[data-n]"); if (!b) return;
  state.players = +b.dataset.n; fixSeats(); save();
  renderPlayers(); renderPre(); renderTree();
});

/* ---------- preflop ---------- */
var preBody = document.getElementById("preBody");
function pickRow(label, key, opts, cur){
  return '<div class="pick"><span class="k">' + esc(label) + '</span><div class="chips" role="group" aria-label="' + esc(label) + '">' +
    opts.map(function(o){
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return '<button class="chip" data-pick="' + key + '" data-val="' + esc(v) + '" aria-pressed="' + (v === cur) + '">' + esc(l) + "</button>";
    }).join("") + "</div></div>";
}
function renderPre(){
  document.querySelectorAll("#preSeg button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.pre === state.pre ? "true" : "false"); });
  if (state.pre === "sizes"){
    var rows = SIZES.map(function(r){ return "<tr><td>" + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td><td class="mono">' + esc(r[2]) + "</td></tr>"; }).join("");
    preBody.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Situation</th><th>Size</th><th>Example</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      SIZE_NOTES.map(function(n){ return '<p class="note">' + esc(n) + "</p>"; }).join("");
    return;
  }
  var mode = PRE[state.pre], s = seats(), spot, picker, who, tierLine = "";
  if (state.pre === "open"){
    picker = pickRow("Your seat", "openSeat", s.slice(0, -1), state.openSeat);
    spot = findSpot(mode, tierOf(s, state.openSeat));
    who = "Folded to you in the " + state.openSeat;
    tierLine = "At " + state.players + "-handed, " + state.openSeat + " opens like " + TIERS[tierOf(s, state.openSeat)] + " position.";
  } else if (state.pre === "3bet"){
    var after = s.slice(s.indexOf(state.opener) + 1);
    picker = pickRow("Who opened", "opener", s.slice(0, -1), state.opener) + pickRow("Your seat", "hero", after, state.hero);
    spot = findSpot(mode, threeBetSpotId(s, state.opener, state.hero));
    who = state.hero + " facing a " + state.opener + " open";
    tierLine = "At " + state.players + "-handed, " + state.opener + " opens like " + TIERS[tierOf(s, state.opener)] + " position.";
  } else if (state.pre === "4bet"){
    picker = pickRow("You opened from", "opened4", s.slice(0, -1).concat([["cold","Cold 4-bet"]]), state.opened4);
    spot = findSpot(mode, fourBetSpotId(s, state.opened4));
    who = spot.who.replace("{seat}", state.opened4);
    if (state.opened4 !== "cold") tierLine = "At " + state.players + "-handed, " + state.opened4 + " opens like " + TIERS[tierOf(s, state.opened4)] + " position.";
  } else {
    picker = pickRow("Villain who 4-bets", "spot5", mode.spots.map(function(x){ return [x.id, x.label]; }), state.spot5);
    spot = findSpot(mode, state.spot5);
    who = spot.who;
  }

  var callStr = (state.pre === "3bet" && state.hero === "SB" && spot.sbCall !== undefined) ? spot.sbCall : spot.call; // the SB calls less
  var sets = { v:parseRange(spot.value), b:parseRange(spot.bluff), c:parseRange(callStr) };
  function cat(k){ return sets.v.has(k) ? "v" : sets.b.has(k) ? "b" : sets.c.has(k) ? "c" : "f"; }
  var cells = "", counts = { v:0, b:0, c:0, f:0 };
  for (var i = 0; i < 13; i++) for (var j = 0; j < 13; j++){
    var key = keyAt(i,j), c = cat(key);
    counts[c] += key.length === 2 ? 6 : (key[2] === "s" ? 4 : 12);
    cells += '<button class="cell c-' + c + (state.hand === key ? " sel" : "") + '" data-hand="' + key + '" aria-label="' + key + ": " + esc(mode.labels[c]) + '">' + key + "</button>";
  }
  var colors = { v:"var(--suit)", b:"var(--amber)", c:"var(--blue)", f:"var(--cell)" };
  var hands = { v:spot.value, b:spot.bluff, c:callStr, f:"Everything else" };
  var legend = ["v","b","c","f"].filter(function(k){ return k === "f" || hands[k]; }).map(function(k){
    return '<div class="lg"><span class="sw" style="background:' + colors[k] + (k === "f" ? ";box-shadow:inset 0 0 0 1px var(--line)" : "") + '"></span><div><div class="name">' + esc(mode.labels[k]) + '</div><div class="hands">' + esc(hands[k]) + '</div></div><div class="pct">' + (counts[k] / 1326 * 100).toFixed(1) + "%<br>" + counts[k] + " combos</div></div>";
  }).join("");
  var readText = state.hand ? "<b>" + state.hand + "</b> → " + esc(mode.labels[cat(state.hand)]) : "Tap any hand to see what to do with it.";

  preBody.innerHTML =
    '<div class="picks">' + picker + "</div>" +
    '<div class="spot">' +
      '<div class="gridwrap"><div class="grid">' + cells + '</div><p class="readout" aria-live="polite">' + readText + "</p></div>" +
      '<div class="info">' +
        '<div><div class="k">' + esc(mode.title) + '</div><div class="who">' + esc(who) + "</div>" + (tierLine ? '<p class="tier">' + esc(tierLine) + "</p>" : "") + "</div>" +
        '<div class="sizebox"><span class="k">Size</span><span class="v">' + esc(spot.size) + "</span></div>" +
        '<div class="legend">' + legend + "</div>" +
        (spot.note ? '<p class="note">' + esc(spot.note) + "</p>" : "") +
      "</div>" +
    "</div>";
}
document.getElementById("preSeg").addEventListener("click", function(e){
  var b = e.target.closest("button"); if (!b) return;
  state.pre = b.dataset.pre; state.hand = null; save(); renderPre();
});
preBody.addEventListener("click", function(e){
  var p = e.target.closest("[data-pick]");
  if (p){ state[p.dataset.pick] = p.dataset.val; fixSeats(); save(); renderPre(); return; }
  var c = e.target.closest("[data-hand]");
  if (c){ state.hand = c.dataset.hand; renderPre(); }
});

/* ---------- postflop tree ---------- */
var STREETS = [["flop","Flop",""],["turn","Turn",""],["river","River",""]];
var POTS = [["hu","Heads-up","2 players"],["mw","Multiway","3+ players"]];
var MW_SUBS = { flop: [["strong","Strong draw (12+ outs)"],["draw","Flush draw / open-ender"],["weak","Weak showdown"],["air","Air"]], river: [["missed","Missed draw"],["weak","Weak showdown"],["air","Air"]] };
MW_SUBS.turn = MW_SUBS.flop;
var MW_KEYS = [["open","Betting first or checked to"],["vsBet","Facing a bet"],["vsRaise","Facing a raise"]];
var ROLES = [["agg","Aggressor","You made the last bet"],["def","Defender","You called it"]];
var POS = [["ip","In position","You act last"],["oop","Out of position","You act first"]];
var treeEl = document.getElementById("tree"), glanceEl = document.getElementById("glance");
function chipRow(name, opts, cur){
  return '<div class="chips" role="group" aria-label="' + name + '">' + opts.map(function(o){
    return '<button class="chip" data-set="' + name + '" data-val="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + esc(o[1]) + (o[2] ? "<small>" + esc(o[2]) + "</small>" : "") + "</button>";
  }).join("") + "</div>";
}
function actChip(k, act, sm){ return '<span class="act k-' + k + (sm ? " sm" : "") + '">' + esc(act) + "</span>"; }
function termTag(t){ return t ? '<span class="term">' + esc(t) + "</span>" : ""; }
function labelOf(arr, v){ return arr.filter(function(a){ return a[0] === v; })[0][1]; }

function renderTree(){
  if (state.bucket === "nv") state.bucket = "nvv"; // older saved choice, before the nutted bucket was split
  var bk = BUCKETS.filter(function(b){ return b.id === state.bucket; })[0] || BUCKETS.filter(function(b){ return b.id === "gsv"; })[0];
  if (state.pot === "mw") return renderMultiway(bk);
  var node = T[state.street][state.role][state.pos][bk.id];
  var path = [labelOf(STREETS,state.street), labelOf(ROLES,state.role), labelOf(POS,state.pos), bk.name].join(" › ");
  var body;
  if (node.bad){
    body = '<div class="verdict">' + actChip("mix","Split by hand type") + '</div>' +
      '<div class="subs">' + node.subs.map(function(s){
        return '<div class="sub"><div class="h">' + esc(s.h) + '</div><div class="a">' + actChip(s.k, s.act, true) + (s.size ? '<span class="size">' + esc(s.size) + "</span>" : "") + "</div>" +
          '<div class="t">' + termTag(s.term) + (s.t ? "<span>" + esc(s.t) + "</span>" : "") + "</div></div>";
      }).join("") + "</div>";
  } else {
    body = '<div class="verdict">' + actChip(node.k, node.act) + (node.size ? '<span class="size">' + esc(node.size) + "</span>" : "") + "</div>" +
      '<div class="playtype"><span class="k">Bet type</span>' + termTag(node.term) + "</div>" +
      '<dl class="rows">' + node.rows.map(function(r){ return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>";
  }
  var bucketChips = '<div class="bucket-chips" role="group" aria-label="Hand bucket">' + BUCKETS.map(function(b){
    return '<button class="chip" data-set="bucket" data-val="' + b.id + '" aria-pressed="' + (b.id === bk.id) + '">' + esc(b.name) + '<small class="alias">= ' + esc(b.play) + "</small></button>";
  }).join("") + "</div>";
  var tableNote = state.players >= 8
    ? '<p class="streetnote">At ' + state.players + "-handed, more pots go multiway. When 3+ players see the flop, switch to Multiway above.</p>"
    : "";

  treeEl.innerHTML =
    '<div class="lvl"><span class="k">1 · Street</span>' + chipRow("street", STREETS, state.street) + "</div>" +
    '<div class="lvl"><span class="k">2 · Players in the pot</span>' + chipRow("pot", POTS, state.pot) + "</div>" +
    '<div class="lvl"><span class="k">3 · Your role</span>' + chipRow("role", ROLES, state.role) + "</div>" +
    '<div class="lvl"><span class="k">4 · Position</span>' + chipRow("pos", POS, state.pos) + "</div>" +
    '<div class="lvl"><span class="k">5 · Hand bucket = bet type</span>' + bucketChips + '<p class="hint">' + (bk.badCards ? '<span class="cardcount">' + esc(bk.badCards) + " bad next cards</span> " : "") + esc(bk.def) + " e.g. " + cards(bk.ex[0]) + "</p></div>" +
    '<div class="lvl leafnode"><span class="k">Play</span>' +
      '<article class="leaf" aria-live="polite">' +
        '<div class="leaf-head"><div class="path">' + esc(path) + '</div><div class="aliasline">' + esc(bk.name) + " = " + esc(bk.play) + '</div><p class="ctx">' + esc(CTX[state.street][state.role][state.pos]) + "</p></div>" +
        body +
        '<p class="why"><b>Why</b>' + esc(node.why) + "</p>" +
      "</article>" +
    "</div>" +
    '<p class="streetnote">' + esc(STREETNOTE[state.street]) + "</p>" + tableNote;

  var spot = T[state.street][state.role][state.pos];
  glanceEl.innerHTML = '<div class="k">This spot, every bucket</div><div class="glance-list">' + BUCKETS.map(function(b){
    var n = spot[b.id], a, s;
    if (n.bad){ a = actChip("mix","Split",true); s = "see split"; } else { a = actChip(n.k, n.act, true); s = n.size; }
    return '<button class="grow" data-set="bucket" data-val="' + b.id + '" aria-current="' + (b.id === bk.id) + '"><span class="bn">' + esc(b.name) + "<small>" + esc(n.bad ? b.play : n.term) + '</small></span><span class="ga">' + a + '<span class="gs">' + esc(s) + "</span></span></button>";
  }).join("") + "</div>";
}
// Multiway: one answer per situation, whatever your role or position (the guide's MW section).
function mwLine(label, L) {
  return '<div class="sub"><div class="h">' + esc(label) + '</div><div class="a">' + actChip(L.k, L.act, true) + (L.size ? '<span class="size">' + esc(L.size) + "</span>" : "") + "</div>" +
    '<div class="t">' + termTag(L.term) + (L.t ? "<span>" + esc(L.t) + "</span>" : "") + "</div></div>";
}
function renderMultiway(bk){
  var node = PB.MW[state.street][bk.id], body;
  if (bk.id === "bad") {
    body = MW_SUBS[state.street].map(function (sub) {
      var set = node[sub[0]];
      return '<div class="mw-sub"><div class="mw-h">' + esc(sub[1]) + '</div><div class="subs">' + MW_KEYS.map(function (k) { return mwLine(k[1], set[k[0]]); }).join("") + "</div></div>";
    }).join("");
  } else body = '<div class="subs">' + MW_KEYS.map(function (k) { return mwLine(k[1], node[k[0]]); }).join("") + "</div>";
  var bucketChips = '<div class="bucket-chips" role="group" aria-label="Hand bucket">' + BUCKETS.map(function(b){
    return '<button class="chip" data-set="bucket" data-val="' + b.id + '" aria-pressed="' + (b.id === bk.id) + '">' + esc(b.name) + '<small class="alias">= ' + esc(b.play) + "</small></button>";
  }).join("") + "</div>";
  treeEl.innerHTML =
    '<div class="lvl"><span class="k">1 · Street</span>' + chipRow("street", STREETS, state.street) + "</div>" +
    '<div class="lvl"><span class="k">2 · Players in the pot</span>' + chipRow("pot", POTS, state.pot) + '<p class="hint">In a multiway pot the same rules apply whatever your role or position.</p></div>' +
    '<div class="lvl"><span class="k">3 · Hand bucket = bet type</span>' + bucketChips + '<p class="hint">' + (bk.badCards ? '<span class="cardcount">' + esc(bk.badCards) + " bad next cards</span> " : "") + esc(bk.def) + " e.g. " + cards(bk.ex[0]) + "</p></div>" +
    '<div class="lvl leafnode"><span class="k">Play</span>' +
      '<article class="leaf" aria-live="polite">' +
        '<div class="leaf-head"><div class="path">' + esc(labelOf(STREETS, state.street) + " › Multiway › " + bk.name) + '</div><div class="aliasline">' + esc(bk.name) + " = " + esc(bk.play) +
        '</div><p class="ctx">Three or more players see the ' + state.street + ". Someone usually has something, so bet good hands bigger and almost never bluff.</p></div>" +
        body + '<p class="why"><b>Why</b>' + esc(node.why) + "</p>" +
      "</article>" +
    "</div>";
  glanceEl.innerHTML = '<div class="k">Multiway, every bucket: betting first or checked to</div><div class="glance-list">' + BUCKETS.map(function(b){
    var n = PB.MW[state.street][b.id], a, sz;
    if (b.id === "bad") { a = actChip("check", "Check", true); sz = "no bluffs"; } else { a = actChip(n.open.k, n.open.act, true); sz = n.open.size; }
    return '<button class="grow" data-set="bucket" data-val="' + b.id + '" aria-current="' + (b.id === bk.id) + '"><span class="bn">' + esc(b.name) + "<small>" + esc(b.id === "bad" ? "Check, give up or take a free card" : n.open.term) + '</small></span><span class="ga">' + a + '<span class="gs">' + esc(sz) + "</span></span></button>";
  }).join("") + "</div>";
}
function onTreeClick(e){
  var b = e.target.closest("[data-set]"); if (!b) return;
  state[b.dataset.set] = b.dataset.val; save(); renderTree();
  if (b.classList.contains("grow")){
    var leaf = treeEl.querySelector(".leaf");
    if (leaf && leaf.scrollIntoView) leaf.scrollIntoView({ block:"nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
}
treeEl.addEventListener("click", onTreeClick);
glanceEl.addEventListener("click", onTreeClick);

/* ---------- rules ---------- */
document.getElementById("bucketDefs").innerHTML = BUCKETS.map(function(b){
  return '<div class="bk"><h3>' + esc(b.name) + '</h3><div class="bk-tags"><span class="term">= ' + esc(b.play) + "</span>" + (b.badCards ? '<span class="cardcount">' + esc(b.badCards) + " bad next cards</span>" : "") + '</div><p class="muted" style="font-size:14px">' + esc(b.def) + "</p><ul>" + b.ex.map(function(x){ return "<li>" + cards(x) + "</li>"; }).join("") + "</ul></div>";
}).join("");
document.getElementById("termsBody").innerHTML = TERMS.map(function(r){ return '<tr><td class="strong">' + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td class="muted">' + esc(r[2]) + "</td></tr>"; }).join("");
document.getElementById("adjust").innerHTML = ADJUST.map(function(r){ return '<div class="rule"><b>' + esc(r[0]) + "</b><span>" + esc(r[1]) + "</span></div>"; }).join("");
document.getElementById("oddsBody").innerHTML = ODDS.map(function(r){ return '<tr><td class="mono">' + r[0] + '</td><td class="mono">' + r[1] + '</td><td class="mono">' + r[2] + "</td><td>" + esc(r[3]) + "</td></tr>"; }).join("");
document.getElementById("outsBody").innerHTML = OUTS.map(function(r){ return "<tr><td>" + esc(r[0]) + '</td><td class="mono">' + r[1] + '</td><td class="mono">' + r[2] + '</td><td class="mono">' + r[3] + "</td></tr>"; }).join("");

showTab(); renderPlayers(); renderPre(); renderTree();
})();
