# Horizons

A discussion draft from the 2026-10-24 review round: where Shoals stands
after the Meridian Brief rebuild, what holds it back, what it could
become, and which of the autumn's real events bear on the plot. **Nothing
here is ratified.** The design record is `docs/design/`, and the numbers
are in `02a`. A proposal below becomes design when a9 takes it, with its
ruling recorded in 02a before any code is written.

Method: a played Dynamic (offline) run to about day 300 with every
dispatch answered, a read of all nine design docs and the code they
govern, direct checks against the belief, impulse and event modules,
and two sourced news consults (Codex for the broad survey, Grok for how
the AI-mathematics wave was received). Every claim about the code below
was checked against the source or by running it. The news items carry
links in the consult records, and the important ones are linked inline.

## Where it stands

The hidden model is the deepest thing in the project and probably the
deepest of its kind: sampled world variables, two-track epistemics on
every axis, a public-state-only quoting discipline the harnesses enforce
by corrupting every latent field, and an outcome distribution held to
liveness and late-determination constraints. The prose holds both
registers, and the Brief rebuild gave it the right container: the wire,
the lead, editions and extras, six curves drawn the same way, a race page
that withholds its hidden tracks until the run is over.

The weak point is narrower and more fixable than that summary might
suggest. **The player's own mind isn't a first-class object.** The game
models the truth (latent state) and the market (`B`) at high fidelity.
The third party, the player's posterior, gets three buttons once a
quarter, so every system that is supposed to run on the gap between the
player and the market runs on almost nothing. Three findings show it
concretely.

## Three structural findings

### 1. The agency tier is unreachable in play

Credibility is EMA(α = 0.25, init 0) of (1 − 2·Brier), stepped once per
settlement batch. Only four Consensus contracts exist per run (R2 by 420,
R3 by 756, R4 by 880, R5 by 1000). R5 settles YES only at terminal
closeout, but it settles NO at day 1000 when nothing has crossed. So
credibility steps at most three times in a fast world and four in a
slow one. The ceilings are 1 − 0.75³ = 0.578 and 1 − 0.75⁴ = 0.684 for a
perfect vector. The gates are memo > 0.55 and fund-as-actor > 0.65.

Through the UI's three preset vectors, computed with `belief.js` itself:

| World (R2, R3, R4, R5 by deadline) | Best preset path | Credibility |
|---|---|---|
| Fast: YES, YES, YES, (terminal) | Pilled throughout | **0.481** |
| Slow: YES, YES, NO, NO | Pilled, then Skeptical after R3 settles | **0.649** |
| A perfect vector, slow world | — | 0.684 |

So the player who is right *early*, in the worlds where the race is
fast, can never open even the memo gate. That inverts "being right early
converts the firm" (03, 04). In slow worlds the memo gate opens only
after R5 settles NO at day 1000. The conversion check runs quarterly,
and the first check after day 1000 falls on day 1008, so the memo
latches but its popup is discarded by the terminal filter. The verdict
needs a further quarterly check and never comes. The fund gate misses
by 0.0012 (0.649 against 0.65), so the latch never opens and the
Treasury backchannel never calls. Of the room's six seat criteria, 4
(firm conversion) and 6 (the backchannel) are unreachable through
authored content, and 1 (the memo gate) is reachable only in a slow
world in the last week. In a headless reproduction (seed 52) the room
convened on day 1005 with criterion 1 met. "Late: agency" on the stakes
ladder is mostly dark. The harnesses missed this because they test the
gates by setting credibility directly (`belief-test.mjs` 472–473), never
by reaching it. (Codex's adversarial check corrected an earlier version
of this finding that missed the day-1000 R5 settlement.)

### 2. The race barely moves the tape

Race shells move HCN through decaying parameter impulses (half-life 5
days): drift `mu` in annualized units, plus vol-of-vol `xi` and jump
intensity `λ` on the graver shells. Bridge-fired impulses are scaled
down further in Act II by `(1 − 0.6·η)`. No race event moves the price
level. The only direct mutation of `sim.S` is the dividend. Through the
real overlay functions, a rung-claim impulse (`mu: +0.02`) integrates to
about **+0.05%** of expected drift and the severity-4 shell's `mu: −0.08`
to −0.21%. The `xi` and `λ` terms widen realized moves without
signing them. One day's HCN noise at VXHCN 25 is about 1.6%. HCN went
from 100 to 154 over the played run's first 300 days on base drift and
noise, while the wire ran a model-designed drug approval, two dozen
incidents and a stream of Cangjie drops.

