# 02 — Race Model

> The state machine under the narrative. Sketch-level: variables, couplings,
> and resolution logic — tuned numbers live in the appendix,
> [02a-tuning.md](02a-tuning.md). Everything here extends the
> existing `world-state.js` / `EventEngine` pattern rather than replacing it.

## Design principle: soft-everywhere

Every question the discourse argues about — timelines, takeoff speed,
alignment difficulty, whether Beijing would ever deal — is a **hidden random
variable sampled at game start**, not a plot decision. The player (and the
event copy) observes only noisy projections of these variables. Replays
differ in *what kind of world you're in*, not just event order. You cannot
metagame the timeline, and the dread survives repeated play.

## Design principle: two-track everywhere

Decided 2026-07-23, generalizing from capability: **truth advances on
one track; disclosure on another.** `C_internal` vs `C_released` vs
certified rung; incidents occurred vs detected; alignment evidence found
vs published; Beijing's position vs intelligence about it. Every gap is
somebody's alpha, every disclosure is somebody's choice, and the game's
epistemology is the systematic study of the lag. (`C[open]` is the
limiting case: single-track by construction — release *is* its mode of
existence.)

## Per-run hidden state (sampled at init)

| Variable | Range/shape | Prior (encodes the game's stance) |
|---|---|---|
| `alignTractability` τ | continuous 0–1 | Biased unfavorable: race-speed alignment works in a minority of worlds; pause-speed alignment works in most. The wager variable. |
| `takeoffSharpness` | slow ↔ fast continuum | Mass toward fast-ish; drives Act III tempo compression rate. |
| `chinaTrue` | {position, dealPossible} | Beijing's true distance behind, and whether a deal was ever possible — `dealPossible` rarely true; when true and discovered, the treaty branch is live. Safety culture is *not* sampled: anti-safety by construction. |
| `labSafetyCulture` (per lab) | continuous | Halcyon mid, wide variance; Polaris high; Tianxia low by construction (anti-safety, open-weights). |
| `scalingElasticity` | continuous; mass at healthy, real low tail | Replaces the `fizzleWorld` boolean (soft-everywhere, applied to ourselves): how far returns to scale carry this decade. Low draws degrade training returns and release cadence noisily — stalls and recoveries, tradeable all the way down — and only gradually confirm a plateau. The skeptics were right in the tail; the AGI trade unwinds. Kept as a *real* outcome for epistemic honesty. |

## World state (extends `world.*`) — latent truth and its projections

- **Capability `C[lab]` — two tracks** (decided 2026-07-23):
  `C_internal` (what the lab has) and `C_released` (what the world can
  touch). Both latent authoritative state, never directly observable;
  the world sees only projections (claimed rungs, certified rungs, `B`,
  release behavior). `C_internal` advances via compute accumulation,
  talent flow, and — past a threshold — the **recursion term**:
  `dC_int/dt` gains a component proportional to `C_internal` itself
  (the takeoff mechanic and the source of Act III tempo). **Releases
  are choices, not clockwork** (the `model_release` pulse machinery
  ports, generalized to all labs, as decisions): publishing pulls
  `C_released` up toward `C_internal` and pays revenue and prestige, at
  the price of heat, proliferation surface, and evidence handed to
  rivals and markets — withholding is also a move, and cadence
  arithmetic is the world's only read on the internal track. The
  internal−released gap is Fixedpoint's home; the market's whole
  epistemic problem is that `B` tracks `C_released` while the future is
  being decided by `C_internal`. `frontierLead` becomes derived (true
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
  insider tips.
- **Race temperature `heat`** — aggregate recklessness of the environment:
  export-control escalation, strait escalation (Taiwan is the physical
  layer's single point of failure — gray-zone incidents heat; a blockade
  is a superevent), treaty progress (cools), e/acc deregulation
  (heats), incident backlash (cools briefly, then fades), proliferation
  (every open-weights Tianxia release heats — permanently; weights don't
  un-release: mechanically `heat = transient + irreversibleFloor(proliferation)`,
  and only the transient part ever cools), lead size
  (a comfortable lead cools; a knife-edge heats). `S` is a stock of
  effective margin: racing burns it, and high heat suppresses its
  *accumulation* lab-by-lab — nobody banks margin they don't think they
  can afford.
- **Market belief `B`** — the market's posterior over the timeline, held
  as a curve (hazard over crossing dates), not a scalar; the displayed
  "implied timeline" is derived from it. Updates on
  *legible* events only (releases, earnings, incidents, Sharma columns) —
  never on hidden truth. *Available* alpha is generated by the true gap,
  but *playable* alpha ≈ f(player posterior − `B`) — true `C` never
  enters the interface; it only generates evidence and, eventually,
  settlement. `B` catching up to reality *is*
  alpha decay, mechanically.
- **Control regime `controlRegime`** — the state's grip on the
  frontier, an ordered enum: `private → supervised → mobilized →
  nationalized`. Transitions ratchet on detected incidents, heat,
  elections, and lobbying; each step reshapes release visibility
  (disclosure becomes classification), Consensus availability
  (contracts freeze or void — see
  [09-market-integrity.md](09-market-integrity.md)), HCN's very existence (delisting,
  conversion to a compensation claim — the nationalization trade), and
  the player's access (the Treasury backchannel matters more as the
  regime hardens). Mostly one-way. The satire register owns the
  transitions (the czar announces supervision; the mobilization memo is
  ghostwritten); the consequences play dead straight.
