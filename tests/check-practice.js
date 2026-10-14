// Checks the practice mode: hand evaluator, bucket reading, judge and simulator.
//  1. The evaluator ranks known hands correctly.
//  2. Every example hand in the guide's bucket list lands in its own bucket.
//  3. Thousands of simulated hands always finish, keep money consistent, and only offer valid buttons.
//  4. A player who always does what the guide says is graded "correct" on every decision,
//     and the guide's answer is always one of the buttons shown.
// Run: node tests/check-practice.js
const path = require("path");
const js = (f) => path.join(__dirname, "..", "js", f);
const K = require(js("cards.js"));
const E = require(js("engine.js"));
require(js("ranges.js")); require(js("table.js")); require(js("data.js"));
const C = require(js("coach.js"));
require(js("villain.js")); require(js("reads.js"));
const S = require(js("sim.js"));

let problems = 0;
const fail = (msg) => { console.log("FAIL  " + msg); problems++; };
const P = (s) => K.parseCards(s);

// 1. Evaluator
const order = [
  "AsKsQsJsTs", "9h9d9c9s2d", "KhKdKc7s7d", "Ah9h6h3h2h", "9c8d7h6s5c", "5d4c3h2sAs",
  "QhQdQc8s2d", "JhJd4c4s9d", "AhAd9c7s2d", "AhKd9c7s2d"
];
for (let i = 0; i + 1 < order.length; i++) {
  if (!(K.evaluate(P(order[i])) > K.evaluate(P(order[i + 1])))) fail(`evaluator order: ${order[i]} should beat ${order[i + 1]}`);
}
if (K.evaluate(P("AhAd9c7s2d4h3c")) <= K.evaluate(P("AhAd9c7s2d"))) fail("7-card hand should find the 5-high straight");
if (K.handName(K.evaluate(P("KhKdKc7s7d"))) !== "Full house, kings full of 7s") fail("hand name for a full house");
// Number cards are digits, so a kicker never reads like a hand ("3 kicker", not "three kicker").
if (E.describe(E.made(P("As3s"), P("Qc2dAh")), P("As3s"), P("Qc2dAh")) !== "Top pair (aces), 3 kicker") fail("kicker name");
if (K.handName(K.evaluate(P("2s2h2dKcQs"))) !== "Three of a kind, 2s") fail("three of a kind name");

// 2. The guide's example hands
const examples = [
  ["7h7c", "Ks7d2c", "nnv"], ["AsKs", "AdKh4c", "nnv"], ["9s9h", "9c5d5s", "nnv"],
  ["7h7c", "Ks7s2d", "nsv"], ["KcQd", "KhQs7c", "nsv"], ["QdJd", "AsKcTh", "nsv"],
  ["7h7c", "Qs9s7d", "nvv"], ["KhQh", "KsQs6d", "nvv"],
  ["AcKd", "Ks7h2c", "gsv"], ["QdQc", "8s5h2d", "gsv"], ["AhJs", "Jc6d3s", "gsv"],
  ["Kh9c", "KdTd8s", "gvv"], ["QsQd", "JcTc6h", "gvv"], ["8c8s", "7d6d2c", "gvv"],
  ["AsQs", "Js7s2d", "bad:strong"], ["9c9d", "Ks7h2c", "bad:weak"], ["QcJd", "8s4h2d", "bad:air"]
];
for (const [h, b, want] of examples) {
  const an = E.analyze(P(h), P(b));
  const got = an.bucket === "bad" ? "bad:" + an.sub : an.bucket;
  if (got !== want) fail(`${h} on ${b}: got ${got}, guide says ${want}`);
}
// River: a set that loses to a completed flush drops to Good · very vulnerable
const riverSet = E.analyze(P("7h7c"), P("Qs9s7d8s2h"), { prevBoard: P("Qs9s7d8s"), prevInfo: E.made(P("7h7c"), P("Qs9s7d8s")) });
if (riverSet.group === "nutted") fail("set on a four-flush river should not be nutted");
console.log(`Guide examples checked: ${examples.length + 1}`);