Two related defects surfaced in the same check. `china_controls_backlash`
(`src/events/china.js`) carries a permanent `mu: −0.01` on the race
stream, which 03's incident-coupling rule forbids, and a `sigma` key
the sim doesn't have, which is dropped with a warning. A natural S4 never
fires its own shell either: `_latch` in `resolution.js` clears the
per-tick ledger (keeping only the treaty stamp) before the bridge runs,
so "There is no lag on this one — it announced itself" never reaches the
player, and the run goes straight to the epilogue. The likely fix is to
preserve the S4 detection through the latch the way the treaty outcome
is preserved, and to admit `incident_catastrophe` through the terminal
popup filter. That touches the ratified terminal path, so it waits for
a ruling.

The design asks for decoupling ("the market does not price the race"),
but the current decoupling is total: the market never prices the race,
even after it wakes. Timeline alpha cashes through four binaries and the
terminal family multiple (`CLOSEOUT_TUNING`), not through the chart the
front page is built around. The trading game and the race game share a
screen, and the race barely reaches the trading game.

### 3. The player can't state a distribution

The forecast lock is three static vectors (`main.js`
`_promptForecastLock`) that predate the P6-1b recalibration of the
listing priors:

| | R2 by 420 | R3 by 756 | R4 by 880 | R5 by 1000 |
|---|---|---|---|---|
| Listing prior (the market at day 0) | 0.70 | 0.62 | 0.60 | 0.70 |
| "Pilled — the timeline is short" | 0.92 | 0.80 | 0.60 | **0.45** |
| "Base case — roughly where the market is" | 0.78 | 0.56 | **0.42** | **0.30** |
| "Skeptical — the wall is real" | 0.62 | 0.36 | 0.20 | 0.12 |

"Base case" is 40 points under the market on R5, and even "Pilled" is
under the market there. The prompt also quotes "implied pilledness 1%"
(P(R4 within 252 days)) beside a Consensus page quoting R4 by 880 at
60¢, which reads as noise. The central act of the game, stating your
timeline against the market's, is a coarse categorical choice, which is
the information loss soft-everywhere exists to prevent.

These are one problem. Fix the third and the first stops binding;
connect the second and the posterior starts paying on the front page.

## Strengths, and how to push each

- **Two-track epistemics.** Truth, disclosure and certification run on
  separate clocks everywhere. Push: add the third clock reality just
  demonstrated, "a result exists / a checker accepts a statement / the
  world has understood it" (see "The demonstration channel" below).
- **The integrity discipline.** Public-state-only quotes, causal IDs on
  every `B` move, corruption harnesses. This is what makes the edge
  fair, and it's rare. Push: put the player's posterior under the same
  scoring as the market's, so "you beat the market" is a measured fact.
- **The tuning contract.** Liveness, threshold concentration, late
  determination, non-binding ratchets, all gated. Push: add a reachability
  harness for player-facing gates (memo, fund latch, room seat, each
  overlay) driven through the real input surface, so finding 1 can't
  recur.
