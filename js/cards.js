/* Cards and hand evaluation.
   A card is an integer 0–51: rank = card >> 2 (0 = 2 … 12 = A), suit = card & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣).
   evaluate(cards) scores the best five-card hand from 3–7 cards; a higher score is a better hand.
   Score layout: category << 20, then up to five 4-bit ranks for tie-breaks.
   Categories: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads, 8 straight flush. */
(function (root) {
"use strict";

var RANKS = "23456789TJQKA";
var SUITS = "♠♥♦♣";
// Number cards are written as digits, matching the cards on screen ("3 kicker", "Set of 7s"); picture cards as words.
var RANK_NAME = ["2","3","4","5","6","7","8","9","10","jack","queen","king","ace"];
var RANK_PLURAL = ["2s","3s","4s","5s","6s","7s","8s","9s","10s","jacks","queens","kings","aces"];
var CATEGORY = ["High card","Pair","Two pair","Three of a kind","Straight","Flush","Full house","Four of a kind","Straight flush"];

var counts = new Int8Array(13);

function straightHigh(mask) {
  for (var h = 12; h >= 4; h--) {
    var m = 31 << (h - 4);
    if ((mask & m) === m) return h;
  }
  return (mask & 0x100F) === 0x100F ? 3 : -1; // A-2-3-4-5
}

// Packs the n highest ranks found in mask, starting at bit `shift` and moving down 4 bits each.
function topRanks(mask, n, shift) {
  var out = 0;
  for (var r = 12; r >= 0 && n > 0; r--) {
    if (mask & (1 << r)) { out |= r << shift; shift -= 4; n--; }
  }
  return out;
}

function evaluate(cards) {
  var i, c, r, mask = 0;
  var sc0 = 0, sc1 = 0, sc2 = 0, sc3 = 0, sm0 = 0, sm1 = 0, sm2 = 0, sm3 = 0;
  counts.fill(0);
  for (i = 0; i < cards.length; i++) {
    c = cards[i]; r = c >> 2;
    counts[r]++; mask |= 1 << r;
    switch (c & 3) {
      case 0: sc0++; sm0 |= 1 << r; break;
      case 1: sc1++; sm1 |= 1 << r; break;
      case 2: sc2++; sm2 |= 1 << r; break;
      default: sc3++; sm3 |= 1 << r;
    }
  }
  var fmask = sc0 >= 5 ? sm0 : sc1 >= 5 ? sm1 : sc2 >= 5 ? sm2 : sc3 >= 5 ? sm3 : 0;
  if (fmask) {
    var sf = straightHigh(fmask);
    if (sf >= 0) return (8 << 20) | (sf << 16);
  }
  var quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (r = 12; r >= 0; r--) {
    var n = counts[r];
    if (n === 4) quad = r;
    else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | topRanks(mask & ~(1 << quad), 1, 12);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  if (fmask) return (5 << 20) | topRanks(fmask, 5, 16);
  var st = straightHigh(mask);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | topRanks(mask & ~(1 << t1), 2, 12);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | topRanks(mask & ~(1 << p1) & ~(1 << p2), 1, 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | topRanks(mask & ~(1 << p1), 3, 12);
  return topRanks(mask, 5, 16);
}

function category(score) { return score >> 20; }

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// withKicker adds the deciding side card, for showdowns where both players have the same hand.
function handName(score, withKicker) {
  var cat = score >> 20, a = (score >> 16) & 15, b = (score >> 12) & 15, c = (score >> 8) & 15;
  if (withKicker && cat === 1) return "Pair of " + RANK_PLURAL[a] + ", " + RANK_NAME[b] + " kicker";
  if (withKicker && cat === 2) return "Two pair, " + RANK_PLURAL[a] + " and " + RANK_PLURAL[b] + ", " + RANK_NAME[c] + " kicker";
  if (withKicker && cat === 3) return "Three of a kind, " + RANK_PLURAL[a] + ", " + RANK_NAME[b] + " kicker";
  if (withKicker && cat === 0) return cap(RANK_NAME[a]) + " high, then " + RANK_NAME[b];
  switch (cat) {
    case 8: return a === 12 ? "Royal flush" : "Straight flush, " + RANK_NAME[a] + " high";
    case 7: return "Four of a kind, " + RANK_PLURAL[a];
    case 6: return "Full house, " + RANK_PLURAL[a] + " full of " + RANK_PLURAL[b];
    case 5: return "Flush, " + RANK_NAME[a] + " high";
    case 4: return "Straight, " + RANK_NAME[a] + " high";
    case 3: return "Three of a kind, " + RANK_PLURAL[a];
    case 2: return "Two pair, " + RANK_PLURAL[a] + " and " + RANK_PLURAL[b];
    case 1: return "Pair of " + RANK_PLURAL[a];
    default: return cap(RANK_NAME[a]) + " high";
  }
}

function cardText(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
function cardsText(list) { return list.map(cardText).join(""); }

var SUIT_KEYS = { "♠": 0, "s": 0, "♥": 1, "h": 1, "♦": 2, "d": 2, "♣": 3, "c": 3 };
function parseCards(str) {
  var s = String(str).replace(/\s+/g, ""), out = [];
  for (var i = 0; i < s.length; i += 2) {
    var r = RANKS.indexOf(s[i].toUpperCase()), su = SUIT_KEYS[s[i + 1]];
    if (r < 0 || su === undefined) throw new Error("Bad card: " + s.slice(i, i + 2));
    out.push(r * 4 + su);
  }
  return out;
}

// "AKs", "AKo" or "77" for two hole cards, matching the range notation in data.js.
function handKey(two) {
  var a = two[0], b = two[1], ra = a >> 2, rb = b >> 2;
  if (ra === rb) return RANKS[ra] + RANKS[rb];
  var hi = ra > rb ? a : b, lo = ra > rb ? b : a;
  return RANKS[hi >> 2] + RANKS[lo >> 2] + ((a & 3) === (b & 3) ? "s" : "o");
}

// Every concrete two-card combo for a hand key, minus cards already in use.
function combosOf(key, dead) {
  var r1 = RANKS.indexOf(key[0]), r2 = RANKS.indexOf(key[1]), out = [], s1, s2;
  for (s1 = 0; s1 < 4; s1++) for (s2 = 0; s2 < 4; s2++) {
    var a = r1 * 4 + s1, b = r2 * 4 + s2;
    if (r1 === r2 && s2 <= s1) continue;
    if (key.length === 3 && key[2] === "s" && s1 !== s2) continue;
    if (key.length === 3 && key[2] === "o" && s1 === s2) continue;
    if (dead && (dead.has(a) || dead.has(b))) continue;
    out.push([a, b]);
  }
  return out;
}

// Small seeded random generator, so tests can replay the same hands.
function seededRandom(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var api = {
  RANKS: RANKS, SUITS: SUITS, RANK_NAME: RANK_NAME, RANK_PLURAL: RANK_PLURAL, CATEGORY: CATEGORY,
  evaluate: evaluate, category: category, straightHigh: straightHigh, handName: handName,
  cardText: cardText, cardsText: cardsText, parseCards: parseCards, handKey: handKey, combosOf: combosOf,
  seededRandom: seededRandom
};
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
