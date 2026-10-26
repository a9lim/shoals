# Roadmap

The queue of work beyond the game as it stands. `docs/design/` describes
only what is built; everything designed but not built lives here. When an
item is taken, its rulings go into `02a-tuning.md` first, its description
moves into the design doc it belongs to, and it leaves this file.

The direction below was set in the 2026-10-25 ideation round (a9, Claude,
and an independent read from Codex). Sections 1–6 are the main line, in
order; the sections after them are the backlog, grouped by subject.

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
  measured (section 1).
- **Commit** (pillar 2). Spend the edge: trade on it, circulate it,
  publish it, or bind capital to conditions. Commitments are hard to back
  out of (sections 2 and 3).
- **Lose your grip** (pillar 3). First your hands go: orders lag, and
  standing orders take over. Then your judgment goes: the reader you
  license outforecasts you, the paper's own editor is ghostwritten, and
  your pricing models stop describing the market (section 4).
- **The accounting.** The model's counterfactual, labelled as one: the world
  without you, and the worlds that looked like yours (section 3).

### Embedded agency

The player's position is the one Demski and Garrabrant's *Embedded Agency*
(2018) describes: an agent that is part of the world it reasons about, with
no Cartesian boundary between them. The sequence's four subproblems each
map to systems Shoals has or is building. The mapping is a design lens, not
a citation of results.

- **Embedded world-models.** The player is smaller than the world and
  inside it. They read a filtered public record. Their own fills are in the
  tape (the impact overlay), their leaks change the record they read, and
  their credibility becomes part of what the market believes. The reader in
  section 1 is the formal version of what a bounded observer can know.
- **Decision theory.** "What if I hadn't?" can't be observed, only
  modelled. The last edition runs the model's counterfactual and labels it
  as the model's (section 3).
- **Robust delegation.** Standing orders, mandates and the licensed
  reader hand your agency to successors. They act when you can't, on
  values you specified earlier and imperfectly (sections 2 and 4).
- **Subsystem alignment.** The parts of your own agency are not wholly
  yours. Meridian has its own belief and incentives (`F`, the committee).
  The licensed reader is Halcyon's model. Sources have interests of their
  own (sections 2 and 4).

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
  promises that play decides. It goes (section 3).
- **The public edge is big enough to act on and closes decisively.** It
  is large enough that a player who reads well can move things. It closes
  soon after the legible event that reveals it, so a position taken on it
  cannot be unwound at the old price. Mandates and stakes carry exit costs.
  Decisions stick.
- **The licensed reader is in** (section 4). Whether its displayed
  forecast carries a small τ-keyed tilt is decided in its round.
- **A disclosure the player chooses may move `B`.** This reopens the
  ruling that the ledger's `B` channel is closed, for dissemination only
  (section 2).

### Measured in the reader round (2026-10-25)

The reader and `B`'s rebuild are built. Their rulings are in 02a ("The
reader", "Belief, η, and the firm", "The valuation layer"). What the
measurements say about the direction:

- **A calibrated market leaves a small public edge.** The 2.8 nats per
  run the ideation probe found came mostly from the old heuristic `B`'s
  own miscalibration. Part of it was statically exploitable. A
  headline-only reader, calibrated, is nearly as good as one that reads
  the whole record (0.004 nats per rung-quarter apart): today's quiet
  record carries little timing information.
- **The edge is the market's crude reading of the headlines.** That was
  a9's ruling. The rule of thumb is calibrated only by day and claim
  state, so nothing static beats it. A reader-copier then earns about
  0.8 nats per run against `B` (validation worlds). The opportunity per
  run is 0.70 nats in Act I, 0.19 in Act II and nothing in Act III. The
  edge closes once a rung is claimed. `K_CRED` is 1.35.
