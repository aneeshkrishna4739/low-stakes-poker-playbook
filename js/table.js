/* Table seats for 5 to 11 players, and which preflop range applies to each seat.
   Seats are named from the button backwards (BTN, CO, HJ, LJ); any earlier seats are UTG, UTG+1, ...
   A seat's range tier depends on how many players are still to act behind it. */
(function (root) {
"use strict";

var FROM_END = ["BB", "SB", "BTN", "CO", "HJ", "LJ"];

function seatsFor(n) {
  n = Math.max(5, Math.min(11, n | 0));
  var k = Math.min(n - 1, FROM_END.length);
  var early = [];
  for (var i = 0; i < n - k; i++) early.push(i === 0 ? "UTG" : "UTG+" + i);
  return early.concat(FROM_END.slice(0, k).reverse());
}

// vep = very early (7+ players behind), ep = early (5-6), hj = middle (4),
// co = cutoff (3), btn = button (2), sb = small blind (1). The BB never opens.
function tierOf(seats, seat) {
  var behind = seats.length - 1 - seats.indexOf(seat);
  if (behind >= 7) return "vep";
  if (behind >= 5) return "ep";
  if (behind === 4) return "hj";
  if (behind === 3) return "co";
  if (behind === 2) return "btn";
  if (behind === 1) return "sb";
  return null;
}

// Against early and middle opens both blinds share one range; against later opens they differ.
function threeBetSpotId(seats, opener, hero) {
  var t = tierOf(seats, opener);
  var shared = t === "vep" || t === "ep" || t === "hj";
  if (hero === "SB") return shared ? t + "-bl" : t + "-sb";
  if (hero === "BB") return shared ? t + "-bl" : t + "-bb";
  return t + "-ip";
}

function fourBetSpotId(seats, opener) {
  if (opener === "cold") return "cold";
  var t = tierOf(seats, opener);
  return t === "hj" ? "ep" : t;
}

var api = { seatsFor: seatsFor, tierOf: tierOf, threeBetSpotId: threeBetSpotId, fourBetSpotId: fourBetSpotId };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
