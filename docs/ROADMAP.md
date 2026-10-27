# Roadmap

The queue of work beyond the game as it stands. `docs/design/` describes
only what is built; everything designed but not built lives here. When an
item is taken, its rulings go into `02a-tuning.md` first, its description
moves into the design doc it belongs to, and it leaves this file.

The direction was set in the 2026-10-25 ideation round (a9, Claude, and an
independent read from Codex). The 2026-10-27 review (Claude, with two
independent reads from Codex) reordered the queue around how the game plays
for an evening, and a9 ratified it the same day, with the rulings listed
under "Rulings (2026-10-27)". Sections 1–8 are the main line, in order; the
sections after them are the backlog, grouped by subject.

How a round runs:

1. Ratify the design into 02a.
2. Implement. Implementers flag interpretation calls rather than
   improvise.
3. Run the ten harnesses at default N.
4. Get an independent Codex review of the round before committing.

Player-facing prose and the score are authored, and a9 ratifies them.

## Where this is going

**The north star.** Shoals is a game where your beliefs are measured, your
commitments have consequences, and your instruments of judgment are
slowly taken over by the thing you are judging. At the end, the last
edition can say honestly what you knew, what you did, and what changed
because of it.

a9's framing: the player gets data and owns the synthesis. The game supplies
evidence and measures what was knowable; it never draws the conclusion. And
the player is part of the world, not an external agent. They are as
exposed to the numbers moving as everyone around them.

The three pillars become three verbs, plus a closing honesty:

- **Know** (pillar 1). Read a filtered public record and form a timeline
  you can be scored on. The edge over the market is real, learnable and
  measured. What you say and what your book bets can be set side by side
  (section 4).
- **Commit** (pillar 2). Spend the edge: trade on it, circulate it,
  publish it, or bind capital to conditions. Commitments are hard to back
  out of (sections 1 and 2).
- **Lose your grip** (pillar 3). First your hands go: orders lag, and
  standing orders take over. Then your judgment goes: the reader you
  license outforecasts you, the paper's own editor is ghostwritten, and
  your pricing models stop describing the market (section 6).
- **The accounting.** The model's counterfactual, labelled as one: the world
  without you, and the worlds that looked like yours (section 5).

The core loop under all four, in Codex's words from the 2026-10-27 review:
**form a view, accept exposure, revise under consequence.** The forecast
score is one receipt for that loop, not the loop itself. Every round on the
main line answers to a player-facing test as well as its harness gates:
after one quarter, can a player name the evidence they used, the exposure
they chose, and what remains unresolved? The sentence the next releases
should make possible, also Codex's: "I kept that position because of that
report; when the correction came, I could still save the money, but only by
abandoning what I had promised."

### Embedded agency

The player's position is the one Demski and Garrabrant's *Embedded Agency*
(2018) describes: an agent that is part of the world it reasons about, with
no Cartesian boundary between them. The sequence's four subproblems each
map to systems Shoals has or is building. The mapping is a design lens, not
a citation of results.

- **Embedded world-models.** The player is smaller than the world and
  inside it. They read a filtered public record. Their own fills are in the
  tape (the impact overlay), their leaks change the record they read, and
  their credibility becomes part of what the market believes. A public call
  moves the market they are forecasting, and with enough credibility makes
  minor events come true (section 2). The reader is the formal version of
  what a bounded observer can know.
- **Decision theory.** "What if I hadn't?" can't be observed, only
  modelled. The last edition runs the model's counterfactual and labels it
  as the model's (section 5).
- **Robust delegation.** Forecast policies, standing orders, mandates and
  the licensed reader hand your agency to successors. They act when you
  can't, on values you specified earlier and imperfectly (sections 1, 2
  and 6).
- **Subsystem alignment.** The parts of your own agency are not wholly
  yours. Meridian has its own belief and incentives (`F`, the committee).
  The licensed reader is Halcyon's model. Sources have interests of their
  own. Even your book bets differently from your forecast (sections 2, 4
  and 6).

There is no position outside the outcome. A doom short never settles, the
book is the player's standing and job, and the epilogue prices the book in
the world that resolved.

### Commitments from the 2026-10-25 round

- **Data given, synthesis owned.** Instruments show evidence and numbers,
  never verdicts. The licensed reader is one more source to weigh.
- **Close worlds can turn.** For a fixed terminal decomposition, the
  bounded-influence clip cannot change the sign of `dW`: the player's
  clipped term can carry a world across the failure line but never across
  the holds line. Trajectory effects on leadership aside, it also shrinks
  the player's leverage to zero exactly where the knife-edge principle
  promises that play decides. It goes (section 2).
- **The public edge is big enough to act on and closes decisively.** It
  is large enough that a player who reads well can move things. It closes
  soon after the legible event that reveals it, so a position taken on it
  cannot be unwound at the old price. Mandates and stakes carry exit costs.
  Decisions stick.
- **The licensed reader is in** (section 6). Its displayed forecast
  carries no τ-keyed tilt (a9, 2026-10-27).
- **A disclosure the player chooses may move `B`.** This reopens the
  ruling that the ledger's `B` channel is closed, for dissemination only
  (section 2).

### Measured in the reader round (2026-10-25)

The reader and `B`'s rebuild are built. Their rulings are in 02a ("The
reader", "Belief, η, and the firm", "The valuation layer"). What the
measurements say about the direction:

- **A calibrated market leaves a small public edge.** The 2.8 nats per
  run the ideation probe found came mostly from the old heuristic `B`'s
  own miscalibration. A headline-only reader, calibrated, is nearly as
  good as one that reads the whole record (0.004 nats per rung-quarter
  apart): today's quiet record carries little timing information.
- **The edge is the market's crude reading of the headlines.** That was
  a9's ruling. The rule of thumb is calibrated only by day and claim
  state, so nothing static beats it. A reader-copier then earns about
  0.8 nats per run against `B` (validation worlds): 0.70 in Act I, 0.19 in
  Act II and nothing in Act III. The edge closes once a rung is claimed.
  `K_CRED` is 1.35.
- **Luck still opens gates for a few.** A static early caller has a
  negative mean, but its heavy right tail clears the memo gate in about 5%
  of worlds. A significance condition on the gates was tried and dropped.
  It penalized the bold, skilled reader more than the lucky caller.
- **Domains are where the designed quiet signal comes from.** The
  demonstration channel should widen the edge on information, not on the
  market's error. Its round measures that.