- **Luck still opens gates for a few.** Against a market this sharp, a
  skilled record is about a nat. A static early caller has a negative
  mean, but its heavy right tail clears the memo gate in about 5% of
  worlds. A significance condition on the gates was tried and dropped.
  It penalized the bold, skilled reader more than the lucky caller.
- **Domains are where the designed quiet signal comes from.** The
  demonstration channel (below) should widen the edge on information,
  not on the market's error. Its round measures that.
- **Late determination.** The reader's family head stays under the
  knife-edge ceilings: it beats the prior's Brier by 16.7% at day 350 and
  28.4% at day 700, against 25% and 60%. But at about 29% of act
  boundaries it gives one family more than 0.60, against principle 1's
  target of none. That target was unmeasured until now. It is a
  diagnostic, and a question for the knife-edge's next retune.

## 1. Next: the forecast as a standing policy, then domains

The reader, the public record and `B` as a designed inefficiency landed
in the 2026-10-25 round. Two pieces of the approved section remain, in
this order. Each refits the reader where it changes the record.

### The forecast as a standing policy

Sixteen of a run's 48 dispatches were forecast locks in the 2026-10-25
play, and domains would multiply the curves. The quarterly lock becomes a
standing policy the player sets: carry my curves or follow the market,
plus follow the reader once section 4 licenses it. At each quarter's
opening, the policy is snapshotted without a modal, as `scoreQuarter`
expects today. That immutable snapshot is scored at the quarter's close,
and revisions during the quarter affect only later snapshots. The
dispatch returns only when the player asks to revise or an authored
decision needs them.

### Domains: rungs observed through certification channels

Capability shows up in public jaggedly. It arrives first and loudest
wherever it is cheapest to verify. An internal model can produce research
mathematics at volume, machine-checked, long before anyone can certify
"autonomous researcher" in AI R&D, which is the domain that drives
recursion. AI 2027 tracked capability by domain, and Shoals should too, as
an epistemic layer:

- **One hidden scalar per lab stays.** The kinematics, their calibration
  and the bit-identity harnesses are untouched. A domain is a way a rung
  becomes *visible*, not a separate capability.
- **Each domain certifies on its own clock**, drawn from a `domains`
  substream outside `race.streams`:

  | Domain | How it certifies | Speed |
  |---|---|---|
  | Mathematics | formal proof; the demonstration channel below | fast, loud |
  | Software | benchmarks and shipped work | medium |
  | AI research | contested, empirical, internal; drives recursion | slowest |
  | Cyber, bio | red-team reports and incidents; capability shows first as harm | by incident |
  | Persuasion | detected campaigns (the persuasion incident class) | by detection |

- **Consensus lists per-domain contracts** on the same rung. The current
  rung contracts become the AI-research contracts.
- **`B` and the reader carry a curve per listed domain**, and the player
  may hold a curve per domain.
- **The Race page grows a domain grid.**
- **The edge:** the loud domain leads the quiet one by a lag that is real
  but not fixed. A certified R3 in mathematics is evidence about AI
  research, not its settlement.
- **The demonstration channel** lives here. A lab publishes what its
  *unreleased* model did, a third disclosure mode beside release and
  leak. It certifies the fast domains, moves `B`'s next-rung curve, and
  cannot settle the AI-research contracts. It carries a correlated
  withdrawal risk: one flawed lemma retracts its dependents. Labs facing a
  funding deadline demonstrate more. In lore it arrives as the Fixedpoint
  catalogue: the codename's first public meaning is seven hundred papers.
- **Separate decision, later:** whether domain capability feeds hazards,
  for example cyber capability raising theft and incident rates. That
  touches kinematics.

### Gates for the rest of the section

- Domains change the record, so the reader is refit and its gates rerun.
  The edge bands and `K_CRED` are re-derived on validation worlds, as in
  02a.
- The demonstration channel's edge is measured on its own: the edge with
  domains, against the edge without them.
- The standing policy's automatic locks match their declared policy
  exactly. A policy lock snapshots at the quarter's opening, and no
  forecast uses information from after its snapshot.

