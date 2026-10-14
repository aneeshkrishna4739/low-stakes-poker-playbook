/* All strategy content: preflop ranges and sizes, postflop tree, buckets, bet types and rules.
   Edit this file to change the strategy. Range priority on the grid: value > bluff > call.
   3-bet spot ids are "<opener tier>-<your seat>": tiers vep/ep/hj/co/btn/sb (see js/table.js),
   your seat ip (any non-blind seat), sb, bb, or bl (both blinds share a range).
   sbCall: the smaller calling range for the SB in a shared "bl" spot (the SB mostly 3-bets or folds). */
(function (root) {
"use strict";

var IP3 = "3× the open → 7.5bb";
var OOP3 = "4× the open → 10bb. Go 11–12bb vs players who call too much.";

var TIERS = { vep: "very early", ep: "early", hj: "middle", co: "cutoff", btn: "button", sb: "small blind" };

/* ---------- preflop ---------- */
var PRE = {
  "open": {
    title: "Opening ranges",
    labels: { v: "Open (raise)", b: "Open (raise)", c: "Call", f: "Fold" },
    spots: [
      { id:"vep", size:"2.5bb, +1bb per limper", value:"77+, ATs+, KTs+, QTs+, JTs, AJo+, KQo", bluff:"", call:"", note:"Seven or more players are still to act behind you, so open only strong hands." },
      { id:"ep", size:"2.5bb, +1bb per limper", value:"22+, A8s+, A5s-A4s, K9s+, QTs+, JTs, T9s, 98s, ATo+, KJo+", bluff:"", call:"", note:"Small pairs are opens at 100bb: they win big pots when they hit a set." },
      { id:"hj", size:"2.5bb, +1bb per limper", value:"22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, ATo+, KJo+, QJo", bluff:"", call:"", note:"Add every suited ace and more suited connectors." },
      { id:"co", size:"2.5bb, +1bb per limper", value:"22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A9o+, KTo+, QTo+, JTo", bluff:"", call:"", note:"Only three players are left behind you. Open wide and steal the blinds." },
      { id:"btn", size:"2.5bb, +1bb per limper", value:"22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o", bluff:"", call:"", note:"Open almost half your hands: only the blinds are left, and you have position after the flop." },
      { id:"sb", size:"3bb", value:"22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A5o+, K9o+, QTo+, JTo", bluff:"", call:"", note:"Raise or fold against the BB. Don't limp: you will be out of position for the whole hand." }
    ]
  },
  "3bet": {
    title: "3-bet ranges",
    labels: { v: "3-bet for value", b: "3-bet as a bluff", c: "Call", f: "Fold" },
    spots: [
      { id:"vep-ip", size:IP3, value:"QQ+, AKs, AKo", bluff:"", call:"JJ-22, AQs-AJs, KQs-KJs, QJs, JTs, T9s", note:"Full-ring early opens are very strong, around 8–10% of hands. 3-bet only premiums, skip bluffs, and set-mine pairs in position." },
      { id:"vep-bl", size:OOP3, value:"QQ+, AKs, AKo", bluff:"", call:"JJ-22, AQs-ATs, KQs-KJs, QJs, JTs, T9s, 98s, 87s, AQo", sbCall:"JJ-TT, AQs", note:"The calls are for the BB only. From the SB, 3-bet or fold and flat just JJ-TT and AQs." },
      { id:"ep-ip", size:IP3, value:"QQ+, AKs, AKo", bluff:"A5s", call:"JJ-55, AQs-AJs, KQs-KJs, QJs, JTs, T9s, AQo", note:"Early opens are strong at low stakes. Keep 3-bets value-heavy and set-mine small pairs in position." },
      { id:"ep-bl", size:OOP3, value:"QQ+, AKs, AKo", bluff:"A5s", call:"JJ-22, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo", sbCall:"JJ-TT, AQs", note:"The calls are for the BB only. From the SB, 3-bet or fold and flat just JJ-TT and AQs." },
      { id:"hj-ip", size:IP3, value:"JJ+, AQs+, AKo", bluff:"A5s-A4s, 76s", call:"TT-55, AJs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo, KQo", note:"Bluff 3-bets use suited wheel aces: they block AA and AK and can make straights and nut flushes." },
      { id:"hj-bl", size:OOP3, value:"JJ+, AQs+, AKo", bluff:"A5s-A4s", call:"TT-22, AJs-A8s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, AQo-AJo, KQo", sbCall:"TT-99, AJs", note:"The calls are for the BB. From the SB, 3-bet or fold and flat just TT-99 and AJs." },
      { id:"co-ip", size:IP3, value:"TT+, AJs+, KQs, AQo+", bluff:"A5s-A2s, K9s, Q9s, J9s, T8s, 76s, 65s", call:"99-22, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AJo, KQo", note:"You have position for the whole hand, so flatting is fine. 3-bet bigger (3.5×) against players who call 3-bets too much." },
      { id:"co-sb", size:OOP3, value:"TT+, AJs+, KQs, AQo+", bluff:"99-88, ATs, KJs, QJs, JTs, A5s-A2s, AJo, KQo", call:"", note:"3-bet or fold. Flatting from the SB invites a BB squeeze and leaves you out of position." },
      { id:"co-bb", size:OOP3, value:"TT+, AJs+, KQs, AQo+", bluff:"A5s-A4s, K9s, Q9s, 76s, 65s", call:"99-22, ATs-A2s, KJs-K6s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s-86s, 75s, 64s, 54s, AJo-A9o, KQo-KTo, QJo, JTo", note:"You already have 1bb in, so defend wide with suited and connected hands. Fold weak offsuit hands." },
      { id:"btn-sb", size:OOP3, value:"99+, ATs+, KTs+, QJs, AJo+, KQo", bluff:"88-77, A9s-A2s, K9s, QTs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, ATo, KJo", call:"", note:"3-bet or fold. The button opens wide, so 3-bet around 16% and expect a lot of folds." },
      { id:"btn-bb", size:OOP3, value:"TT+, ATs+, KJs+, AQo+", bluff:"A5s-A2s, K8s-K7s, Q9s, J9s, T8s, 97s, 86s, 75s, 65s, 54s", call:"99-22, A9s-A6s, KTs-K4s, QJs-Q6s, JTs-J7s, T9s-T7s, 98s-96s, 87s-86s, 76s, 64s, 53s, 43s, AJo-A5o, KQo-K9o, QJo-QTo, JTo-J9o, T9o, 98o", note:"Your widest defend. Rake is high at low stakes, so fold the weakest offsuit hands even though the price looks good." },
      { id:"sb-bb", size:"3× the open → 9bb vs a 3bb SB open (you have position)", value:"99+, ATs+, KTs+, QJs, AJo+, KQo", bluff:"A9s-A2s, K9s-K6s, Q9s, J9s, T8s, 97s, 86s, 75s, 64s, 54s", call:"88-22, K5s-K2s, QTs-Q4s, JTs-J6s, T9s-T6s, 98s-96s, 87s-85s, 76s-74s, 65s-63s, 53s, 43s, ATo-A2o, KJo-K7o, QJo-Q8o, JTo-J8o, T9o-T8o, 98o, 87o", note:"Blind vs blind: the SB opens very wide and you have position. Defend most hands and 3-bet often." }
    ]
  },
  "4bet": {
    title: "4-bet ranges",
    labels: { v: "4-bet for value", b: "4-bet as a bluff", c: "Call the 3-bet", f: "Fold" },
    spots: [
      { id:"vep", who:"You opened {seat} and got 3-bet", size:"Usually out of position: 2.5× their 3-bet → ~19bb vs 7.5bb. In position vs a blind: 2.2× → ~22–24bb.", value:"KK+, AKs", bluff:"", call:"QQ-JJ, AKo, AQs", note:"A 3-bet against a full-ring early open is almost always QQ+ or AK at low stakes. 4-bet only AA, KK and AKs; call QQ, JJ and AKo and play carefully after the flop." },
      { id:"ep", who:"You opened {seat} and got 3-bet", size:"Out of position: 2.5× their 3-bet → ~19bb vs 7.5bb. In position vs a blind: 2.2× → ~22–24bb.", value:"QQ+, AKs, AKo", bluff:"", call:"JJ-88, AQs-AJs, KQs", note:"Low-stakes 3-bets against early and middle opens are rarely light. No 4-bet bluffs here; fold AQo and weaker." },
      { id:"co", who:"You opened {seat}; the button or a blind 3-bets", size:"Out of position vs the button: 2.5× → ~19bb. In position vs a blind: 2.2× → ~22–24bb.", value:"QQ+, AKs, AKo", bluff:"A5s-A4s", call:"JJ-77, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo", note:"4-bet bluff only against players who 3-bet more than 8%. Against a button 3-bet you are out of position, so call just JJ-99, AQs, AJs and KQs." },
      { id:"btn", who:"You opened {seat} and a blind 3-bets", size:"In position: 2.2× their 3-bet → ~22–24bb vs 10–11bb.", value:"QQ+, AKs, AKo", bluff:"A5s-A3s", call:"JJ-55, AQs-A8s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, AQo-AJo, KQo", note:"Position lets you call wide with suited hands. Add JJ to your 4-bets against blinds who 3-bet a lot." },
      { id:"sb", who:"You opened {seat} and the BB 3-bets", size:"Out of position: 2.5× their 3-bet → ~22bb vs 9bb.", value:"QQ+, AKs, AKo", bluff:"A5s-A4s", call:"JJ-77, AQs-ATs, KQs-KTs, QJs, JTs, T9s, 98s, AQo", note:"You are out of position for the whole hand, so call tighter than you would on the button." },
      { id:"cold", who:"Someone opens, someone else 3-bets, and it's on you", size:"2.3× the 3-bet → ~17–25bb. Add 2–3bb when out of position.", value:"QQ+, AKs, AKo", bluff:"", call:"", note:"Against an early open plus a 3-bet, tighten to KK+ and AKs. Don't flat: you'd be squeezed between two strong ranges." }
    ]
  },
  "5bet": {
    title: "5-bet ranges",
    labels: { v: "5-bet all-in (value)", b: "5-bet all-in (bluff)", c: "Call", f: "Fold" },
    spots: [
      { id:"nit", label:"Nit", who:"You 3-bet; a nit (4-bets under 2.5%) 4-bets", size:"All-in, 100bb", value:"KK+", bluff:"", call:"", note:"Their range is about KK+ and AK. QQ and AK have roughly 39–40% equity against it and need about 45% to jam profitably. Fold them." },
      { id:"typ", label:"Unknown", who:"You 3-bet; a typical or unknown player 4-bets (~3–4%)", size:"All-in, 100bb", value:"QQ+, AKs, AKo", bluff:"", call:"", note:"Their range includes some JJ, AQs and the occasional bluff, which makes QQ and AK profitable jams. Never flat a 4-bet at 100bb: jam or fold." },
      { id:"agg", label:"Aggressive", who:"You 3-bet; an aggressive player (4-bets 5%+) 4-bets", size:"All-in, 100bb", value:"JJ+, AQs+, AKo", bluff:"A5s", call:"", note:"A5s blocks AA and AK. Use it as a 5-bet bluff only against players who 4-bet and then fold." },
      { id:"face5", label:"Facing a 5-bet", who:"You 4-bet and villain jams", size:"Calling needs about 39% equity", value:"", bluff:"", call:"QQ+, AKs, AKo", note:"Fold every 4-bet bluff. Against a nit who only jams KK+ and AK, fold QQ; AK is close to break-even." }
    ]
  }
};

var SIZES = [
  ["Open raise, any seat before the SB", "2.5bb", "—"],
  ["Open raise, SB", "3bb", "—"],
  ["Isolate limpers, in position", "4bb + 1bb per extra limper", "2 limpers → 5bb"],
  ["Isolate limpers, from the blinds", "5bb + 1bb per extra limper", "1 limper → 5bb"],
  ["3-bet in position", "3× the open", "vs 2.5bb → 7.5bb"],
  ["3-bet out of position", "4× the open", "vs 2.5bb → 10bb"],
  ["Squeeze (open + callers)", "3-bet size + 1× open per caller", "BB vs 2.5bb + 1 caller → 12.5bb"],
  ["4-bet in position", "2.2× the 3-bet", "vs 10bb → 22bb"],
  ["4-bet out of position", "2.5× the 3-bet", "vs 7.5bb → 19bb"],
  ["5-bet", "All-in", "100bb"]
];
var SIZE_NOTES = [
  "Isolate limpers with roughly the range you would open from that seat, a little tighter against two or more limpers. Never open-limp.",
  "Live games (common at 8–11 players): open 3–4bb and add 1bb per limper. The 3-bet and 4-bet multipliers stay the same, so the bb amounts scale up with your open."
];

/* ---------- buckets and bet types ---------- */
var BUCKETS = [
  { id:"nnv", name:"Nutted · non-vulnerable", play:"Value bet", badCards:"0–4", def:"No real draws out, a gutshot at most. Almost nothing can beat you on the next card, so your only job is getting paid. Bet to build the pot.", ex:["Set of 7s on K♠7♦2♣ (rainbow, no draws)","A♠K♠ on A♦K♥4♣ (top two; only a gutshot out)","Full house or quads"] },
  { id:"nsv", name:"Nutted · slightly vulnerable", play:"Value bet, light protection", badCards:"5–9", def:"Exactly one real draw out, such as a single flush draw. That draw is your only danger, so bet a bit bigger to charge it and never slowplay.", ex:["Set of 7s on K♠7♠2♦ (only a flush draw out)","K♣Q♦ on K♥Q♠7♣ (top two; one straight draw out)","Q♦J♦ on A♠K♣T♥ (nut straight; only a paired board hurts)","Nut flush on an unpaired board (a set can still fill up)"] },
  { id:"nvv", name:"Nutted · very vulnerable", play:"Value + protection bet", badCards:"10+", def:"Two or more draws out, such as a flush draw plus straight draws. Many next cards beat you or freeze the action, so bet big now while you’re ahead.", ex:["Set of 7s on Q♠9♠7♦ (flush draw + straight draws)","K♥Q♥ on K♠Q♠6♦ (top two; flush and straight draws)","A straight on a two-tone board","A non-nut flush"] },
  { id:"gsv", name:"Good · slightly vulnerable", play:"Thin value bet", badCards:"0–9", def:"Probably best, and only an overcard or a single draw can hurt you. Small bets get called by worse pairs.", ex:["A♣K♦ on K♠7♥2♣","Q♦Q♣ on 8♠5♥2♦","A♥J♠ on J♣6♦3♠"] },
  { id:"gvv", name:"Good · very vulnerable", play:"Protection bet", badCards:"10+", def:"Probably best now, but overcards plus draws mean many next cards hurt. You bet mainly to deny free cards.", ex:["K♥9♣ on K♦T♦8♠ (weak kicker, wet board)","Q♠Q♦ on J♣T♣6♥ (overpair, many draws)","8♣8♠ on 7♦6♦2♣"] },
  { id:"bad", name:"Bad hand", play:"Semi-bluff · bluff · give up", def:"Behind, or ahead only of bluffs. Split it by what the hand can still do:", ex:["Strong draw → semi-bluff: combo draws, flush draw + overcards (12+ outs)","Draw → semi-bluff or free card: flush draw, open-ender (8–9 outs)","Weak showdown → pot control: second or third pair, underpairs, ace-high","Air → bluff or give up: nothing, or backdoor draws only"] }
];

var TERMS = [
  ["Value bet", "Bet so that worse hands call you.", "Nutted · non-vulnerable"],
  ["Value bet, light protection", "Value bet sized a little bigger (50–66% on the flop) because one draw is out. Don't slowplay it.", "Nutted · slightly vulnerable"],
  ["Value + protection bet", "Bet that gets called by worse hands and makes draws pay to continue. Size up: 75–100%.", "Nutted · very vulnerable"],
  ["Thin value bet", "Small value bet (33–50%) with a hand only a little ahead of what calls.", "Good · slightly vulnerable"],
  ["Protection bet", "Bet mainly to fold out or charge hands that could outdraw you. Getting called by worse is a bonus.", "Good · very vulnerable"],
  ["Semi-bluff", "Bet or raise with a draw. You win if they fold and can still win by hitting.", "Bad hand · draws"],
  ["Bluff", "Bet with a hand that can't win at showdown so that better hands fold.", "Bad hand · air"],
  ["Give up", "Check and fold. Put no more money in with a hand that has no equity.", "Bad hand · air"],
  ["Pot control", "Check or call instead of betting, to keep the pot small with a medium hand.", "Good hands, weak showdown"],
  ["Bluff catch", "Call with a hand that beats only bluffs.", "Good hands facing a bet"],
  ["Drawing with odds", "Call with a draw only when the price is right (see Outs).", "Bad hand · draws"],
  ["Free card", "Check behind with a draw to see the next card for free.", "Bad hand · draws, in position"],
  ["Slowplay", "Check or just call with a monster so they keep betting.", "Nutted · non-vulnerable, rarely"],
  ["C-bet", "Continuation bet: the preflop raiser bets the flop.", "Aggressor, flop"],
  ["Barrel", "Keep betting on the next street after betting the last one.", "Aggressor, turn and river"],
  ["Delayed c-bet", "The preflop raiser checks the flop, then bets the turn.", "Aggressor, turn"],
  ["Probe bet", "The caller bets the turn after the raiser checked back the flop.", "Defender, turn"],
  ["Lead (donk bet)", "Bet out of position into the player who bet the last street.", "Defender, out of position"],
  ["Check-raise", "Check, then raise when they bet. For value or as a semi-bluff.", "Defender, out of position"],
  ["Overbet", "Bet more than the pot, usually on the river when they're capped.", "Nutted, river"],
  ["Stab / float", "Bet when they show weakness (stab), or call in position planning to take the pot later (float).", "Bad hand · air"]
];

/* ---------- postflop tree ---------- */
var CTX = {
  flop:{ agg:{ ip:"You raised preflop and have position. Villain checks to you.", oop:"You raised preflop and act first." },
         def:{ ip:"You called preflop in position. Villain acts first.", oop:"You called preflop, usually from the blinds, and act first." } },
  turn:{ agg:{ ip:"You bet the flop and got called. Villain checks to you.", oop:"You bet the flop, got called, and act first." },
         def:{ ip:"You called a flop bet. Villain bets again or checks.", oop:"You called a flop bet and act first." } },
  river:{ agg:{ ip:"You bet the turn and got called. Villain checks to you.", oop:"You bet the turn, got called, and act first." },
          def:{ ip:"You called a turn bet. Villain bets again or checks.", oop:"You called a turn bet and act first." } }
};
var STREETNOTE = {
  flop:"Heads-up, single-raised pot. For 3-bet pots and multiway pots, see Buckets & rules.",
  turn:"If the flop checked through, the preflop raiser can still bet the turn (a delayed c-bet) with these sizes, and the caller should make a probe bet of 50–66% with value and draws.",
  river:"Draws are finished. “Vulnerable” now only asks whether the river card beat you. Re-bucket before you act."
};

// N(action, color, size, bet type, rows, reason); B(sub-hands, reason); S(hand, action, color, size, bet type, note)
function N(act,k,size,term,rows,why){ return {act:act,k:k,size:size,term:term,rows:rows,why:why}; }
function B(subs,why){ return {bad:true,subs:subs,why:why}; }
function S(h,act,k,size,term,t){ return {h:h,act:act,k:k,size:size,term:term,t:t}; }

var T = {
 flop:{
  agg:{
   ip:{
    nnv:N("Bet","bet","33–50% pot","Value bet (c-bet)",[["If check-raised","Re-raise to about 3× their raise. Plan to be all-in by the river."],["Next streets","Value bet the turn 66–75% and the river 75–100%."]],"Low-stakes players call too much. Build the pot now instead of slowplaying."),
    nsv:N("Bet","bet","50–66% pot","Value bet, light protection (c-bet)",[["If check-raised","Re-raise or jam. Don’t slowplay with a draw out."],["Next streets","Value bet blank turns 66–75%. If the draw completes, re-bucket (usually to a Good hand)."]],"Mostly value, but one draw is out. A slightly bigger bet charges it without scaring off worse hands."),
    nvv:N("Bet","bet","75–100% pot","Value + protection bet (c-bet)",[["If check-raised","Re-raise or jam. Don’t flat: most turn cards are scare cards."],["Next streets","Keep betting 75%+ on blank turns. Slow down only if the draw completes."]],"You are ahead now. Make every draw pay to see the next card."),
    gsv:N("Bet","bet","33–50% pot","Thin value bet (c-bet)",[["If check-raised","Bluff catch once on dry boards. Fold to a big turn bet from a passive player."],["Next streets","Aim for two streets of value: bet a blank turn 50–66%, or check back one street for pot control."]],"Worse pairs and weak draws call small bets. You get value without bloating the pot."),
    gvv:N("Bet","bet","66–75% pot","Protection bet (c-bet)",[["If check-raised","Fold weak top pair. Continue with overpairs or pair + draw."],["Next streets","Protection bet 66% on blank turns. Check back when the draw arrives."]],"Free cards hurt this hand most. Charge the draws or take the pot now."),
    bad:B([S("Strong draw (12+ outs)","Bet","bet","66–75% pot","Semi-bluff c-bet","Jam if check-raised."),S("Flush draw / open-ender","Bet","bet","50–66% pot","Semi-bluff c-bet or free card","Bet on boards that favor your range; otherwise check back for a free card."),S("Weak showdown","Check","check","","Pot control","Second or third pair, underpairs. Keep the pot small and get to showdown."),S("Air","Bet","bet","33% pot","Bluff c-bet, or give up","Heads-up on dry A, K or Q-high boards only. Give up on wet, low or multiway boards.")],"Bluff where your preflop range hits harder than theirs.")
   },
   oop:{
    nnv:N("Bet","bet","33–50% pot","Value bet (c-bet)",[["If raised","Re-raise about 3×, or jam if your stack is under 3× the pot."],["Vs a maniac","Check-raise for value (3×) instead. They will bet for you."],["Next streets","Value bet the turn 66–75% and the river 75–100%."]],"Passive players won’t bet when you check. Bet to grow the pot."),
    nsv:N("Bet","bet","50–66% pot","Value bet, light protection (c-bet)",[["If raised","Re-raise about 3×, or jam."],["Next streets","Barrel blank turns 66–75%."]],"Passive players won’t bet for you, and the one draw shouldn’t see a free card."),
    nvv:N("Bet","bet","75–100% pot","Value + protection bet (c-bet)",[["If raised","Re-raise or jam."],["Next streets","Barrel blank turns 75%+."]],"Checking gives every draw a free card. Deny it."),
    gsv:N("Bet","bet","33–50% pot","Thin value bet (c-bet)",[["If raised","Bluff catch against aggressive players on dry boards; fold against nits."],["Next streets","Thin value bet a blank turn 50–66%, or check-call for pot control."]],"Get value from worse pairs while keeping the pot manageable out of position."),
    gvv:N("Bet","bet","50–66% pot","Protection bet (c-bet)",[["If raised","Fold weak top pair. Call with overpairs or pair + draw."],["Multiway","Check-call (pot control) instead of betting."],["Next streets","Protection bet blank turns; check-call when the draw completes."]],"You need protection, but out of position you can’t build a huge pot with one pair."),
    bad:B([S("Strong draw (12+ outs)","Bet","bet","50–66% pot","Semi-bluff c-bet","Jam over a raise."),S("Flush draw / open-ender","Check-call","call","bets ≤ 50%","Drawing with odds","Fold to bigger bets."),S("Weak showdown","Check-call","call","one bet ≤ 50%","Bluff catch","Fold to big bets."),S("Air","Bet","bet","33% pot","Bluff c-bet, or give up","Heads-up on dry A or K-high boards only. Otherwise check-fold.")],"Out of position, give up more often. Bluff only on boards that clearly favor you.")
   }
  },
  def:{
   ip:{
    nnv:N("Raise","bet","3× their bet","Raise for value",[["Very dry board","Slowplay: flat call against aggressive c-bettors, then raise the turn."],["If they check","Value bet 50%."],["If they re-raise","Jam."]],"The pool can’t fold top pair. Start building the pot now."),
    nsv:N("Raise","bet","3× their bet","Raise for value",[["If they check","Value bet 50–66%."],["If they re-raise","Jam."]],"Don’t slowplay this one: a free turn could be the card that beats you."),
    nvv:N("Raise","bet","3.5× their bet or jam","Value + protection raise",[["If they check","Value + protection bet 66–75%."],["If they re-raise","Jam."]],"Charge the draws and protect against bad turn cards."),
    gsv:N("Call","call","any size","Bluff catch / pot control",[["If they check","Thin value bet 50%."],["Next streets","Call again on blank turns. Raise only small bets from aggressive players."]],"Keep their bluffs in and the pot under control."),
    gvv:N("Call","call","bets ≤ 75%","Bluff catch",[["Vs a 33% bet on a very wet board","Raise 3× as a protection raise."],["If they check","Protection bet 66%. Don’t give a free card."],["Next streets","Fold to a big turn bet when the draw completes."]],"You’re ahead now, but you don’t want a big pot with a hand that many cards beat."),
    bad:B([S("Strong draw (12+ outs)","Call or raise","mix","raise to 3×","Semi-bluff raise","Raise against players who fold; otherwise call. Jam if re-raised."),S("Flush draw / open-ender","Call","call","bets ≤ 66%","Drawing with odds","Fold a gutshot to bets over 50%."),S("Weak showdown","Call","call","one bet ≤ 33%","Bluff catch","Fold to bigger sizes."),S("Air","Fold","fold","","Give up (stab or float)","If they check, stab 50%. Float a 33% bet only against players who c-bet everything.")],"Position lets you realize draws cheaply. Don’t pay to see cards with nothing.")
   },
   oop:{
    nnv:N("Check-raise","bet","3× their bet","Check-raise for value",[["Very dry board","Slowplay: check-call, then check-raise or lead the turn."],["If they check back","Lead the turn 50–66% for value."],["If they re-raise","Jam."]],"The preflop raiser c-bets a lot. Let them bet, then raise."),
    nsv:N("Check-raise","bet","3× their bet","Check-raise for value",[["If they check back","Lead the turn 66% on blanks."],["If they re-raise","Jam."]],"Let the raiser c-bet, then raise. Just calling lets the draw see the turn cheaply."),
    nvv:N("Check-raise","bet","3.5× their bet or jam","Value + protection check-raise",[["If they check back","Lead the turn 75%."],["If they re-raise","Jam."]],"Get the money in before a bad turn card arrives."),
    gsv:N("Check-call","call","any size","Bluff catch",[["If they check back","Probe bet the turn 50–66% for thin value."],["Next streets","Check-call blank turns. Against nits, fold to the third barrel."]],"A raise folds out worse hands and only gets called by better ones."),
    gvv:N("Check-call","call","bets ≤ 66%","Bluff catch",[["Vs a 33% bet on a very wet board","Check-raise 3× for protection."],["If they check back","Probe bet a blank turn 66% for protection."],["Next streets","Fold to big turn bets when the draw completes."]],"Call once and re-evaluate on the turn."),
    bad:B([S("Strong draw (12+ outs)","Check-raise","bet","3× their bet","Semi-bluff check-raise","Jam over a re-raise."),S("Flush draw / open-ender","Check-call","call","bets ≤ 66%","Drawing with odds","Fold a gutshot to bets over 33%."),S("Weak showdown","Check-call","call","one bet ≤ 33%","Bluff catch","Fold to bigger sizes."),S("Air","Check-fold","fold","","Give up","")],"You miss most flops from the blinds. Fold air and continue with real equity.")
   }
  }
 },
 turn:{
  agg:{
   ip:{
    nnv:N("Bet","bet","66–75% pot","Value bet (barrel)",[["If check-raised","Jam."],["River","Value bet 75–100%. Overbet 125% when they’ve checked twice."]],"A bigger turn bet sets up an all-in on the river."),
    nsv:N("Bet","bet","66–75% pot","Value bet (barrel)",[["If the draw completed","Re-bucket: usually Good · very vulnerable now. Check back or bet small."],["If check-raised","Jam."]],"One card left and only one draw. Bet big enough to set up a river jam."),
    nvv:N("Bet","bet","75–100% pot","Value + protection bet (barrel)",[["If the draw completed","Re-bucket. If you’re no longer the nuts, play it as a Good hand."],["If check-raised","Jam."]],"One card to come. Draws should pay the maximum."),
    gsv:N("Bet","bet","50–66% pot","Thin value bet (barrel)",[["Scary turn card","Check back for pot control."],["If check-raised","Fold most one-pair hands. Turn check-raises at low stakes are value."],["River","Thin value bet 50% if they check again."]],"Second street of value from worse pairs."),
    gvv:N("Bet blanks","bet","66–75% pot","Protection bet",[["If the draw completed","Check back for pot control and take a showdown."],["If check-raised","Fold."]],"Protect on blank cards; control the pot when the board gets worse."),
    bad:B([S("Strong draw (12+ outs)","Bet","bet","66–75% pot","Semi-bluff barrel","Jam over a check-raise."),S("Flush draw / open-ender","Check","check","","Free card","Take the free river card unless the turn is a great card to bluff."),S("Weak showdown","Check","check","","Pot control","Get to showdown cheaply."),S("Air","Bet or give up","mix","66% pot","Bluff barrel, or give up","Barrel only on A, K or Q turns, or cards that complete obvious draws. Otherwise check and give up.")],"A second barrel needs a reason: a good card for your range, or real equity.")
   },
   oop:{
    nnv:N("Bet","bet","66–75% pot","Value bet (barrel)",[["If raised","Jam."],["River","Value bet 75–100%."]],"Passive players check back turns. Bet so you don’t lose a street of value."),
    nsv:N("Bet","bet","66–75% pot","Value bet (barrel)",[["If raised","Jam."],["If the draw completed","Re-bucket and check-call."]],"Keep building the pot. Passive players check back turns."),
    nvv:N("Bet","bet","75–100% pot","Value + protection bet (barrel)",[["If raised","Jam."],["If the draw completed","Re-bucket and check-call."]],"Make the last card expensive."),
    gsv:N("Bet","bet","50–66% pot","Thin value bet (barrel)",[["Scary turn card","Check-call (bluff catch)."],["If raised","Fold one pair against passive players."]],"Value from worse pairs and draws that still call."),
    gvv:N("Bet blanks","bet","66% pot","Protection bet",[["If the draw completed","Bluff catch: check-call bets up to 50%, fold to 75% or more."],["If raised","Fold."]],"Protect on blanks; switch to bluff catching when the board gets worse."),
    bad:B([S("Strong draw (12+ outs)","Bet","bet","66% pot","Semi-bluff barrel","Jam over a raise."),S("Flush draw / open-ender","Check-call","call","bets ≤ 33–50%","Drawing with odds","Only at the right price. See Outs in Buckets & rules."),S("Weak showdown","Check-call","call","one bet ≤ 33%","Bluff catch","Fold to bigger sizes."),S("Air","Check-fold","fold","","Give up","Bluff barrel 66% only on an A or K turn, heads-up.")],"Out of position, give up air on the turn unless the card clearly helps you.")
   }
  },
  def:{
   ip:{
    nnv:N("Raise","bet","2.5–3× their bet","Raise for value",[["If they check","Value bet 66–75%."],["If they jam","Call."]],"The turn is where the pot gets big enough to win a stack."),
    nsv:N("Raise","bet","2.5–3× their bet","Raise for value",[["If they check","Value bet 66–75%."],["If they jam","Call."]],"Get the money in while the one draw is still only a draw."),
    nvv:N("Raise","bet","3× or jam","Value + protection raise",[["If they check","Value + protection bet 75–100%."],["Short stacks","Jam if your stack is under 2× the pot."]],"Don’t let draws see the river cheaply."),
    gsv:N("Call","call","bets ≤ 75%","Bluff catch",[["If they check","Thin value bet 50–66%."],["River","Call bets up to 66%. Fold to overbets from passive players."]],"You beat their bluffs and thin value. Don’t turn your hand into a bluff by raising."),
    gvv:N("Call on blanks","call","bets ≤ 66%","Bluff catch",[["Draw completed + big bet","Fold."],["If they check","Protection bet 50–66%."]],"Many turn cards change who is ahead. Re-check the board before calling."),
    bad:B([S("Strong draw (12+ outs)","Call","call","","Drawing with odds","Semi-bluff raise only against aggressive players who fold."),S("Flush draw / open-ender","Call with odds","call","bets ≤ 33–50%","Drawing with odds","9 outs is about 20% to hit. Fold to bigger bets unless they pay you off when you hit."),S("Weak showdown","Fold","fold","","Give up","Bluff catch 33% only against aggressive players."),S("Air","Fold","fold","","Give up (stab if checked)","If they check, stab 50%.")],"Count outs before calling. The turn is where draws lose the most money.")
   },
   oop:{
    nnv:N("Check-raise","bet","3× their bet","Check-raise for value",[["Vs a passive player","Lead 66–75% for value. They may check back."],["If they checked back the flop","Probe bet 66–75% for value."]],"A non-vulnerable hand can risk a free card to win a bigger pot."),
    nsv:N("Check-raise","bet","3× their bet","Check-raise for value",[["Vs a passive player","Lead 66–75% for value. Don’t risk a free river card."],["If they checked back the flop","Probe bet 66–75% for value."]],"Usually safe to check-raise, but lead against players who might check back."),
    nvv:N("Lead","bet","75% pot","Lead for value + protection",[["Vs an aggressive barreler","Check-raise 3× or jam."],["If raised","Jam."]],"Don’t risk a free card against a passive player."),
    gsv:N("Check-call","call","bets ≤ 75%","Bluff catch",[["If they checked back the flop","Probe bet 50–66% for thin value."],["River","Check-call small bets; fold to big bets from nits."]],"Let them bluff into you. Raising only gets called by better."),
    gvv:N("Check-call blanks","call","bets ≤ 66%","Bluff catch",[["Draw completed + big bet","Fold."],["If they checked back the flop","Probe bet 50–66% on blanks for protection."]],"Bluff catch on safe cards; get out on bad ones."),
    bad:B([S("Strong draw (12+ outs)","Check-raise or call","mix","raise to 3×","Semi-bluff check-raise","Check-raise against players who fold; otherwise call (drawing with odds)."),S("Flush draw / open-ender","Check-call with odds","call","bets ≤ 33–50%","Drawing with odds","Fold to bigger bets."),S("Weak showdown","Check-fold","fold","","Give up","Bluff catch 33% only against aggressive players."),S("Air","Check-fold","fold","","Give up","")],"Out of position with a weak hand, keep the pot small or let it go.")
   }
  }
 },
 river:{
  agg:{
   ip:{
    nnv:N("Bet","bet","75–100% pot","Value bet (overbet if capped)",[["Villain checked twice","Overbet 125–150%. They’re capped."],["If check-raised","Call or jam with the nuts."]],"Low-stakes players pay off big river bets. Size up."),
    nsv:N("Bet if still best","bet","75–100% pot","Value bet",[["River completed the draw","Re-bucket: thin value bet 33–50% or check back."],["If check-raised","Call only with near-nuts."]],"No more cards come. Most rivers miss the one draw, so you’re still near the top: bet big."),
    nvv:N("Bet if still best","bet","75–100% pot","Value bet",[["River completed the draw","Re-bucket: thin value bet 33–50% or check back."],["If check-raised","Call only with near-nuts."]],"No more cards come, so protection no longer matters. The only question is whether you’re still best."),
    gsv:N("Bet","bet","50–66% pot","Thin value bet",[["Scary river","Check back for pot control."],["If check-raised","Fold. River raises at low stakes are almost never bluffs."]],"Name the worse hands that call before you bet."),
    gvv:N("Bet small or check","mix","33–50% pot","Thin value bet or pot control",[["Draws missed","Thin value bet 33–50%."],["Draws completed","Check back."],["If check-raised","Fold."]],"Small bets get called by worse pairs. Big bets only get called by better."),
    bad:B([S("Missed draw","Check","check","","Give up (bluff only vs folders)","Bluff 66–75% only against players who fold. Most low-stakes players call too much, so default to giving up."),S("Weak showdown","Check","check","","Pot control (showdown value)","You win some showdowns. A bet only gets called by better."),S("Air","Check","check","","Give up","Bluff 75% only against nits on a scare card.")],"Bluffing calling stations on the river is the biggest leak at low stakes.")
   },
   oop:{
    nnv:N("Bet","bet","75–100% pot","Value bet",[["Vs a maniac","Check-raise for value or check-jam."],["If raised","Jam with the nuts."]],"Passive players check back rivers. Bet to get paid."),
    nsv:N("Bet if still best","bet","75–100% pot","Value bet",[["River hurt you","Bluff catch: check-call bets up to 50%, fold to big bets."]],"Re-bucket first. Most rivers miss the one draw, so bet big."),
    nvv:N("Bet if still best","bet","75–100% pot","Value bet",[["River hurt you","Bluff catch: check-call bets up to 50%, fold to big bets."]],"Re-bucket first, then bet big or switch to bluff catching."),
    gsv:N("Bet","bet","33–50% pot","Thin value bet",[["If raised","Fold."],["Vs an aggressive player","Check-call to bluff catch."]],"Thin value against players who won’t bet when you check."),
    gvv:N("Check-call","call","bets ≤ 50%","Bluff catch",[["Big bet on a scary river","Fold."],["Draws missed","Thin value bet 33%."]],"Catch small bluffs; don’t pay off big bets."),
    bad:B([S("Missed draw","Check-fold","fold","","Give up","Bluff 66–75% only against nits on a scare card."),S("Weak showdown","Check-call","call","one bet ≤ 33%","Bluff catch","Fold to bigger sizes."),S("Air","Check-fold","fold","","Give up","")],"Give up most river bluffs out of position.")
   }
  },
  def:{
   ip:{
    nnv:N("Raise","bet","2.5–3× or jam","Raise for value",[["If they check","Value bet 75–100%. Overbet when they’re capped."]],"Raises on the river get paid by top pair and two pair at low stakes."),
    nsv:N("Raise if still best","bet","2.5–3× their bet","Raise for value",[["River completed the draw","Bluff catch: call, don’t raise."],["If they check","Value bet 75–100%."]],"Re-bucket on the river before raising."),
    nvv:N("Raise if still best","bet","2.5–3× their bet","Raise for value",[["River completed the draw","Bluff catch: call, don’t raise."],["If they check","Value bet 66–75% if still best."]],"Re-bucket on the river before raising."),
    gsv:N("Call","call","bets ≤ 75%","Bluff catch",[["Overbet or jam from a passive player","Fold."],["If they check","Thin value bet 50%."]],"Low-stakes players under-bluff big river bets."),
    gvv:N("Call small","call","bets ≤ 50%","Bluff catch",[["Big bet on a scary river","Fold."],["If they check","Thin value bet 33% if draws missed; otherwise check back."]],"You beat bluffs and little else."),
    bad:B([S("Missed draw","Fold","fold","","Give up (bluff if checked to)","If they check, bluff 66% only against players who fold."),S("Weak showdown","Fold","fold","","Give up","Bluff catch 33% only against known bluffers. If checked to, check back."),S("Air","Fold","fold","","Give up (stab if checked twice)","Stab 50% if they checked both turn and river.")],"When they check twice, they’re weak. When they bet, believe them.")
   },
   oop:{
    nnv:N("Lead","bet","75–100% pot","Lead for value",[["Vs an aggressive player","Check-raise for value 2.5–3×, or check-jam."]],"Passive players check back rivers. Lead to get paid."),
    nsv:N("Lead if still best","bet","75–100% pot","Lead for value",[["Vs an aggressive player","Check-raise 2.5–3× for value."],["River hurt you","Bluff catch: check-call bets up to 50%."]],"Passive players check back rivers. Lead to get paid."),
    nvv:N("Lead if still best","bet","75–100% pot","Lead for value",[["River hurt you","Bluff catch: check-call bets up to 50%, fold to big bets."]],"Bet while you’re still ahead; slow down if the river changed that."),
    gsv:N("Check-call","call","bets ≤ 75%","Bluff catch",[["If they checked back the turn","Lead 33–50% as a thin value bet."],["Overbet from a passive player","Fold."]],"Let them bluff. Raising only gets called by better."),
    gvv:N("Check-call small","call","bets ≤ 50%","Bluff catch",[["Big bet on a scary river","Fold."]],"Bluff catch cheaply or not at all."),
    bad:B([S("Missed draw","Check-fold","fold","","Give up","Lead 66% as a bluff only on scare cards against players who fold."),S("Weak showdown","Check-call","call","one bet ≤ 33%","Bluff catch","Fold to bigger sizes."),S("Air","Check-fold","fold","","Give up","")],"Out of position on the river with a weak hand: check and let it go.")
   }
  }
 }
};

/* ---------- rules ---------- */
var ADJUST = [
  ["3-bet pots","Shrink sizes: flop 25–33% on dry boards, 50% on wet. The stack is only about 4× the pot, so Good · slightly vulnerable and better are happy to get all-in."],
  ["Multiway (3+ players)","Bet only Good · very vulnerable or better, and size up to 66–75%. Almost no bluffs or semi-bluffs without a strong draw."],
  ["Full ring (8–11 players)","Early-seat ranges are much tighter and more pots go multiway. Give early opens more credit, bluff less after the flop, and use the multiway rule whenever 3+ players see the flop."],
  ["Short-handed (5 players)","Everyone opens wider. Defend and 3-bet a bit more, and c-bet more often heads-up."],
  ["Low stack-to-pot (under 3)","Overpairs and top pair, top kicker are committed. Value bet and jam instead of pot control."],
  ["Vs calling stations","Value bet bigger and thinner. Never bluff the river."],
  ["Vs nits","Fold one pair to their raises. Stab more when they check twice."],
  ["Big turn and river raises","At low stakes they mean two pair or better. Fold one pair unless the player has shown bluffs."]
];
var ODDS = [
  ["25% pot","16.7%","20%","Range bets on dry boards, 3-bet pots"],
  ["33% pot","20%","25%","Thin value bets, dry-board c-bets"],
  ["50% pot","25%","33%","Value bets, semi-bluffs"],
  ["66% pot","28.4%","40%","Protection bets on wet boards"],
  ["75% pot","30%","43%","Value + protection bets, strong semi-bluffs"],
  ["100% pot","33.3%","50%","River value bets with strong hands"],
  ["150% pot","37.5%","60%","River overbets when villain is capped"]
];
var OUTS = [
  ["Combo draw (flush + straight)","15","32%","54%"],
  ["Flush draw","9","19%","35%"],
  ["Open-ended straight draw","8","17%","31%"],
  ["Gutshot","4","9%","16%"],
  ["Two overcards","6","13%","24%"]
];

var api = { TIERS: TIERS, PRE: PRE, SIZES: SIZES, SIZE_NOTES: SIZE_NOTES, BUCKETS: BUCKETS, TERMS: TERMS, CTX: CTX, STREETNOTE: STREETNOTE, T: T, ADJUST: ADJUST, ODDS: ODDS, OUTS: OUTS };
root.PB = Object.assign(root.PB || {}, api);
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