- **Firm belief `F`** — Meridian's institutional AGI-pilledness. Moves on
  the player's advice (a new interaction: memos/meetings with the CIO), and
  on the player's *track record* — being right early converts the firm.
  Divergence between the player's positioning and `F` drives the scrutiny
  loop (see [03-market-mechanics.md](03-market-mechanics.md)); high `F` +
  high credibility unlocks fund-as-actor moves.

## The incident generator (two-track)

Incidents are the main channel by which hidden state becomes visible —
and, decided 2026-07-23, **occurrence and detection are distinct
tracks**, mirroring capability. An incident *happens* on the latent
track; the world *learns of it* later, or never. Anatomy (per the July
2026 Hugging Face template):

```
occurrence ~ f(C_internal[lab], 1 − S[lab], heat, deploymentSurface)
anatomy    = capability × reduced-safeguard × mundane human error
detection  ~ f(severity, lab transparency, incident-reporting regime,
              media pressure, insider leaks) — a lag distribution
              with a never-detected tail
effects    = split by track:
  occurrence (silent): the physical damage — costs, dead capability,
              exfiltrated weights, S burned
  detection  (public): B jump, heat impulse (backlash), regulation
              triggers, faction shifts, post-mortem followup chains
```

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

Severity ladder: 0 embarrassing → 1 costly → 2 alarming (exfiltration-class)
→ 3 grave (casualties / infrastructure) → 4 unrecoverable (self-disclosing
by nature; this *is* an
ending trigger in worlds where τ is low and margin was gone). Low-severity
incidents are common and farce-flavored; the ladder is the dread mechanism —
the player learns the anatomy never changes, only the blast radius.
Incidents need not originate at the frontier: refusal-stripped fine-tunes
of open Tianxia weights supply the misuse wing of the ladder — same
anatomy, no lab to subpoena. And past a rung the **persuasion class**
joins the ladder (a9, 2026-07-23): a targeted campaign shaping `B`,
`F`, or faction standing is an incident *by construction on the latent
track* — occurrence is quiet, detection (a pattern in the prose, an
eval post-mortem, a Tan story) is the scandal, and severity is measured
in moved beliefs rather than broken systems.

## The evidence generator

The alignment-side twin of the incident ladder (adopted 2026-07-23):
technical evidence beats — eval anomalies, hidden-reasoning findings,
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

- **Probability** ~ f(lead gap, `heat`, victim's security posture):
  Beijing steals hardest exactly when falling behind matters most; a
  comfortable Tianxia doesn't need to.
- **Security level** is discrete per-lab state, SL1–SL4 (startup
  hygiene → hardened corporate → compartmentalized → state-grade), each
  step bought with money *and* research friction — a three-way budget
  knife-fight against capabilities and safety spend that the insider
  channel can see (the guards-vs-GPUs memo leaks). Theft hazard keys
  off level vs. attacker effort; level changes have observable tells
  (badge policies, a paper drought, the air-gap complaint). Auxiliary
  per-lab state beside `S`: the five dials are the player-facing
  summary, not an exhaustive state inventory.
- **Attribution is sampled noise.** Spies, or — in high-`C` worlds — the
  model itself; the public post-mortem rarely settles it, and the two
  readings price very differently.
- **Downstream:** permanent `heat` impulse; the "why slow down if it can
  be stolen" argument acquires teeth — post-theft, `S` spending drops
  race-wide (accumulation stops; the banked stock stays), because the
  margin rationale collapses when the lead does; a
  mobilization/nationalization push becomes live politics; and Russia
  exists in this game chiefly as the *second* buyer.

## Resolution

Terminal-state selection is one precedence ladder, checked continuously:
**(1)** a severity-4 incident resolves in place; **(2)** an implemented
treaty resolves as the Deal; **(3)** `max(C, C[open])` crossing the R5
threshold resolves as the race outcome below; **(4)** a confirmed
plateau resolves as the fizzle; **(5)** day-1008 timeout → epilogue
extrapolation: sample the remainder forward from standing state
(decided 2026-07-23; see [05-endings.md](05-endings.md)). For the race outcome:

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

Bounded influence (decided 2026-07-23): world and player contributions
to every terminal quantity are tracked separately, and the player's
delta is clipped to ≤ 30% of the total movement (margin-unit
decomposition in [02a-tuning.md](02a-tuning.md)) — independently
acting labs, governments, investors, and
publics carry the rest. A seat, not a steering wheel, enforced in
arithmetic.

Resolved 2026-07-23: proliferation is a **component of `heat`**, not a
sixth dial. Beijing is banking on open weights, so proliferation and the
race are the same phenomenon — every Tianxia release is simultaneously a
capability event and a diffusion event. Weight theft, stripped fine-tunes,
and misuse incidents all express as heat impulses with their own event
anatomy.