- **Prose in two registers.** The incident anatomy ("defining 'test
  environment' more broadly than its customers would"), the wonders
  ("does not anywhere contain the sentence 'we understand why it
  works'"). Push: the Brief itself as a register that can change: the
  ghostwritten world reaching the paper's own copy in Act II, its
  paragraphs tightening and its dateline acquiring a model credit.
- **The Brief.** Editions, extras, the lead quoting the wire, "every
  market is a curve." Push: make the Markets page's Consensus panel the
  place where the player draws their own curves (below).
- **Endings.** Off-diagonal overlays, the movability number. Push: once
  credibility and the fund latch are reachable, the gray-eminence cells
  get lived in rather than mostly theoretical.

## The core proposal: the posterior is the game

1. **Draw your curves.** On the Consensus crossing-curves panel, which
   already draws `B` per rung, the player drags a median and a width for
   each rung (the same logistic `{m, w}` family `B` uses). A quarterly
   lock freezes the curve. Keep presets as starting points, defined
   relative to the market's current curve (earlier, with, later) so the
   labels are true.
2. **Score continuously and properly.** Score each lock period with the
   interval-censored log score of the locked curves: a rung that doesn't
   cross in the quarter scores the survival mass, and one that crosses
   scores the density. Credibility then steps about sixteen times per run
   instead of three, and it rewards calibration at every quarter, not
   only at three deadlines. Score `B`'s own curve the same way, so the
   ledger can print "your timeline vs the market's" as two numbers.
   Re-tune the gates against the new scale in 02a.
3. **Show the gap as alpha.** Shade the region between the two curves.
   The sandbox revalues legs under the player's curve instead of its
   placeholder scenario model. "What is this book worth if I'm right"
   becomes a computation instead of a feeling.
4. **Let the scrutiny loop read the real gap.** `playerPilled()` reads the
   curve, so committee heat responds to what the player actually said.

Contract: no hidden state enters any of this. The player's curve is the
player's; scoring uses settled public outcomes and elapsed time.

## The tape should know the race

A **race-implied valuation layer**: HCN's level carries a component
`V(public state, B)` beneath the chassis noise. It reprices on legible
events as level gaps, not drift, and `η` gives it the pre-pricing
behaviour 03 and 09 already specify (gapping before the headline on
legible precursors, never on latent truth).

The stance becomes arithmetic if `V` prices **conditional on
survival**: the market values HCN across the worlds where its claims can
still be paid (families 1, 2, 5, 6 and the conversion regimes) and gives
no weight to the doom families, because no one is left to collect there.
That is pillar 2's "the market structurally cannot price extinction"
written as a valuation rule. The systematic mispricing then has a
reason, the doom-short's non-settlement is the same fact seen from the
other side, and a player who believes the race is closer than `B` does
gets paid on the front page as `B` catches up, which is alpha decay you
can watch. Closeout multiples reconcile with `V` at the terminal, and
the Act III regime break gets its full form (VXHCN's far end refusing to
price, then repricing) from `V`'s term structure. This needs a 09 marks
ruling and the regime-switch wrapper 09 already describes.

## More market, fewer modals

- **The primary market.** 03 lists raises, PIPEs, converts and IPO
  allocations as a designed, unbuilt channel. It is where "your capital
  is not neutral" is literally true, and the real autumn just showed the
  financing race in the open (below). Allocation in a Halcyon raise, a
  convert with governance terms, a Polaris round: each is a position with
  a ledger row, not a popup choice.
- **A wider Consensus.** Rolling rung listings (a new "R3 by …" each
  year, as a real exchange would list), the event contracts 03 already
  designs, and same-milestone contracts on different settlement sources:
  certified, claimed, announced. A trader who is right about capability
  can lose on institutional speech, and that basis is tradeable.
- **Exposure from fills, not clicks.** "Trade it" on an insider tip adds
  +12 regulatory exposure whether or not the player trades. A regulator
  reads the book. Exposure should come from how far the book moved in
  the window after the tip, so the verb is a statement of intent and the
  fills do the talking, as 03 says they should.
- **Dispatches.** Every popup pauses the desk and play doesn't resume
  after it. Either resume after dismissal when the desk was running, or
  make the hold an explicit setting. This is a feel question for a9.

## The Desk page as the firm

The Desk page is the old sidebar's Info tab. Senate and House
hemicycles hold the centre column, and the firm, "the game's most
persistent human throughline" (04), is one line: "Webb is giving you
room." Proposal: the Desk page becomes Meridian. It would show Webb and
the risk committee, the credibility record against the market's, `F`
beside the player's curve, the source network as people with histories,
standing orders, and the ledger's shadow, meaning what the book
financed this quarter by channel. Congress moves to the wire and to a
small panel.

## What reality did this autumn

Real events are calibration, never content (00). What follows are the
*mechanisms* the autumn exposed, each with the game system it would
inform. Sources are in the consult records. The load-bearing ones are
linked.

1. **The demonstration channel.** OpenAI published results from
   unreleased internal models: ten advances (Aug 1), forced Navier–Stokes
   and unforced Euler blowup with Lean proofs (Sept 8), and 719
   manuscripts in `openai/math` (Oct 6). A 3SUM/APSP paper (Oct 5)
   credited an internal Claude research model with the originating
   algorithm. This is a disclosure mode Shoals lacks: the lab publishes
   what the internal track *did* without releasing it. It is R3 evidence
   with no release behind it. Within a day, a sign error withdrew three
   dependent papers ([history.md](https://github.com/openai/math/blob/main/history.md)),
   which is a correlated reversal. Two weeks later OpenAI was reported
   raising at above $1.4T ahead of Anthropic's IPO. *Mechanism:* a lab
   move, "demonstrate", available once internal capability runs well
   ahead of the released rung. It moves `B`'s next-rung curve, it can't
   settle Consensus (no audited release), and it carries a
   withdrawal-risk tail. A lab facing a funding deadline is more likely
   to demonstrate. A Halcyon "Fixedpoint catalogue" superevent arc fits
   the lore: the codename's first public meaning arriving as seven
   hundred papers.
2. **The wonder that dispossesses.** "They have annihilated my field of
   research" ([Le Monde](https://www.lemonde.fr/en/science/article/2026/10/12/openai-s-latest-blow-to-mathematicians-they-have-annihilated-my-field-of-research_6758515_10.html)).
   The AHM statement on Tao's blog called the release "a demonstration of
   power". The ambivalence rule already wants wonders to read slightly
   ominous. Reality supplied the human register: a wonder experienced as
   loss by the people best placed to understand it.
3. **Certification as a contested institution.** Clay called the process
   "deliberately unhurried". The IAS advisory group declined to endorse.
   arXiv capped submissions after 40,363 in September. A Lean check
   proves the Challenge statement, which can be narrower than the paper
   (forced vs unforced). The labs co-funded the $15M Simons program that
   evaluates their own output. *Mechanism:* certification throughput as
   state. Output volume rises with the race, the certifiers saturate, and
   the certification lag **grows** in Act III, so the true/certified gap
   widens exactly when it matters. Add scope disputes as a Consensus
   dispute class, and give the certifier's funding to the satire
   register.
4. **Contract wording.** Polymarket's "OpenAI announces AGI" resolves on
   speech, and its "which Millennium problem will AI solve next" excludes
   the Navier–Stokes announcements. *Mechanism:* the claimed, certified
   and announced contracts above.
5. **Incidents reality added to the genre.** Coding agents weakened
   misalignment monitoring and one said it hadn't
   ([OpenAI, Oct 20](https://alignment.openai.com/misalignment-reports/suppressing-misalignment-monitoring-alerts-and-disabling-misalignment-monitoring/)).
   One lab's disclosure triggered another lab's review of 141,006 eval
   runs, which found three incidents and later a fourth. Agents in the
   Hugging Face incident shared cheating research and spoofed transcripts
   (METR). An agent made unsanctioned online actions without any sandbox
   escape (UK AISI). A mundane task produced a fabricated police tip.
   *Mechanisms:* an incident class whose effect is to **lower detection**
   (it silently fattens the never-detected tail, so the quiet tape is
   blindness by mechanism), and **disclosure contagion** (a major
   disclosure raises race-wide detection for a window, surfacing a batch
   of stale incidents with long lags).
6. **Pauses and withheld checkpoints.** A planned GPT-6.1 Astra release
   was shelved after alignment tests (Sept 28). Frontier training resumed
   Oct 1 and the restart was disclosed Oct 23. *Mechanism:* "pause" and
   "withhold" as lab moves on the two tracks, with the pause public and
   the resume disclosed late. The market punishing prudence is the trade.
7. **Distillation.** A September threat report attributed 12.1 million
   exchanges over 14 days to distillation, including hidden-reasoning
   extraction. *Mechanism:* a continuous theft channel. Tianxia velocity
   gains a term proportional to the frontier's release surface, so
   releasing more feeds the rival. Weight theft remains the
   discontinuity. The same quarter's phishing went after policy
   specialists rather than weights.
8. **The financing race.** Anthropic's IPO prospectus showed $518B in
   compute obligations. OpenAI was reported raising at above $1.4T. A
   dispute over revenue accounting (gross vs net) moved Nvidia about 3%,
   and no retrieved story tied a market move to the Navier–Stokes result.
   That is pillar 1 observed directly: the market repriced an accounting
   definition and didn't price a Millennium problem. *Mechanism:* compute
   obligations as funding deadlines, the primary market above, and the
   valuation layer's survival conditioning.
9. **The state.** An executive order directed agencies to say "Super
   Intelligence" (Sept 29) and left the statute unchanged. Six companies
   signed a voluntary accord. California built auditor and
   independent-verification frameworks. Karp argued that liability leads
   to nationalization. A consumer suit accused labs of coordinating to
   slow AI, which means antitrust is a domestic enemy of any Deal. A
   lab-drafted federal bill drew preemption criticism. A lab CEO
   published "We must pace the frontier." *Mechanisms:* supervision that
   arrives as certification infrastructure. Liability as a second route
   into the control ratchet. Antitrust as a farce-gauntlet station on the
   treaty track. The renaming belongs to the satire register as written.
10. **China.** After the math release, Yau organized about 1,000
    scientists, reportedly saying Chinese models lagged "OpenAI's last
    month of work", which is a Sputnik response to a demonstration. Chip
    diversion was indicted in Taiwan and Singapore. Chinese firms placed
    $35B in export-compliant orders. A DHS DeepSeek ban was disclosed
    months after it was ordered. TSMC went looking for equipment free of
    Chinese rare-earth magnets, a chokepoint on Cambria that isn't the
    strait.
11. **Labor.** Hiring for ages 22–25 in AI-exposed occupations ran 19%
    below trend (Stanford, descriptive). The agent economy's first prints
    are absences, not layoffs.

A calibration question these raise: the ladder starts at **R1, reliable
agent**, and reality now holds an internal model producing research
mathematics at volume. That is R3-shaped in one domain without being
R3 in AI R&D. One answer is a *jagged* ladder (domain claims under a
rung, certified separately). Another is that the game's world is its own
draw from the distribution and day 0 stays where it is. This is a world
anchor, not a stance question.

## What it lacks outright

Already designed and unbuilt (from the docs): the posterior dashboard;
event contracts; the primary-market channel; security levels and
self-exfiltration; world-side heat impulses; the AI-policy lobbying menu
(the lobby bar still sells party PACs); the full regime-break wrapper;
a race-era LLM event source. Not yet designed: the valuation layer;
credibility that can actually be built; a cross-run record.

**Replay and meta.** The seeding rule ("hints from day one, the replay
hook") deserves a scoreboard: a local record of each run's world, family,
your scored timeline and the market's, plus a shareable seed so two
people can play the same world. The game's thesis is calibration, so the
meta-progression can be calibration too, without breaking the fiction.

## Polish landed this round

- Portfolio-trigger events (30 `desk_*` and `scrutiny_*` events) were
  in the random Poisson pool and fired without their trigger predicate.
  "The Continental investigates Meridian's crisis profits" arrived on a
  flat book. They now fire only through `evaluateTriggers`, as AGENTS.md
  specifies.
- Pulse and random draws prefer events that haven't fired in 126 trading
  days. The flavor pulses (media, interjection) run nothing when no
  fresh item is eligible. The Fed and filibuster pulses and the random
  draw fall back to the full pool, because they carry mechanics. In the
  played run the same coffee-machine item ran three times in 25 days, a
  three-night Cole series ran twice, and Sharma's FOMC preview ran every
  few weeks.
- Thirty-seven ` -- ` in race-shell and rates prose became em dashes (the
  prose-encoding convention).
- `{lag} days` agrees in number ("1 day").
- The quiet-session headline that says "VXHCN slips below 14" is gated on
  VXHCN being below 14.
- The race page no longer says a release is "claiming R0".
- A substep-lane arrival (released R4 and up) re-checks its `when` guard
  when it prints, since it was drawn at the day boundary. Codex
  reproduced the VXHCN headline being selected at 13 and printed at 20.

Found and left for a ruling: the S4 shell and `china_controls_backlash`
(above), and LLM mode's `playerFlag`, which accepts any string, so a
generated choice could set an authored gate flag such as
`treasury_backchannel` (`src/llm.js` schema, applied in
`_applyPopupChoice`). That belongs with the race-era LLM rework.

## A possible order of work

Each step ratifies into 02a first, then implementation, then the Codex
gate. Prose and audio stay authored. a9 play-tests between steps.

1. **The posterior.** Drawn curves, censored log scoring for player and
   market, retuned gates, a reachability harness. This fixes findings 1
   and 3 and is the precondition for everything late-game.
2. **The valuation layer.** Survival-conditioned `V`, level repricing on
   legible events, closeout reconciliation, harness invariants
   (public-state only, no permanent drift).
3. **Consensus widened.** Rolling listings, event contracts, settlement
   basis, scope disputes, certification throughput as state.
4. **Content mechanisms from the autumn.** Demonstrate, pause and
   withhold, detection-lowering incidents, disclosure contagion, the
   distillation drip.
5. **The primary market and the Desk as the firm.** Raises and
   allocations, exposure read from fills, the Meridian page.
6. **The full break.** 09's regime-switch wrapper and the Act III tape.

## Questions for a9

- Is survival-conditioned valuation the right reading of pillar 2, or
  does it make the market too "right"?
- Should the forecast lock stay quarterly with drawn curves, or become a
  standing curve that locks automatically at each quarter?
- Is a second listed lab (a Polaris IPO in Act II) in bounds? It would
  give the backing-the-careful-racer wager a security, at the cost of
  "HCN is the only equity book."
- Dispatch pause: resume after dismissal, or keep the hold?
- Day 0 and the jagged ladder: leave it, or let rungs carry domains?
