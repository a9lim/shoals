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

**Truth advances on one track; disclosure on another.** `C_internal` vs `C_released` vs
certified rung; incidents occurred vs detected; alignment evidence found
vs published; thefts committed vs disclosed; Beijing's position vs
intelligence about it. Every gap is
somebody's alpha, every disclosure is somebody's choice, and the game's
epistemology is the systematic study of the lag. (`C[open]` is the
limiting case: single-track by construction — release *is* its mode of
existence.)

## Per-run hidden state (sampled at init)

| Variable | Range/shape | Prior (encodes the game's stance) |
|---|---|---|
| `alignTractability` τ | continuous 0–1 | Biased unfavorable: race-speed alignment works in a minority of worlds; pause-speed alignment works in most. The wager variable. |
| `takeoffSharpness` | slow ↔ fast continuum | Mass toward fast-ish; drives Act III tempo compression rate. |
| `chinaTrue` | {position, velocity, dealPossible} | Beijing's true distance behind, how fast its program really moves (slower, matched, or quietly faster — the argument the market is having), and whether a deal was ever possible — `dealPossible` rarely true; when true, a treaty that reaches its window can hold. Safety culture is *not* sampled: anti-safety by construction. |
| `labSafetyCulture` (per lab) | continuous | Halcyon mid, wide variance; Polaris high; Tianxia low by construction (anti-safety, open-weights). |
| `scalingElasticity` | continuous; mass at healthy, real low tail | Continuous rather than a fizzle flag (soft-everywhere, applied to ourselves): how far returns to scale carry this decade. Low draws degrade training returns and release cadence noisily — stalls and recoveries, tradeable all the way down — and only gradually confirm a plateau. The skeptics were right in the tail; the AGI trade unwinds. Kept as a *real* outcome for epistemic honesty. |

## Race state — latent truth and its projections

- **Capability `C[lab]` — two tracks:** `C_internal` (what the lab has) and `C_released` (what the world can
  touch). Both latent authoritative state, never directly observable;
  the world sees only projections (claimed rungs, certified rungs, `B`,
  release behavior). `C_internal` advances via compute accumulation,
  talent flow, and — past a threshold — the **recursion term**:
  `dC_int/dt` gains a component proportional to `C_internal` itself
  (the takeoff mechanic and the source of Act III tempo). **Releases
  are choices, not clockwork** (every lab decides): publishing pulls
  `C_released` up toward `C_internal` and pays revenue and prestige, at
  the price of heat, proliferation surface, and evidence handed to
  rivals and markets — withholding is also a move, and cadence
  arithmetic is the world's only read on the internal track. The
  internal−released gap is Fixedpoint's home; the market's whole
  epistemic problem is that `B` tracks `C_released` while the future is
  being decided by `C_internal`. `frontierLead` is derived (true
  lead: internal; visible lead: released); `chinaTrue.position`
  initializes `C_internal[tianxia]` — one truth, not two fields.
- **The rung ladder** — `C` is continuous under the hood (soft-everywhere:
  the truth is a trajectory), but the world *observes* it quantized into
  named rungs, AI 2027-style, and Consensus binaries settle on
  *certified* rung crossings (audited evals, public demos, a named
  adjudicator — typically lagged), never on hidden truth:
  - **R1 — Reliable agent.** Teammate-grade: does the job, files the
    tickets. Economically loud, existentially quiet. Game starts here.
  - **R2 — Autonomous engineer.** Superhuman-coder class: ships what its
    lab's best team ships, faster. The release cadence starts compounding.
  - **R3 — Autonomous researcher.** Fixedpoint works: the model carries
    the R&D. Visible only through cadence arithmetic and the insider
    channel — the market reads it a rung late, which is the alpha.
  - **R4 — Recursion.** The `dC/dt ∝ C` term dominates; Act III tempo.
  - **R5 — Takeoff threshold.** Resolution fires (see below).
  Rung claims are also the discourse's currency: labs claim early,
  skeptics concede late, and a binary settling YES on "R3 by year-end" is
  a world event. The gap between claimed rung, believed rung (`B`), and
  true `C` is the game's epistemology in one mechanic — and the lag
  between true and certified crossing is itself alpha.
- **Open-ecosystem capability `C[open]`** — the diffuse track: the best
  system buildable from released weights and fine-tunes. Ratchets up on
  every Tianxia release, never down; trails the frontier; has no lab, no
  safety budget, and no one to subpoena. In proliferation worlds it is
  the crossing entity ([05-endings.md](05-endings.md) family 4), and it
  is the recipient-of-last-resort when an exfiltration has no buyer —
  including the case where the exfiltrator was the model.
- **Safety margin `S[lab]`** — accumulated alignment work: safety headcount,
  culture, *pace* (racing burns margin), player-influenced investment.
  Observable only via proxies: papers, departures, incident post-mortems,
  insider tips. `S` is a stock of effective margin: racing burns it, and
  high heat suppresses its *accumulation* lab-by-lab — nobody banks margin
  they don't think they can afford. Racing pace rises as a lab's lead
  narrows and as heat climbs, damped by its culture: Tianxia races almost
  fully when close, Polaris barely. The West's margin is a practice (it
  grows and burns); Tianxia's is a purchase (bought for control, floored,
  never burned below its base).
