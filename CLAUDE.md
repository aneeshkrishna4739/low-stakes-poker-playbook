# CLAUDE.md

Guide for working on this project. Read this before changing anything.

## What this is

An interactive poker strategy page for low-stakes cash games (NL2–NL50, 100bb stacks, 5–11 players). It has three tabs:

- **Preflop ranges:** 13×13 grids for 3-bet, 4-bet and 5-bet spots with sizes in big blinds. The player count (5–11) sets the seat names and which range each seat uses.
- **Postflop tree:** street × role (aggressor/defender) × position (IP/OOP) × hand bucket → action, size (% of pot), bet type, follow-ups, reason. 72 spots.
- **Practice:** simulated hands from any seat; the player decides, a rule-based judge grades each decision against this guide, and the online version asks Claude to review the hand. Every finished hand goes into a database (History view), and Retrospect analyzes it.
- **Buckets & rules:** bucket definitions, bet-type glossary, adjustments, pot odds, outs.

The owner is learning poker. The page is a study and at-the-table reference, so clarity beats completeness.

## Tech constraints

- Plain HTML, CSS and JavaScript. No framework, bundler, package.json or dependencies. Don't add any.
- `index.html` must work by double-clicking it (file://). So no ES modules (`type="module"`), no `fetch()` of local files, no build step required to view.
- Each script is wrapped in an IIFE that attaches its exports to `window.PB` and also sets `module.exports`, so Node tests can `require` the same files. Keep that pattern for any new script.
- Load order in `index.html` matters: `ranges.js` → `table.js` → `data.js` → `cards.js` → `engine.js` → `coach.js` → `villain.js` → `reads.js` → `sim.js` → `store.js` → `retro.js` → `app.js` → `trainer.js`.
- The only network request is Google Fonts, with system-font fallbacks. Keep it that way.

## Where things live

| File | Contains |
| --- | --- |
| `js/data.js` | All strategy content: preflop ranges and sizes, postflop tree `T`, buckets, bet-type glossary `TERMS`, rules. Most changes happen here. |
| `js/table.js` | Seat names for 5–11 players and the seat → range tier mapping. |
| `js/ranges.js` | Range notation parser (`QQ+`, `JJ-55`, `ATs+`, `A5s-A2s`, `AKo`, `AK`). |
| `js/cards.js` | Cards as integers 0–51 and the hand evaluator (higher score = better hand). |
| `js/engine.js` | Hand reading: made hand, share of hands that beat you, bad next cards, bucket and bad-hand type. |
| `js/coach.js` | The judge: the guide's answer for a spot (from `PRE` and `T`), decision options, and the verdict. |
| `js/villain.js` | The opponent model as probabilities: `villainPolicy(class, situation)` and `betSizes`. Profiles: nit, typ, agg, loose (calling station). |
| `js/reads.js` | Range reads: re-weights each opponent's preflop range by `villainPolicy` for every action he took, then equity, fold and call odds. |
| `js/sim.js` | Practice hands: scenario dealing, one to three opponents, multiway betting rounds, pot and stacks. No DOM, so it runs in Node. |
| `js/app.js` | Rendering and state for the chart and tree tabs. No strategy content here. |
| `js/store.js` | The practice database: the artifact `db` store online, `localStorage` locally, memory as a last resort. |
| `js/retro.js` | Retrospect: areas, strengths, weaknesses, leak patterns, trend, and the prompt for Claude's coaching report. Pure functions. |
| `js/trainer.js` | The Practice tab UI: Play, History, Retrospect, and Claude's reviews. |
| `css/styles.css` | Styles and light/dark theme tokens. |
| `tests/check-data.js` | Validates ranges, seats and tree completeness. |
| `tests/check-practice.js` | Evaluator, the guide's example hands, and thousands of simulated practice hands. |
| `tests/check-reads.js` | Range reads against the opponents' real hands: the real hand is never ruled out, and ahead-of-range and hand-class predictions are calibrated. |
| `tests/check-retro.js` | Records, Retrospect on simulated players with known habits, and both stores (the cloud one against a stand-in for the platform db). |
| `tests/screenshots.py` | Phone-width screenshots of each tab; prints page width per tab. |
| `tools/build_single_file.py` | Inlines everything into `dist/low-stakes-poker-playbook.html`. |

## The strategy model

**Preflop range tiers** depend on how many players act behind the opener, not on the seat's name: `vep` very early (7+ behind), `ep` early (5–6), `hj` middle (4), `co` cutoff (3), `btn` button (2), `sb` small blind (1). UTG at 9-handed is `vep`; UTG at 6-handed is `ep`; UTG at 5-handed is `hj`.

**3-bet spot ids** are `<opener tier>-<your seat>`, where your seat is `ip` (any non-blind seat), `sb`, `bb`, or `bl` when both blinds share a range (against `vep`, `ep` and `hj` opens). **4-bet spot ids** are the opener's tier (`hj` uses `ep`), plus `cold`. **5-bet spots** are by villain type: `nit`, `typ`, `agg`, `face5`.

**Ranges** are comma-separated strings in standard notation, split into `value`, `bluff` and `call`. When a hand appears in more than one list, the grid shows value, then bluff, then call.

**Hand buckets** (ids used as keys in `T`), each paired with a bet-type name shown next to it everywhere:

| id | Bucket | Bet type |
| --- | --- | --- |
| `nnv` | Nutted · non-vulnerable | Value bet |
| `nsv` | Nutted · slightly vulnerable | Value bet, light protection |
| `nvv` | Nutted · very vulnerable | Value + protection bet |
| `gsv` | Good · slightly vulnerable | Thin value bet |
| `gvv` | Good · very vulnerable | Protection bet |
| `bad` | Bad hand | Semi-bluff · bluff · give up |

**Vulnerability is counted, not guessed:** the number of next cards that could beat the hand or kill the action (`badCards` in `BUCKETS`). Nutted: 0–4 non-vulnerable (a gutshot at most), 5–9 slightly (one real draw out), 10+ very (two or more draws). Good: 0–9 slightly, 10+ very. Bucket descriptions should lead with that difference, and every example hand must actually fit its bucket (check that no straight or flush is already possible on the board before calling a hand "nutted").

**Tree spots** live at `T[street][role][pos][bucket]`, e.g. `T.turn.def.oop.gsv`. Each is built with:

- `N(action, color, size, betType, rows, reason)` for a single action. `color` is one of `bet`, `call`, `check`, `fold`, `mix`. `rows` is a list of `[situation, what to do]`.
- `B(subs, reason)` for the `bad` bucket, with `S(handType, action, color, size, betType, note)` for each of: strong draw, flush draw/open-ender, weak showdown, air (on the river: missed draw, weak showdown, air).

Every spot needs a bet type and a reason. Bet-type names should come from `TERMS`; if you introduce a new one, add it to `TERMS` with a definition. Adding a bucket means adding it to `BUCKETS` and to all 12 street/role/position groups in `T`; the check fails otherwise.

**Sizing units:** preflop in big blinds (and multiples of the previous bet), postflop as % of the current pot, raises as × their bet.

## Practice mode

**Hand reading (`engine.js`)** follows the guide literally, against every two-card hand the opponent could hold:
- Nutted: two pair or better (counting only what your own cards add) and at most 2.5% of hands beat you.
- Good: top pair, an overpair or better, and at most 30% of hands beat you; or any pair that at most 12% of hands beat (JJ on A-A-5).
- Bad: everything else, split into strong draw (12+ cards make it good), draw (8–11), weak showdown (any pair, or ace high) and air; on the river, missed draw.
- Bad next cards: the most next-card outs that any hand currently behind you has. That count picks the vulnerability bucket. On the river, Nutted is always non-vulnerable, and Good is very vulnerable only if the river was a scare card.

**Opponents (`villain.js`, `sim.js`).** Each opponent is dealt from the chart range his preflop action implies (opening, calling, 3-bet; calling stations call with `LOOSE_EXTRA` too), so his range is known exactly. Postflop he plays by `villainPolicy` on his `quickClass` (engine.js: a fast version of the buckets, about 98% in line with the exact reading). Bet sizes are drawn from `betSizes`, so size carries information. Multiway pots come from opens with callers, a cold-caller before the hero (a squeeze spot), and blinds overcalling.

**Range reads (`reads.js`)** run the opponent model backwards: weight(hand) = product over his actions of `actionProb(class of hand on that board, situation, action, size)`. Change `villainPolicy` or `betSizes` and the reads follow automatically. `tests/check-reads.js` must keep the real hand possible and the predictions calibrated. A play the read clearly supports (equity vs pot odds, fold equity vs break-even, worse hands calling) is upgraded from mistake to almost, never further; the guide stays the standard.

**Multiway guide (`MW` in data.js).** `MW[street][bucket] = {open, vsBet, vsRaise, why}` (the bad bucket has one set per hand type). The judge uses it whenever 2+ opponents are in the hand, whatever the hero's role or position. The Postflop tree shows it under "Players in the pot › Multiway".

**Hand names** write number cards as digits and picture cards as words ("Top pair (aces), 3 kicker", "Three of a kind, 2s", "Set of 7s"), so a kicker never reads like a hand. Keep that in any new text.

**The judge (`coach.js`)** never hard-codes advice. Preflop answers come from the range charts; postflop answers are read from the tree node for the hand's bucket and situation, its rows ("If they check", "If raised" …) and its size limits ("bets ≤ 66%"). If you change the tree's wording, keep the action words the judge reads: `Bet`, `Check`, `Raise`, `Call`, `Fold`, `Check-raise`, `Check-call`, `Check-fold`, `Lead`, `Call or raise`, `Check-raise or call`, the `≤ N%` size limits, and the row labels.

**Invariants the tests enforce:**
- Every example hand in `BUCKETS` lands in its own bucket. If you change a threshold or an example, keep them in sync.
- A player who always picks the guide's answer is graded "correct" on every decision, and the guide's answer is always one of the buttons shown.
- Simulated hands always finish, never deal a card twice, and never put in more than the 100bb stack.

**The practice database (`store.js`).** A hand record is built by `sim.js` `toRecord()`: plain JSON, about 1 KB, with every decision's choice, the guide's answer (`best`, plus `also`), verdict, the guide text, and either the chart (preflop) or bucket, role and position (postflop). Changing the record shape means bumping `v` and keeping old records readable.
- Online it lives at `data/users/<viewer id>/practice/batches/<batch>`: one document per UTC hour (`b-YYYYMMDDHH`, then `-2`, `-3`…), at most 100 hands or 180 KB each, shaped `{key, v, hands: {<handId>: record}}`. New hands are merged with `update({hands: {id: record}})` (create with `set` if the document doesn't exist), so tabs never overwrite each other. Loading pages through batches ordered by `key`. Platform limits: 256 KB per document, 25,000 documents per artifact, queries up to 1000.
- Locally it is `localStorage` key `ls-playbook-hands-v1` (an array of records). History can export JSON/CSV and import JSON (duplicates skipped by hand id).
- To read a user's practice from a Claude session: `ArtifactData` `list` on collection `data/users/me/practice/batches` of the published artifact.

**Retrospect (`retro.js`)** groups decisions into areas (preflop spot, postflop situation, street, role and position, hand bucket) and leak patterns (`LEAKS`: each has `opp` = when the mistake was possible, `test` = the mistake, advice, and a study pointer). Tests require each simulated habit to come out as the top leak and at least 97% of non-correct decisions to be explained by some leak: add a pattern when you add a new kind of decision.

**Claude's review** uses the artifact `sample` capability (declared when the page is published as an artifact). It only exists inside the claude.ai viewer: `window.claude.use("sample")` resolves to a function there and is absent in the local file, where the page shows "Copy hand for Claude" instead. Never call Claude without a click from the player. The coaching report in Retrospect works the same way.

**Publishing as an artifact** needs `capabilities: {sample: {}, db: {}, user: {}, downloads: true}`: `db` and `user` for the database, `downloads` for History exports. Passing a non-empty `capabilities` replaces the whole set.

## Strategy principles to keep consistent

The page is exploitative against a loose, passive low-stakes pool, not solver output:

- Value bet bigger and thinner; bluff less, especially on the river.
- More vulnerable hands bet bigger (protection); non-vulnerable hands may slowplay rarely, vulnerable ones never.
- Fold one pair to big turn and river raises; low-stakes raises are value-heavy.
- At 100bb, never flat a 4-bet: jam or fold.
- Re-bucket every street. On the river, "vulnerable" only means "did the river beat me?"
- 3-bet pots, multiway pots and table size are handled as adjustments in `ADJUST`, not as separate trees.

If a requested change conflicts with these, say so before making it.

## Writing style for page copy

Plain, short, direct sentences written for a learning player. Use the poker term and say what it means in practice. Use typographic apostrophes (’) inside strings in `data.js`. Avoid em-dash asides and filler.

## Design rules

- Colors are tokens on `:root`, redefined in both dark-mode blocks in `styles.css`. Never use a literal color in a component rule.
- Must work at 390px wide with no horizontal page scroll. Grid tracks that hold content use `minmax(0, 1fr)`, and flex/grid children holding text get `min-width: 0`.
- Toggle visibility with the `hidden` attribute (the stylesheet forces `[hidden]{display:none!important}`).
- Saved settings use `localStorage` key `ls-playbook-v2` (tabs and pickers) and practice hands `ls-playbook-hands-v1`, always inside try/catch. Change a key if its shape changes incompatibly.

## After every change

```
node tests/check-data.js           # must print "All checks passed"
node tests/check-practice.js       # must print "All checks passed" (about 10 seconds)
node tests/check-retro.js          # must print "All checks passed" (about 15 seconds)
python tools/build_single_file.py   # keep dist/ in sync
python tests/screenshots.py         # optional: every tab should report width 390
```

Update `README.md` when features, files or counts change (for example the number of tree spots).