## 2. The decision chain: editions as evidence, spending the edge, Meridian

Codex's proposal, adopted: build one complete chain before widening the
simulation. The first chain to prove it runs:

1. a demonstration;
2. a disputed inference;
3. a forecast and a position;
4. a conditional financing commitment;
5. a disclosure decision;
6. an ending that accounts for each step.

The chain should admit several defensible policies, and it should
sometimes punish a good decision through bad luck.

### Editions as evidence

Today the Brief is a feed: `brief.js` leads with the newest log entry, and
the log is a bounded list of headlines. It should become an archive whose
earlier editions are evidence you go back to.

- **An evidence-record layer** (`evidence-record.js`) between the race's
  disclosures and the event engine, on one side, and `brief.js` and
  `race-page.js` on the other. Consequential reports get structured
  identities:
  - the claim and its subject;
  - occurrence and publication days, where known;
  - the source, and related reports;
  - correction status;
  - the contracts the report bears on.

  The layer exposes separate public and private views. Prose stays
  authored.
- **What the archive lets the paper do:**
  - show "since your last forecast";
  - link a withdrawal to the demonstration it retracts and that
    demonstration's dependents;
  - connect a new incident to an earlier assurance.
- **Pinning:** the player can pin reports to a thesis and mark what would
  disconfirm it. Pins score nothing. They make reasoning inspectable, and
  the last edition sets them beside what the player committed at the time.
- **Scope disputes as a dispute class:** "solved the wrong problem," or a
  checker that proves a narrower statement than the claim. The dispute
  lifecycle exists and is harness-exercised, but no event opens one yet.
  The chain's disputed inference is one.
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

- Disclosures are records that reference evidence ids and recipients.
  They reach `belief.js`, the firm or the public only when delivered.
  Circulating the same evidence twice is not two independent updates.
- **Each verb has a cost:**
  - a disclosure can destroy a trade;
  - it can expose a source;
  - it can force the firm to own a position it would rather leave
    implicit.
- **Insider exposure is read from fills.** A regulator reads the book.
  "Trade it" on a tip costs exposure according to how the book moved in
  the window, not because the verb was clicked.
- **Gates:**
  - a private briefing never moves public quotes;
  - duplicates don't multiply evidence;
  - reactions respect source dependencies;
  - matched-policy runs measure the exchange between return, access and
    race effects.

### Mandates

Durable commitments, in `mandates.js`. Each has an owner, a deadline,
committed resources, release conditions and a consequence for withdrawal.
Reservations flow through the portfolio, and race effects flow through the
existing chokepoints and the ledger. This is the fund-as-actor menu and
the financing race given one lifecycle:

- **Conditional financing:** anchor Polaris's next round if an independent
  evaluation happens first; a PIPE with governance terms as the
  fund-scale version of board restraint; anchor Cambria's Austin expansion
  (compute nationalism; the strait premium falls slowly).
- **Institutional undertakings:** a disclosure relationship; a restraint
  pledge; refusing a government compute mobilization, or not.
- **Compute obligations as funding deadlines** for the labs, so financing
  windows close on their own clock.
- **The thesis:** a declared investment thesis with a risk envelope. The
  ticket's figure values the book under the player's curves, so "what is
  this book worth if I'm right" becomes a computation.
- **Exit costs.** Releasing a mandate early forfeits something real:
  standing, an allocation, a relationship.
- **Gates:**
  - reserved resources cannot be spent twice;
  - conditions cannot be satisfied retroactively;
  - defaults produce their stated consequences;
  - every enacted commitment has an attributable channel;
  - distinct preparations produce distinct feasible proposals in the room.

### Meridian, the firm

The 2026-10-26 visual round made the Desk the Meridian page: the
player's forecast record and scored quarters, their standing, standing
orders and convictions, and Washington as two seat bars, the regulations
and the lobbying list, with the settings at its foot. The firm itself is
still one line of standing text. Give the page the firm:

- the CIO, Webb and the risk committee;
- the credibility record against the market's and the reader's;
- `F` beside the player's curves;
- the sources as people with histories, reliability records and fates,
  with tips about evidence as well as incidents;
- the mandates beside the standing orders;
- the ledger's shadow: what the book financed this quarter, by channel.

The firm's arc becomes mechanical:

- **The scrutiny loop gets teeth:** "explain this thesis" dispatches, and
  forced trims on a divergent drawdown.
- **Firm conversion as a mechanic.** The verdict sets `firm_converted`,
  and today nothing reads it.
- **The AI-policy lobbying menu replaces the party-PAC bar:**
  - liability shield and deregulation (heat up, near-term returns up);
  - the frontier-lab nationalization push;
  - compute reporting;
  - mandatory evals.

  The regime evaluator already accepts supervision, mobilization,
  nationalization and classification pushes; only the evals and reporting
  push is wired.

### The room inherits the preparations

The room stays one convening, but what the player can bring to it is what
they built. The proposals on offer are the ones their mandates,
disclosure relationships and conversions made feasible, rather than a
count of interchangeable seat criteria. Counsel leverage on the summit
gate lands here: the player's standing can move whether the Reykjavik
window opens.

### Tools for authoring the chain

- **An authoring inspector.** It shows which seeds reached each beat, its
  eligibility, its consequences, and any follow-through that never
  arrived.
- **Interruption metrics** per run: dispatches by cause, repeated
  choices, and how many actionable developments arrive between decisions.
- Front-page priority uses public significance and authored metadata. It
  never picks a headline because the engine knows it foreshadows a
  catastrophe.

## 3. Influence that can turn a world, and the accounting

### Bound the intervention, not the outcome

Today `dEff = dW + clip(dP, ±(3/7)·|dW|)` (`src/race/resolution.js`). For
a fixed terminal decomposition, that keeps `dW`'s sign. Family 1 needs
`d > 0`, so the clipped player term can never carry a world across the
holds line. (`dW` is an algebraic residual, `d − d_P`, not a replayed
no-player world, and the player's channels can still change trajectories
and leadership.) The clip also scales with `|dW|`, so the player's
leverage shrinks to zero at exactly the knife-edge. The `endings-test`
coverage gate (≥ 40% of runs within reach) measures raw `d_P` and misses
this.

- **Retire the terminal clip.** Bound influence where it is exercised:
  - the capital actually available;
  - implementation delay;
  - diminishing returns per channel;
  - competing institutions;
  - the opportunities actually offered.

  A marginal actor should sometimes be decisive near a threshold. That
  does not make them sovereign.
- **Recalibrate the knife-edge gates on effective outcomes:** the share
  of close worlds that a maximal player can turn, inside a ratified band.
  The no-player distribution stays unchanged. Then report how purposeful
  policies move the distribution, rather than forcing every policy back
  into it.
- The ledger row "Of the margin that decided it, yours" goes. It prints
  an unclipped share, and no share is a causal answer anyway. The
  counterfactual below replaces it.

### Replayable runs

The race is seeded, but the event engine and the price path use
`Math.random`, so whole runs can't be replayed. Fixing that takes two
pieces:

- **Explicit randomness:** the event engine and the price path draw from
  named seeded streams. They stay separate from presentation randomness,
  so a display draw still never moves the market.
- **A command journal:** every player command, recorded with the day and
  substep it was made on.

Replaying an unchanged journal reproduces the run exactly. A branch-
dependent draw needs stable addressing, or an explicit coupling rule.
This is the same piece that shared seeds need (section 6).

### The last edition's accounting

The accounting is post-terminal only. It separates three things:

- **Recorded contributions:** capital committed, disclosures made,
  restraint funded.