// 3 + 4. Simulated hands
function play(seed, policy) {
  const rng = K.seededRandom(seed);
  const st = S.newHand({ players: 5 + Math.floor(rng() * 7), rng, reads: policy !== "guide" });
  let steps = 0;
  while (!st.done && steps++ < 30) {
    const p = st.prompt;
    if (!p) { fail(`seed ${seed}: hand stopped without a prompt or a result`); break; }
    const ids = p.options.map((o) => o.id);
    let choice;
    if (policy === "guide") {
      choice = S.expectedChoice(st);
      if (!ids.includes(choice)) {
        // The guide's raise can be impossible when someone is all-in; the judge then accepts the call.
        fail(`seed ${seed}: guide answer "${choice}" is not a button (${p.kind}, ${st.street}, options ${ids.join("/")})`);
        choice = ids.includes("call") ? "call" : ids[0];
      }
    } else choice = ids[Math.floor(rng() * ids.length)];
    const d = S.choose(st, choice);
    if (!d || !["correct", "almost", "mistake"].includes(d.verdict)) fail(`seed ${seed}: decision without a verdict`);
    if (policy === "guide" && d.verdict !== "correct") fail(`seed ${seed}: following the guide was graded ${d.verdict} (${d.kind} ${d.street}: chose ${d.choice}, best ${d.best}; ${d.path || d.guide})`);
  }
  if (!st.done) fail(`seed ${seed}: hand did not finish`);
  else {
    const r = st.result;
    if (!(r.net >= -100 && r.net <= 100 * Math.max(1, st.opps.length) + 1.5)) fail(`seed ${seed}: impossible result ${r.net}bb`);
    if (st.heroIn > 100 || st.opps.some((v) => v.in > 100)) fail(`seed ${seed}: put in more than the stack`);
    if (st.board.length && st.board.length !== 3 && st.board.length !== 4 && st.board.length !== 5) fail(`seed ${seed}: board has ${st.board.length} cards`);
    const all = st.board.concat(st.hero, ...st.opps.map((v) => v.cards));
    if (new Set(all).size !== all.length) fail(`seed ${seed}: a card was dealt twice`);
    // Money: what you won plus what everyone else lost adds up to zero.
    const pot = S.potOf(st), back = st.result.winner === "villain" ? 0 : st.result.net + st.heroIn;
    if (back > pot + 0.01) fail(`seed ${seed}: won ${back}bb from a ${pot}bb pot`);
  }
  return st;
}

const t0 = Date.now();
const coverage = {};
let decisions = 0, verdicts = { correct: 0, almost: 0, mistake: 0 };
for (let seed = 1; seed <= 1500; seed++) {
  const st = play(seed, "guide");
  for (const d of st.decisions) {
    decisions++;
    const key = d.kind + (d.street !== "preflop" ? " " + d.street : "") + (d.multiway ? " multiway" : "");
    coverage[key] = (coverage[key] || 0) + 1;
    if (d.bucket) coverage["bucket " + d.bucket.split(" · ").slice(0, 2).join(" · ")] = (coverage["bucket " + d.bucket.split(" · ").slice(0, 2).join(" · ")] || 0) + 1;
  }
}
for (let seed = 5001; seed <= 7000; seed++) {
  const st = play(seed, "random");
  for (const d of st.decisions) verdicts[d.verdict]++;
}
const ms = Date.now() - t0;
console.log(`Guide-following hands: 1500 (${decisions} decisions, all must be "correct")`);
console.log(`Random-choice hands: 2000 (verdicts: ${JSON.stringify(verdicts)})`);
console.log("Spots covered:");
Object.keys(coverage).sort().forEach((k) => console.log(`  ${k.padEnd(48)} ${coverage[k]}`));
console.log(`Time: ${ms} ms`);

const mustCover = ["pre-rfi", "pre-vsopen", "pre-vs3bet", "pre-vs4bet", "pre-vs5bet", "open flop", "open turn", "open river", "vsBet flop", "vsBet turn", "vsBet river", "vsRaise flop",
  "open flop multiway", "open turn multiway", "open river multiway", "vsBet flop multiway", "vsBet turn multiway"];
for (const k of mustCover) if (!coverage[k]) fail(`no practice hand reached "${k}"`);

if (problems) { console.log(`${problems} problem(s) found`); process.exit(1); }
console.log("All checks passed");
