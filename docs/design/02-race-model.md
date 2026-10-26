# 02 — Race Model

The state machine under the narrative: variables, couplings, and
resolution logic. Numbers live in [02a-tuning.md](02a-tuning.md). The race
runs in `src/race/`, DOM-free and seeded; event guards read its public
face through read-only mirrors on `world.ai`, never the race object.

## Design principle: soft-everywhere

Every question the discourse argues about — timelines, takeoff speed,
alignment difficulty, whether Beijing would ever deal — is a **hidden random
variable sampled at game start**, not a plot decision. The player (and the
event copy) observes only noisy projections of these variables. Replays
differ in *what kind of world you're in*, not just event order. You cannot
metagame the timeline, and the dread survives repeated play.

## Design principle: two-track everywhere

**Truth advances on one track; disclosure on another.** `C_internal` vs
`C_released` vs certified rung; incidents occurred vs detected; alignment
evidence found vs published; thefts committed vs disclosed; Beijing's
position vs intelligence about it. Every gap is somebody's alpha, every
disclosure is somebody's choice, and the game's epistemology is the
systematic study of the lag. (`C[open]` is the limiting case:
single-track by construction — release *is* its mode of existence.)

## Per-run hidden state (sampled at init)

| Variable | Range/shape | Prior (encodes the game's stance) |
|---|---|---|
| `alignTractability` τ | continuous 0–1 | Biased unfavorable: race-speed alignment works in a minority of worlds; pause-speed alignment works in most. The wager variable. |
| `takeoffSharpness` | slow ↔ fast continuum | Mass toward fast-ish; scales the recursion term, so it sets how fast R4 and R5 arrive once ignition starts. |
| `chinaTrue` | {position, velocity, dealPossible} | Beijing's true distance behind, how fast its program really moves (slower, matched, or quietly faster — the argument the market is having), and whether a deal was ever possible — `dealPossible` rarely true; when true, a treaty that reaches its window can hold. Safety culture is *not* sampled: anti-safety by construction. |
| `labSafetyCulture` (per lab) | continuous | Halcyon mid, wide variance; Polaris high; Tianxia low by construction (anti-safety, open-weights). |
| `scalingElasticity` | continuous; mass at healthy, real low tail | How far returns to scale carry this decade (soft-everywhere, applied to ourselves). Low draws degrade training returns and release cadence noisily — stalls and recoveries, tradeable all the way down — and only gradually confirm a plateau. The skeptics were right in the tail; the AGI trade unwinds. Kept as a *real* outcome for epistemic honesty. |

## Race state — latent truth and its projections

- **Capability `C[lab]` — two tracks:** `C_internal` (what the lab has)
  and `C_released` (what the world can touch). Both are latent
  authoritative state, never directly observable; the world sees only
  projections (claimed rungs, certified rungs, `B`, release behavior).
  `C_internal` advances via compute accumulation, talent, and — past a
  threshold — the **recursion term**: `dC_int/dt` gains a component
  proportional to `C_internal` itself (the takeoff mechanic). **Releases
  are choices, not clockwork:** a lab releases when its internal track
  runs far enough past its released one, and publishing pulls
  `C_released` up toward `C_internal` at the price of heat, proliferation
  surface, and evidence handed to rivals and markets. Withholding is also
  a move, and cadence arithmetic is the world's only read on the internal
  track. The internal−released gap is Fixedpoint's home; the market's
  whole epistemic problem is that `B` tracks the released record while
  the future is being decided by `C_internal`. `chinaTrue.position`
  initializes `C_internal[tianxia]` — one truth, not two fields.
- **The rung ladder** — `C` is continuous under the hood (the truth is a
  trajectory), but the world *observes* it quantized into named rungs,
  AI 2027-style. Consensus binaries settle on *certified* rung crossings
  (audited evals, public demos, a named adjudicator — typically lagged),
  never on hidden truth:
  - **R1 — Reliable agent.** Does the job, files the tickets.
    Economically loud, existentially quiet. The game starts here.
  - **R2 — Autonomous engineer.** Ships what its lab's best team ships,
    faster. The release cadence starts compounding.
  - **R3 — Autonomous researcher.** Fixedpoint works: the model carries
    the R&D. Visible through cadence arithmetic and the insider channel —
    the market reads it a rung late, which is the alpha.
  - **R4 — Recursion.** The `dC/dt ∝ C` term dominates; Act III tempo.
  - **R5 — Takeoff threshold.** Resolution fires (see below).

  Rung claims are also the discourse's currency: labs claim early,
  skeptics concede late, and a binary settling YES on "R3 by its
  deadline" is a world event. The gap between claimed rung, believed
  rung (`B`), and true `C` is the game's epistemology in one mechanic —
  and the lag between true and certified crossing is itself alpha.
- **Open-ecosystem capability `C[open]`** — the diffuse track: the best
  system buildable from released weights and fine-tunes. Ratchets up on
  every Tianxia release, never down; trails the frontier; has no lab, no
  safety budget, and no one to subpoena. It supplies the misuse wing of
  the incident ladder.
- **Safety margin `S[lab]`** — accumulated alignment work: safety
  culture, *pace* (racing burns margin), player-influenced investment.
  Observable only via proxies. `S` is a stock of effective margin: racing
  burns it, and high heat suppresses its *accumulation* lab by lab —
  nobody banks margin they don't think they can afford. Racing pace rises
  as a lab's lead narrows and as heat climbs, damped by its culture:
  Tianxia races almost fully when close, Polaris barely. The West's
  margin is a practice (it grows and burns); Tianxia's is a purchase
  (bought for control, floored, never burned below its base).
- **Race temperature `heat`** — aggregate recklessness of the
  environment, mechanically `heat = transient + irreversibleFloor +
  straitOverlay`. Proliferation is the floor: every open-weights Tianxia
  release heats permanently (weights don't un-release), up to a cap, and
  a successful theft adds to it. A blockade adds a reversible overlay
  while it lasts (Taiwan is the physical layer's single point of
  failure). The transient part moves only through ledgered player
  choices — backing export controls heats; advising the deal in the room
  cools.
- **Market belief `B`** — the market's posterior over the timeline, held
  as a crossing-date law per rung, not a scalar; the displayed "implied
  timeline" is derived from it. It is a designed inefficiency, a pool of
  two forecasters weighted by η, the share of the market that runs
  licensed models.
  - The first is the **market's rule of thumb**: a heuristic updater
    that moves on releases, rung claims and certifications only. It is
    recalibrated by day and claim state, so nothing static beats it, and
    is otherwise as crude as it reads.
  - The second is the **reader**: a forecaster fit on the simulator's own
    runs, which reads the whole public record — cadence, incidents,
    thefts, the strait, the regime, the treaty's beats.

  Neither ever sees hidden truth. The edge a player can earn is what the
  record holds beyond the rule's reading. It is widest before the claim
  that reveals a rung and shrinks as η rises. Detected incidents,
  insider-tip whispers, published or leaked evidence and disclosed
  thefts also fold into a bounded alignment sentiment that `B` records
  and nothing prices. True `C` never enters the interface; it only
  generates evidence and, eventually, settlement. `B` catching up to
  reality *is* alpha decay, mechanically, and the valuation layer is
  where the tape shows it.
- **Control regime `controlRegime`** — the state's grip on the frontier,
  an ordered enum: `private → supervised → mobilized → nationalized |
  classified` (the two terminal peers never swap). Transitions ratchet on
  a decaying grip pressure fed by detected incidents, thefts, and
  blockades, on heat, and on exogenous political pushes — the incident
  reporting bill is the one wired. Each step reshapes the race and the
  book: supervision drags domestic capability drift, mobilization
  freezes Consensus and the compute curve and floors domestic racing
  pace, nationalization converts HCN to a compensation claim at a
  published reference (the nationalization trade; the conversion itself
  executes at terminal closeout), and classification blacks out incident
  detections. The full table is in
  [09-market-integrity.md](09-market-integrity.md). Mostly one-way. The
  satire register owns the transitions (the czar announces supervision;
  the mobilization memo is ghostwritten); the consequences play dead
  straight.
- **Firm belief `F`** — Meridian's institutional AGI-pilledness. Wakes on
  its own toward the market's read of the recursion rungs, and converts
  toward the player on their *track record* — credibility scored
  quarterly against the market; being right early converts the firm.
  Divergence between the player's stated timeline and `F` drives the
  scrutiny loop (see [03-market-mechanics.md](03-market-mechanics.md));
  high `F` and high credibility open the fund latch.

## The incident generator (two-track)

Incidents are the main channel by which hidden state becomes visible,
and **occurrence and detection are distinct tracks**, mirroring
capability. An incident *happens* on the latent track; the world *learns
of it* later, or never:

```
occurrence ~ f(C_internal[lab], 1 − S[lab], heat, deploymentSurface)
anatomy    = capability × reduced-safeguard × mundane human error
detection  ~ f(severity, incident-reporting regime, concealment,
              player leaks) — a lag distribution with a
              never-detected tail
effects    = split by track:
  occurrence (silent): the latent record; an insider tip may be rolled
  detection  (public): a decaying market impulse, control-regime
              pressure, an alignment-sentiment fold, post-mortem
              followups
```

Consequences of the split:

- **The market moves on detection, never occurrence.** The
  occurrence→detection gap is the insider channel's purest trade — and
  its most radioactive: positioning on an undisclosed incident is the
  compliance arc's centerpiece.
- **Undetected incidents compound.** No backlash, no post-mortem — the
  conditions that produced the S2 still stand, and the world reads the
  quiet tape as safety. A calm feed is evidence of margin *or* of
  blindness, and the player cannot fully tell which: the ambivalence
  rule, running on the incident track.
- **Detection quality is a lobbyable regime.** Mandatory incident
  reporting raises detection and halves lags, retroactively once —
  better world, thinner edge. The player can lobby their own alpha away.
- **The record has a shape.** A detection is followed by the lab's
  post-mortem and then a scoped independent review: found versus
  published, as the official record. A player's leak forces a pending
  incident's detection within days.
- **The gap hides its own incidents** ([02a](02a-tuning.md)): detection
  lag scales with the source's internal−released gap — concealment
  licenses `C_internal`, defenders license the released frontier. The
  incident ledger inherits `B`'s epistemic problem.

Severity ladder: 0 embarrassing → 1 costly → 2 alarming
(exfiltration-class) → 3 grave (casualties / infrastructure) → 4
unrecoverable. An S4 self-discloses the moment it happens and resolves
the run in place; its hazard rises with lost margin, high heat and
capability near R4. Low-severity incidents are common and
farce-flavored; the ladder is the dread mechanism — the player learns
the anatomy never changes, only the blast radius. The unit is a
*population* of agents, not a model — prose renders it; the generator's
row stays one incident, one severity. Incidents need not originate at
the frontier: refusal-stripped fine-tunes of open Tianxia weights supply
the misuse wing — same anatomy, no lab to subpoena. Past R3 the
**persuasion class** joins the ladder: a fifth of incidents are
campaigns, quiet at occurrence and slow to detect (most never are). The
detection is the scandal; it raises control-regime pressure, and two
detected campaigns in a hot, mobilized state tip it into
classification.

## The evidence generator

The alignment-side twin of the incident ladder: technical evidence
beats — eval anomalies, hidden-reasoning findings, control-experiment
results — sampled with reliability, correlated with τ but noisy enough
never to identify it (the ambivalence rule's likelihood-ratio
discipline applies). Two tracks, as everywhere: *found* vs *published*.
Only the alignment-carrying labs, Halcyon and Polaris, produce it; labs
sit on results, publication is a choice, and unpublished beats leak.
Evidence folds into `B`'s alignment sentiment; it has no player-facing
beat of its own.

## The theft mechanic

Weight exfiltration is the race's discontinuity — the only event that
moves `C` faster than the recursion term. A successful theft of a
frontier checkpoint sets `C[thief] → max(C[thief], C[victim] − ε)`, where
ε is integration lag (compute to serve it, engineers to harness it), not
knowledge. Years of lead, gone in a news cycle.

- **Probability** ~ f(Beijing's strategic desperation, `heat`, victim's
  security level). Desperation is a physical-world read: their program
  is genuinely slower than they need, or the frontier's internal track
  is pulling away past where distillation helps. Beijing steals hardest
  exactly when falling behind matters most; a comfortable Tianxia
  doesn't need to — but a floor keeps parity-state espionage alive. The
  one theft dyad is Tianxia stealing from the leading domestic lab.
- **Security level** is discrete per-lab state, SL1–SL4 (startup hygiene
  → hardened corporate → compartmentalized → state-grade); theft success
  keys off the victim's level. Every lab sits at SL2.
- **Two tracks, again.** A theft happens silently and is disclosed
  later, or never. At disclosure the *public* attribution — spies, an
  insider, or the model itself — is sampled independently of the truth;
  the public post-mortem rarely settles it, and the readings price very
  differently. The record's true thief is never surfaced.
- **Downstream:** a permanent `heat` floor increment; `S` accumulation
  stops race-wide for 90 days (the banked stock stays, racing burn
  continues), because the margin rationale collapses when the lead does;
  and grip pressure jumps, so mobilization becomes live politics.

## Resolution

Terminal-state selection is one precedence ladder, checked continuously:
**(1)** a severity-4 incident resolves in place; **(2)** an implemented
treaty resolves as the Deal; **(3)** a confirmed plateau resolves as the
fizzle; **(4)** the frontier crossing the R5 threshold resolves as the
race outcome below (plateau is gated to runs that never crossed R5, so
steps 3 and 4 never compete); **(5)** day-1008 timeout → epilogue
extrapolation: sample the remainder forward from standing state
([05-endings.md](05-endings.md)). Exact gates and the family mapping are
in [02a-tuning.md](02a-tuning.md). For the race outcome:

```
leader   = argmax C
margin   = S[leader] adjusted by lead size:
             big lead  → leader can slow down at the end (+margin)
             knife-edge → forced corner-cutting (−margin, even for the careful)
outcome  = compare(margin, requirement(τ, takeoffSharpness))
family   = outcome × leader identity × treaty state   → see 05-endings.md
```

The lead-size adjustment is the game's stance rendered as arithmetic:
**margin is what winning is for.** (Deliberately double-counted with
the racing pace's closeness term: a comfortable lead slows the burn
*and* buys terminal margin. The compounding is the thesis, not an
accounting slip.)

## Player couplings (summary)

Every lever the player has moves one of a few dials, each recorded on
the complicity ledger:

- **`C`** — the cost-of-capital channel (persistent net HCN positioning,
  either sign) and primary allocations in Halcyon follow-ons.
- **`S`** — restraint bought through Halcyon's board, Polaris backing
  and Polaris rounds, and the room's advice.
- **`heat`** — backing export controls; advising the deal in the room.
- **`F`** — the firm converting toward a player whose curves beat the
  market's.
- **The treaty** — the compute-reporting groundwork.

Leaks change *when* the world learns of an incident, not how much it
believes. The ledger's `B` channel is closed.

Bounded influence: world and player contributions to every terminal
quantity are tracked separately, and the player's delta is clipped to
≤ 30% of the total movement ([02a-tuning.md](02a-tuning.md)) —
independently acting labs, governments, investors, and publics carry the
rest. A seat, not a steering wheel, enforced in arithmetic.

Proliferation is a **component of `heat`**, not a separate dial. Beijing
is banking on open weights, so proliferation and the race are the same
phenomenon — every Tianxia release is simultaneously a capability event
and a diffusion event.