- **Model counterfactuals:** the run replayed under a stated alternative
  policy. The first is **the world without you**, a page of the last
  edition. It is an intervention-free policy defined in 02a, covering
  trading, forecasts, disclosures and institutional actions: for example,
  flat book, market curves, every tip sat on, every dispatch's
  no-commitment choice. When an action becomes unavailable under an
  alternative policy, the policy says what happens instead.
- **Unresolved attribution:** interactions with no unique personal share,
  said plainly.

And around it:

- **The worlds like yours.** At each act boundary, the reader's posterior
  next to what happened. For example: at day 700 the record you were
  reading fit 214 worlds, and 31% of them ended like this one. It is the
  knife-edge principle made visible.
- **The sampled variables disclosed:** τ, takeoff sharpness,
  `scalingElasticity`, `dealPossible` and China's position, with the
  incidents detection never caught and the days they occurred.
- **The player's pinned theses** beside their commitments (section 2).
- **Content:**
  - the timeout narrated years later, instead of a "Path: extrapolated" row;
  - the Deal's fingerprints in prose, since slot prose is static per cell
    and only the ledger rows vary;
  - the CIO's told-you-so and the czar's credit in the fizzle.
- **Gates:**
  - an unchanged journal reproduces the observed run;
  - the intervention-free policy matches its independently specified
    baseline;
  - alternatives obey feasibility;
  - no hidden trajectory leaks during play;
  - policy effects are evaluated across held-out seeds.

## 4. Judgment taken over: Act III

Act III already takes the player's hands: the latency ladder, standing
orders, a degrading terminal. This section takes their judgment.

### The licensed reader

In Act II, Halcyon licenses its model to the Street as a market reader.
Its name comes from `06-naming.md`. It is section 1's reader in the
fiction.

- **Meridian can license it.** Its quality scales with the released
  rung, and it shows numbers, not conclusions.
- **The market licenses it too.** Its share of `B` is the η-weight from
  section 1, so as it spreads, the public edge closes. By Act III the
  player's edge is what the reader can't see: tips, intelligence, and
  their own synthesis.
- **Standing orders can follow it.** That is robust delegation made into
  a menu choice.
- **Open decision for the round:** a small τ-keyed tilt in the product's
  displayed forecast in low-τ worlds. It would be the alignment problem
  met in your own workflow. The risk is that it reads as a gotcha.
  - It is not section 1's estimator. That stays public-only and feeds
    `B` and V untouched.
  - The tilt would be a new observed signal, with its own observation
    model and an explicit, harness-stated exception to the public-state
    corruption invariant.
  - It would be held to the ambivalence rule's likelihood-ratio
    discipline: real evidence, never decisive.

### The Brief's own editor

The ghostwritten world reaches the paper. Its editorial voice shifts by
released rung: the paragraphs tighten, and the dateline acquires a model
credit. The last human-written edition is a beat of its own. The variants
are authored.

### The tools stop describing the market

The full regime break, and the clearing machinery it needs:

- **A regime-switch wrapper** on the authoritative process, so that in
  Act III the process itself drifts away from the GBM+Heston its own tools
  assume.
- **A regime-aware authoritative quote surface** for exchange option and
  futures quotes. It would price halt, conversion-band, decree and
  terminal hazards, and from mobilized onward the declared
  nationalization band. The CRR trees become display and scenario tooling
  only. Corrupting tree inputs would then change displayed analytics and
  nothing economic, which becomes a harness invariant.
- **Halts.** HCN gets LULD-style halts of at most a day and a delisting
  halt of at most five days. Options suspend exercise and assignment
  during a halt, reject pending orders explicitly, and settle any expiry
  inside a halt against the published risk mark. A fairness invariant
  follows: outside declared halts, the player can always flatten.
- **Carry through delisting.** Borrow fees and manufactured dividends
  accrue to the legal conversion timestamp and then stop, with a stated
  record-date rule for dividends.