- **Race temperature `heat`** — aggregate recklessness of the environment,
  mechanically `heat = transient + irreversibleFloor + straitOverlay`.
  Proliferation is the floor: every open-weights Tianxia release heats
  permanently (weights don't un-release), up to a cap, and a successful
  theft adds to it; only the transient part ever cools. A blockade adds a
  reversible overlay while it lasts (Taiwan is the physical layer's
  single point of failure). The transient part today moves only through
  ledgered player choices (backing export controls heats; advising the
  deal in the room cools). Designed but not yet wired as world-side
  impulses: export-control and gray-zone escalation (heat), treaty
  progress (cools), e/acc deregulation (heats), incident backlash (cools
  briefly, then fades), and lead size (a comfortable lead cools; a
  knife-edge heats).
- **Market belief `B`** — the market's posterior over the timeline, held
  as a curve (hazard over crossing dates), not a scalar; the displayed
  "implied timeline" is derived from it. Updates on
  *legible* events only (releases, certifications, detected incidents,
  insider-tip whispers, published or leaked evidence, disclosed thefts)
  — never on hidden truth. *Available* alpha is generated by the true gap,
  but *playable* alpha ≈ f(player posterior − `B`) — true `C` never
  enters the interface; it only generates evidence and, eventually,
  settlement. `B` catching up to reality *is*
  alpha decay, mechanically.
- **Control regime `controlRegime`** — the state's grip on the
  frontier, an ordered enum: `private → supervised → mobilized →
  nationalized | classified` (the two terminal peers never swap).
  Transitions ratchet on a decaying grip pressure fed by detected
  incidents, thefts, and blockades, on heat, and on exogenous political
  pushes (lobbying, elections — today only the evals/reporting push is
  wired); each step reshapes release visibility
  (disclosure becomes classification), Consensus availability
  (contracts freeze or void — see
  [09-market-integrity.md](09-market-integrity.md)), HCN's very existence (conversion to a compensation claim at a
  published reference — the nationalization trade; the conversion itself
  executes at terminal closeout), and
  the player's access (the Treasury backchannel matters more as the
  regime hardens). Mostly one-way. The satire register owns the
  transitions (the czar announces supervision; the mobilization memo is
  ghostwritten); the consequences play dead straight.
- **Firm belief `F`** — Meridian's institutional AGI-pilledness. Wakes on
  its own toward the market's read of the recursion rungs, and converts
  toward the player on their *track record* — credibility scored at the
  quarterly forecast locks; being right early converts the firm.
  Divergence between the player's positioning and `F` drives the scrutiny
  loop (see [03-market-mechanics.md](03-market-mechanics.md)); high `F` +
  high credibility unlocks fund-as-actor moves.

