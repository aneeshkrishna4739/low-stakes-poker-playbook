# Low-Stakes Poker Playbook

An interactive strategy page for 100bb cash games at NL2–NL50, 5 to 11 players, tuned to exploit a loose, passive player pool.

- **Players at the table (5–11):** relabels the seats (UTG, UTG+1 … LJ, HJ, CO, BTN, SB, BB) and picks the right ranges for each seat. A seat's range depends on how many players are still to act behind it, so UTG at 9-handed plays tighter than UTG at 6-handed.
- **Preflop ranges:** 13×13 grids for opening, 3-bet, 4-bet and 5-bet spots, with sizes in big blinds. Pick your seat (and who opened); tap any hand to see its action.
- **Postflop tree:** flop, turn and river × aggressor or defender × in or out of position × six hand buckets. Switch between heads-up and multiway pots. Each bucket is paired with its bet-type name (Nutted · non-vulnerable = Value bet, Nutted · slightly vulnerable = Value bet, light protection, Nutted · very vulnerable = Value + protection bet, Good · slightly vulnerable = Thin value bet, Good · very vulnerable = Protection bet, Bad hand = Semi-bluff · bluff · give up). Each of the 72 spots gives an action, a size as % of the pot, the bet type (c-bet, check-raise for value, bluff catch, semi-bluff…), what to do if raised, and the reason.
- **Practice:** random hands at your table size, from any seat, heads-up or multiway (about a third of flops have 3+ players: opens with callers, cold-callers before you, the big blind overcalling). Each opponent has a profile (nit, unknown, aggressive, calling station) and holds a hand from the chart range his action implies. Opponents vary their bet sizes, and bigger bets mean stronger hands. You make every decision, preflop to river; for postflop decisions you pick the bet type (value bet, light protection, protection bet, semi-bluff…). A judge reads your hand the way the guide does (made hand, hands that beat you, bad next cards → bucket) and grades each choice against the charts: Correct, Almost or Mistake, with the guide entry and the reason. Every postflop decision also shows a **range read** for each opponent: his preflop range, what he did since, what he likely holds now, how often you beat it, your equity, and how often a bet gets folds or calls from worse or better hands. When the guide plays a spot one way but the range read clearly backs your play, the verdict is Almost instead of Mistake. At the end of a hand the online version asks Claude for a review; this local copy has a "Copy hand for Claude" button instead, to paste into a chat.
- **History:** every finished hand is saved with each decision, the guide's answer and the verdict. Filter to hands with mistakes, open any hand to see every decision, and export the database as JSON (full backup) or CSV (one row per decision, for a spreadsheet). Import a JSON export to move hands between the online version and this copy; duplicates are skipped.
- **Retrospect:** an analysis of your saved hands (all practice, last 7 days or last 100 hands): how often you follow the guide, strengths and weaknesses by spot, street, role and hand bucket, your three biggest leaks with what to do and a real example from your hands, and progress by day. The online version asks Claude for a coaching report with a plan for your next session; this copy has "Copy for Claude".
- **Buckets & rules:** bucket definitions with example hands, a glossary of bet types, adjustments for 3-bet pots, multiway pots and table size, a pot-odds table and an outs table.

## Open it

Double-click `index.html`. It runs in any browser with no install and works offline (fonts fall back to system fonts without internet).

`dist/low-stakes-poker-playbook.html` is the same page as one self-contained file, handy for sending to someone or opening on your phone.

## Project layout

```
index.html                     page structure
css/styles.css                 styles, light and dark themes
js/ranges.js                   range notation parser (QQ+, JJ-55, ATs+, A5s-A2s, AKo)
js/table.js                    seat names for 5–11 players and which range each seat uses
js/data.js                     all strategy content: ranges, sizes, postflop tree, bet types, rules
js/cards.js                    cards and hand evaluation
js/engine.js                   hand reading: hands that beat you, bad next cards, bucket
js/coach.js                    the judge: the guide's answer for a spot and the verdict
js/villain.js                  the opponent model: how each profile plays each class of hand, and bet sizes
js/reads.js                    range reads: each opponent's range from his actions, equity, fold and call odds
js/sim.js                      practice hands: dealing, opponents, multiway betting, pot and stacks
js/app.js                      player count, tabs, range grids and tree rendering
js/store.js                    the practice database (your Claude account online, browser storage locally)
js/retro.js                    Retrospect: areas, strengths, weaknesses, leak patterns
js/trainer.js                  the Practice tab: Play, History, Retrospect, and Claude's reviews
tests/check-data.js            validates every range token, every seat at 5–11 players, and all 72 tree spots
tests/check-practice.js        evaluator, the guide's example hands, and thousands of simulated practice hands
tests/check-retro.js           database and Retrospect: simulated players with known habits, store save/reload/import
tests/check-reads.js           range reads against opponents' real hands: never rules out the real hand, calibrated predictions
tests/screenshots.py           renders the page at phone width and saves screenshots
tools/build_single_file.py     rebuilds dist/ from the files above
CLAUDE.md                      guide for Claude when working on this project
screenshots/                   phone-width screenshots of each tab
dist/                          single-file build
```

## Changing the strategy

Everything you'd want to tweak lives in `js/data.js`.

- **Ranges** use standard notation, separated by commas: `QQ+`, `JJ-55`, `ATs+`, `A5s-A2s`, `AKo`, or `AK` for both suited and offsuit. When a hand appears in more than one list, the grid shows value first, then bluff, then call.
- **3-bet spots** are named `<opener tier>-<your seat>`. Tiers come from how many players act behind the opener: `vep` very early (7+), `ep` early (5–6), `hj` middle (4), `co` cutoff, `btn` button, `sb` small blind. Your seat is `ip` (any non-blind seat), `sb`, `bb`, or `bl` when both blinds share a range. Example: `ep-bl` is a blind facing an early open.
- **Postflop spots** are in the `T` object, keyed `T[street][role][position][bucket]`, for example `T.turn.def.oop.gsv`. Each has an action, size, bet type (`term`), follow-up rows and a reason.

After editing, run the checks and rebuild the single file:

```
node tests/check-data.js
node tests/check-practice.js
node tests/check-retro.js
node tests/check-reads.js
python tools/build_single_file.py
```

## Assumptions

- Online or live cash, 100bb effective stacks, NL2–NL50, 5 to 11 players (default 6).
- Opens are 2.5bb (3bb from the SB). Your own opening chart is not included; the ranges here cover what happens after an open.
- Postflop sizes assume a heads-up, single-raised pot. The Buckets & rules tab covers 3-bet pots, multiway pots and low stack-to-pot ratios.
- This is an exploitative baseline, not solver output. Tighten against nits and loosen against players who fold too much.

## Where your practice is saved

- **Online (claude.ai):** in the page's database, in a part only your account can read. It follows you to any device where you open the page.
- **This local copy:** in your browser's storage for this file. Clearing browser data deletes it, so use History › Export JSON now and then and keep the file (for example in this folder).

The two are separate. To combine them, export from one and import into the other.