- **The exchange variance index.** It is computed from authoritative
  option quotes, with a published realized-variance fallback and
  observations stored with validity status. VXHCN futures settle to it,
  so terminal VXHCN stops marking last-valid.
- **Global stressed-scenario risk limits.** Aggregate delta, gamma and
  vega, jump-to-conversion, decree, binary and doom scenarios across
  maturities and synthetic equivalents, instead of per-instrument counts.
- **A regime margin add-on.** Margin becomes max(realized-vol,
  implied-jump, regime add-on).

### Standing orders and the player's hands

- A nudge when the panel unlocks, since today it just appears.
- A leak-policy rule beside sit-on-every-tip.
- The designed `F` and scrutiny relief for sit-on-every-tip.
- A soft-trim path between 80% and 100% of margin, which would make rule
  (c)'s 80% gate observable.
- **A player flatten control.** `liquidateAll` has no player entry point;
  a flatten button would take the latency ladder.

## 5. Alignment gets a price

The evidence ladder runs beneath the feed and folds into an alignment
sentiment that nothing prices. Give it a market, and a voice.

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

## 6. The run as an object

The game's thesis is calibration, so the meta-progression can be
calibration too.

- **An almanac**, local to the browser: each run's world, family, and the
  scored timeline against the market's and the reader's. Your calibration
  across worlds is the progression, so learning to read the record is how
  you get better. Storage follows the root's rules: wrapped in try/catch,
  and the game works without it.
- **The last edition as a keepsake**, shareable with its seed.
- **Shared seeds:** two people play the same world. This needs section
  3's explicit randomness.
- **Speculative:** a weekly shared world with an anonymous forecast
  scoreboard on the site's Worker and D1, following the precedent of
  `POST /api/surveys`, with nothing stored beyond the score. a9's call
  when the time comes.

## Cuts and deferrals (2026-10-25)

- **The party-PAC lobby bar** is replaced by the AI-policy menu
  (section 2).
- **The political pool:** trim its *exposure* — how often it leads the
  paper and takes a dispatch — before deleting authored content. Pool
  size alone doesn't show what dominates a run. Measure with section 2's
  interruption metrics first.
- **Modal quarterly locks** become a standing policy (section 1).
- **Deferred until the section 2 chain works:** the wider Consensus
  (section 8), Russia as a second buyer, and new incident classes.

## 7. Event illustrations: a pilot, in its own session

A self-contained session, briefed as follows.

**Goal.** Find an illustration style for *The Meridian Brief* that
belongs to the design system (near-white paper, one oxblood accent,
hairlines, the inks, "depict, don't decorate", "pattern before hue"), and
prove it on a small set.

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
sheet in the chosen style. The sheet replaces the deleted Disco Elysium
oil-portrait sheet, which predated the Brief. Nothing is integrated until
a9 picks a style.

**After the pick.** These are integration questions for the main game:

- Where images live: the dispatch, the front-page lead, the epilogue.
- The size budget.
- Alt text.
- Whether characters get portraits.
- How the ghostwritten world and Act III degradation touch the images.

## 8. A wider Consensus

Deferred until the section 2 chain works.

- **Rolling rung listings.** A new "R3 by …" each year, as a real
  exchange would list.
- **Event contracts:**
  - next Aleph major by a date
  - treaty framework signed
  - a severity-2-or-worse incident this year
  - Fixedpoint confirmed
  - first model-designed drug approved (the wonders as tradeables)

  Incident-flavoured contracts settle on the alignment-sentiment channel.
- **Same milestone, different settlement sources:** certified, claimed
  and *announced*. A trader can be right about capability and lose on
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

## 9. The race's missing machinery

