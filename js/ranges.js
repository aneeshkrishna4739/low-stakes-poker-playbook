/* Hand-range notation parser: QQ+, JJ-55, ATs+, A5s-A2s, AKo, AK (both suited and offsuit). */
(function (root) {
"use strict";
var R = "AKQJT98765432";

/* ---------- range parsing ---------- */
function addHand(set, two, sfx){
  if (sfx === "s" || sfx === "") set.add(two + "s");
  if (sfx === "o" || sfx === "") set.add(two + "o");
}
function parseRange(str){
  var set = new Set();
  if (!str) return set;
  str.split(",").map(function(s){return s.trim();}).filter(Boolean).forEach(function(tok){
    if (tok.indexOf("-") > -1){
      var p = tok.split("-"), a = p[0].trim(), b = p[1].trim();
      if (a[0] === a[1]){
        var i1 = R.indexOf(a[0]), i2 = R.indexOf(b[0]);
        if (i1 > i2){ var t = i1; i1 = i2; i2 = t; }
        for (var i = i1; i <= i2; i++) set.add(R[i] + R[i]);
      } else {
        var hi = a[0], sfx = a.slice(2), j1 = R.indexOf(a[1]), j2 = R.indexOf(b[1]);
        if (j1 > j2){ var u = j1; j1 = j2; j2 = u; }
        for (var j = j1; j <= j2; j++) addHand(set, hi + R[j], sfx);
      }
    } else if (tok.slice(-1) === "+"){
      var x = tok.slice(0, -1);
      if (x[0] === x[1]){
        for (var k = R.indexOf(x[0]); k >= 0; k--) set.add(R[k] + R[k]);
      } else {
        var hiI = R.indexOf(x[0]);
        for (var m = R.indexOf(x[1]); m > hiI; m--) addHand(set, x[0] + R[m], x.slice(2));
      }
    } else {
      if (tok[0] === tok[1]) set.add(tok.slice(0, 2));
      else addHand(set, tok.slice(0, 2), tok.slice(2));
    }
  });
  return set;
}
function combos(set){
  var n = 0;
  set.forEach(function(h){ n += h.length === 2 ? 6 : (h[2] === "s" ? 4 : 12); });
  return n;
}
function keyAt(i, j){
  if (i === j) return R[i] + R[i];
  return i < j ? R[i] + R[j] + "s" : R[j] + R[i] + "o";
}

var api = { R: R, addHand: addHand, parseRange: parseRange, combos: combos, keyAt: keyAt };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
