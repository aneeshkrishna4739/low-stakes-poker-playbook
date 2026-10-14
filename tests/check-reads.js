// Checks the range reads (reads.js) against the opponents' real hands.
//  1. An opponent's real hand is always still possible in his read range (it never gets weight 0).
//  2. Calibration: when the read says you're ahead of X% of his range, you are ahead about X% of the time.
//  3. Class calibration: the read's share of nutted hands, draws, etc. matches how often he really holds them.
//  4. Equity with no cards to come equals your showdown share against the read ranges.
// Run: node tests/check-reads.js
const path = require("path");
const js = (f) => path.join(__dirname, "..", "js", f);
const K = require(js("cards.js"));
const E = require(js("engine.js"));
require(js("ranges.js")); require(js("table.js")); require(js("data.js")); require(js("coach.js")); require(js("villain.js"));
const RD = require(js("reads.js"));
const S = require(js("sim.js"));

let problems = 0;
const fail = (msg) => { console.log("FAIL  " + msg); problems++; };
const bins = Array.from({ length: 5 }, () => ({ p: 0, a: 0, n: 0 }));
const groups = {};
let checked = 0, zero = 0, mwReads = 0;
const GROUP_OF = { nut: "nut", good: "good", goodv: "good", strong: "draw", draw: "draw", weak: "weak", air: "air" };

for (let seed = 1; seed <= 1200; seed++) {
  const rng = K.seededRandom(seed);
  const st = S.newHand({ players: 5 + Math.floor(rng() * 7), rng, reads: false });
  let guard = 0;
  while (!st.done && guard++ < 30) {
    const ids = st.prompt.options.map((o) => o.id);
    if (st.street !== "preflop" && st.prompt.ctx) {
      const read = RD.readHand(st, { raw: true, betFrac: 0.5 });
      if (read.opps.length > 1) mwReads++;
      const heroScore = K.evaluate(st.hero.concat(st.board));
      read.raw.forEach((r, ri) => {
        const v = r.v, idx = r.list.findIndex((c) => (c[0] === v.cards[0] && c[1] === v.cards[1]) || (c[0] === v.cards[1] && c[1] === v.cards[0]));
        checked++;
        if (idx < 0 || !(r.w[idx] > 0)) { zero++; if (zero <= 3) fail(`seed ${seed}: ${v.seat}'s real hand ${K.cardsText(v.cards)} has no weight in his read (${v.priorText}; ${v.obs.map((o) => o.action).join(",")})`); }
        const pred = read.opps[ri].ahead, vs = K.evaluate(v.cards.concat(st.board));
        const actual = heroScore > vs ? 1 : heroScore === vs ? 0.5 : 0;
        const b = bins[Math.min(4, Math.floor(pred * 5))]; b.p += pred; b.a += actual; b.n++;
        const tbl = E.rankTable(st.board), real = GROUP_OF[E.quickClass(v.cards, st.board, tbl)];
        read.opps[ri].groups.forEach((g) => { const e = groups[g.key] || (groups[g.key] = { p: 0, a: 0 }); e.p += g.share; e.a += g.key === real ? 1 : 0; });
      });
      if (st.board.length === 5 && read.opps.length === 1) {
        // No cards to come: equity must match the weighted showdown share.
        const r = read.raw[0]; let exact = 0;
        for (let i = 0; i < r.list.length; i++) exact += r.w[i] * (heroScore > r.scores[i] ? 1 : heroScore === r.scores[i] ? 0.5 : 0);
        if (Math.abs(exact - read.equity) > 0.06) fail(`seed ${seed}: river equity ${read.equity.toFixed(3)} vs exact ${exact.toFixed(3)}`);
      }
    }
    let c = S.expectedChoice(st);
    if (!ids.includes(c) || rng() < 0.25) c = ids[Math.floor(rng() * ids.length)];
    S.choose(st, c);
  }
}
console.log(`Opponent reads checked: ${checked} (${mwReads} decisions with 2+ opponents); real hand impossible in read: ${zero}`);
if (zero) fail(`${zero} reads ruled out the opponent's real hand`);
console.log("Ahead-of-range calibration (predicted vs actual):");
bins.forEach((b, i) => {
  if (!b.n) return;
  const p = b.p / b.n, a = b.a / b.n;
  console.log(`  read says ${i * 20}–${i * 20 + 20}%: predicted ${(p * 100).toFixed(1)}%, actual ${(a * 100).toFixed(1)}% (${b.n} reads)`);
  if (b.n >= 150 && Math.abs(p - a) > 0.06) fail(`calibration off in bin ${i}: predicted ${p.toFixed(3)}, actual ${a.toFixed(3)}`);
});
console.log("What he holds (predicted share vs actual):");
Object.entries(groups).forEach(([k, e]) => {
  const p = e.p / checked, a = e.a / checked;
  console.log(`  ${k.padEnd(5)} predicted ${(p * 100).toFixed(1)}%, actual ${(a * 100).toFixed(1)}%`);
  if (Math.abs(p - a) > 0.03) fail(`class ${k} off: predicted ${p.toFixed(3)}, actual ${a.toFixed(3)}`);
});
if (problems) { console.log(`${problems} problem(s) found`); process.exit(1); }
console.log("All checks passed");