- **Releases are phase-locked across worlds early.** Release policy is a
  threshold on near-deterministic drift, so Act I releases fall on
  nearly the same calendar in every world. Measured in the 2026-10-25
  round over day mod 63: releases run ±20% by week, and claims run 65%
  above average in days 42–48. A per-lab jitter on appetite, or a
  release-review lag, would desynchronize them. The reader would then be
  refit.
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
- **Occurrence-day physical effects of incidents:** costs, dead
  capability and `S` burned. These need recorded magnitudes first, so the
  calibrated `S` path isn't double-counted.
- **Pauses and withheld checkpoints as lab moves.** A pause is public,
  and the resume is disclosed late. A checkpoint withheld after failing
  alignment tests lets the market punish prudence.
- **Distillation** as a continuous theft channel. Tianxia's velocity
  gains a term proportional to the frontier's release surface; weight
  theft stays the discontinuity.
- **New incident classes** (deferred; see above):
  - *monitor tampering*, an incident whose effect is to lower detection
    and silently fatten the never-detected tail;
  - *disclosure contagion*, where a major disclosure raises race-wide
    detection for a window and surfaces a batch of stale incidents.
- **Adversarial persuasion.** Campaigns that move `F` and faction
  standings against the player, and insider-channel source trust that can
  be attacked.

## 10. Trait effects

The six dynamic tags in `src/traits.js` carry no effects yet.

## 11. Continuity cleanup

Code-side seams the current-only docs no longer cover:

- `src/events/market.js:100` names a Zhaowei model "Qilin-4"; the line is
  Cangjie.
- `src/events/market.js:108` and `src/events/firm.js:89` call Liang Wei
  "Zhaowei CEO". He is the Premier everywhere else.
- `src/events/market.js` names real firms (TSMC, Goldman, Morgan Stanley,
  Gartner) against the lore rule. Cambria is the chipmaker; the banks and
  the analyst house need fictional names or none.
- `src/regulations.js:111` defines the Algorithmic Capability Disclosure
  Act, which no event activates or advances.
- The epilogue's stat block prints an "Alignment" row
  (`src/endings.js:398`) though its prose never says the word. Rename the
  row, or rule that the stat block is outside the tone rule.
- Stale code comments that cite retired names or deleted docs.

## 12. Satire and the state

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

## 13. Feel, from a9's play-test

- The posterior: whether `K_CRED` 1.8 feels generous or stingy to a person
  (it is calibrated against synthetic players), and how the lock dispatch
  and editor feel at the fourth quarter rather than the first. Section 1's
  standing policy and new scale supersede the specific numbers.
- The size of valuation gaps (a parity claim gaps HCN about 13%; a day-1
  Cangjie claim gapped it 12% in the 2026-10-25 run), and the rounds'
  cadence.
- The score.
- The reality-beats content and the capex rates channel.
- `ACT3_TUNING`'s magnitudes and latency ladder, and whether standing
  orders should lock at R5.

## 14. Small seams

- `tick()` in `main.js` is dead code.
- The `/` shortcut and `#step-btn` say "Step forward one day" but step
  one substep.
- Touch input on the curve editor is untested.
- The round dispatches have only been exercised headlessly. A live run
  past Polaris's spawn (around day 400) should see them.
- The epilogue's "Of the margin that decided it, yours" row
  (`main.js`, `resolution.movability`) prints the unclipped share and can
  exceed the clip's 30%: 74.5% in the 2026-10-25 run, on a China-first
  ledger page whose prose says nothing on the table decided it. Section
  3 removes the row; until then, print the clipped share or drop it.
- Race-page labels collide where a claim, a certification and an
  in-house crossing fall within a few weeks of each other (around R2 in
  the 2026-10-25 run).
- The reader's known limits (02a, "The reader" and "The valuation
  layer") all point to the same next step, a nonlinear model class over
  the same features (boosted trees, or a martingale-corrected family
  head):
  - pre-claim cohorts misread within a day;
  - `V` drifting predictably at about 0.027 a quarter.

  Take it when a later round needs a tighter measuring stick.