- **Late determination.** The reader's family head stays under the
  knife-edge ceilings: it beats the prior's Brier by 16.7% at day 350 and
  28.4% at day 700, against 25% and 60%. But at about 29% of act
  boundaries it gives one family more than 0.60, against principle 1's
  target of none. It is a diagnostic, and a question for the knife-edge's
  next retune.

### What the 2026-10-27 review found

The review read the roadmap against the game as built after the reader
round and the 2026-10-26 visual round. Claims marked *checked* were
verified in code. Codex's second read narrowed several of Claude's
proposals; the sections below carry its caveats.

- **One run's forecast record is mostly noise.** The reader-copier's mean
  `S_P` is 0.80 nats a run, and σ₀, the luck spread of one record under
  the market's own law, averages 1.47. Within a run the forecast should
  therefore cost little attention; skill shows, if at all, across runs.
  How many runs it takes is an empirical question: σ₀ sums marginal
  variances without cross-rung covariance (*checked*), so it is not the
  spread of whole-run scores.
- **The forecast costs the most attention, and arrives first.** Sixteen
  of a run's 48 dispatches were forecast locks in a9's 2026-10-25 play.
  The day-0 lock is queued at boot (*checked*), so a new player is asked
  for a timeline about unfamiliar rungs before reading a single edition:
  an assessment before a hypothesis.
- **Agency arrives at the end of an evening.** At the default speed of
  half a day a second, day 1008 is 33.6 minutes of uninterrupted
  simulation (*checked*). 02a's calibration target has the ideal
  reader-copier clearing the memo gate by day 882, about 29 minutes in.
  There is no save (*checked*), so an interrupted evening loses the run.
- **The book holds a bet, and nothing reads it.** 00's one line, "the
  money is how you find out what you actually believe", has no mechanic.
  The forecast editor asks what you believe; the book bets something;
  nothing sets them side by side.
- **The roadmap widened before it deepened.** Its first section added
  domains (curves per domain, a grid, per-domain contracts, a refit)
  ahead of the decision chain that its second section said must come
  before widening the simulation.
- **Several specified gates need whole runs that can't be played
  headless.** Interruption metrics, matched-policy runs, policy effects
  across held-out seeds and journal replay all play whole runs under a
  scripted player. `main.js` is the orchestrator and is DOM-coupled; the
  harnesses rebuild its pieces instead (`tools/endings-test.mjs` says so,
  *checked*).
- **Early releases cluster on a learnable calendar.** Releases are
  phase-locked across worlds in Act I (section 10), which a returning
  player can learn. That is a replay problem as well as the reader's.
- **The back half drifted into clearing machinery** whose payoff a player
  wouldn't feel in a short act. Most of it moves to the backlog (section
  12), taken when a feature needs it.
- **Two corrections.** The wire kept twenty log entries against the
  forty the Brief asked for (`MAX_EVENT_LOG`, *checked*); it now keeps
  forty under the lead. The firm's verdict is not inert: it is one of the
  room's six seat criteria and makes the personal overlay gray eminence
  (*checked*). What's missing is any change to how the desk operates,
  which its prose promises.

### Rulings (2026-10-27)

a9 ratified the review's recommendations:

1. **The order.** The evening first (section 1), then one chain end to end
   (2) with the run made headless alongside it (3), then what the book
   bets (4), the accounting (5), delegation in Act III (6), widening (7),
   and sharing (8).
2. **The opening hand is in.** Each Dynamic run starts on an inherited
   desk with a dated obligation instead of cash and a lock dispatch
   (section 1).
3. **The book beside the forecast,** as narrowed: an exposure comparison
   first; a Kelly-equivalent reading and "follow my book" as a forecast
   policy only once a valuation contract holds (section 4).
4. **No τ tilt** in the licensed reader's displayed forecast (section 6).
5. **Public calls hyperstition minor events.** A call on MarketWire moves
   `B` by the caller's credibility, and with enough credibility can make
   certain minor events come true. Rung crossings, certifications,
   settlements, incidents and the terminal families stay out of a call's
   reach (section 2).
6. **Domains wait.** The chain's demonstration enters as evidence about
   the existing rung contracts; the domain grid and per-domain curves wait
   until players want the distinction (sections 2 and 7).
7. **The clearing machinery moves to the backlog** (section 12), except
   halt settlement, which ships with halts (section 6).
8. **The epilogue's share row goes now**, ahead of the accounting that
   replaces it (section 5).

## 1. The evening: an opening hand, the forecast held lightly

The first thirty minutes ask for confidence before giving a reason to
care. This section gives the opening something to hold and takes the
interruptions out of the forecast. It is mostly authoring and wiring, with
no refit.

### The forecast as a standing policy

The quarterly lock becomes a standing policy the player sets: carry my
curves or follow the market, plus follow the reader once section 6 licenses
it, and follow my book once section 4 can read one. At each quarter's
opening the policy is snapshotted without a modal, as `scoreQuarter`
expects today. That immutable snapshot is scored at the quarter's close,
and revisions during the quarter affect only later snapshots.

- **Day 0 opens without a dispatch.** The policy starts as "follow the
  market", which scores exactly zero, and the draft starts on the market's
  curves. Drawing away from them is the player's first forecast.
- **A quarter's close is one line in the Brief**, the score against
  Consensus, not a notification.
- The dispatch returns only when the player asks to revise or an authored
  decision needs them.
- **Gates:** automatic locks match their declared policy exactly; a
  snapshot is taken at the quarter's opening, and no forecast uses
  information from after it.

### The opening hand: an inherited desk

Codex's proposal. Instead of cash and a timeline to declare, the player
takes over a small existing book. Vasquez brought them in (`lore.md`), and
the book belonged to a portfolio manager who has left. The desk opens on a
living frame: positions already marked, a working order, an approaching
option expiry, a dated cash obligation, and two of the predecessor's
archived reports that supported the book. The predecessor's memo states
their thesis. It is authored and fallible.

The player can liquidate, hedge, keep or replace it. Nothing recommends
one. The first question is concrete: what do I believe enough to keep?

- **Fixtures, not a takeover system.** Three to five authored starting
  books, drawn per run from their own named stream. They give returning
  players different problems:
  - a profitable HCN position with a cash payment due before the
    anticipated catalyst;
  - a defensive book whose insurance is expiring;
  - a large position in an illiquid instrument with little free
    collateral.