## The incident generator (two-track)

Incidents are the main channel by which hidden state becomes visible,
and **occurrence and detection are distinct tracks**, mirroring
capability. An incident *happens* on the latent
track; the world *learns of it* later, or never. Anatomy (per the July
2026 Hugging Face template):

```
occurrence ~ f(C_internal[lab], 1 − S[lab], heat, deploymentSurface)
anatomy    = capability × reduced-safeguard × mundane human error
detection  ~ f(severity, incident-reporting regime, concealment,
              player leaks) — a lag distribution with a
              never-detected tail
effects    = split by track:
  occurrence (silent): the latent record; an insider tip may be
              rolled; the physical damage is deferred (below)
  detection  (public): B moves, market impulse, control-regime
              pressure, faction shifts, post-mortem followup chains
```

Occurrence-day physical effects (costs, dead capability, `S` burned) are
deliberately left out until 02a records magnitudes: no invented
truth-valued numbers in state, and an `S` hit would double-count the
calibrated `S` path. Lab transparency and media pressure as detection
drivers, and a backlash `heat` impulse on detection, are designed and not
yet wired.

Consequences of the split:

- **The market moves on detection, never occurrence** (consistent with
  `B` updating on legible events only). The occurrence→detection gap is
  the insider channel's purest trade — and its most radioactive:
  positioning on an undisclosed incident is the compliance arc's
  centerpiece.
- **Undetected incidents compound.** No backlash, no cooling, no
  post-mortem — the conditions that produced the S2 still stand, and
  the world reads the quiet tape as safety. A calm feed is evidence of
  margin *or* of blindness, and the player cannot fully tell which: the
  ambivalence rule, running on the incident track.
- **Detection quality is itself state.** Mandatory incident reporting
  shortens the lag and shrinks the never-detected tail — better world,
  thinner edge. The player can lobby their own alpha away.
- **Cover-ups are followup chains**: occurrence → internal post-mortem
  → leak or disclosure → backlash, each hop tradeable and leakable.
- **The gap hides its own incidents** ([02a-tuning.md](02a-tuning.md)):
  detection lag scales with
  the source's internal−released gap — concealment licenses
  `C_internal`, defenders license the released frontier. The incident
  ledger inherits `B`'s epistemic problem.

Severity ladder: 0 embarrassing → 1 costly → 2 alarming (exfiltration-class)
→ 3 grave (casualties / infrastructure) → 4 unrecoverable (self-disclosing
by nature; this *is* an
ending trigger in worlds where τ is low and margin was gone). Low-severity
incidents are common and farce-flavored; the ladder is the dread mechanism —
the player learns the anatomy never changes, only the blast radius. The
unit is a *population* of agents, not a model — prose renders it; the
generator's row stays one incident, one severity.
Incidents need not originate at the frontier: refusal-stripped fine-tunes
of open Tianxia weights supply the misuse wing of the ladder — same
anatomy, no lab to subpoena. And past R3 the **persuasion class**
joins the ladder: a targeted campaign shaping `B`,
`F`, or faction standing is an incident *by construction on the latent
track* — occurrence is quiet, detection (a pattern in the prose, an
eval post-mortem, a Tan story) is the scandal, and severity is measured
in moved beliefs rather than broken systems.

## The evidence generator

