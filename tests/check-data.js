// Validates the strategy data:
//  1. every range token parses to real hands
//  2. every opener/your-seat combination at 5 to 11 players maps to a 3-bet and 4-bet spot that exists
//  3. the postflop tree has all 72 spots (3 streets x 2 roles x 2 positions x 6 buckets),
//     each with a bet type and a reason
// Run: node tests/check-data.js
const path = require("path");
const ranges = require(path.join(__dirname, "..", "js", "ranges.js"));
const table = require(path.join(__dirname, "..", "js", "table.js"));
const data = require(path.join(__dirname, "..", "js", "data.js"));

const R = ranges.R;
const isHand = (h) =>
  /^[AKQJT2-9]{2}[so]?$/.test(h) &&
  (h.length === 2 ? h[0] === h[1] : R.indexOf(h[0]) < R.indexOf(h[1]));

let problems = 0;
const fail = (msg) => { console.log(msg); problems++; };

// 1. Range tokens
for (const mode of Object.keys(data.PRE)) {
  for (const spot of data.PRE[mode].spots) {
    for (const field of ["value", "bluff", "call"]) {
      if (!spot[field]) continue;
      for (const tok of spot[field].split(",").map((t) => t.trim())) {
        const hands = [...ranges.parseRange(tok)];
        if (!hands.length || hands.some((h) => !isHand(h)))
          fail(`BAD TOKEN  ${mode}/${spot.id}/${field}: "${tok}" -> ${hands.join(" ")}`);
      }
    }
  }
}

console.log("3-bet frequency by spot:");
for (const spot of data.PRE["3bet"].spots) {
  const all = new Set([...ranges.parseRange(spot.value), ...ranges.parseRange(spot.bluff)]);
  console.log(`  ${spot.id.padEnd(8)} ${((ranges.combos(all) / 1326) * 100).toFixed(1)}%`);
}

// 2. Seats at every table size
const ids3 = new Set(data.PRE["3bet"].spots.map((s) => s.id));
const ids4 = new Set(data.PRE["4bet"].spots.map((s) => s.id));
let combos = 0;
console.log("Seats by table size:");
for (let n = 5; n <= 11; n++) {
  const seats = table.seatsFor(n);
  if (seats.length !== n || new Set(seats).size !== n) fail(`BAD SEATS  ${n}: ${seats.join(" ")}`);
  console.log(`  ${String(n).padStart(2)}  ${seats.map((s) => `${s}(${table.tierOf(seats, s) || "-"})`).join(" ")}`);
  const openers = seats.slice(0, -1);
  for (const opener of openers) {
    if (!ids4.has(table.fourBetSpotId(seats, opener))) fail(`NO 4-BET SPOT  ${n}-handed, opened ${opener}`);
    for (const hero of seats.slice(seats.indexOf(opener) + 1)) {
      const id = table.threeBetSpotId(seats, opener, hero);
      if (!ids3.has(id)) fail(`NO 3-BET SPOT  ${n}-handed, ${hero} vs ${opener} -> ${id}`);
      combos++;
    }
  }
}
console.log(`Opener/seat combinations checked: ${combos}`);

// 3. Tree completeness and bet types (one tree spot per bucket listed in BUCKETS)
const bucketIds = data.BUCKETS.map((b) => b.id);
const expected = 3 * 2 * 2 * bucketIds.length;
let cells = 0;
for (const street of ["flop", "turn", "river"])
  for (const role of ["agg", "def"])
    for (const pos of ["ip", "oop"]) {
      const extra = Object.keys(data.T[street]?.[role]?.[pos] || {}).filter((k) => !bucketIds.includes(k));
      if (extra.length) fail(`UNKNOWN BUCKET  ${street}/${role}/${pos}: ${extra.join(", ")}`);
      for (const b of bucketIds) {
        const where = `${street}/${role}/${pos}/${b}`;
        const n = data.T[street]?.[role]?.[pos]?.[b];
        if (!n) { fail(`MISSING    ${where}`); continue; }
        if (!n.why) fail(`NO REASON  ${where}`);
        if (n.bad) n.subs.forEach((s) => { if (!s.term) fail(`NO BET TYPE  ${where}/${s.h}`); });
        else if (!n.term) fail(`NO BET TYPE  ${where}`);
        cells++;
      }
    }
console.log(`Tree spots: ${cells}/${expected} (${bucketIds.length} buckets)`);
if (cells !== expected) fail("Tree is incomplete");
for (const b of data.BUCKETS) if (!b.play) fail(`NO BET TYPE for bucket ${b.id}`);

if (problems) { console.log(`${problems} problem(s) found`); process.exit(1); }
console.log("All checks passed");