- **Liabilities with dates.** A publicly specified, mundane obligation
  (an investor redemption, a financing maturity) that must be met in cash
  by its day, with a stated consequence for missing it: a forced
  liquidation at the ladder's cost and a firm-standing loss. Being right
  about next year doesn't meet next month's obligation, which is the
  timeline trade's oldest lesson. Obligations never touch the hidden race.
  In Act III they are the affirmative objective that makes losing your
  hands cost something specific (section 6).
- **Evaluation starts at the takeover.** P&L, the comparison with holding
  HCN, and the ledger all measure from the takeover marks, never from the
  predecessor's entries.
- **`B`'s day-0 quote is the same in every world**, so a fixture's memo
  can name a timeline and stay true to the market it was written against.
- The predecessor's memo and book are the first stated thesis and the
  first bet the player can compare (section 4), and they are someone
  else's.
- **Open question for the round:** whether Classic mode starts on a book
  too.

### Pacing and the player's hands

- **To the next edition worth reading.** A control that plays at top
  speed until something the player would read: a dispatch, an extra, an
  obligation coming due, a fill, a news day that moves the book past a
  threshold. Quiet weeks pass quickly without a setting.
- **A flatten control.** `liquidateAll` has no player entry point. A
  flatten takes the latency ladder like any manual order.
- **Save and resume** come from section 3: a run is its seed and its
  journal.

### Across evenings: a minimal almanac

The run's record is mostly noise; a career's may not be. The almanac is
local to the browser, written by the last edition: each run's world (seed,
family, the sampled variables) and its scored record, beside the
reader-copier's on the same world, recorded at each lock.

- Across runs it shows the cumulative score, a reliability diagram of the
  player's quarter probabilities, and the families they have seen against
  the game's target distribution. Section 4 adds the book's record.
- Learning to read the record is how a player gets better, and the
  almanac is where that shows. How many runs a skilled record needs to
  stand clear of luck is measured on whole-run distributions (section 3),
  not read off σ₀.
- Storage follows the root's rules: wrapped in try/catch, and the game
  works without it.

### Interruptions, counted in live play

Dispatches by cause, repeated choices, and actionable developments
between decisions can be counted in live play now, without waiting for
section 3's headless runs: a development-only counter in `main.js`, read
in a9's play-tests. It is the measure the political pool's trim waits on.

## 2. One chain, end to end

The 2026-10-25 round adopted Codex's proposal to build one complete
decision chain before widening the simulation. The 2026-10-27 review keeps
that spine and makes the first chain smaller: one instance, end to end,
before four general systems. Evidence, dissemination, mandates and
Meridian are the lifecycle of one decision: what supported it, who received
it, what became binding, and who now holds you responsible.

The chain:

1. **A demonstration.** A lab publishes what its *unreleased* model did:
   a third disclosure mode beside release and leak. In lore it arrives as
   the Fixedpoint catalogue, and the codename's first public meaning is
   seven hundred papers. Mathematics certifies fast and loud. The
   demonstration is evidence about the existing rung contracts (which read
   as AI research), never their settlement. It carries a correlated
   withdrawal risk: one flawed lemma retracts its dependents. Labs facing
   a funding deadline demonstrate more.
2. **A disputed inference.** A scope dispute, the first dispute class an
   event opens: the work solved a narrower problem than claimed, or the
   checker proves a narrower statement. The dispute lifecycle exists and
   is harness-exercised already.
3. **A forecast and a position**, through the posterior and the ticket.
4. **A conditional financing commitment.** Anchor Polaris's next round if
   an independent evaluation happens first.
5. **A disclosure decision** over the evidence the player holds.
6. **The firm's response**, and **an ending that accounts for each step.**

The chain should admit several defensible policies, and it should
sometimes punish a good decision through bad luck.

- **One refit, two measurements.** The demonstration changes the record,
  so the reader is refit in this round. The release jitter (section 10)
  takes the same refit. Measure them apart, by ablation: the
  demonstration's edge against the edge without it, and the jitter's
  effect on its own.

### Durable evidence

Today the Brief is a feed. The chain needs the reports it touches to
persist with identities: the claim and its subject, occurrence and
publication days where known, the source and related reports, correction
status, and the contracts the report bears on. Start with the chain's own
reports, not a general archive.

- A withdrawal links to the demonstration it retracts and that
  demonstration's dependents. A new incident links to an earlier
  assurance.
- "Since your last forecast" becomes possible.
- **Pinning:** the player can pin reports to a thesis and mark what would
  disconfirm it. Pins score nothing. They make reasoning inspectable, and
  the last edition sets them beside what the player committed at the time.
- Prose stays authored. Front-page priority uses public significance and
  authored metadata, never a headline the engine knows foreshadows a
  catastrophe.
- **Gates:**
  - archived editions never acquire later knowledge;
  - hidden-state corruption cannot alter public records;
  - private evidence cannot reach quotes before disclosure;
  - corrections preserve the original's publication history;
  - correlated reports keep their common source.

### Spending the edge

The recurring dilemma: how much of your advantage will you spend to make
other people act? It generalizes the insider tip's three verbs into a
choice about any evidence the player holds:

| Verb | What it does |
|---|---|
| Trade on it privately | keeps the edge |
| Circulate it inside Meridian | moves `F` and can earn a mandate, without moving `B` |
| Brief a partner | the Polaris board, Treasury once the backchannel is open |
| Publish through Tan | closes the market's gap, may move `B`, ends the trade, strains the source |
| Make a public call | your curve on MarketWire: moves `B` by your credibility, and is scored in public |

- Disclosures are records that reference evidence ids and recipients.
  They reach `belief.js`, the firm or the public only when delivered.
  Circulating the same evidence twice is not two independent updates.
- **Each verb has a cost:** a disclosure can destroy a trade, expose a
  source, or force the firm to own a position it would rather leave
  implicit.
- **Insider exposure is read from fills.** A regulator reads the book.
  "Trade it" on a tip costs exposure according to how the book moved in
  the window, not because the verb was clicked.
- **Gates:**
  - a private briefing never moves public quotes;
  - duplicates don't multiply evidence;
  - reactions respect source dependencies;
  - matched-policy runs (section 3) measure the exchange between return,
    access and race effects.

### The public call

The embedded-agency verb: the player's forecast enters the world it
forecasts. Sharma already quotes the odds on air (`lore.md`).