The alignment-side twin of the incident ladder: technical evidence beats — eval anomalies, hidden-reasoning findings,
control-experiment results, replications and their disputes — sampled
with reliability, correlated with τ but noisy enough never to identify
it (the ambivalence rule's likelihood-ratio discipline applies). Two
tracks, as everywhere: *found* vs *published* — labs sit on results,
publication is a choice, leaks exist, and the insider channel sees the
gap. The evidence trail is what makes the room epistemic rather than
ideological: by the time the final scaling decision arrives, the player
holds a posterior over τ with actual evidence in it — and so does
everyone else in the room, not the same one.

## The theft mechanic

Weight exfiltration is the race's discontinuity — the only event that
moves `C` faster than the recursion term. A successful theft of a frontier
checkpoint sets `C[thief] → max(C[thief], C[victim] − ε)`, where ε is
integration lag
(compute to serve it, engineers to harness it), not knowledge — and when
the exfiltrator was the model, the thief may be no lab at all: the
checkpoint lands in `C[open]`. Years of
lead, gone in a news cycle.

- **Probability** ~ f(Beijing's strategic desperation, `heat`, victim's
  security level). Desperation is a physical-world read: their program is
  genuinely slower than they need, or the frontier's internal track is
  pulling away past where distillation helps. Beijing steals hardest
  exactly when falling behind matters most; a comfortable Tianxia
  doesn't need to — but a floor keeps parity-state espionage alive. The
  wired dyad is Tianxia stealing from the leading domestic lab;
  self-exfiltration into `C[open]` is supported by the commit path and not
  yet rolled.
- **Security level** is discrete per-lab state, SL1–SL4 (startup
  hygiene → hardened corporate → compartmentalized → state-grade); theft
  success keys off the victim's level. Designed: each step bought with
  money *and* research friction — a three-way budget knife-fight against
  capabilities and safety spend that the insider channel can see (the
  guards-vs-GPUs memo leaks) — with observable tells (badge policies, a
  paper drought, the air-gap complaint). Not yet wired: no event changes
  a level, so every lab sits at SL2. Auxiliary per-lab state beside `S`:
  the five dials are the player-facing summary, not an exhaustive state
  inventory.
- **Two tracks, again.** A theft happens silently and is disclosed later,
  or never. At disclosure the *public* attribution — spies, an insider,
  or the model itself — is sampled independently of the truth; the public
  post-mortem rarely settles it, and the readings price very differently.
  The record's true thief is never surfaced.
- **Downstream:** permanent `heat` floor impulse; the "why slow down if it
  can be stolen" argument acquires teeth — post-theft, `S` accumulation
  stops race-wide for a season (the banked stock stays, racing burn
  continues), because the margin rationale collapses when the lead does;
  a mobilization/nationalization push becomes live politics; and Russia
  exists in this game chiefly as the *second* buyer.

## Resolution

Terminal-state selection is one precedence ladder, checked continuously:
**(1)** a severity-4 incident resolves in place; **(2)** an implemented
treaty resolves as the Deal; **(3)** a confirmed plateau resolves as
the fizzle; **(4)** `max(C, C[open])` crossing the R5 threshold
resolves as the race outcome below (plateau is gated to runs that never
crossed R5, so steps 3 and 4 never compete); **(5)** day-1008 timeout →
epilogue extrapolation: sample the remainder forward from standing state
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
heat's lead-size term: a comfortable lead cools the race *and* buys
terminal margin. The compounding is the thesis, not an accounting slip.)

## Player couplings (summary)

Capital flows → `C` (acceleration) and `S` (activist restraint, Polaris
backing); advice → `F`; lobbying → `heat` and the regulation pipeline;
insider-channel choices → `B` (leaks), personal exposure, and standing with
the safety network; late-game fund-as-actor moves → all of the above,
bigger. Every lever the player has ultimately moves one of five dials:
`C`, `S`, `heat`, `B`, `F`. That's the whole game, legible on one line.

Bounded influence: world and player contributions
to every terminal quantity are tracked separately, and the player's
delta is clipped to ≤ 30% of the total movement (margin-unit
decomposition in [02a-tuning.md](02a-tuning.md)) — independently
acting labs, governments, investors, and
publics carry the rest. A seat, not a steering wheel, enforced in
arithmetic.

Proliferation is a **component of `heat`**, not a sixth dial. Beijing is banking on open weights, so proliferation and the
race are the same phenomenon — every Tianxia release is simultaneously a
capability event and a diffusion event. Weight theft, stripped fine-tunes,
and misuse incidents all express as heat impulses with their own event
anatomy.