- **How it moves the market.** The call enters `B` directly, weighted by
  the caller's credibility frozen at the moment of the call. It does not
  also enter through the reader: V reads the reader's family heads, and a
  new record row teaches the fitted reader nothing, so routing it both
  ways would count it twice. Through the quotes and V it reprices the
  player's own book.
- **Hyperstition (a9, 2026-10-27).** With enough credibility, a call can
  make certain minor events come true: a fiction that makes itself real,
  the other half of 00's Landian thread. The class of events and the
  credibility threshold are the round's to set. Candidates, each public
  and each something whose timing plausibly follows belief:
  - a Polaris round pulled forward or upsized;
  - a lab's demonstration pulled forward (labs facing a funding window
    demonstrate more);
  - a Halcyon follow-on upsized;
  - Consensus listing a contract on the called milestone;
  - a Cambria allocation or capex announcement;
  - the Street's echo: Sharma's follow-up, a herd of analyst notes.
- **The bound.** Rung crossings, certifications, settlements, incidents
  and the terminal families stay out of a call's reach. A hyperstitioned
  event affects the race only through the channels that event already
  has (a Polaris round through the primary market, for example); the call
  adds no route of its own. Today nothing finances Halcyon because its
  valuation rose (`src/race/coupling.js` reads the player's own exposure
  and primary allocations), and the call doesn't change that.
- **Mechanics.** A call raises the hazard of, or pulls forward, events in
  the class, scaled by credibility above the threshold and decaying with
  time. The draws come from their own named stream, so runs without a call
  stay bit-identical.
- **The record and the receipt stay apart.** 02a already notes the score
  stops being proper when the player's forecasts change the process. The
  call and every event it hyperstitioned are ledgered as interventions;
  the forecast record scores the call only from credibility and
  benchmarks frozen before it.
- **Gates:**
  - buy, announce, then sell; repeated announcements; and credibility
    feeding back into itself are each tested;
  - a call below the threshold changes no event's hazard;
  - no call can move a rung, a settlement, an incident or a family;
  - a call traded against draws regulatory exposure the way a tip does
    (proposed).

### The financing commitment, and bounding the intervention

The chain's mandate is the first commitment built to be decisive near a
threshold, so the terminal clip goes in the same round.

- **The mandate** has an owner, a deadline, committed resources, release
  conditions and a consequence for withdrawal. Reservations flow through
  the portfolio; race effects flow through the existing chokepoints and
  the ledger. Releasing it early forfeits something real: standing, an
  allocation, a relationship.
- **Retire the terminal clip.** Today `dEff = dW + clip(dP, ±(3/7)·|dW|)`
  (`src/race/resolution.js`), which keeps `dW`'s sign for a fixed
  decomposition: the clipped term can never carry a world across the
  holds line, and the clip shrinks the player's leverage to zero at the
  knife-edge. (`dW` is an algebraic residual, `d − d_P`, not a replayed
  no-player world, and the player's channels can still change trajectories
  and leadership.) Bound influence where it is exercised instead:
  - the capital actually available;
  - implementation delay;
  - diminishing returns per channel;
  - competing institutions;
  - the opportunities actually offered.

  A marginal actor should sometimes be decisive near a threshold. That
  does not make them sovereign.
- **Recalibrate the knife-edge gates on effective outcomes:** the share of
  close worlds a maximal player can turn, inside a ratified band. The
  `endings-test` coverage gate (≥ 40% of runs within reach) measures raw
  `d_P` and misses the clip. The no-player distribution stays unchanged;
  report how purposeful policies move the distribution rather than forcing
  every policy back into it.
- **Gates:**
  - reserved resources cannot be spent twice;
  - conditions cannot be satisfied retroactively;
  - defaults produce their stated consequences;
  - every enacted commitment has an attributable channel.

### The firm responds

- **Conversion changes how the desk operates.** Today the verdict counts
  toward the room's seat and the gray-eminence overlay, and the desk itself
  doesn't change. Give it what its prose promises: limits, the CIO's
  backing, a mandate the firm now owns with the player.
- **The scrutiny loop gets teeth:** "explain this thesis" dispatches, and
  forced trims on a divergent drawdown.
- **The terminal receipt.** The last edition lists the chain's steps as
  recorded commitments: what was known, what was bet, what was promised,
  what was disclosed.

### After the instance works: generalize

- **The evidence-record layer** (`evidence-record.js`) between the race's
  disclosures and the event engine on one side and `brief.js` and
  `race-page.js` on the other, with separate public and private views.
- **Mandates** (`mandates.js`) as the fund-as-actor menu and the financing
  race in one lifecycle:
  - conditional financing: Polaris rounds on conditions; a PIPE with
    governance terms as the fund-scale version of board restraint;
    anchoring Cambria's Austin expansion (compute nationalism; the strait
    premium falls slowly);
  - institutional undertakings: a disclosure relationship; a restraint
    pledge; refusing a government compute mobilization, or not;
  - compute obligations as funding deadlines for the labs, so financing
    windows close on their own clock;
  - the thesis: a declared investment thesis with a risk envelope, where
    the ticket's figure values the book under the player's curves ("what
    is this book worth if I'm right"), the converse of section 4.
- **Meridian, the firm**, on its page:
  - the CIO, Webb and the risk committee;
  - the credibility record against the market's and the reader's;
  - `F` beside the player's curves;
  - the sources as people with histories, reliability records and fates,
    with tips about evidence as well as incidents;
  - the mandates beside the standing orders and the obligations;
  - the ledger's shadow: what the book financed this quarter, by channel.
- **The AI-policy lobbying menu replaces the party-PAC bar:** liability
  shield and deregulation (heat up, near-term returns up); the
  frontier-lab nationalization push; compute reporting; mandatory evals.
  The regime evaluator already accepts supervision, mobilization,
  nationalization and classification pushes; only the evals and reporting
  push is wired.
- **The room inherits the preparations.** It stays one convening, but the
  proposals on offer are the ones the player's mandates, disclosure
  relationships and conversions made feasible, rather than a count of
  interchangeable seat criteria. Counsel leverage on the summit gate lands
  here: the player's standing can move whether the Reykjavik window opens.
  Gate: distinct preparations produce distinct feasible proposals.

## 3. The run, headless

Much of the rest waits on whole runs played without a page: save and
resume, the authoring inspector, matched-policy gates, the counterfactual,
shared seeds. It proceeds incrementally, alongside section 2, not as a
platform project ahead of play.

- **Extract the transitions** from `main.js` into a DOM-free module, one
  authoritative path at a time, starting with the ones the chain touches:
  the substep, the day's open and close, the race block in its documented
  order, the event engine, settlements, and the popup queue's state
  machine with choices supplied by a policy. `main.js` keeps the rendering
  and wiring. Each move is pure, with a recorded-run equivalence check,
  because the ordering rules (`_midDayBaseline`, the popup barrier,
  overlays removed LIFO) are easy to break.
- **A randomness boundary first.** The event engine and the price path use
  `Math.random`, and a command journal alone cannot reproduce that. They
  draw instead through an injectable generator on named seeded streams,
  kept apart from presentation so a display draw still never moves the
  market. Addressing a draw by a semantic identity (the event's own id and
  occurrence, the instrument and substep) rather than a chronological slot
  keeps a branch that adds or removes one event from relabelling every
  later draw. That is the coupling rule a counterfactual needs.
- **A command journal:** every player command, recorded with the day and
  substep it was made on, and the rules version the run was played under.
  After a retune, an old save is retired with a notice, never replayed
  silently under new rules.
- **What it buys:**
  - save and resume: a run is its seed, its journal and its version;
  - whole-run harnesses with scripted player policies: interruption
    metrics at scale, matched-policy gates, and the empirical spread of
    whole-run scores the almanac needs;
  - the authoring inspector: which seeds reached each beat, its
    eligibility, its consequences, and follow-through that never arrived;
  - the counterfactual (section 5) and shared seeds (section 8).
- **Gates:**
  - an unchanged journal reproduces a run exactly, headless against live;
  - the extracted transitions keep the race block's order;
  - Classic stays inert, and the existing bit-identity invariants hold.

## 4. What the book bets

00's one line says the money is how you find out what you actually
believe. A book does not identify its owner's belief: a constrained,
inherited, hedged, liability-bearing book can reflect obligations,
incentives or a mistake. What the game can honestly show is what the book
bets, beside what the player says.

### The exposure comparison

For each open rung and the coming quarter: the book's value if the rung
certifies this quarter and if it doesn't, beside the draft's and the
market's probability for that same quarter. The horizon is labelled; R5 is
excluded, because nothing certifies it. Show, don't tell: the numbers sit
together and the about panel says what they are.

### The Kelly-equivalent reading

Later, once the valuation contract below holds.

- **The formula.** In a frictionless two-outcome market with state prices
  `p` and `1 − p`, a log-utility bettor's optimal wealths satisfy
  `q / (1 − q) = p·W_yes / ((1 − p)·W_no)` (standard result: Kelly 1956;
  Cover and Thomas, *Elements of Information Theory*, ch. 6). Read
  backward, it gives the odds under which the book's exposure would be
  Kelly-optimal: **Kelly-equivalent odds under these scenarios**, never the
  owner's belief.
- **The valuation contract** it needs before it ships:
  - complete wealth in each outcome: cash, liabilities, and every holding,
    private stakes included. The ticket's figure today computes
    incremental P&L, excludes private stakes, and spreads each outcome over
    several HCN moves (*checked*, `src/ticket.js`);
  - a stated treatment of uncertainty within an outcome, since averaging
    wealth within each outcome does not preserve log-optimality;
  - no reading where wealth in an outcome is zero or negative: insolvency
    is not conviction;
  - explicit horizons: a quarter's probability is not a term-end
    probability, and one quarter doesn't make a timeline.
- **What the identity covers.** The log score and a Kelly bettor's
  log-wealth growth coincide for the idealized single-rung binary
  allocation. The game's summed marginal scores across correlated rungs
  are not one portfolio's growth. Claim no more.
- **"Follow my book"** becomes a forecast policy (section 1) only once the
  contract holds.
- **Gates:**
  - cash plus an asset whose payoff is the same in both outcomes reads as
    the market's probability (bonds don't qualify: a certification moves
    rates through the capex channel);
  - the Kelly-optimal binary book for a stated quarter probability reads
    back as that probability;
  - the reading uses only the book and public state, and survives the
    hidden-field corruption invariant.

### Where it shows

- The opening hand's predecessor (section 1): their memo's thesis beside
  their book's bets is the first comparison the player sees, and it is
  someone else's.
- The almanac (section 1) records the book's quarters beside the stated
  ones.
- The accounting (section 5) sets them side by side by quarter: the
  forecast that said R3 by day 540, the book that only paid after day 720.
  Pillar 1's anomaly (if transformative AI were near, rates should say so)
  is an argument from what markets bet; this turns it on the player, as a
  reading.

## 5. The accounting

The last edition says what you knew, what you did, and what changed
because of it. It separates three things:

- **Recorded contributions:** capital committed, disclosures made,
  restraint funded, obligations met or missed (section 2's receipt).
- **Model counterfactuals:** the run replayed under a stated alternative
  policy (section 3). The first is **the world without you**, a page of the
  last edition: an intervention-free policy defined in 02a, covering
  trading, forecasts, disclosures and institutional actions (flat book,
  market curves, every tip sat on, every dispatch's no-commitment choice).
  When an action becomes unavailable under an alternative policy, the
  policy says what happens instead.
- **Unresolved attribution:** interactions with no unique personal share,
  said plainly.

The ledger page prints channels and no share of the outcome: the share it
used to print was unclipped, and no share is a causal answer. The
counterfactual is the answer to "what changed because of you".

**A first slice, labelled for what it is: player race channels removed,
recorded external inputs held fixed.** The race is seeded and runs
headless, so it can be rerun before section 3 lands. It needs every channel
by which the player mutates the race (coupling, primary allocations,
`raceEffects`, leaks, the lobbying signals, treaty inputs, player-backed
export-control stages) and a logged daily series of the external inputs,
since the public record keeps only the latest day's (*checked*). It first
replays the observed run with the channels intact and must reproduce it.
It is sensitivity analysis, not the world without you: recorded inputs can
descend from the player's earlier actions, so holding them fixed keeps
consequences of what was removed, and inputs after the observed terminal
day need a stated rule. The name "the world without you" is reserved for
the full policy replay.

Around it:

- **The worlds like yours.** At each act boundary, the reader's family
  head next to what happened: "at day 700 the record you were reading said
  31% for this ending." It is the knife-edge principle made visible, and
  the head already exists for V.
- **What you said and what you bet** (section 4), and the player's pinned
  theses beside their commitments (section 2).
- **The sampled variables disclosed:** τ, takeoff sharpness,
  `scalingElasticity`, `dealPossible` and China's position, with the
  incidents detection never caught and the days they occurred.
- **The annotated last edition.** The run's own editions return, reprinted
  with what was true on the day each was printed in the margin: the
  internal tracks, the undetected incidents, the reader's odds. The archive
  becomes the accounting, in the paper's own form.
- **Content:**
  - the timeout narrated years later, instead of a "Path: extrapolated" row;
  - the Deal's fingerprints in prose, since slot prose is static per cell
    and only the ledger rows vary;
  - the CIO's told-you-so and the czar's credit in the fizzle.
- **Gates:**
  - the intervention-free policy matches its independently specified
    baseline;
  - alternatives obey feasibility;
  - no hidden trajectory leaks during play;
  - policy effects are evaluated across held-out seeds.

## 6. Delegation: judgment taken over

Act III already takes the player's hands: the latency ladder, standing
orders, a degrading terminal. This section takes their judgment. Codex's
frame from the review: forecast policies, standing orders, the licensed
reader and any future quoting policy are one thing, delegation. They need a
common account of what is automatic, when it acts, and how the player
revokes it. The dramatic line runs between delegating execution, which is
built, and delegating judgment, which isn't.

### An affirmative late objective

Today Act III removes the public edge and makes execution worse at the
same time. That is powerful once. A fifth run needs something to do while
discretion disappears: the obligations from section 1 and the mandates
from section 2 come due, and keeping them with fewer hands is the act's
problem. Delegation is how you keep a promise you can no longer keep
yourself.

### The licensed reader

In Act II, Halcyon licenses its model to the Street as a market reader.
Its name comes from `06-naming.md`. It is the reader in the fiction.

- **Meridian can license it.** Its quality scales with the released
  rung, and it shows numbers, not conclusions.
- **The market licenses it too.** Its share of `B` is the η-weight, so as
  it spreads, the public edge closes. By Act III the player's edge is what
  the reader can't see: tips, intelligence, and their own synthesis.
- **Forecast policies and standing orders can follow it.** Robust
  delegation as a menu choice.
- **The displacement is the story.** The record shows how much of the
  player's forecast and book the reader wrote: "in the last year, 94% of
  your locks were the reader's."
- **No τ tilt (a9, 2026-10-27).** The 2026-10-25 round left open a small
  τ-keyed tilt in the product's displayed forecast in low-τ worlds. It is
  cut: a product can be commercially interested, selectively presented
  and institutionally overtrusted without secretly changing its numbers
  by a hidden parameter, and the tilt would have needed an exception to
  the public-state corruption invariant. The delegation problem is rich
  without it.

### The Brief's own editor

The ghostwritten world reaches the paper. Its editorial voice shifts by
released rung: the paragraphs tighten, and the dateline acquires a model
credit. The last human-written edition is a beat of its own. The variants
are authored.

### The tools stop describing the market

The felt part of the regime break:

- **A regime-switch wrapper** on the authoritative process, so that in Act
  III the process drifts away from the GBM+Heston its own tools assume.
  The Greeks stop hedging, and the scenario figure stops being right.
- **Halts**, with their settlement. HCN gets LULD-style halts of at most a
  day and a delisting halt of at most five days. Options suspend exercise
  and assignment during a halt, reject pending orders explicitly, and
  settle any expiry inside a halt against the published risk mark. Outside
  declared halts, the player can always flatten.

The rest of the clearing machinery (a regime-aware quote surface, the
exchange variance index, carry through delisting, stressed-scenario
limits, a regime margin add-on) is in section 12.

### Standing orders and the player's hands

- A nudge when the panel unlocks, since today it just appears.
- A leak-policy rule beside sit-on-every-tip.
- The designed `F` and scrutiny relief for sit-on-every-tip.
- A soft-trim path between 80% and 100% of margin, which would make rule
  (c)'s 80% gate observable.

## 7. Widening, where players ask for it

Taken once section 2 shows players want a distinction they cannot yet
express.

### Domains: rungs observed through certification channels

Capability shows up in public jaggedly, first and loudest wherever it is
cheapest to verify. An internal model can produce research mathematics at
volume, machine-checked, long before anyone can certify "autonomous
researcher" in AI R&D, the domain that drives recursion.

- **One hidden scalar per lab stays.** The kinematics, their calibration
  and the bit-identity harnesses are untouched. A domain is a way a rung
  becomes *visible*, not a separate capability.
- **Each domain certifies on its own clock**, drawn from a `domains`
  substream outside `race.streams`:

  | Domain | How it certifies | Speed |
  |---|---|---|
  | Mathematics | formal proof; the demonstration channel | fast, loud |
  | Software | benchmarks and shipped work | medium |
  | AI research | contested, empirical, internal; drives recursion | slowest |
  | Cyber, bio | red-team reports and incidents; capability shows first as harm | by incident |
  | Persuasion | detected campaigns (the persuasion incident class) | by detection |

- **Consensus lists per-domain contracts** on the same rung; the current
  rung contracts become the AI-research contracts.
- **`B` and the reader carry a curve per listed domain.** The player's
  forecast stays one curve per rung (AI research) unless they choose
  otherwise: domains are evidence first, not more curves to keep.
- **The Race page grows a domain grid.**
- **The edge:** the loud domain leads the quiet one by a lag that is real
  but not fixed. A certified R3 in mathematics is evidence about AI
  research, not its settlement.
- **Gates:** the reader is refit and its gates rerun; the edge bands and
  `K_CRED` are re-derived on validation worlds; the edge with domains is
  measured against the edge without them.
- **Separate decision, later:** whether domain capability feeds hazards,
  for example cyber capability raising theft and incident rates. That
  touches kinematics.

## 8. The run as an object, shared

Needs section 3's randomness boundary and journal.

- **Shared seeds:** two people play the same world, weather included.
- **The daily edition:** one world a day, the same for everyone. Local
  first.
- **The last edition as a keepsake**, shareable with its seed.
- **Speculative:** a shared world with an anonymous forecast scoreboard on
  the site's Worker and D1, following the precedent of `POST
  /api/surveys`, with nothing stored beyond the score. a9's call when the
  time comes.

## Cuts and deferrals

From 2026-10-25:

- **The party-PAC lobby bar** is replaced by the AI-policy menu
  (section 2).
- **The political pool:** trim its *exposure* — how often it leads the
  paper and takes a dispatch — before deleting authored content. Measure
  with section 1's interruption counts first.
- **Deferred until the section 2 chain works:** the wider Consensus
  (section 9), Russia as a second buyer, and new incident classes.

From the 2026-10-27 review (ratified):

- **Modal quarterly locks** are cut, not replaced by sixteen
  notifications (section 1).
- **The full domain grid** waits for section 7.
- **The τ-keyed tilt** in the licensed reader (section 6).
- **The clearing machinery** moves to the backlog (section 12), except
  halt settlement.
- **Catastrophe bonds** wait in section 9: a seventh curve should answer
  a want players have, not give an unpriced variable somewhere to go.
- **Mechanical trait effects.** The six dynamic tags in `src/traits.js`
  stay descriptive. A tag earns its place through recognition; automatic
  buffs would turn characterization into a build checklist.

## 9. Instruments in waiting

### Alignment gets a price

The evidence ladder runs beneath the feed and folds into an alignment
sentiment that nothing prices.

- **AI catastrophe bonds.** A fictional reinsurance syndicate issues
  bonds that pay a coupon and lose principal when an S2-or-worse incident
  is *detected*, either at a named lab or race-wide.
  - **Two-track by construction:** the trigger is detection, not
    occurrence.
  - **The coupon prices the public incident hazard** and the alignment
    sentiment, from public state only.
  - **An S4 cannot pay.** No counterparty survives it, so the market can
    price only the alignment failures people survive. That is pillar 2 as
    an instrument.
  - **Insider tips gain a second, radioactive use.**
  - **A seventh curve on the Markets page.**
  - Settlement follows 09's oracle discipline. The closeout rules for the
    doom families are stated in 02a.
- **The evidence ladder's beats on the wire.** Found-versus-published
  beats give the alignment side of the wager a voice, and give the bonds
  news to move on.
- **A Sato superevent:** the head of alignment's departure, or her team's
  headcount crossing a line, as the vital sign made loud.

### Selling liquidity

Codex's proposal from the review, speculative. Occasionally another
institution asks for a block in an existing instrument, with its size and
deadline public. The player names a price and quantity, commits capital
for the quote's life, and hedges any fill through the ticket. It is a
trading pleasure the premise underuses: earning by bearing someone else's
inconvenient timing, without a better forecast. In Act III execution
windows shorten, and a quoting policy configured earlier keeps accepting
risk faster than the player can reconsider it (section 6's delegation).

- Acceptance depends on observable terms and independent flow, never
  hidden race state. No omniscient customers.
- Quotes need enforceable limits, expiry, partial-fill rules and visible
  collateral reservation.
- Cost: high. It opens real execution and exploit surfaces, needs
  adversarial accounting tests, and should be an earned desk
  responsibility, never an opening panel.

### A wider Consensus

- **Rolling rung listings.** A new "R3 by …" each year, as a real exchange
  would list.
- **Event contracts:**
  - next Aleph major by a date
  - treaty framework signed
  - a severity-2-or-worse incident this year
  - Fixedpoint confirmed
  - first model-designed drug approved (the wonders as tradeables)

  Incident-flavoured contracts settle on the alignment-sentiment channel.
- **Same milestone, different settlement sources:** certified, claimed and
  *announced*. A trader can be right about capability and lose on
  institutional speech. The basis is tradeable.
- **Certification throughput as state.** Output volume rises with the
  race and the certifiers saturate, so the certification lag *grows* in
  Act III. The gap between true and certified widens exactly when it
  matters.
- **Polaris tender offers**, where a later round buys out early stakes.
- **Cambria earnings** as a compute-curve print.
- **Fizzle interpolation.** The fizzle closeout is one seeded draw at the
  endpoint. If date-differentiated claims prove mispriced by it,
  interpolate maturity-linearly from the last valid mark to the draw.

## 10. The race's missing machinery

- **Releases are phase-locked across worlds early.** Release policy is a
  threshold on near-deterministic drift, so Act I releases cluster on a
  learnable calendar. Measured in the 2026-10-25 round over day mod 63:
  releases run ±20% by week, and claims run 65% above average in days
  42–48. A per-lab jitter on appetite, or a release-review lag, would
  desynchronize them. Take it in section 2's refit, measured on its own.
- **Security levels**, SL1–SL4 per lab, with costs, research friction and
  observable tells (badge policies, a paper drought, the air-gap
  complaint). Theft success keys off the victim's level. Today every lab
  sits at SL2.
- **Self-exfiltration.** The model as the thief, landing in `C[open]`.
  The commit path supports it; nothing rolls it.
- **World-side heat impulses:**
  - export-control and gray-zone escalation (heats)
  - treaty progress (cools)
  - deregulation (heats)
  - incident backlash (cools, then fades)
  - lead size (a comfortable lead cools, a knife-edge heats)
- **The post-theft margin burn.** A theft already freezes `S`
  accumulation race-wide for 90 days. The burn would go further: "why
  slow down if it can be stolen" as a lab decision that spends margin,
  with its beat on the wire (the header of `src/events/china.js` holds
  the slot).
- **Detection drivers.** Detection lag answers only to the reporting
  regime, the concealment term and the lobbyable `detectionQuality` dial.
  Lab transparency and media pressure (Tan's standing, a run of leaks)
  should shorten it too.
- **The open ecosystem's own dynamics.** `C[open]` trails Tianxia's
  released capability at a fixed lag and has no motion of its own. A
  proliferation path (fine-tunes compounding, self-exfiltration landing
  there) would make family 4's proliferation variant reachable.
- **Russia as a second buyer** for stolen weights, beside Beijing
  (deferred; see above).
- **Occurrence-day physical effects of incidents:** costs, dead capability
  and `S` burned. These need recorded magnitudes first, so the calibrated
  `S` path isn't double-counted.
- **Pauses and withheld checkpoints as lab moves.** A pause is public, and
  the resume is disclosed late. A checkpoint withheld after failing
  alignment tests lets the market punish prudence.
- **Distillation** as a continuous theft channel. Tianxia's velocity gains
  a term proportional to the frontier's release surface; weight theft
  stays the discontinuity.
- **New incident classes** (deferred; see above):
  - *monitor tampering*, an incident whose effect is to lower detection
    and silently fatten the never-detected tail;
  - *disclosure contagion*, where a major disclosure raises race-wide
    detection for a window and surfaces a batch of stale incidents.
- **Adversarial persuasion.** Campaigns that move `F` and faction
  standings against the player, and insider-channel source trust that can
  be attacked.

## 11. Event illustrations: a pilot, in its own session

A self-contained session, briefed as follows. It runs in parallel with the
main line; it doesn't repair pacing.

**Goal.** Find an illustration style for *The Meridian Brief* that belongs
to the design system (near-white paper, one oxblood accent, hairlines, the
inks, "depict, don't decorate", "pattern before hue"), and prove it on a
small set.

**Hypothesis to test first.** Stipple or engraving in the text ink (the
newspaper hedcut lineage), theme-paired for light and dark, with the one
red spent only on what the story points at. Try one or two alternatives
against it, such as halftone duotone or woodcut.

**Pilot set.** About eight superevents:

- the walkout
- the S4 catastrophe
- the Fixedpoint leak
- a Taiwan blockade
- the room
- the Deal
- the first model-designed drug
- a treaty summit

**Tooling.** Codex's built-in image generation, through `gaslamp codex`.

**Deliverable.** A contact sheet for a9 to choose from, plus a prompt
sheet in the chosen style. Nothing is integrated until a9 picks a style.

**After the pick.** These are integration questions for the main game:

- Where images live: the dispatch, the front-page lead, the epilogue, the
  annotated last edition.
- The size budget.
- Alt text.
- Whether characters get portraits.
- How the ghostwritten world and Act III degradation touch the images.

## 12. Market integrity

The clearing machinery the regime break would eventually want, moved here
from the Act III section in the 2026-10-27 review. Take a piece when a
feature or a found defect needs it. Halt settlement stays with halts
(section 6).

- **A regime-aware authoritative quote surface** for exchange option and
  futures quotes. It would price halt, conversion-band, decree and
  terminal hazards, and from mobilized onward the declared
  nationalization band. The CRR trees become display and scenario tooling
  only. Corrupting tree inputs would then change displayed analytics and
  nothing economic, which becomes a harness invariant.
- **Carry through delisting.** Borrow fees and manufactured dividends
  accrue to the legal conversion timestamp and then stop, with a stated
  record-date rule for dividends.
- **The exchange variance index.** It is computed from authoritative
  option quotes, with a published realized-variance fallback and
  observations stored with validity status. VXHCN futures settle to it, so
  terminal VXHCN stops marking last-valid.
- **Global stressed-scenario risk limits.** Aggregate delta, gamma and
  vega, jump-to-conversion, decree, binary and doom scenarios across
  maturities and synthetic equivalents, instead of per-instrument counts.
- **A regime margin add-on.** Margin becomes max(realized-vol,
  implied-jump, regime add-on).

## 13. Satire and the state

These are content work, in the satire register. Calibration came from the
autumn of 2026 (real events are calibration, never content):

- **Supervision that arrives as certification infrastructure:** auditor
  frameworks, independent-verification statutes.
- **Liability as a second route into the control ratchet.**
- **Antitrust as a station on the treaty's farce gauntlet:** labs sued
  for coordinating to slow down.
- **An administration that renames the technology** in its communications
  and leaves the statute alone.
- **A lab-drafted federal bill** whose preemption clause is the point.
- **Beijing's Sputnik response to a demonstration:** a thousand
  scientists mobilized against the rival's last month of work.
- **The agent economy's first prints as absences.** Junior hiring in
  exposed occupations falls before anything else does.
- **The wonder that dispossesses.** A field's open problems are closed
  overnight, and the people best placed to understand it experience it
  as loss.

## 14. Continuity cleanup

Code-side seams the current-only docs no longer cover:

- `src/events/market.js:100` names a Zhaowei model "Qilin-4"; the line is
  Cangjie.
- `src/events/market.js:108` and `src/events/firm.js:89` call Liang Wei
  "Zhaowei CEO". He is the Premier everywhere else.
- `src/events/market.js` names real firms (TSMC, Goldman, Morgan Stanley,
  Gartner) against the lore rule, and `src/events/halcyon.js:96` says
  "Ex-Goldman". Cambria is the chipmaker; the banks and the analyst house
  need fictional names or none.
- `src/regulations.js:111` defines the Algorithmic Capability Disclosure
  Act, which no event activates or advances.
- The epilogue's stat block prints an "Alignment" row
  (`src/endings.js:398`) though its prose never says the word. Rename the
  row, or rule that the stat block is outside the tone rule.
- `main.js` clears the retired LLM mode's `shoals_llm_key` and
  `shoals_llm_model` storage on every boot. Drop it once enough time has
  passed.
- Stale code comments that cite retired names or deleted docs.

## 15. Feel, from a9's play-test

- The first thirty minutes, once section 1 lands: the opening hand,
  whether the forecast policy is found without being explained, and
  whether the pacing control makes Act I's quiet weeks feel chosen.
- The posterior: whether `K_CRED` 1.35 feels generous or stingy to a
  person (it is calibrated against synthetic players), and how the editor
  feels at the fourth quarter rather than the first.
- The size of valuation gaps (a parity claim gaps HCN about 13%; a day-1
  Cangjie claim gapped it 12% in the 2026-10-25 run), and the rounds'
  cadence.
- The score.
- The reality-beats content and the capex rates channel.
- `ACT3_TUNING`'s magnitudes and latency ladder, and whether standing
  orders should lock at R5.

## 16. Small seams

- `tick()` in `main.js` is dead code.
- The `/` shortcut and `#step-btn` say "Step forward one day" but step
  one substep.
- Touch input on the curve editor is untested.
- The round dispatches have only been exercised headlessly. A live run
  past Polaris's spawn (around day 400) should see them.
- Race-page labels collide where a claim, a certification and an in-house
  crossing fall within a few weeks of each other (around R2 in the
  2026-10-25 run).
- The reader's known limits (02a, "The reader" and "The valuation
  layer") all point to the same next step, a nonlinear model class over
  the same features (boosted trees, or a martingale-corrected family
  head):
  - pre-claim cohorts misread within a day;
  - `V` drifting predictably at about 0.027 a quarter.

  Take it when a later round needs a tighter measuring stick.

## Further out

Not queued; kept so the ideas aren't lost.

- **Other seats.** The same world from Treasury's desk, Tan's newsroom or
  Halcyon's board. Each would be a second game on the same race model.
