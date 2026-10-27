# 02a — Tuning Appendix

Every constant and implementation ruling behind [02](02-race-model.md),
[03](03-market-mechanics.md), [04](04-arcs.md), [05](05-endings.md), and
[09](09-market-integrity.md). Code transcribes these values, and a retune
is a design decision recorded here first. The exception is a module that
names some magnitudes as tunable without a record here (the compute
curve's), and the section says so where it applies. The **target outcome
distribution** at the bottom is the tuning contract, and the
**knife-edge principle** is its guardrail.

The tuning objects are exported mutable for harness sweeps only:

| Object | File |
|---|---|
| `VELOCITY_TUNING` | `src/race/sampler.js` |
| `RACE_TUNING`, `RETUNE` | `src/race/race-state.js` |
| `THEFT_TUNING` | `src/race/capability.js` |
| `STRAIT_TUNING` | `src/race/strait.js` |
| `INCIDENT_TUNING` | `src/race/incidents.js` |
| `CONTROL_TUNING` | `src/race/control-regime.js` |
| `forecastTuning` | `src/race/belief.js` |
| `VALUATION_TUNING` | `src/race/valuation.js` |
| `COUPLING_TUNING` | `src/race/coupling.js` |
| `ROUNDS_TUNING` | `src/race/rounds.js` |
| `CLOSEOUT_TUNING` | `src/race/closeout.js` |
| `ACT3_TUNING` | `src/act3.js` |
| `STANDING_TUNING` | `src/standing-orders.js` |

A number called a **gate** is asserted by a harness at its default N. A
number called a **diagnostic** is printed but not asserted, and it moves
with retunes.

Units: trading days (game = days 0–1008, 16 substeps/day); capability in
rung units (R1 = 1 … R5 = 5); `S`, `heat`, τ, culture, pace in [0, 1].
All hazards are per trading day — per substep use
`p_sub = 1 − exp(−λ/16)`, never `λ` raw.

## Per-run sampler

| Variable | Distribution | Notes |
|---|---|---|
| τ `alignTractability` | Beta(2, 3) | mean 0.40 — race-speed alignment works in a minority of worlds |
| `takeoffSharpness` | Beta(3, 2) → mapped [0.5, 3.0]; `sharpnessNorm = (sharpness − 0.5)/2.5` | multiplier on recursion; mass toward fast |
| `scalingElasticity` | mixture: 12% Uniform[0.25, 0.6] (fizzle tail) + 88% Beta(5, 2) → mapped [0.6, 1.1] | overall median ≈ 0.95; the tail is a real 12% by construction |
| `chinaTrue.position` | Normal(0.8, 0.3) clamp [0.2, 1.6] | rung gap behind Halcyon at start |
| `chinaTrue.velocity` | LogNormal, median 0.95, σ 0.37, clamp [0.75, 1.325]; own substream `chinaVelocity` | hidden multiplier on Tianxia's deterministic capability drift — is Beijing slower, matched, or quietly faster. A fat upper *tail*, not a raised median, is what lets the fastest-Tianxia worlds cross in-horizon |
| `chinaTrue.dealPossible` | Bernoulli(0.15) | a treaty can hold only here |
| `labSafetyCulture` | Halcyon Normal(0.5, 0.2) clamp [0.1, 0.9]; Polaris Normal(0.8, 0.1) clamp [0, 1]; Tianxia = 0.15 fixed | anti-safety by construction |

Each subsystem draws from its own named substream (`deriveSeed(seed,
name)`), so same-seed trajectories stay stable as subsystems are added.

## Capability kinematics

Start: `C_int[halcyon]` = 1.75, `C_rel[halcyon]` = 1.55.
`C_int[tianxia]` = 1.75 − position, `C_rel[tianxia]` = `C_int[tianxia]`
− 0.1 (ships everything). `C[open]` = `C_rel[tianxia]` − 0.15. Polaris
spawns at `C_int[halcyon]` − 0.6. Clamps: `C ∈ [0.3, 5.5]`,
`C[open]` ≥ 0.3.

```
ignition  q(E) = smoothstep(0.60, 0.75, scalingElasticity)
base      μ_b  = g0 · compute(t)^0.5 · talent^0.3 · E
recursion μ_r  = r0 · sharpness · C_int · σ((C_int − 2.8)/0.35)
dC_int/dt = q·(μ_b + μ_r) + (1 − q)·μ_b·max(0, 1 − C_int/3.2)
          + 0.004·Normal(0,1)                (daily shock, not √day)
g0 = 0.000828/day      r0 = 0.000724/day
compute(t)^0.5 = sqrt(compute0) · growth^(t/504)
```

| Lab | compute0 | annual growth | talent | other drift terms |
|---|---|---|---|---|
| Halcyon | 1.0 | 2× | 1.0 | × player coupling (Player influence) |
| Tianxia | 0.75 | by `exportControlStage` 0–3: **[1.30, 1.20, 1.06, 0.90]** | 0.85 | × `chinaTrue.velocity`; + fast follower |
| Polaris | 0.25 | 2× | 1.1 | — |

- **Fast follower:** `dC_int[tianxia]/dt += k_f · max(0, C_rel[frontier]
  − C_int[tianxia])`, **k_f = 0.03**. Tianxia distills from the
  *released* frontier — public information, so hygiene holds inside the
  kinematics. It bounds the gap; it cannot make Tianxia lead (its target
  is structurally behind the frontier's internal track). Lead production
  comes from velocity and domestic drag.
- **Export controls** bind the compute leg only: entity lists trim the
  exponent, broad chip controls nearly flatten it, a full embargo sends it
  below 1 (clusters age out faster than gray-market replacement). The
  follower term is untouched — controls bind chips, never weights already
  released — and velocity still multiplies the slower drift, so controls
  slow even a faster-than-believed Tianxia without reversing distillation.
  The stage substitutes directly into the closed form, so raising it
  mid-run also revalues compute Tianxia already has: the drift *rate*
  drops discontinuously while `C` stays continuous. That is the intended
  physics (an embargo devalues the installed base — maintenance, spares,
  interconnect) and the only variant with exact stage-0 bit-identity.
  The stage is an orchestrator-passed input to `advanceRace`; absent means
  stage 0, so headless runs are the stage-0 calibration.
- **Domestic regulatory drag:** under `controlRegime == supervised`,
  Halcyon's and Polaris's drift takes `×(1 − δ_sup)`, **δ_sup = 0.09**;
  Tianxia is untouched. Mobilized and beyond impose no drag — the state is
  racing — but pin the domestic racing-pace floor at 0.7 (margin burns
  instead; see below). "Slowing down hands it to China" is a coupling, not
  a talking point: the worlds where the ratchet fired are the worlds where
  the gap closes.
- **`C[open]` can never be the crossing entity** under these kinematics:
  it sits at or below `C_rel[tianxia]` − 0.15, so family 4's
  proliferation variant is unreachable.

**Calibration statistic: unconditional first-passage medians** —
right-censored runs (no crossing by 1008) count, Kaplan–Meier style;
never medians conditional on crossing, which bias early. The ±10%
tolerance is a *design* band (how far the stance may drift), not a
sampling band; MC sampling SD at N=1000 is ~2–4 days. Gates
(`race-mc`): R2 230, R3 644, R4 800, R5 911, each ±10%, and a fizzle
tail of 12% (band 9–15%). The recursion
sigmoid's tail contributes from day one (σ(−3) ≈ 0.047, ~25% of base at
start); that is *in* the calibration, not a bug. Low-elasticity worlds
(q → 0) asymptote near C ≈ 3.2 — the plateau is a ceiling, not a slower
slope.

**Plateau confirmation** (resolution ladder step 3) requires ALL of:
recursion never ignited (`q < 0.01`, which holds for `E` below about
0.61), R5 never crossed,
**day ≥ 700**, and the leader's smoothed (shock-free expected-drift,
player coupling included) capability growth < 0.0002/day **sustained over
the trailing 180 trading days**. Reasons: an instantaneous reading is a
signal, never a confirmation — low-E runs sit under the threshold from
day 1, and a stall is indistinguishable from being early except in
hindsight; a raw trailing endpoint difference is noise-dominated (the
daily shock puts the estimator SD near 3.6e-4/day against a 2e-4
threshold); and a run that crossed R5 and then flatlined at the clamp is
family 1–4 business, not family 6. Most family-6 mass therefore arrives
through timeout extrapolation — in-horizon confirmations are the late,
demonstrably saturating tail.

**Polaris:** spawn day `round(Normal(400, 25))` clamped [300, 500];
starts SL2 with `S` = 0.70 and `C_rel` = `C_int` − 0.2. Calibration-
neutral — Halcyon leads regardless.

**Releases:** a lab releases when `C_int − C_rel` > appetite; appetite
0.25 (Halcyon), 0.15 (Tianxia), 0.45 (Polaris); +0.1 when heat > 0.55,
−0.1 when trailing the frontier by > 0.25 rung. A release pulls `C_rel`
up 85% of the gap. Per-lab release cooldown **45 trading days** (majors
ship no oftener than ~9 weeks); deliberately not 63, which pins the
release count at its ceiling so no proliferation-floor increment lands
mid-band.

**Certification lags** on a released-rung crossing: R2 Exp(25d); R3
Exp(60d), 40% disputed (+U(20, 40)d); R4 Exp(20d). R1 is trivial and R5
is resolution territory, so `CERT_RUNGS = [2, 3, 4]`. Certification is
**nested**: settling rung r settles all unresolved lower rungs the same
day and cancels their pending timers — a certified R4 entails a certified
R3. The ledger records implied-vs-direct settlement so Consensus can
distinguish them. Crossings are stamped `endDay = day + 1`.

## Safety margin, heat, theft

```
dS/dt = 0.0009·culture·(1 − 0.8·heat)                 (accumulation)
      − 0.0012·racingPace·clamp(S/S_taper, 0, 1)       (burn, tapering)
S0    = { halcyon 0.50, tianxia 0.43, polaris 0.70 at spawn, open 0 }
S_taper = 0.265

lead[lab]  = C_int[lab] − max(C_int[active rivals], C[open])    (signed)
closeness  = clamp(1 − lead/L_pace, 0, 1)
pressure   = clamp((heat − 0.30)/0.40, 0, 1)
racingPace = clamp(0.30 + (a_c·closeness + a_p·pressure)·(1 − culture), 0, 1)
a_c = 0.34   a_p = 0.12   L_pace = 0.6
domestic labs under mobilized+: racingPace ≥ 0.7
```

- **`(1 − culture)` is the stance in one term:** culture is how much a
  lab resists racing when the race gets close — Tianxia (0.15) responds
  almost fully, Halcyon (~0.5) halfway, Polaris (0.8) barely, which keeps
  Polaris the margin-carrier despite permanently saturated closeness. A
  big lead means baseline pace, `S` recovers, and family 1 lives exactly in
  runaway worlds (the lead-adjustment double count is the thesis, per 02).
  "Appetite pressure" is read as ambient heat, not release backlog.
- **Burn tapers as `S` falls** (all labs): margin is a practice level, not
  a fuel tank. Corner-cutting has diminishing room, `S` asymptotes above
  zero instead of hitting the rail, and the deep-failure tail of `d`
  compresses, so resolution concentrates at the threshold as the
  knife-edge principle demands.
- **Tianxia's margin is bought, not grown:** `S0[tianxia]` = 0.43 is also
  its floor — burn never takes it below its purchased base, and
  accumulation above it stays culture-tiny. Control is non-negotiable for
  that principal (an unaligned model threatens the Party first), so the
  control budget is not what gets cut under racing. Culture stays 0.15:
  no growth, no safety network, no generalization.
- **Post-theft:** `S` *accumulation* zeroes race-wide for 90 days; racing
  burn continues.

**Heat:** `heat = clamp(transient + floor + strait, 0, 1)`, starting
`transient = 0.15`, `floor = 0`. The floor ratchets:
`min(0.016·tianxiaReleases, 0.30)` for proliferation, plus +0.04 per
successful theft. The proliferation cap binds in a strict minority of
runs (gate: 35–55%, `race-mc`); a cap that bound in nearly every run
would be a ratchet that always binds. A blockade adds the reversible
`strait` overlay (0.20) while it lasts. The transient part moves only
through ledgered `raceEffects`; nothing else writes it, and nothing
decays it.

**Theft:** attempt hazard/day =
`0.0015 · clamp(0.10 + 1.4·desperation, 0, 1.5) · (1 + heat)` for the
wired dyad (Tianxia stealing from the leading domestic lab) — the 0.10
floor keeps parity-state espionage alive (stealing isn't only for the
desperate). Success by victim security level SL1–SL4:
[0.70, 0.45, 0.18, 0.04]; failed attempts cool down 60d; every lab starts
SL2, and nothing changes a level. Integration lag ε ~ U(0.15, 0.35).
Benchmark (SL2, heat ≈ 0.3): E[successes] ≈ 0.6 per run, the
calibration target rather than an invariant; at SL3 the same worlds give
about 0.24.

**Strategic desperation** — the one quantity behind both the theft and
blockade hazards:

```
vDeficit    = clamp((1.05 − chinaTrue.velocity) / 0.30, 0, 1)
runaway     = clamp((C_int[frontier] − C_int[tianxia] − 0.25) / 0.60, 0, 1)
desperation = max(vDeficit, runaway)
```

It reads what actually signifies Beijing losing in an
unconventionally-relevant way: a program genuinely slower than it needs
(their own hidden state, which they of course know), or the frontier's
internal track pulling away past the follow floor (≈ Halcyon's release
appetite, where distillation stops helping). The raw internal gap does
not work here: the fast follower bounds it near the release lag, so it
measures release-cycle phase, not strategic position. Both inputs are
physical-world reads, never market or quote reads.

## The strait

Gray-zone incidents ~ Poisson(1/90 per day)·(1 + heat)·tension —
public scares, narrative only. Blockade hazard:

```
h_block/day = BLOCKADE_BASE · (1 + heat) · (0.5 + 2.05·tension)
                            · (0.4 + 1.4·desperation)
BLOCKADE_BASE = 0.000052
tension = 0.6·clamp(−chinaRelations/3, 0, 1) + 0.4·clamp(tradeWarStage/4, 0, 1)
```

The incidence band is the design invariant and the base is derived from
it: cumulative per-run blockade ≈ 3% baseline, 12–15% hot or desperate
(gates, `plumbing-test`). Emergent and intended: blockades concentrate in
slow-velocity worlds, nearly disjoint from family 4, so the tail fires
in the timelines where China was losing.

A blockade: far compute curve +40–80% (near end half that), heat overlay
+0.20, and the mobilization gate opens. Duration ~ Exp(45d) clamped
[20, 120]: blockades **end** — flag, heat overlay, and compute force
majeure lift together. The mobilization gate, once opened, stays open for
the run (the political option space doesn't re-shrink). No gray-zone
escalation or new blockade rolls while a blockade is active. Tension is
one shared source (`straitTension` in strait.js), public facts only, read
identically by the blockade hazard and the compute curve. The strait is
race dynamics and steps inside `advanceRace`, drawing only from its own
substream; a blockade sets `taiwanBlockade` (Hsinchu — chips), never the
Gulf arc's `straitClosed` (Hormuz — oil), which must not touch the
compute curve.

## Incidents (two-track) and evidence

World occurrence process (per-lab hazards compose badly, so the *world*
rate is the primitive):

```
w_i      = exp(0.7·(C_int,i − 2)) · (1 − S_i) · (0.5 + heat) · surface_i
Λ_world  = min(0.30, 0.07 · Σ w_i)          (Poisson daily; source ∝ w_i)
surface  = { halcyon 1.0, tianxia 1.3, open 1.6, polaris 0.4 };  S_open = 0
```

About one occurrence per 13 days early, capped near one per 3.3 days
late (~80–160 detected per run). Severity: S0 0.55 / S1 0.25 / S2 0.15 /
S3 0.045 at mid-margin, renormalized after the S4 draw — **S4 is budgeted
separately as a late-tail event**, not a flat slice:

```
p4 = min(0.005, 0.0004 · ((1−S)/0.5)² · (heat/0.5)² · σ((C_int − 4)/0.25))
```

A flat 0.5% slice over the ~200 occurrences a run sees would end most
runs by S4 alone and eat the outcome table.

**Detection** — eventual probability / mean lag per severity: S0
0.70/Exp(10d); S1 0.78/Exp(8d); S2 0.86/Exp(6d); S3 0.94/Exp(3d); S4
1.00/immediate (same tick — self-disclosing is the point). Persuasion
class: 0.40/Exp(90d), unlocks at `C_int ≥ R3` and takes a **0.20 share**
of the class draw once unlocked. **Severity 4 is never persuasion-class**:
the absolute S4 self-disclosure rule dominates every reclassification.

**Reporting regime:** detection `min(1, p + 0.12)`, lags halved, and
activation applies **retroactively once** — pending latents re-roll
detectability and remaining lag under the improved parameters. The
disclosure wave when a reporting mandate lands is deliberate.

**Concealment — the gap hides its own incidents.** Each incident stamps a
lag multiplier at occurrence:

```
defend  = 1 + K · (C_rel,frontier − 3)⁺    (defenders license the released frontier)
conceal = 1 + K · (C_int,source  − 3)⁺     (the incident hides with what produced it)
lagMult = conceal / defend      K = INCIDENT_TUNING.CONCEAL_K = 1.0
meanLag = baseMeanLag · lagMult, then × 0.5 under reporting
```

Both sides of detection are automated, and they license different
models. `lagMult` is exactly 1 while both legs are ≤ R3 and when
`C_int,source` equals `C_rel,frontier`; > 1 when the source runs ahead of
the best *shipped* model anywhere; < 1 when it runs behind it. For the
frontier lab the Fixedpoint gap becomes, literally, the detection gap —
the incident ledger inherits `B`'s epistemic problem. A trailing lab with
its own gap closed under a higher released frontier sits below 1 (its
incidents meet monitors better than the model that produced them), and
open-weights misuse gets *easier* to detect late (single-track
`C[open]` against frontier-grade monitoring — no lab to hide it): the
denominator is the global released frontier by design.
`C_rel,frontier` = max `C_released` over active labs — not the internal
leader's own released track, not the open ecosystem (not a defender-side
licensor); `C_int,source` is the occurrence row's C (`C[open]` for open).
Interactions: S4 stays immediate (0 × anything); persuasion's 90d is
multiplied like any lag; the latent record carries `baseMeanLag` +
`lagMult` and the reporting regime recomputes strictly from that pair;
the leak floor still beats concealment (the human channel outruns the
machine's hiding — the verb's point); insider tips are untouched (the
source still knows). The reporting regime is the lobbyable world dial;
concealment stamps the record — two dials, never conflated. Should the
paired term over-hide, the reduced form is concealment only
(`defend ≡ 1`).

The multiplier costs no RNG draw, but it is not run-level bit-identity:
an affected incident leaves the detection-eligible set later or earlier
than its K=0 twin, so `streams.incidents` re-phases from there in either
direction (legitimate, like the leak coupling). What holds: per-tick
identity from a shared state; ledgers and RNG position identical through
the creation day of the first affected record; full identity before any
R3 crossing. Diagnostic (`race-mc`): occurrences after day 700 go
undetected about a third more often than earlier ones.

**Incidents have no occurrence-day physical effects:** the latent
record's field stays null. Giving them one needs a magnitude recorded
here first, and it must not double-count the calibrated `S` path.

**Register:** the generator's row stays ONE incident with ONE severity —
severity already carries blast radius, and a headcount field would be
truth-valued state the prose carries for free. From S2 up the prose
renders agent *populations*; S0/S1 keep the single-agent farce plus a
swarm variant or two. A scoped independent review (`incident_review_scoped`)
shows found-vs-published as the shape of the official record.

**Insider tips:** one Bernoulli(**0.3**) per incident not detected in its
occurrence tick, drawn at occurrence — "undetected" means not detected
that tick, independent of whether public detection ever comes; the
occurrence→disclosure window is the tip's whole point (gating on the
never-detected tail alone would starve it). **0.5** under `classified`,
switched at roll time with draw counts unchanged. The bridge fires
flagged occurrences as tips gated on `safetyNetworkTrust ≥ 20` (the
initial standing: the channel exists weakly from day one and deepens by
sitting), at most one per 45 days and one per day. Roughly 60
occurrences a run are flagged and 5–8 reach the desk: the channel is a
person, not a feed. `B` folds flagged occurrences into its alignment
sentiment at occurrence (a whisper; see "Belief"), so a tipped player's
edge is *the fact and its specificity, never exclusivity*; tip prose
says so. Tipped incidents can stay permanently undetected, and that
quiet-tape ambiguity is design.

**Tip verbs.** Only *leak* couples to the race, through the same
frozen/inactive gate as `raceEffects` (a leak after the terminal latch
does nothing mechanical):

- **Detection forcing:** the leaked incident becomes detectable
  unconditionally (overriding the never-detected tail is what the verb is
  for) with `meanLag = min(current, 4)` — a floor: a leak never slows a
  detection already coming faster. Already detected: no-op.
- **`B` fold, once per evidence ID:** the leak folds the incident's
  detection-class sentiment (−`ALIGN_INCIDENT`·(sev+1)) under the
  detection's own id `det_${id}`, cause `'player-leak'`, so the real
  detection's later fold is a no-op. For an incident that would detect
  anyway the total `B` move is identical leaked or unleaked — leaking buys
  timing and public pressure, never extra belief mass; for the
  never-detectable tail the fold is new mass by design.
- A leak adds detection-hazard draws downstream, so the post-leak
  realization legitimately diverges; the bit-identity invariant is the
  no-player run.

*Trade* and *sit* get no race coupling: the trade edge is the fact and its
timing on the chassis, and the outcome beat stays detection-agnostic. The
complicity ledger's `B` channel stays closed — a leak's net `B`
displacement is zero for would-detect incidents and designed for the
rest; whistleblower involvement reaches the endings through flags.

**Evidence beats:** per alignment-carrying lab ~Exp(40d), where
alignment-carrying = **Halcyon and Polaris** (Tianxia is anti-safety by
construction and produces only capability signals). Per-beat LR:
|log LR| ~ U(0, log 3), sign ~ Bernoulli(τ) (kind worlds read kind),
clipped to [⅓, 3], and **cumulative evidence log-odds clipped to
±log 19** — the posterior ceiling (0.95) is enforced at the accumulator,
so the clamp holds at any beat count. Publication probability = culture;
unpublished beats leak at 0.25. Diagnostic (`race-mc`): about 40 found
and 28 published per run. Evidence folds into `B`'s alignment sentiment
and has no player-facing beat of its own.

**Theft disclosure** (narrative + belief only; `commitTheft`'s occurrence
bundle — discontinuity, heat floor, 90d S freeze — is complete at
occurrence and untouched): eligibility **pDisclose 0.75**, decided at
commit (a quarter of thefts stay rumor forever); memoryless mean lag
**40d**, never same-tick; draws from `streams.theftDisclosure`, so race
trajectories are identical with the track on or off. Public attribution
is sampled **espionage 0.55 / insider 0.30 / the model itself 0.15**,
independent of the record's true attribution — public post-mortems rarely
settle it, and the dispute is the story. The thief field is truth and is
never surfaced; prose keeps the accused unnamed and direction-neutral.
The bridge fires disclosure shells off `tr.theftDisclosures` (never
`tr.thefts`); the frontier victim (highest public released-rung claim,
ties → earlier crossing) gets the superevent. `B` folds **−0.20** into
alignment sentiment once per disclosure (`theftdisc_` ids). Shell impulses: ordinary
{mu −0.02, xi 0.015, lambda 0.3}, frontier {mu −0.05, xi 0.04,
lambda 0.6}. Headline pools are keyed by public attribution, rotated by
deterministic per-(shell, attribution) counters, never an RNG draw; popup
`context` is not token-substituted and stays attribution-agnostic. No
tips on thefts, no treaty mutation, no followups on theft shells.

## Consensus binaries

`BINARY_NOTIONAL = 100` (mirrors bond face; per-unit prices share the
bond display scale). Listed contracts, each an oracle tuple per
[09](09-market-integrity.md) with `fallbackValue` 0.50:

| Contract | Deadline | Dispute deadline | Listing base rate | Settles on |
|---|---|---|---|---|
| R2 | 420 | 450 | 0.70 | certification |
| R3 | 756 | 786 | 0.62 | certification |
| R4 | 880 | 910 | 0.60 | certification |
| R5 | 1000 | 1008 | 0.70 | terminal resolution only |

Deadlines are calibrated against the measured *certified* KM medians so
each certifiable contract is genuinely two-sided. The listing base rate
is the contract's published prior, and it lives only in `consensus.js`.
It equals `B`'s day-0 quote, which is the same in every world because
every world opens with the released frontier at R1. It is re-derived at
each refit of the reader. Gates (`consensus-test`): each base rate within 0.03 of the mean
day-0 quote, and each listing mid within 8 points of its measured *YES*
frequency. The fallback branch is outside that comparison ("Belief, η,
and the firm": the settlement tree). No contract is degenerate.

Binary longs are cash-funded (no leverage); shorts post full-notional
collateral with the premium sequestered. Binaries carry no greeks, no
delta or gross-notional contribution, and no maintenance margin. A
certification contract that is not certified by its deadline settles
NO. R5 settles through terminal closeout: YES if the frontier's
internal R5 crossing falls on or before day 1000, extrapolation
included, and NO otherwise. Dispute boundary: a ruling is accepted
through the deadline day; the fallback fires only at
`day > disputeDeadline`, so call order never decides deadline-day
outcomes. The dispute lifecycle is harness-exercised; no event opens a
dispute, so in play the R3 certification dispute resolves upstream as
its disputed-lag draw.

## Compute futures

`COMPUTE_INDEX_BASE = 100` (the bond-face/binary-notional display scale);
rolling four-maturity quarterly ladder (63-day quarters, nothing past day
1008); Reg-T shorts with `COMPUTE_MAINTENANCE_MARGIN = 0.35`; fills are
spread-only (`COMPUTE_SPREAD_VOL = 3.0`, no impact pool —
allocation-quarter contracts don't trade through the equity impact book);
no greeks. Settlement is event-driven on race-day maturities, never
sim-day expiry.

Curve **structure** is fixed: demand uplift from public release count
+ certified rung + secular trend; scramble backwardation (near rich,
saturating far); a standing strait premium as a *pure tail* — zero at
spot, saturating with maturity — so geography is priced only where
geography bites. Curve **magnitudes** (demand coefficients, scramble
depth, standing-tail size, spread width) live in `compute-market.js` and
are tunable without a record here. Belief lift: the structural curve ×
`(1 + 0.15·P(R5 by day + 252))`, uniform across maturities (a deliberate
simplification).

Blockade: the far-curve band **[0.40, 0.80]** from the strait block; the
near end carries **half** the adjustment (`BLOCKADE_NEAR_FRAC = 0.5`) so a
contract settling *during* a blockade settles force-majeure-priced, never
at a pre-blockade free pass. Settlement precedence: decree (mobilized) ⊃
force majeure (blockade) ⊃ ordinary. Freeze is terminal: no listings
while frozen, and frozen marks hold at the captured decree/last-valid
mark, never repriced.

**`entryBasis` is a VWAP:** compute positions average their entry price
on same-direction extends, because formula-priced closeout pays off the
basis directly and only a VWAP conserves cash under multi-fill. Every
other position type keeps the chassis first-entry convention.

**Decree ≠ nationalization reference:** the compute decree closeout uses
the contract's *own listed multiplier* (= 1) over the formulas enumerated
at listing. The U[0.60, 1.15] conversion multiple and the 20-session
median belong solely to **HCN share conversion**, drawn once at race
creation from the `nationalization` substream (outside `race.streams`, so
race trajectories are identical with the market on or off). The two
multipliers never mix.

## The reader

A forecaster of the race, fit on the simulator's own runs and fed the
public record only. This is amortized simulation-based inference, a
standard technique. `B`, the valuation layer and every gate on what is
knowable are built on it. Ratified 2026-10-25 (ROADMAP §1).

**The public record** (`src/race/public-record.js`) is the data contract.
It is a per-run accumulator, initialized from the race's public state at
creation (initial claims are not in any day's transitions) and stepped
once per completed day. Each step runs after `stepControlRegime` and
`stepTreaty`, reads `race.lastTransitions` and `buildPublicView`, and
ignores a same-day replay. It also takes the day's public world inputs
from the orchestrator. Its contents are what the Brief prints:

- the clock;
- per frontier lab: whether it is active, and Polaris's spawn day; the
  first day each rung was claimed (released) and each certification day;
  the release count and recent release days;
- the open ecosystem's rung, and the released and certified frontier
  rungs;
- detected incidents by severity, source lab and class, with their
  detection lags, as totals and as a trailing 126-day count. Under
  `classified`, read at the day's close after the ratchet, a detection of
  severity ≤ 3 enters only as a classified brief, flagged grave at
  severity 3, as the wire shows it;
- disclosed thefts (count and last day);
- the strait: gray-zone scares, and a blockade's start and end;
- the control regime and the day it last moved;
- the treaty track's public beats (the window opening, the outcome);
- the public world inputs: strait tension, the export-control stage and
  the treaty stage (0 headless).

Nothing else enters. That rules out continuous capability, latent
queues, τ, `S`, heat, truth records and insider tips (a tip is the
player's channel, not the record). It also rules out published and
leaked evidence: no wire item prints it, and the record holds only what
the player can read. The evidence archive (section 2 of the roadmap) may
put it on the page, and a refit follows. The player's own leak stays out
of the record this round; dissemination is section 2's.

**Feature sets.** One function (`recordFeatures`), shared by the fit tool
and the live game, builds:

- **legible**: the market's rule of thumb, `B`'s heuristic updater
  ("Belief, η, and the firm"), as it reads the headlines. For a rung,
  this is the rule's own crossing law, plus the clock and the rung's claim
  state (claimed or not; for R5, R4's, since R5 is never claimed before
  the world resolves), and nothing else. Claim *age* is not in it. For
  the family head, it is the old valuation rule's inputs: the rule's R5
  law, each lab's claimed rung and the clock.
- **full**: everything legible, plus the whole record, claim ages
  included.
- **prior-only**: the clock and the rung, for the learning floor.

legible ⊂ full, so the information is nested. Each head has one explicit
feature list, exported with the constants. Every evaluator, gate and
fairness test of a reader uses that reader's list and nothing else.

**Outputs**, per feature set:

- For each open rung, a law over the days its event can still occur,
  plus an atom at the support's boundary. `T` is the frontier
  certification day for R2–R4 (any frontier lab, direct or implied),
  with support through day 1008. There the atom means *never*: no
  certification happens after day 1008. For R5, `T` is the frontier's
  internal crossing day, extrapolation included as the R5 contract
  settles, with support through day 1260 so the compute market's
  252-day horizon is covered. The R5 atom means *not by day 1260*. It
  includes crossings later in the extrapolation, and it is not "never".
  Event likelihoods are integer-day interval masses, and the atom is the
  survival remaining at the boundary. A world that resolves naturally
  before the event can no longer reach it. Resolution is a competing
  event: such a world stays in the risk set and lands in the atom. It is
  never treated as independent censoring. Labels come from natural
  resolution only. Desk ejection exists only in live play, where the
  world continues headless.
- **The legible rung heads are the rule, rescaled** (a9's ruling,
  2026-10-25: the crude rule). They are the rule's own cumulative hazard,
  `H_rule(t, D) = −ln(1 − P_rule(T ≤ D | T > t))`, cut at the support and
  floored to stay finite, passed through the calibration stage below.
  The rule's reading of a world enters only through `H_rule`. So the head
  is calibrated in the large, by day, by claim state and at every horizon
  that prices something. That leaves no static or calendar exploit, and
  it keeps the rule's misreading within a day, which is the designed
  inefficiency.
- The full and prior-only rung heads are a piecewise-exponential hazard
  in residual time `s = T − t`
  over fixed bins (0–21, 21–63, 63–126, 126–252, 252–504 and 504 days or
  more, cut at the support). Each bin's log hazard is linear in the
  head's standardized features, with its own intercept. Each rung has its
  own weights, and so does each claim state (claimed or not; for R5,
  R4's). The two states are separate sub-models with their own λ,
  because before a claim the wait depends on hidden capability and
  after it the wait is a competing-timer lag. A shared fit lets the much
  larger pre-claim population set the post-claim slopes. The features are a
  fixed basis over the head's information. It holds transforms (the
  rule's probabilities enter as its log cumulative hazards,
  `ln(−ln(1 − p))`), hinge terms with knots at training quantiles, a
  piecewise-linear clock with a knot at every lock day (before a claim
  the hazard turns sharply with time, and three quantile knots cannot
  follow it). The prior-only head gets the same clock basis, so the
  learning floor compares like with like. The basis is written into the
  constants. The legible and full readers'
  bases are not nested, but their information is: `H_rule` is a function
  of the rule's state, which the full set sees. Certification after a
  claim is a competing-timer process: exponential lags, the minimum
  across labs, R3's dispute mixture, implied certification from a higher
  rung. Coarse constant-hazard bins approximate these mechanisms; they do
  not represent them exactly.
  `P(T ≤ t + s | record_t)` is closed-form, and the quarter's probability
  is its value at s = 63: the law is already conditional on the record at
  t, so nothing is conditioned twice.
- **The calibration stage** ends every rung head: legible, full and
  prior-only. It rescales the head's cumulative hazard on nested
  **horizon segments**, with one scale per segment. The boundaries are
  the scored quarter's end `t + 63`, the rung's contract deadline `D_R`
  (420, 756, 880, 1000) while it is ahead, and the support's end. Sorted,
  they cut `(t, support]` into two or three segments. On each segment `k`
  the head's own hazard increment is multiplied by `exp(σ_k)`, so the law
  stays continuous and monotone in D and keeps the head's shape within
  a segment.

  The scales `exp(σ)` are piecewise linear in the clock, with a **knot
  every 21 days** (the sampling grid), per rung, claim state (R5 on R4's) and
  head. They are set by **moment matching** at each knot. On the training
  worlds sampled that day in that state, the mean predicted probability
  equals the observed rate at each segment boundary in turn:
  - the quarter;
  - the deadline, the price that trades;
  - the support, which pilledness, compute urgency and the plateau read.

  The horizons are nested, so the observed rates are ordered and each
  scale solves a one-dimensional monotone equation, given the ones
  before it. A segment whose cell has fewer than five events *within the
  segment*, or fewer than five worlds surviving it, would solve to a
  near-certain or empty law. Its scale instead holds the nearest valid
  knot's value, as does every scale at a knot whose cell has too few
  worlds. Knots are added on each rung's crossing day `D_R − 63` and on `D_R`
  itself, so no interpolation spans a change in a segment's role. A
  segment that disappears at a role knot keeps a separate limit on each
  side. The days before the knot interpolate toward its last
  pre-crossing value, never toward a scale borrowed from after it. The
  prior-only head's stage pools the claim states, because that head
  sees only the clock and the rung.

  Earlier forms failed in ways this one avoids:
  - Likelihood fits traded the horizons off, leaving lock days five to
    eight points out.
  - A rescale with an exponent, `exp(α)·H^β`, matched any two horizons
    but not three. Codex proved that three moments are infeasible for it
    once the quarter crosses the deadline.
  - Knots on lock days alone left the deadline quote unconstrained over
    each contract's last 63 days, and 5 to 25 points rich there. "Short
    every binary in its last six weeks" would have paid in every run.
  - The full heads' earlier `a·H^b` layer, fit on quarter events,
    missed the deadline by up to 10 points on some lock days.
- The family distribution `p₁ … p₆`: a linear softmax, with a separate
  head for each act (the released frontier: R2 or below, R3, R4 and
  above). A single head over the whole run cannot carry how much more
  determined the outcome is late, and its increments were predictable
  from its own inputs.

**The fit.** `tools/reader-fit.mjs` simulates headless no-player runs with
`endings-test`'s loop: `advanceRace`, `stepControlRegime`, `stepTreaty`,
`checkResolution`, with the heuristic `B` stepped alongside. Seeds are
split by world:

| Split | Seeds | Use |
|---|---|---|
| train | 1,000,001–1,008,000 | the fit |
| validation | 2,000,001–2,002,000 | the bands, φ and `K_CRED` |
| test | the harnesses' (base 1) | the gates |

Half the training worlds run neutral (no strait tension, stage 0, treaty
stage 0). The other half run under a declared **assumed input schedule**:
strait tension, the export-control stage and the treaty stage each step
as a slow Markov process over their public ranges. The fit tool states
the schedule.

Each run is sampled every 21 days from day 0 while it is unresolved,
and again every 21 days from its own offset (the seed mod 21), before
any extrapolation mutates the race. Early releases fall on nearly the
same calendar in every world (on days 1, 46 and 91 in nine worlds in
ten), and the treaty window opens on day 700 in a third of worlds, so a
fixed grid would never train on those phases. The hazard heads train on
both series, and the calibration stage matches on the grid series. Every
hazard and family head is fit by maximum likelihood with an L2 penalty
and a deterministic optimizer: SciPy's L-BFGS-B on one BLAS thread,
through `tools/reader-optimizer.py`. The calibration stage is then solved
by moment matching. NumPy
and SciPy come from the shared venv's `data` column and are needed only
to refit. Every head must converge; none may stop on its iteration
budget. The fit then writes `src/race/reader-constants.js`, which is
generated and never hand-edited. That file is compact and holds only
what evaluation needs: the record's schema version, the input schedule,
the basis and its knots, the feature standardization and the weights.
A compact validation report goes beside the tool, in
`tools/reader-fit-report.json`: what `reader-test` reads, plus a summary.
The full detail goes to `tools/reader-fit-detail.json`, which git
ignores. The same code always writes the same file; a cold refit takes
about 18 minutes, and a rebuild that reuses the converged hazard heads
takes under one. The game and the harnesses only evaluate it; nothing is
fit at runtime.

**Refit rule.** The reader is refit whenever a change moves the
distribution of runs or the record's contents. That includes kinematics,
incidents, certification, the regime ratchet, the treaty track, new
record fields (domains, the evidence archive), dissemination,
intervention-bounded influence, and the replayable headless runs of
section 3, which replace the assumed input schedule with the event
engine's own. A schema mismatch fails `reader-test` outright; a stale fit
fails its calibration gates. Player inputs are not among these: the
headless worlds the reader is fit on take none, so the opening hand
needs no refit ("The evening").

**Known limits.** Within a lock day, the reader misreads some pre-claim
cohorts. The clearest case is legible R2 before its claim at days
315–378: worlds the head puts at 0.25–0.35 certify within the quarter at
0.35–0.69, and at day 252 the same predictions run high. The full heads
show smaller misses of the same kind. Each day's mean is right. The
basis was tried up to clock × rule interactions without closing the
gap, because a linear basis cannot carry how the rule's pre-claim state,
a proxy for release history, changes meaning over time. In the legible
half this is part of the rule's crudeness, and so part of the edge. In
the full half it means the measuring stick understates what a richer
reader would find. The calibration stage fixes the calendar and the
priced horizons; it cannot fix misreadings within a day. Nor can it fix
the full heads off the sampling grid early in a run. Releases land in
lockstep on days 1, 46 and 91, and a linear clock basis cannot carry a
one-day spike, so full deadline quotes miss by up to eight points on
those days (R4 at day 1: +0.085). Through those weeks the released
frontier is R1 in nearly every world, η is 0, and `B` is its legible
half, which is calibrated there. A nonlinear model class (boosted trees over the same
features) is the next step if a later round needs a tighter stick. The
assumed input schedule is not the event engine's,
and the player's channels are absent from training, so live worlds sit
off the training distribution by an amount nothing measures yet. The
reader is linear in its features. It is a measuring stick, not a bound
on what a richer reader could learn. The ceiling gates are measured
against it, and passing them does not establish when a world becomes
inferentially determined.

Gates (`reader-test`, test seeds, reported separately for neutral worlds
and for each scenario of the input schedule, never averaged together):

- **Calibration.** On quarter events (rung R certifies within the next
  63 days) and live deadline events, at the sampled days, per rung and
  for the legible and full sets,
  with tolerances that are the larger of the stated number and two
  world-bootstrap standard errors:
  - in the large, within 0.01;
  - **by day** (no calendar exploit), at every 21-day sampled day
    holding at least 200 samples, both on the quarter and on the live
    deadline, the price that trades: within 0.03. Here the noise term is
    three standard errors, not two: some 700 day cells are checked, and
    at two standard errors about one in twenty would fail by chance. The
    standard error is the combination, √(SE_test² + SE_train²). Each knot
    is matched to a finite training cell, so the prediction carries that
    cell's sampling error as well as the test cell's;
  - **off the grid**: the offset-sampled days, pooled per 21-day window
    between knots, on the same terms, for the legible heads. Live quotes
    are evaluated daily. The full heads' windows are reported, not
    gated (Known limits);
  - **by day and claim state**, the cells the stage is matched on,
    holding at least 200 distinct worlds: on the same terms. The pooled
    legible cells run each seed under both scenarios, so samples double
    count worlds;
  - **at the support**, in the large, within 0.01;
  - **by claim state**, within 0.02 for claimed and for unclaimed rungs;
  - **across predicted deciles**, the n-weighted mean absolute error
    within 0.013 (set on validation), for the full heads. For the legible
    heads it is reported, not gated: their misreading within a day is
    the designed inefficiency.

  Family: each class's mean predicted share within 0.02 of its
  frequency, over all acts. Each act's head is reported separately, not
  gated. Bootstrap intervals are taken by world, because snapshots
  of one world are not independent. The worst single decile is reported,
  not gated (see Known limits).

  The legible heads cannot see the world inputs, which are not part of
  the rule's state, so they cannot tell a neutral world from a scheduled
  one. They are gated on the training mixture, both scenarios pooled,
  with each scenario reported. The full heads see the inputs and are
  gated per scenario.
- **The learning floor.** The full reader's mean log loss on
  rung-quarter events sits at least φ = 0.221 below the prior-only
  reader's (set on validation worlds; the fit reprints its current
  suggestion beside it).
- **Purity.** A record rebuilt from the logged public projection alone
  evaluates bit-identically to the live one. That projection is the
  ledger's public rows, the public snapshots and the inputs: the rows
  alone do not carry Polaris's initial claims or the open ecosystem's
  rung. Corrupting every hidden field leaves the record unchanged. That
  includes the hidden fields that public ledger rows carry (a theft's
  true thief, a release's continuous capability, an incident's insider
  flag), so a row that stopped whitelisting would fail the check.
- **Challengers.** On world-split halves of the test seeds, two richer
  readers are fit to the full reader's residuals: claim-age splines and
  nearest neighbours. Neither improves held-out rung-quarter log loss by
  more than 0.001 nats per event (set on validation). Planted defects
  show they can fail: each must catch, by more than that bound, a full
  head degraded to the legible one, a doubled odds and a planted
  claim-age term. A pairwise-products challenger was dropped, because it
  overfits by more than the defects it should catch. Each challenger's
  subgroup residual bias (by act, rung, claim state and regime) is
  reported.

The edge and its decay are gated under `B`, below.

Diagnostic: the knife-edge principle's act-boundary target (no family's
posterior over 0.60, none reachable under 0.02), read off the full
reader's family head.

## Belief, η, and the firm

**η reads the released frontier:**
`η = clamp((releasedFrontierRung − 1)/4, 0, 1)`. The licensing rationale
("quant shops license the models too") only reaches shipped models, and a
public-state η keeps the corruption-invariance harness meaningful. Latent
`C_internal` never touches market efficiency; it acts only through
evidence. Every quoter receives only the public view (`buildPublicView`:
day, rung claims, certifications, public releases, `controlRegime`) —
never continuous C, latents, or τ — and the harnesses corrupt every hidden
field and assert that quotes and settlements do not move.

**`B` is a designed inefficiency.** It pools two forecasts. One is the
market's rule of thumb, recalibrated. The other is the full reader ("The
reader", above).

**The rule of thumb** is the heuristic updater that was all of `B` before
the reader. It keeps its mechanics: a per-rung logistic `{m, w}` over
crossing dates, widths at listing `w = {90, 140, 120, 160}` for R2–R5,
and `RUNG_SPACING = 150` days for rungs pulled forward by a certification
below them. Medians are seeded so that day-0 `F_R(deadline)` equals the
rule's seed priors `{0.70, 0.62, 0.60, 0.70}` (`RUNG_SEED`, the old
listing base rates), solved against the survival-conditioned law. Widths
**tighten with evidence**: `w ← w·(1 − 0.15·α)` on each timeline update,
floor 25.

The timeline moves only on releases and certifications. A claim blends
at `A_CLAIM = 0.55`. A certification marks its rung crossed and pulls the
next rung toward `day + 150` at `A_CERT_NEXT = 0.35`. A routine release
nudges at `A_ROUTINE = 0.06`. Monotone `m` is re-enforced each step.
Every `m`/`w`/monotonicity mutation is ledgered under its originating
event ID, and the harness reconstructs the rule's state from that ledger
alone.

The rule runs early, and it reads the headlines crudely. That is the
point: it is the inefficiency. Its raw probabilities reach nothing priced.

**The legible reader** recalibrates the rule, and only by day and claim
state ("The reader": the legible rung heads are the rule, rescaled). It
is calibrated in the large, per lock day and per claim state, and is
otherwise as crude as the rule. The full reader reads the whole record.

**The pool.** For each rung, every probability a quote, a snapshot or a
display reads is

```
P_B(T ≤ D | record_t) = (1 − η)·P_legible + η·P_full
```

with η the released-frontier dial above. In the fiction, the full
reader's share is the part of the market that runs licensed models, so η
is literal. The pooled CDFs are then made coherent across the ladder:
`P_B(R4 ≤ D) ≤ P_B(R3 ≤ D) ≤ P_B(R2 ≤ D)` pointwise, by taking running
minima up the ladder, because certification is nested.

**What the pool guarantees, and what it doesn't.** With exact conditional
readers on nested information, no forecast measurable on the legible
information beats the *unprojected* pool in expected log score. That
holds for any state-dependent weight in [0, 1]. The pool lies between
the two readers, and moving from the legible reader toward the full one
never raises the expected loss. Clamping preserves this only against
forecasts clamped the same way. The coherence projection breaks the
statement wherever it binds. There, a projected rung's quote can leave
the interval between its two readers, because a lower rung's estimate
was too low. The fitted readers are approximations as well. So the
guarantee is empirical: every gate below runs on the projected output
the market actually quotes, and the projection's frequency and size are
reported.

Two strategies are explicit baselines, not exploits the construction
rules out:

- **Headline-plus-quote.** A player who knew `P_legible` could read
  `P_full = (P_B − (1 − η)·P_legible)/η` off the quote wherever η > 0 and
  the coherence projection does not bind. That is reading the market,
  and it is synthesis.
- **The settlement tree.** Quotes price the *event*. Fallback settlement
  at 0.50 under `nationalized` or `classified`, and on an unresolved
  dispute, is institutional mispricing the market leaves in place, and
  it is excluded from the no-exploit claim.

**The close.** The target is for the edge on a rung to be widest before
the claim that reveals it, and mostly gone after. At the claim, both
readers update on a headline, and η steps up with the released frontier
on the same day. To be paid you act before the claim, and unwinding
after it realizes the market's new price. That is a target the gate
below measures, not a consequence of the construction. There is no
gradual reveal term: a known delayed correction would itself be a
momentum trade. R5 is never claimed; its edge narrows only through η.

`B` stays a function of the public record, the rule's ledgered state and
the day. It has no noise, and the `belief` substream stays reserved.

The **alignment sentiment** is unchanged and still unpriced. Published
evidence adds its `logLR`; a detected incident subtracts
`0.06·(severity + 1)`; leaks blend `0.7·B + 0.3·L(leakedSignal)`, once per
evidence ID; a theft disclosure subtracts 0.20; the clamp is ±log 19.
Leaks update by evidence, never by interpolating toward truth. The
player's leak verb folds there, under the detection's id. No quote,
valuation or display reads it.

**Displays.** The Markets page draws `B`'s pooled crossing curve, and the
Race page its daily mass on each rung. Its
implied date is the pooled conditional median, or "not this term" when
less than half the mass lands within the support. The posterior editor
starts from `B`'s **projection** onto the player's family (below): a
deterministic least-squares fit to the pooled conditional CDF at days
`t + 21k`, within the support. The projection is only a starting point
for drawing. Following the market is a policy, not a drawing.

**The edge, gated** (`reader-test`, test seeds). These gates are
provisional: their bands are chosen on validation worlds once the
ratified hazard family is fit, because a multi-horizon recalibration can
close more of the gap than the quarter-only probe did, and the numbers
are recorded here then. An eligible rung-quarter is a rung in R2–R4
uncertified at a lock day. Its edge is the log loss of `B`'s projected
snapshot minus the full reader's. The act is the released frontier at the
lock: R2 or below, R3, or R4 and above. Per event the edge can peak in
Act II, where certifications cluster. The per-run **opportunity**, the
sum of the edge over a world's eligible rung-quarters in the act averaged
over worlds, is front-loaded, because Act I holds most of the quarters.
The edge shrinks faster than `1 − η`: near agreement, a log-score
advantage is about quadratic in the gap.

- Front-loaded: per-run opportunity in Act I ≥ Act II ≥ Act III.
- Bands: Acts I and II, opportunity and per-event edge, each within
  ±max(30%, 0.005 nats) of its validation value. Those values are about
  0.71 nats per run (Act I) and 0.18 (Act II) of opportunity, and 0.023
  and 0.06 nats per event. Act III holds too few
  open rung-quarters for a band, so it is bounded absolutely instead:
  |opportunity| ≤ 0.02 nats per run.
- Big enough to act on: a reader-copier, scoring the full reader's
  quarter probabilities against `B`'s snapshot every quarter, clears the
  memo gate by day 882 in at least half of worlds at the calibrated
  `K_CRED`.
- Closes decisively: on each rung, the mean edge per rung-quarter over
  quarters locked while the rung is claimed but uncertified is at most a
  third of the mean over quarters locked while it is unclaimed, or 0.005
  nats, whichever is larger. Both are
  states at the lock. A window defined by when the claim later lands
  would condition on the future, and a sharper reader loses there by
  construction.
- No static preset pays: locking *earlier*, *later* or the market's
  projection every quarter earns mean skill ≤ +0.05 nats per run, and
  clears the memo gate in ≤ 10% of worlds (the calibration targets
  under the posterior).

Diagnostics: the headline-plus-quote baseline (a recalibration on `B`'s
own quote, the clock and the claim state), its edge per act, and the
fallback-tree mispricing per contract. Also the coherence projection's
binding frequency and size, and an inversion baseline restricted to
coordinates where the projection does not bind.

**Event impulses** are a decaying overlay on the sim parameters
(half-life 5 trading days), carried as `impulse: {…}` on race shells and
dispatched inside `_fireEvent` on every path. Bridge-fired impulses are
scaled by `(1 − 0.6·η)`, so the market's reaction to a race headline
damps as the released frontier rises. η's other consumers are the pools
in `B` and `V`. Signs
are binding; per-shell magnitudes live on the
shells and are tunable. Overlays are removed before day-complete
processing, so events mutate baseline parameters and day-complete
valuations never price through a transient overlay; permanent additive
deltas on the race stream remain forbidden ([03](03-market-mechanics.md)).

**The posterior.** The player holds, for each tracked rung R2–R5, a
logistic law with a plateau over the *certified* crossing day (R5: the
terminal crossing):

```
F(x) = (1 − q)·σ((x − m)/w)
```

`m` is the median *given that the rung ever certifies*, and `q` is the
mass on never. "Not this term" is larger: `q` plus the logistic's tail
past day 1008, since nothing certifies after the term. Bounds:
`w ∈ [25, 400]`, `m ∈ [0, 2016]`, `q ∈ [0, 0.95]`. Medians and plateaus
are monotone over the carried certification rungs (`m₂ ≤ m₃ ≤ m₄`,
`q₂ ≤ q₃ ≤ q₄`; the standing policy below says which rungs carry), and
dragging one pushes its carried neighbours. R5 is not
ordered against them: an internal R5 crossing can end a world before R4
certifies. A certified rung is frozen at its certification day. The
player edits a standing **draft** at any time on the Race page (moved
from the Markets page's Consensus panel by a9's ruling, 2026-10-26):
median, width, and plateau, with the same keys. The plateau handle edits the conditional
curve's height at the term's end, `1 − S(1008)/S(t)`, the chance of a
crossing this term given none yet, and `q` follows from it given `m` and
`w`. Day 0's draft follows the market on every rung.

**The standing policy** (ratified 2026-10-27, ROADMAP §1; replaces the
quarterly lock dispatch). The forecast is a policy the player sets per
rung, and the desk snapshots it each quarter without asking. Each rung
R2–R5 either **follows the market** or **carries** the player's curve,
and every rung starts following. The draft is three things kept apart:
the per-rung policy, the carried curves, and the **effective** curves,
where a followed rung's effective curve is `B`'s projection, live, and a
carried rung's is its carried curve. The editor draws the effective
curves, so a followed rung shows only `B`; ink appears only where the
player has stated something.

- **An edit carries.** An edit on a followed rung (a drag, a key, the
  plateau handle) first copies the projection into its carried curve,
  clamps that copy's median and plateau between its carried neighbours'
  (moving no neighbour), and sets it carrying; then it applies the
  change. Without the clamp, a width key on a rung whose projection
  crosses a carried neighbour would carry a set that fails validation.
  *Follow the market*, on the focused rung or on every rung at once,
  sets rungs back to following.
- **Order holds among carried rungs only.** Medians and plateaus stay
  monotone over the carried, uncertified rungs of R2–R4, and an edit
  restores that order by pushing carried neighbours, as a median or
  plateau drag does today. A width edit moves no neighbour. An edit
  cannot place a median before the latest certification day (the
  editor's floor, as today); that limits edits and never moves a curve.
  `_orderCurves` stays for `B`'s projection, apart from the carried
  ordering. Followed
  rungs are never pushed and never pushed against, so a followed rung's
  effective curve may cross a carried one. Each rung is scored on its
  own, so the crossing costs nothing but coherence, and the player can
  see it.
- **Certification freezes one rung and moves nothing else.** The
  certified rung's curve becomes its certification day; carried curves
  stay where the player left them, and survival conditioning handles a
  median that is now in the past.
- **Validation** checks every rung's bounds and the order among carried
  uncertified rungs only.

**Locks** stay quarterly: days 0, 63, 126, …, on-grid, immutable, with
idempotent replay only. Every snapshot is taken at the start of the
close that ends the lock day's edition (the top of `_onDayComplete`,
after its game-over guard, which `frame`, `step` and the popup barrier's
drain all reach), before the race steps, while
`race.day` and `belief.day` still equal the lock day: `B` and the record
are the lock day's, and nothing from later reaches it. The closing
quarter is scored one close earlier, in the lock-day block of the close
that brings `race.day` to the lock day, where `F`, scrutiny and the firm
conversion also read the closing quarter's lock, as they do today. The
player reads the quarter's close in the lock day's edition and has that
whole edition to revise. Day 0's snapshot is the close of Edition 1, two
seconds in at the default speed, so under the default policy the first
quarter follows and scores exactly 0. A run that resolves or ejects
before a lock day's snapshot takes no snapshot: no lock opens a quarter
the run never trades, and none is ever taken on day 1008. A revision
during a quarter reaches only later snapshots. The reader-copier's
record (below, "The evening") snapshots at the same boundary.

A lock classifies each rung once, and every consumer reads that
classification: **followed** if its policy followed or its carried curve
is bit-equal to today's projection (an untouched drawing is the market's
call), **carried** otherwise. The standing policy itself is left as set.
A lock stores, for every rung it will score, the quarter's probability
from each side: `p_P` from the player's law and `p_M` from `B` at the
lock. A followed rung stores `p_P ≡ p_M` and scores exactly 0, and its
claim reads `B`'s quote at the lock. A lock whose every rung is followed
is a **market-policy** lock. The lock also stores the effective curves
and `B`'s projection for display. `scoreQuarter` reads the stored pair
and never re-evaluates `B`.

Nothing raises a forecast dispatch, and nothing holds a day for the
forecast. Revising is drawing, so ROADMAP §1's revision dispatch is
superseded; a dispatch comes only from an authored decision.

**A quarter's close is one line in the Brief.** When the closing quarter
scored a carried rung, the lock day's edition carries one desk item on
the wire: the quarter's increment and the record, in nats against
Consensus. A quarter whose every rung was followed prints nothing, since
it scored exactly 0.

**What follows states nothing.** A followed R4 is no stated posterior,
so `playerPilled` is null when the lock reads R4 as followed. Each
consumer handles null explicitly:

- The scrutiny loop skips the quarter. The market-policy lock used to
  read `marketPilled` here, and the gap is measured against `F`, which
  wakes slowly; copying the market drew the committee's heat (a seed-1
  probe: `marketPilled` 59.2 against `F` 17.0 at day 630, a gap of 42).
- Firm conversion uses `marketPilled`: a credible desk that agrees with
  the market on R4 pulls the firm toward the market.
- The belief-keyed convictions (`agi_pilled`, `doomer`) don't fire.
  Convictions already earned stay.

`hasEverLocked` becomes `hasStatedForecast`: some lock has carried some
rung. It gates the `F` advice row.

Gates (`belief-test`, `forecast-test`):

- A snapshot matches its declared policy exactly: a followed rung stores
  `p_P ≡ p_M`, and a carried rung stores its carried curve bit-for-bit.
- A draft change after a snapshot leaves the stored lock unchanged and
  reaches only the next one.
- Mixed policies: a followed rung's moves never move a carried rung, a
  certification moves no carried rung, and validation accepts a crossing
  between a followed and a carried rung.
- A player who never draws: every lock follows on every rung, `S_P` and
  σ₀ are exactly 0 for the whole run, and there is no scrutiny trigger,
  belief-keyed conviction or `F` advice row.
- No lock is taken after the run ends or on day 1008. A run that ends
  mid-edition takes no snapshot; a snapshot held behind the popup
  barrier is still taken at that close's start, with the lock day's
  state; and the trait evaluation later in the same close sees the new
  lock.

The old assertions that a market-policy lock's `playerPilled` equals
`marketPilled` are replaced by the null contract above.

**Scoring.** At each lock day `L_{q+1}`, every rung R ∈ {2, 3, 4} that
was uncertified at `L_q` is scored for the quarter `(L_q, L_{q+1}]` from
the pair stored at `L_q`. A lock is recorded after its day's close, so a
certification on `L_q` was already known to it. The player's quarter
probability is the survival-conditioned `p = 1 − S(L_{q+1})/S(L_q)`, with
`S = 1 − F`, computed in log space. `B`'s is its pooled law at 63
residual days. Both are clamped to [0.02, 0.98] before they are stored,
so the two sides compare the same scalars. `o = 1` if R certified in the
quarter.

**The outstanding quarter is scored at the terminal.** When the run ends
between locks, the existing unscored lock is scored once, against its
original end date and the authoritative completed trajectory. After desk
ejection, the world continues headless, so a certification in the
extrapolation before that end date scores `o = 1`. After natural
resolution, nothing certifies later. No terminal lock is created, no
quarter is scored twice, and skill scored after the end unlocks nothing.
Dropping that quarter would select the scored quarters on outcomes. The skill increment is the log-likelihood
ratio, in nats:
`Δ = o·ln(p_P/p_M) + (1 − o)·ln((1 − p_P)/(1 − p_M))`. Cumulative skill
is `S_P = ΣΔ`, and **credibility = tanh(S_P / K_CRED)**. R5 is not
scored, because nothing certifies it.

These properties are gated by the harness:

- A market-policy lock scores exactly 0 every quarter.
- The score is proper over the clamped range: among probabilities in
  [0.02, 0.98], the expected Δ is maximized by reporting the true one,
  clamped. That holds for a fixed process generating outcomes. It is not
  incentive-compatible where the player's forecasts or actions change
  the process.
- A quarter without a crossing is information. The early caller pays a
  little every quiet quarter and collects when the crossing lands, so
  being early is indistinguishable from being wrong until it isn't.

A run scores up to sixteen quarters. The gates are memos > 0.55 and
fund-as-actor > 0.65 ∧ `F` > 60. The record also carries σ₀, how far it
would swing by luck if the market were right:

```
σ₀² = Σ p_M(1 − p_M)·(ln(p_P/p_M) − ln((1 − p_P)/(1 − p_M)))²
```

The sum runs over every scored rung-quarter, and a market-policy lock
adds nothing to it. σ₀ is reported (`forecastRecord`); no gate reads it.
A significance condition on the gates, `S_P ≥ z·σ₀`, was ratified and
measured this round, then dropped. A bold, skilled record has a large σ₀:
the reader-copier's averages 1.47 against a mean `S_P` of 0.80. So any
`z` ≥ 0.75 shut out the honest reader, while the early caller's heavy
right tail, which σ₀ under the market's own law understates, still came
through.

Calibration targets (gated by `forecast-test`):

- The reader-copier clears the memo gate by day 882 in at least half of
  worlds (the edge gate under `B`, above). This target sets `K_CRED`.
- No static preset earns positive mean skill (≤ +0.05 nats per run), or
  clears the memo gate in more than 10% of worlds. An early caller pays a
  little each quiet quarter and collects when a crossing lands, so luck
  opens the gate for a few. That is the property above, and the bound is
  the one ratified before this round.
- The oracle, which locks the true certification days (`w` 30, `q` 0),
  earns more mean skill than the reader-copier. Its fund-gate rate is
  reported. The old target of ≥ 80% by day 756 assumed the heuristic
  `B`; against a market this sharp after a claim, a `w`-30 law leaks
  mass into the wrong quarter and the 0.98 clamp caps what being right
  pays.
- The market-policy player stays at 0.

Diagnostic: an informed player halfway between `B`'s projection and the
truth (`w = 0.7·w_B`), the calibration target before the reader existed.

**K_CRED = 1.35**, set on validation worlds against the reader-copier
(53.1% clear the memo gate there; the "earlier" preset 5.6%). It was 1.8
against the heuristic `B`, whose larger but statically exploitable edge
set the old scale. Early quarters carry little score, because both laws clamp at 0.02
until a rung is in reach.

`lockedClaim(R)` is the latest lock's P(T_R ≤ D_R) at the contract
deadline; for a rung the lock followed it is `B`'s quote at the lock.
`marketPilled` is 100 × `P_B`(R4 within 252 days of today | not yet
crossed), and `playerPilled` reads the same measure off the latest lock
when it carried R4, and is null when it followed. Consensus settlement scores
nothing. The editor and the record's display are in
[03](03-market-mechanics.md).

**Firm belief `F`** lives on `race.F`: starts 15, clamped [0, 100]; wakes
toward market pilledness at 0.08 of the gap per step, and converts toward
the player's side at `6·max(0, credibility)` per step. Market pilledness
reads **R4** while the compute lift reads **R5** — a deliberate
asymmetry: firm culture wakes on the visible recursion-adjacent frontier,
compute demand scrambles on the terminal rung. The **scrutiny** loop
fires on a belief gap > 20 with a ±3 `firmStanding` nudge, **two-sided**:
−3 divergent and underperforming, +3 divergent and outperforming (the
committee grudgingly respects P&L). No carried R4, no stated posterior, no gap.

**Firm conversion** (checked on lock days after the `F` step): the memo
fires once when the memo gate is open and `F ≥ 40`; the verdict fires once
at `F ≥ 75` if the player made the case and `F ≥ 85` otherwise — hedging
cannot stop a firm that the evidence converts (04), but it costs the
attribution. **The fund latch** is monotone over `canActAsFund` (the
0.65/60 gate, never re-derived) and mirrors to `world.ai.fundLive`:
Treasury's interest does not retract on a one-quarter dip.

## Control regime and content plumbing

**The ratchet runs on a *decaying* grip pressure** (×0.97 per day,
half-life ≈ 23 trading days), so it answers recent severity clusters, not
the ever-accumulating S0/S1 farce stream. That decay is what keeps
mobilized+ a strict minority despite ~80–160 detected incidents per run;
it is load-bearing design, not an implementation detail. Increments per
detection by severity: S0 0.10 / S1 0.20 / S2 0.80 / S3 4.0 / S4 15.0;
persuasion-class 2.5; successful theft 2.0; blockade start 4.0. Gates,
as full disjunctions:

- **supervised**: pressure ≥ 7 ∨ heat ≥ 0.45 ∨ an exogenous
  supervision/evals push.
- **mobilized** (may jump straight from private on a severe shock):
  pressure ≥ 12 ∨ any S4 ∨ (mobilization gate open ∧ (heat ≥ 0.60 ∨
  pressure ≥ 7)) ∨ (theft ∧ heat ≥ 0.60) ∨ an exogenous push. The open
  gate lowering the bar to the supervised threshold is deliberate: after
  a blockade the memo is already drafted.
- **terminal** — requires *already* mobilized (current rank, not the
  in-call target: the panic button follows mobilization, never leapfrogs
  it). Event-triggered first: (S4 ∧ theft) → nationalized; (≥ 2 detected
  persuasion campaigns ∧ heat ≥ 0.55) → classified; exogenous pushes.
  Pressure-gated second: pressure ≥ 22 ∧ heat ≥ 0.55, theft-flavored →
  nationalized, else classified. A qualitative catastrophe nationalizes
  regardless of accumulated pressure — that is the story, not a shortcut.

The OR-structure is the design: conjunctive gates would make the
terminal regimes vanishingly rare and kill the nationalization trade.
Gates (`plumbing-test`): all five regimes are reachable endogenously,
and mobilized or beyond stays a strict minority of runs (diagnostic:
about a quarter). The regime is monotone, and the
terminal peers never swap (nationalized ↔ classified is rejected both
directions). `setControlRegime` is the sole writer and applies its
consequences synchronously: mobilized freezes Consensus (the successor
adjudicator keeps settling) and the compute curve; nationalized/classified
fallback-settle every open contract, pending ones included. Exogenous
pushes (lobbying, elections) arrive as `exo` signals to the evaluator,
never as direct writes.

**Regime evaluation is orchestrated, not baked in:** `stepControlRegime`
runs after `advanceRace`, which stays the physical race (capability,
incidents, strait). The political overlay consumes the ledger; this keeps
regime-static harness runs meaningful and `advanceRace`'s ledger role
pure. Same-day replay is a no-op. Impulse signs on the strait, regime,
and dispute shells are binding (blockade risk-off with jump premium,
relief rally with tail memory, regime hardening scaling with rank);
magnitudes are tunable.

**Event cadence scaling:** the discretionary base rate scales linearly
in the *released* frontier rung (the same public driver as η), ×1.0 at
R1 → ×2.5 at R5, applied to accept rate and cooldown in sequence (≈ 2.5×
effective compression, not multiplicative). Gate (`plumbing-test`):
early cadence near 41 days between discretionary events, late cadence
shorter than early. Exactly 1 in Classic.

**Field contract — `world.ai`:** `exportControlStage` 0–3, `treatyStage`
0–4, `wonderCount`, and the race-owned read-only mirrors `controlRegime`,
`reportingRegime`, `frontierRung` (the released frontier rung — the
public act proxy every arc guard keys on, the same quantity η and the
base-rate scale read), and `fundLive`; plus `geopolitical.taiwanBlockade`.
main.js writes the mirrors each day-complete in the order advanceRace →
stepControlRegime → mirror → base-rate scale → Act III driver; event
`when` guards read the mirrors, never the race object; the mirrors are
excluded from `WORLD_STATE_RANGES`, so structured effects cannot write
them. Narrative flags the arcs set (`fixedpointPublic`, `halcyonPaused`,
`proofDisputed`, `fixedpointIndex`) are plain state set by function
effects, not whitelisted; `summitLive` mirrors the treaty track's open
window. A geopolitical field stays as long as any `when` guard reads it.

**Factions and traits:** `safetyNetworkTrust` (init 20) and
`labRelations` (init 30) join the six political factions; `labRelations`
is a **scalar** — per-lab nuance lives in player flags and insider-channel
state. The convictions (agi-pilled, doomer, accelerationist,
deal-believer, insider, whistleblower) gate on **observable play only** —
locked posteriors, credibility, tip verbs, leak choices; never hidden
truth. Their thresholds are narrative gating, not market math, so they
stay code-local; they gate later content and carry no market effects of
their own.

**Firing conventions:**

- Whatever the race model decides fires from the ledger, never Poisson:
  categories `release`, `incident`, `catastrophe`, `certification`,
  `strait`, `regime`, `dispute`, `theft`, `polaris`, `insider`,
  `conversion`, `summit`, `room`, `rates` and `rounds` are excluded from
  the Poisson draw. The treaty window
  bridge-fires on window-open, and its *outcomes* (`treaty_holds`,
  `treaty_resolution`) fire from the ledger too — the window's choices
  schedule nothing, because the model decides the outcome and so fires
  the news of it.
- Ordinary popups schedule followups at *choice* level only (the engine's
  popup path returns before top-level scheduling); superevents and
  non-popups schedule top-level.
- A one-shot fires the first day its guard holds and preempts that day's
  draw, so one-shots sharing a rung guard cluster in the week the rung
  lands. Use one only where the same-day coincidence is the beat or a
  second randomly-timed guard exists; otherwise gate a Poisson draw on a
  narrative flag.
- Followup `weight` is a same-day tiebreak among pending siblings of one
  chain, not a firing probability.
- Followups are id references resolved against the authored pool.

**Wonder cadence:** likelihoods are functions of the released rung (0
below each act gate, then rising; the cascade at 2.5 from R4) — the
wonder feed compounds on the same public variable as everything else,
which is the ambivalence rule as wiring. A wonder *claim* never
increments `wonderCount`; only its certified hop does
(`wonder_proof_disputed` → `wonder_proof_verified`), and the dispute
survives into priority and statement fidelity. The wonders shells carry
the same agent fleets as the incidents, headcount growing with the rung.

**Rung-keyed beats:** `treaty_pacing_letter` (one-shot at treatyStage ≥ 1
∧ released R3 — the racers ask Washington for the tools to stop *later*;
nobody stops, the cadence does not move); `halcyon_pause` →
`halcyon_pause_ends` (the voluntary pause that ends "for some work"; the
next release ships on the cadence the pause was meant to interrupt);
`policy_ban_bill` (one-shot at released R4 *by intent*: a ban with
nuclear-statute penalties introduced the morning the R4 keynote opens
with "welcome to the era" — the flail lurching toward consequence and
missing); `halcyon_fixedpoint_index` (post-leak, Halcyon publishes a
self-scored automation index; Consensus declines to list it — a claim
with a decimal point).

## Rates: the capex channel

Each RISE of the released frontier rung fires one `rates_capex_wave`
(category `'rates'`, Poisson-excluded, ≤ 4 per run) carrying a
**permanent** additive `params: { b: +0.005, sigmaR: +0.001 }`: four
fires take the Dynamic default long-run rate 0.04 → 0.06 and `sigmaR`
0.005 → 0.009, and no clamp binds. Why permanent: issuance is a stock, and
the premium persists. Why at the rung step: labs and hyperscalers raise
after a demo — `r` mean-reverts toward the new `b` over the following
weeks, and the front-run is legible on the chassis (short duration on the
rung headline, ahead of the rate catching up). The implied timeline never
reads rates, so the channel moves `r` without moving `B`.

This is a low-volume pool, so the additive-delta convention applies and
the incident-coupling rule does not: the shell is not a race shell and
carries no `impulse` key — the permanent step *is* the market effect. It
fires from the race bridge on a public-state latch over the released
frontier rung: seeded without firing on a run's first call, one fire per
rung step (a two-rung day fires twice), nothing on hold or same-day
replay. That is a deliberate exception to the bridge consuming the
ledger, since a per-lab crossing does not imply the frontier maximum rose.
main.js passes the live rung, captured before resolution runs: the
timeout extrapolation advances the race headless before the terminal
bridge pass, and a bridge reading race state there would fire
extrapolation-era waves into the bond closeout. The delta lands exactly
because the shell carries no `mu` delta for the coupling computation to
key on. Invariants: at R1 nothing fires, so Act I and Classic are
untouched; nothing under `src/race/` reads `sim`, so race trajectories
are untouched by construction.

## The valuation layer

HCN's authoritative process price carries the
market's valuation of the race **conditional on survival**: the market
prices the worlds in which its claims can still be paid, and gives no
weight to the worlds in which no one is left to collect. That is pillar
2's "the market structurally cannot price extinction" written as a
valuation rule. The systematic mispricing has a reason, and the doom
short's non-settlement is the same fact seen from the other side.

`V` is a survival-conditioned expected terminal multiple, pooled the way
`B` is from the two readers' family heads:

```
V   = (1 − η)·V_legible + η·V_full
V_x = Σ_{k ≠ 3} p_{x,k}·m_k / (1 − p_{x,3})
```

- `p_{x,k}` is reader x's family distribution ("The reader"). The
  legible family head reads the rule of thumb's own valuation inputs:
  its R5 law, the claimed rungs behind the old claim lead, and the clock.
  So `V_legible` is the old valuation rule, recalibrated. `V_full` is
  the reference.
- `m_k` are the closeout's family marks, read from `CLOSEOUT_TUNING` so
  they live in one place: 1.60 (family 1), 1.25 (2), 1.00 (5, the Deal),
  0.35 (4) and 0.55 (6, the fizzle's centre).
- Misalignment (family 3) gets no weight. That is the survival
  conditioning. The Deal now has a term, so `V` prices the treaty track.
- The conversion regimes redeem at the nationalization reference
  (closeout cell 3), not at a family mark, and stay outside `V` as
  before.
- η is the released-frontier dial. The pool is of the two readers'
  survival-conditioned *expectations*, the investors' shares of capital
  weighting their prices. It is not a pool of family probabilities
  conditioned afterwards, which would reweight η by each reader's
  survival probability. The pool is an explicit designed mispricing;
  changing η does not make it a full-information martingale.

The clock enters `V` through the readers. A quiet quarter is
information, and the target is that each reader's drift between events
is compensated by its expected jumps at events. The gates below check
that target; it does not follow from calibration. This retires
the old rules that only the deadline moved `V` and that `Π` read `B`'s
*unconditional* R5 law. They existed because the heuristic `B` decayed
in every world. `VALUATION_TUNING` keeps only the gap clamp.

`V` is recomputed at day close, after `stepBelief` and the bridge pass.
The authoritative price takes the change as a level gap before the next
open: `S ← S·ratio`, where `ratio = V_t / V_applied` is clamped to
[0.75, 1.30] and `V_applied` is the last level actually embedded in the
price, so a clamped remainder carries into later days. Resting orders are
checked at the post-gap price, and the resolving day takes no gap. The
gap reaches every downstream mark the normal way (`_syncAll`), and the
markets snapshot is taken after it. Classic has no `V`. The decaying
impulses stay, as texture: vol, jump intensity and a hair of drift.

Gates (`valuation-test` and `reader-test`, test seeds). The survival
measure is the test worlds that do not end misaligned. Every series is
the **stopped process**: after resolution, `V` is the realized mark
`m_f`, so a world that resolves inside a window is never dropped from
it.

- Corrupting every latent field leaves `V` bit-identical, and `V` is
  constant in Classic.
- `V ∈ [0.35, 1.60]`, and the ratio stays inside its clamp.
- No-player race trajectories are untouched, because nothing under
  `src/race/` reads `sim`.
- **Calibration.** Under the survival measure, binned by each reader's
  `V_x` into deciles holding at least 200 samples, the mean realized
  `m_f` sits within 0.05 of the bin's mean `V_x`.
- **Fairness on own information.** Under the survival measure, the
  increment `V_x,t+63 − V_x,t` of each reader is regressed, on world-split
  halves, on what that reader could see at t. That is its own value plus
  its own feature list; for the full reader it also includes the
  readers' disagreement and the quote history. The held-out mean
  absolute predicted increment is at most 0.03. Cell means in (act,
  `V_x` decile) are reported. This is an empirical requirement.
  Calibration does not imply it, because predictions from successively
  lossy summaries of the record need not form a martingale.
- **The pool's advantage, measured.** Under the survival measure, the
  pooled `V`'s increments are predictable from the full reader. That is
  the designed edge, reported per act. Predictability from the legible
  information alone, by the same regression on the legible features, is
  held to 0.03.
- **Exploitable errors.** Several challengers (pairwise products,
  claim-age splines, nearest neighbours) fit the full reader's terminal
  residual `m_f − V_full,t` on world-split halves. None reaches a
  held-out R² over a bound set on validation worlds, and each one's
  subgroup residual bias is reported.

Diagnostics: the median terminal reveal `m_f/V_T` by family; the share of
days with gaps over 2%; the largest daily move. Static long and short
log-return diagnostics are reported, net of spread, as drift
indicators. They are not position accounting: no margin, liquidation or
conversion. Predictable drift is not by itself arbitrage. Costing a
strategy with full position accounting is section 3's replayable runs.

**Known limit: V drifts predictably.** The bound of 0.03 sits above the
target this round set out with (0.02), because the linear family heads
are not martingales. On test worlds, the held-out mean absolute
predicted 63-day increment is 0.0265 for the legible reader and 0.028
for the full reader; a permutation placebo gives 0.002–0.009. The pool,
predicted from the legible information, measures 0.021. Both readers'
values are calibrated in level. A per-act linear recalibration was fit
and measured: its slopes came out near 1 (0.99–1.04), it left the
predictability where it was, and it pushed `V` under its 0.35 floor, so
it was removed. A headline reader can therefore anticipate about two
points of HCN's race-driven drift a quarter, against quarterly moves
many times that. The fix is a family head whose increments are
unpredictable by construction, such as a nonlinear head or a
martingale-corrected one, at a later refit.

**Conversion regimes.** Calibration against family marks says nothing
about HCN's actual payoff in worlds that end `nationalized` or
`classified`, where shares redeem at the conversion reference. Those
worlds are reported apart, as the hypothetical family factor they
are.

The terminal HCN mark is closeout cell 1 (below): `spot·m_f / V_T`
outside the conversion regimes, where `V_T` is the last applied level.

## Player influence and the ledger

**Bounded influence, in margin units.** World and player deltas to each
terminal quantity are tracked separately. With `d = margin − required`:

```
d_eff = d_W + clip(d_P, −(3/7)·|d_W|, +(3/7)·|d_W|)
```

The player's share of any threshold crossing is ≤ 30% of the total, by
construction, with no attenuation of the world when the player sat out.
A `0.7·world + 0.3·player` blend would attenuate the world
unconditionally and cap nothing.

**Cost-of-capital channel** (`coupling.js`): an EMA, half-life **50
trading days**, over net persistent HCN positioning (net book delta·S /
equity plus impact-overlay flow, normalized to [−1, +1], computed
orchestrator-side), output as a bounded Halcyon velocity multiplier
`1 + 0.05·clamp(ema, ±1)` — **cap 0.05**, both signs (sustained long →
marginal acceleration, sustained short → marginal slowdown, per 03's
stance table). The channel is an orchestrator-passed input to
`advanceRace` and flows through the one deterministic-drift function, so
kinematics and the plateau detector price one drift: if sustained capital
is the only thing keeping drift above 2e-4/day, the race has not
plateaued, and the ledger attributes exactly that. Headless runs pass
nothing, so calibration is unaffected. Gate (`endings-test`): the
player's maximum reachable |d_P| covers at least 40% of runs' |d_W| (the
knife-edge's play-decides-the-close-ones clause); the cap of 0.05 keeps
the channel marginal rather than authorial. Cumulative dC ≤ ~0.16 rung
units over the horizon; the 50-day half-life makes the realistic ramp ≈
the instantaneous ceiling. Halcyon follow-on allocations add a bounded
primary input to the same channel (below).

**`raceEffects`** on event choices: whitelist `S`-per-lab + `heat`,
per-effect clamp ±0.15, ledgered under the event id, tracked on
`race.playerS`. Magnitudes: `polaris_supplicant` back-them choice
**S[polaris] +0.06** (runway; bites only in Polaris-leader worlds);
`halcyon_osei_board` restraint choice **S[halcyon] +0.05** (~0.35× median
|d_W|; a one-shot popup, so it cannot stack); `china_export_controls`
"Back the controls" **heat +0.04** (visible-containment heat, acting
indirectly through theft and incident hazards, never a direct margin
move); the room's advice (Act III). The ledger records the raw applied
amount, though the burn taper erodes part of a `+S` before resolution, so
the S-channel's resolution-time contribution is slightly overstated. That
is accepted: the error is bounded and conservative (it overstates the
*player's* share, which the clip caps), and it is honest accounting of
intent at decision — the ledger records what capital did, not what
survived the weather.

**F-channel attribution:** firm-belief movement decomposes into the
player-attributable conversion term (advice acts — locks scored by
credibility) and the autonomous `B`-wake term; `stepFirmBelief` exposes
the split and the ledger records ONLY the player component, gated on
`hasStatedForecast`. The orchestrator consumes the exposed delta and never
recomputes the split. The decomposition survives exact cancellation:
when wake and conversion oppose to a net-zero interior step, both raw
components stand unscaled — *preventing* the autonomous move is
persuasion, and a ledger that erased offsetting contributions would
launder exactly the involvement it exists to record. Proportional scaling
applies only when the [0, 100] clamp actually binds.

**The ledger** is append-only, with no zero-effect rows. **Freeze is a
mutation gate, not an append gate:** after the resolution latch, player
channels are inert — `applyRaceEffects` and the leak coupling are full
no-ops while the ledger is frozen or inactive (one shared gate,
`raceChannelsLive()`), and the orchestrator stops passing the coupling
input. Check-then-mutate, never mutate-then-fail-to-record: a race
mutation without a ledger row is the corruption 09's freeze exists to
prevent. After the latch, books are frozen and capital moves nothing that
counts. The ledger's `B` channel is closed (see tip verbs).

## Private rounds and primary offerings

The primary market is where capital is literally
not neutral (03): money in a round reaches the lab. There are two
instruments, and neither has a price process of its own.

**Polaris rounds.** Polaris stays private for the whole run. Its
founding round comes 21 days after the walkout (the spawn day belongs
to that superevent), and later rounds follow every 126 ± 21 days while
it lives. Timing draws from a `rounds` substream outside `race.streams`, so
a run nobody participates in is bit-identical to one without rounds. The
founding round prices a unit at 1.00. Each later round prices at
`P_k = P_{k−1}·clamp(exp(0.8·Δr + 1.0·ΔΠ − 0.15), 0.5, 3.0)`, where `Δr`
is Polaris's claimed-rung gain since the last round and `ΔΠ` the change
in `B`'s probability of R5 by day 1000 (the R5 contract's quote). A quiet half-year is a flat-to-down round.

Meridian is offered an allocation of up to min(20% of equity, 2,000k)
per round, by dispatch: take it all, take half, or pass.

A stake (`privatestake`) has these properties:

- It is cash-funded and carries no greeks.
- It is not marginable collateral, though it counts toward equity at
  its mark. A subscription is capped at cash and at the collateral
  headroom above maintenance.
- It is illiquid until the terminal.
- It is marked at the last round price, the way a venture book marks.

Participation is a ledgered `raceEffects` entry of
`S[polaris] += 0.04 × (taken/offered)`, under the same ±0.15
per-effect clamp. It is runway, which bites only in worlds where Polaris
leads, the same rationale as `polaris_supplicant`.

Terminal value (closeout cell 10) is units × last round price × a
multiple:

| Terminal | Multiple |
|---|---|
| Polaris leads a family-1 crossing | ×6 |
| Polaris leads a family-2 crossing | ×3 |
| Any other family-1/2 world (folded into the winner at the last round) | ×1.0 |
| Family 5, the Deal | ×1.5 |
| Family 6, the fizzle | ×0.3 |
| Family 4 | ×0.1 |
| Family 3 (a private claim on a world that ended) | 0 |
| Conversion regimes (precedence over the family) | ×0.5 |

**Halcyon follow-ons.** Each `rates_capex_wave` (a rise of the released
rung, when somebody has to finance the compute) is also a Halcyon
follow-on offering:

- On announcement HCN gaps −2% for dilution, applied with that day's
  valuation gap.
- Meridian is offered up to min(15% of equity, 1,500k) of new shares at
  a 3% discount to the post-gap price: take it all, take half, or pass.
- The shares are ordinary `stock` positions.
- The money reaches the lab. The allocation adds
  `min(1, 3·allocation/equity)` to the cost-of-capital channel's daily
  input for the 126 days after the offering (the capital's deployment
  window), inside the channel's existing 0.05 cap.
- It is ledgered on the C channel under the offering's id.

Secondary fills still finance nothing.

## The evening

Ratified 2026-10-27 (ROADMAP §1). The forecast's standing policy is under
"Belief, η, and the firm". This section holds the rest: the opening
hand, obligations, pacing, the flatten, the almanac and the interruption
counters. Player-facing prose (memos, archived reports, notices, wire
items) is authored and ratified by a9.

**Dates.** Every date in this section is a run-relative day, which equals
`race.day` during play (Edition N is day N − 1). The chassis counts from
the backfill: at boot `sim.day` is 252, so a chassis expiry or entry day
is the relative day plus 252. The first two listed option expiries are
relative days 63 and 126. Compute maturities are keyed in race days.
Two boundaries matter. Something **due on day d** happens at the close
that turns day d − 1 into day d, the same close at which a chassis
expiry on day d is processed. A **snapshot on lock day L** happens at
the start of the close that ends day L, before it advances (under
"Belief, η, and the firm").

**The opening hand.** A Dynamic run starts on an inherited desk instead
of cash: the book of a portfolio manager who has left Meridian, drawn
from the fixture table below by `createRng(deriveSeed(seed, 'opening'))`,
uniformly. The draw consumes no race stream, and a seed always deals the
same hand. Classic starts on cash: it is the pure trading sim, and the
fixtures' theses are about the race.

Edition 1 leads with the predecessor's handover memo: their thesis in a
few sentences, naming a timeline against `B`'s day-0 quote (the same in
every world, so the memo stays true to the market it was written
against). The memo is fallible by design. The Meridian page keeps it for
the run. Two of the predecessor's archived reports sit on the wire under
it. The wire dates them *Archive*, not with an edition, and they assert
only what holds at day 0 in every world, or claims attributed to a named
source. The player's draft starts following the market, not the
predecessor: the memo is someone else's thesis.

**The takeover** happens at boot, at day 0's opening marks: S = 100,
v = θ, r = b, Consensus at `B`'s day-0 quote and compute at its day-0
curve. It is not a trade, so it pays no spread or impact and counts no
fill, trade or ledger row. Each position enters at its takeover mark on
day 0, so P&L and every comparison measure from the takeover, never from
the predecessor's entries. Cash is solved so that takeover equity, net of
the obligation, is exactly `INITIAL_CAPITAL`; `initialCapital`, the
holding-HCN benchmark, the quarterly reviews, the rogue-trading threshold
and the peak all start where they did on cash.

From the takeover the book is the player's. The coupling channel, the
impact pools, the margin check, the convictions and the epilogue read it
like any book, and keeping it is a choice the ledger sees. The coupling
EMA starts at 0, the impact pools start empty, and the market maker's
hedge accumulator starts at the takeover book's hedge without recording
volume, so the predecessor's history enters nothing and only later
changes in delta count as flow. An inherited HCN long is still a thumb
on the scale from the first close. The catalyst's book saturates the
channel's input at once, and held without a sale its velocity effect
approaches the +5% cap (+2.9% after a quarter, +4.1% after two). A
player who keeps it all run will probably read as involved rather than
a bystander in the last edition; that is a prediction, to be measured
in the round. Race trajectories match across fixtures only where the
player's inputs match, and different books are different inputs.

No refit follows. The reader is fit on headless worlds, which take no
player inputs, and an inherited book is a player input like a trade. The
target outcome distribution stays the neutral-input baseline.

| Fixture | Book (E₀ = takeover equity) | Working order | Obligation | The problem |
|---|---|---|---|---|
| The catalyst | HCN long 1.10 E₀; calls, K 115, expiring day 126, ≈ 0.04 E₀ | limit sell of 0.30 E₀ of the HCN at 106 | investor redemption 0.25 E₀, day 40 | cash ≈ 0.11 E₀: the winning position has to pay the redemption before its catalyst |
| The insurance | HCN long 0.80 E₀; puts on the same shares, K 90, expiring day 63; VXHCN front future long 0.10 E₀ | stop sell of the HCN at 85 | financing maturity 0.15 E₀, day 84 | cash ≈ 0.24 E₀ covers the maturity, unless it buys much of the next insurance |
| The illiquid | VXHCN, the farthest listed future, long 0.80 E₀, several days of its volume; HCN long 0.30 E₀ | none | investor redemption 0.20 E₀, day 50 | cash ≈ 0.10 E₀, and a forced sale sells VXHCN into its own impact |
| The wall | Consensus R3 and R4 short, maximum loss ≈ 0.175 E₀ each; bonds, the farthest listed maturity, long 0.60 E₀ | none | investor redemption 0.10 E₀, day 30 | a later-than-market timeline, its collateral posted against it and little cash beside |

Sizes are targets: the implementation rounds them to whole contracts and
listed strikes, then solves cash. Gates (`opening-test`, new): takeover
equity equals `INITIAL_CAPITAL` to 1e-9 in every world; every fixture
passes the margin check at takeover with headroom, and neither the
margin check nor the rogue-trading threshold fires at the takeover; the
fixture draw consumes no race stream; no fixture's construction reads
hidden state.

**Obligations.** An obligation is `{kind, label, amount, dueDay}`:
public, mundane, and outside the race. Each fixture has one in the first
two quarters, and section 6 will add later ones as Act III's objective.
It is a liability from the takeover. One helper nets every unpaid
obligation out of every actual and prospective equity calculation:
`portfolioValue`, `collateralEquity`, `checkMargin`, short-order
admission, the initial-margin debit check and the private-stake headroom.
Paying one moves cash and the liability together and leaves equity
unchanged. It is met in cash, never on the margin loan. At the terminal,
the closeout pays every unpaid obligation out of its cash, so terminal
equity is net of it.

- **Notice.** At the close due on day `dueDay − 5`, if cash is below
  the amount, a wire item gives notice and the desk pauses. It
  is not a dispatch, and the pause holds until the player plays. A
  covered obligation gives no notice. The book rail lists every unpaid
  obligation by label, due edition and amount.
- **Payment.** At the close due on `dueDay`, after expiry, the race
  block's settlements and the terminal check, and immediately before the
  rogue-trading and margin checks, the desk pays from cash and a wire
  item reports it. On a close that ends the run, the closeout pays it
  instead. The notice is checked at the same point.
- **Forced sale.** If cash is short, the shortfall `max(0, amount − cash)`
  is raised by a forced sale: a desk on a margin debit has no cash to pay
  with. The desk sells the same fraction of every eligible long position,
  the smallest that covers the shortfall: a redemption takes a slice of
  the whole book, illiquid parts included. Each sale is a machinery
  reduce-only close: instant, with no ladder lag, at
  `FORCED_SALE_SPREAD_MULT = 3` times the ordinary spread plus the
  ordinary impact. It bypasses the account restriction, the short-sale
  ban and the binary cash rule, which guard new exposure, and it never
  touches a frozen, pending, disputed or settled contract, a private
  stake or a short. A slice is sized from executable quotes taken
  together before any fill: a pure helper returns each position's bid
  with the instrument's own spread, the regulation multiplier, the ×3
  and execution's price floor ($0.01 for chassis instruments, 0 for
  Consensus), before impact, since a trial fill would move the impact
  pools. The fraction is capped at one, and each position's quantity is
  rounded up to whole units, capped at what it holds, so the slice is
  pro rata to within a unit. Positions then fill in a stable order
  (bonds, HCN, VXHCN futures, options by expiry then strike, compute,
  Consensus), each separately, impact accruing as they go. What impact
  leaves short is raised by up to two more slices, sized the same way;
  if the eligible longs quote zero, nothing is sold. Any remainder goes
  on the margin loan, after which the ordinary margin check runs. The forced sale costs `firmStanding` 8 and
  has its own wire item.

The ×3 spread replaces the roadmap's "at the ladder's cost". Every
fixture's obligation falls in Act I, where the ladder costs nothing, so
that wording would make missing one nearly free.

**Pacing.** *To the next edition worth reading* plays at
`SKIP_DAYS_PER_SEC = 8`, four times the fastest speed setting, and stops
at the first of these:

- a dispatch, at once, mid-day if that is when it opens;
- at the close, an extra or a major wire item;
- at the close, a position change the player did not make by hand that
  day: a resting order filling, a standing order trading, the player's
  own deferred order completing under the latency ladder, exercise or
  assignment, a held contract settling, a forced sale or a margin
  liquidation;
- at the close, an obligation's notice or a quarter's close line;
- at the close, equity (net of obligations) moving by `BOOK_MOVE_STOP`,
  3% of the previous close's equity, or more;
- at the close of the last trading day before a held option expires.

A stop pauses and stays paused: answering a dispatch the skip stopped on
does not resume play. A stop never changes the speed setting. The player
resumes with play, or skips again.

**The flatten.** One control loads the ticket with a closing leg for
every position: reduce-only, carrying the position's id and strategy
name, with the ticket's size reset to one. Sending it trades leg by leg
through `_deferManual` like any ticket, so the ladder and spreads apply,
and cancels the resting orders and every working manual entry, which
could otherwise reopen the book. When a leg executes it is capped at what
its position still holds, so a position that settles, expires or is
traded down while the leg waits closes what remains, or nothing; a leg
whose position has reversed sign since it was sent is skipped, never
traded on its stale side. Positions that cannot trade (private stakes,
frozen Consensus, a restricted account) are left off the ticket and
named there. Before it is sent, the ticket shows the flatten's estimated
cost (the spread at the current ladder multiple, plus impact) apart
from the cash it releases, returned short collateral included. The
ticket stays the only order entry.

**The almanac.** Browser storage under `shoals-almanac`, versioned. The
last edition of every Dynamic run, natural resolution and ejection
alike, appends one record, and the almanac keeps the latest 200. A
record holds the seed and fixture, the family and overlay, the desk's
last day and ending, the world's terminal day and cause (an extrapolated
resolution runs past the desk), the sampler's draws, and the scored record: per quarter and rung,
`o`, `p_P`, `p_M` and the lock's classification, with `S_P`, σ₀ and
credibility. Beside it is the reader-copier's record on the same world:
at each snapshot, the full reader's quarter probability for each open
rung is stored beside `B`'s `p_M` (the pairs `forecast-test` scores) and
scored by the same rule at the same closes, the outstanding quarter
included. The reader-copier reads only the public record. It stays out
of view until the run ends: during play it would be section 6's licensed
reader, which is not yet licensed.

The Meridian page shows the almanac: the runs; the cumulative score
beside the reader-copier's; a reliability diagram over the player's
carried rung-quarters (deciles of `p_P` against the observed frequency,
with counts); and the families seen beside the neutral-input baseline,
labelled as that. Every read and write is wrapped in try/catch. Without
storage the almanac is empty and the game is unchanged.

**Implementation readings** (the round's interpretation calls, kept):

- A certified rung's stored curve is its certification day at the minimum
  width with `q` 0, classified like any rung, so a carried R4 that later
  certifies still counts as stated.
- The quarter's close line counts every scored quarter in `n`, followed
  ones included.
- A working order sized as a fraction of E₀ is sized at the takeover
  mark; an unsized stop covers the whole holding, and the insurance's
  puts cover the HCN holding.
- The memo and the archived reports post as minor; archived items mark
  no news day on the tape. An obligation is paid at the first close at
  or past its due day.
- A machinery close (the forced sale, a flatten leg's cap) counts no
  trade.
- The option-expiry stop falls at the close after which the edition on
  screen is the option's last trading day; the expiry close itself is a
  development. The skip's latch fills only while a skip runs, and the
  first close measures the book move from the takeover's equity. A notice
  during a skip is counted as the skip's stop.
- A flatten loads a fractional holding rounded up to a whole unit, and
  execution caps it at the holding. Its estimate prices every leg at
  today's mid, so two legs sharing an impact pool are estimated as if
  they didn't. A leg that cannot trade now (frozen or disputed
  Consensus, a restricted account) adds nothing to the estimate and is
  named under the ticket. A flatten with nothing left to close still
  sends while orders are working, to cancel them, and a holding larger
  than the ratio control's typed range loads whole.

**Interruption counters.** Development-only counters in `main.js`, read
from the console (`shoalsCounts()`) in a9's play-tests and never shown:

- dispatches by category, split into shown, queued and intercepted by a
  standing order;
- choices repeated from earlier in the run (same event, same choice);
- pauses by cause (notice, skip stop);
- actionable developments by kind (fills, settlements, notices, forced
  sales), and how many fall between consecutive dispatches.

## Resolution

```
margin   = S[leader] + leadAdj(lead)
lead     = C_int[leader] − max(C_int[others], C[open])
leadAdj  = −0.15·(1 − lead/0.10)          lead < 0.10
         = 0                              0.10 ≤ lead ≤ 0.25
         = +0.12·min((lead−0.25)/0.25, 1) lead > 0.25     (continuous)
required = 0.22 + 0.35·(1−τ) + 0.08·sharpnessNorm
d        = margin − required
```

`required` has mean ≈ 0.48, 5–95% ≈ 0.35–0.59, centered against typical
end-state margins per the knife-edge principle (a higher mean would leave
most runs decided far from the threshold, i.e. set in stone).

**Terminal mapping**, exclusive, checked in this order:

1. S4 incident → family 3 (resolved in place)
2. implemented treaty → family 5
3. confirmed plateau → family 6 (gated to never-ignited, never-crossed
   runs — see kinematics)
4. at R5 crossing: technical failure (`d ≤ −0.15`) → family 3
   *regardless of leader*; Tianxia or `C[open]` leader with non-failure
   (`d > −0.15`) → family 4, the control axis ("aligned-to-Beijing"
   includes the ambiguous-dawn band; bad-τ Tianxia crossings are family 3
   with subtitles); domestic leader → **family 1 requires `lead ≥ 0.25` ∧
   `d > 0`** (no knife-edge vindication), else the family-2 gradient
5. day 1008 → timeout extrapolation

**Extrapolation** samples the remainder forward from standing state, with
no events and no market, to an absolute cap (day 1008 + 2520 — a decade
of no ignition IS the fizzle). It includes neutral-signal regime steps, so
the political-control axis reads the extrapolated world, not the day the
desk's story ended (about a third of extrapolated runs change regime past
1008). Early ejection uses the same extrapolation against the same
absolute cap, so the desk's exit timing never moves the world's endpoint.

**Treaty track.** Sub-gates: discovery 0.65 · initiation 0.85 ·
farce-gauntlet survival 0.65 · summit pass (diagnostic ≈ 0.69). Talks become eligible
from day 120 (earlier with public groundwork); the window opens from day
700 and stays open 8 trading days, failing if a detected incident of
severity ≥ 2 fires while it is open — so the summit pass is
incident-driven, and hot worlds fail summits more (the mechanism working,
not drift). The window (`treaty_window`) bridge-fires on opening. **Windows are
leak-free by construction:** opening is
independent of `dealPossible` — non-deal worlds traverse the same
viability-blind gauntlet and open doomed windows at the same rate —
and `dealPossible` gates only whether an implemented treaty holds.
P(dealPossible | window) equals the 0.15 prior, harness-asserted; a
summit convening may be *evidence* in prose, never a *tell* in the joint
distribution. At most one window per run; window rate ≈ 36% of runs
(band [0.25, 0.45]); Deal ≈ 4% (band 2.3–8).

**The terminal path is atomic and shared** by natural resolution, early
ejection, and the rogue-trading and margin-deficit blowups: latch (freeze
ledger → mark → clear the day's transitions and trade bars) → the
resolution-day beat (a carried treaty-outcome superevent must still reach
the player; the epilogue waits behind the popup queue) → terminal closeout
at the resolution-time regime → epilogue. Day processing stops: a world
left live past resolution keeps changing regime and mutating settlements
the closeout should have fixed. **Terminal queue discipline:** once
closeout starts, the popup queue is filtered to terminal-safe beats —
categories `'summit'` and `'catastrophe'` (effect-free acknowledgments;
the S4 that resolves its own run keeps its detection through the latch
so its superevent still prints, never an extrapolated one) — and every
ordinary queued popup is discarded: the world's resolution supersedes the day's
news, and no popup decision may mutate the settled book or stale the
epilogue. Terminal beats opt in by category, never by exemption. The
rogue-trading loss routes as `forced_resignation` — walked out for cause,
the firm survives you.

**Constraint-4 reading:** the ratchet set for the knife-edge constraint
is {nationalized, classified, permanent maximum heat}; "forced shutdown"
is not a distinct model state. Heat assertions measure the run maximum of
total heat, not terminal heat.

## Terminal closeout and overlays

The ten closeout cells (`src/race/closeout.js`; the shape is
[09](09-market-integrity.md)'s):

1. **Family marks** (`CLOSEOUT_TUNING`): melt-up **1.60** (won with
   margin — under "the growth prints") / **1.25** (ambiguous dawn — the
   melt-up no audit can fault); boring-world **1.00** (the Deal — flat is
   the point); doom equity recovery **0.35** and doom bond recovery
   **0.40** on face (the classic convention, knowingly — "recovery
   assumptions were applied where assumptions were all that remained");
   fizzle **0.55 ± 0.15**, seeded (an unwind that ends at prices, without
   incident). They apply as realized over expected: the HCN mark is
   `spot·m_f / V_T`, where `V_T` is the valuation layer's last applied
   level. 09 fixes the shape; these are the numbers.
2. **HCN options** settle intrinsic vs. the family mark in *all*
   terminal families — at the world's end there is no time value left to
   price; declared accelerated termination generalizes. A
   corporate-action hook (`adjustedStrike`) applies before intrinsic and
   is the identity.
3. **Shares redeem to cash** at reference × multiple in the conversion
   regimes rather than carrying claim instruments — the epilogue values
   everything immediately, so claims-as-positions have no gap to live in.
   The claims language survives in prose.
4. **VXHCN** marks the last live index as last-valid-before-cutoff.
5. **Bonds** mark at the last live impact-free MTM in non-doom families
   (par would erase rate P&L where 09 says "bonds are bonds") and at 0.40
   of face in doom families. Par at the world's end is only true when the
   world actually ends.
6. **Fizzle** is one seeded draw, the 18-month path compressed to its
   endpoint.
7. **No usable frozen conversion reference** → redeem at last spot with a
   warning, never a family mark (defensive; unreachable).
8. **Compute held past resolution** (private/supervised) → last-valid
   index mark, kind `'TERMINAL'`; frozen marks are terminal and never
   repriced.
9. **Early-ejection binaries** settle against the world that actually
   happened: certifications inside the extrapolated trajectory before a
   contract's deadline settle it YES, exactly as if the player had been
   there to watch (desk-ends-before-world).
10. **Private stakes** (Polaris rounds) settle at units × last round
   price × the multiple in "Private rounds and primary offerings". They
   are never marked to a process, because there is none.

The closeout draws from a `'closeout'` substream outside `race.streams`,
so race trajectories are identical with closeout on or off.

**Overlays:** indictment → convicted, margin call → margin_called,
whistleblower → whistleblower_exile. Every other end (term end, forced
resignation, firm collapse) splits by **involvement**, judged on
frozen-ledger *actions*: |C| ≥ 0.02, S ≥ 0.03, |F| ≥ 0.05, treaty ≥ 1,
|d_P| ≥ 0.03, or the firm-conversion latch → gray_eminence; else
bystander. Traits, credibility, and raw `F` are never primary signals — a
belief is not an act, and raw `F` carries the autonomous wake. The C gate
is unsigned: a player whose sustained short measurably slowed the race
was in the room, not the audience; S and treaty stay one-sided because
restraint bought and windows advanced are inherently positive. Thresholds
stay code-local.

**Epilogue engine:** `EPILOGUE_SLOTS[family][overlay][page]` with
fallback `[fam][ov]` → `[fam]['*']` → `['*']['*']` and no cross-family
overlay fallback (overlay prose is placed per family). The engine
composes no sentences. The ledger page prints no share of the outcome
(a9, 2026-10-27): the realized share it printed was taken before the
clip and reached 74.5% against the clip's 30% in one run, and no share is
a causal answer.

## Act III

04's shape made mechanical, on one public driver.

**The driver.** A smoothed machine parameter `x ∈ [0, 1]`, owned by
`act3.js` — presentation pacing, not race state, reading only the
`world.ai` mirrors. Daily `x += (target − x)·0.15`, with `target` = 0
through released R3, **0.6** at R4, **1.0** at R5, **+0.1** (capped)
under mobilized+ — unconditionally, so a mobilized state at R ≤ 3 gives a
faint machine tint in the audio while degradation stays 0: the state's
grip IS the machine arriving early. About three trading weeks of
crossfade follow each step — the world changes timbre the week the model
ships, not the second. Degradation is a projection of the same driver:
`d = max(0, (x − 0.5)/0.5)`. Audio: `setMachineIntensity(x)` daily;
`glitchAudio` from degradation clusters; `silenceDesk()` first thing at
the terminal latch — the band stops mid-note, then the accounting. The
shape (one public driver, smoothed, two projections) is fixed; the
magnitudes in `ACT3_TUNING` are feel numbers.

**Substep event lane** (tempo compression): from released R4 the
discretionary Poisson decision stays at the day boundary with identical
accept/cooldown arithmetic, and only the *arrival* moves to a uniform
substep — the same expected rate by construction. The popup queue drains
at substep boundaries while the lane is live. Bridge- and ledger-fired
beats stay at day-complete: transitions are computed at day boundaries,
and firing them mid-day would misstate when the model moved.

**Manual latency ladder** (agency migration): manual orders execute with
a substep lag by released rung — R ≤ 3: 0; R4: 1; R5: 3 with spread
×1.25; R5 ∧ mobilized+: 6 with spread ×1.5 ("advisory"). Standing orders
and resting pending orders execute at their trigger substep with no lag —
precommitments are the fast path; that is the mechanic.

- *Exits are not faster than entries:* the player's closes (position-row
  close, strategy unwind as one unit) take the same lag, since an
  instant-exit asymmetry is exploitable in a market made of machines.
  `exerciseOption` stays instant (a rights execution crosses no spread),
  and every machinery path stays instant — popup trades, margin
  liquidation, forced trims, rogue/terminal actions: the ladder binds the
  player's hand, never the machinery's. `liquidateAll` has no player
  entry point.
- *Re-checked at execution:* restriction, expiry, and the terminal latch.
  A due order whose instrument expired inside the window dies at the
  fill (cash untouched, reported) — `executeMarketOrder` rejects any
  time-bound instrument with `expiryDay <= currentDay`, which also stops
  a resting limit/stop from minting a position past its contract's
  expiry. A working close whose position the machinery flattens inside
  the window expires with a report, never a fabricated fill. A
  restriction landing inside the window cancels working closes — the one
  place the ladder can read as a bug.
- *Game time:* working orders sleep across pause (a paused world fills
  nothing), and resuming rebases the substep clock so a mid-day pause
  never stalls the remaining substeps.

**Day lifecycle rulings.** The popup queue is a barrier to day close on
every path: a day never closes while a popup is open or queued; it stays
open (overlays applied, lane choices writing through the intraday
baseline path) and closes synchronously when the queue drains, so the
player never has to press play to collect a day the world already
finished. Any intraday sim-parameter mutation goes through the LIFO
overlay unwind (`_midDayBaseline`), or the day close silently erases it.
A terminal latch entered mid-day aborts the partial day — overlays
unwound, no day-complete processing, no clock advance (which would misdate
every closeout mark); the partial bar stays as the desk's last unfinished
day, and nothing ticks after the latch. Reset clears every Act III
artifact (repaint state, latency tickets).

**Standing orders** (the delegation layer): menu-authored
precommitments, never free-form; unlocked at released R3, editable until
R5, then **locked** for the run in both directions — the lock binds
exactly when reneging gets tempting. Run-scoped (precommitments are authored per run, never
persisted), parameters fixed, arming is the only choice. Execution
announces itself by toast at the trigger substep. The six rules:

| Rule | Trigger | Action |
|---|---|---|
| (a) | severity-≥3 *detection* | proportional 50% gross cut across open non-frozen positions, every type (bluntness is the design) |
| (b) | blockade onset | halve the HCN stock position |
| (c) | margin utilization > 80% | bonds liquidate first (a preference the margin path consumes, not a firing action) |
| (d) | any certification | sell all ITM long binaries at quote |
| (e) | an insider tip | auto-sit: the compliance precommitment — kills the edge and applies the sit choice (the network deepens) |
| (f) | HCN move vs. day open > 8% at any substep | trade stock to net delta ±20 |

Semantics: standing executions are machinery (zero lag, no spread
multiplier; restriction, frozen legs, and the terminal latch respected —
frozen legs refuse and are reported, never force-filled). One fire per
trigger episode: per incident for (a), with same-tick detections
collapsing to ONE 50% cut, never a compounded 75%; per blockade onset for
(b) (arming mid-blockade does not fire); per (lab, rung) certification
for (d), implied certifications counting separately; per day for (f),
burned even on a rejected fill so a short-sale ban cannot become a
per-substep retry hammer. Cuts round ties up, so a 1-lot leg flattens.
"ITM long binary" means quote mid > 0.5 — even money, not in-profit — and
the panel says "trading above even money". (c)'s only consumer is a
triggered margin call (over 100% utilization by definition), so the
panel claims only "if the desk is forced to liquidate".
(e) intercepts at popup-queue insertion and applies the sit choice's full
consequence once through the manual-sit path; the tip stays in the event
feed and consumes the 45-day throttle — the call happened, the standing
policy answered it, the record shows both — and never holds a day open.
The rules engine draws zero RNG.

**Presentation degradation** (all display, zero pricing): chain quotes
hold for `floor(d·6)` substeps before snapping; the live candle
transiently repaints wrong then corrects (p = 0.04·d per substep, size up
to 0.6% of spot); sparklines skip frames past d = 0.6, up to 75% at
d = 1; the VXHCN *publication* goes stale past d = 0.5, holding 2–6
substeps. Fills, margin marks, and VXHCN settlement always use true
values (09: settle on truth, display the failure); no pricing module
imports `act3.js`, and display randomness draws from its own fixed-seed
stream, never `Math.random`, so a failing display cannot shift the price
path. Degradation clusters fire `glitchAudio` (cluster size 4 →
severity 2, 6 → severity 3; at most once per 15 s wall-clock) — eyes and
ears fail together. Printed history never mutates. Reduced motion drops
stutter and repaint but keeps staleness: a stale quote is information
pacing, not motion, and hiding it would change the game.

**The room** (04's endgame branch point): convenes once per run, the
first day-complete on which the leader lab's `C_internal ≥ R5 − 0.15`,
strictly pre-terminal (evaluated after resolution, so a resolving tick
never convenes one; a run the world ends first has no room). The latch
burns on that first day, seat or no seat — the decision happens when it
happens, and a later standing gain never reopens it. The trigger reads the
leader (any lab); the advice binds Halcyon — the room is Washington's
room whether Halcyon or Beijing is about to cross, and the shell selects
context and headline from per-leader pools (`rival` for Tianxia, `home`
otherwise; diagnostic: Halcyon leads about three rooms in four, Tianxia
the rest). **Seat:** ≥ 2 of {credibility > 0.55, safetyNetworkTrust ≥ 45,
labRelations ≥ 55, firm-converted, briefed on Fixedpoint or backed
Halcyon restraint, the Treasury backchannel}; voice = the satisfied
count. Below the gate there is no beat — the ending arrives as weather,
on the news. **Menu**, full-voice `raceEffects` scaled by voice/6: advise
speed S[halcyon] −0.12; advise margin S[halcyon] +0.12; advise the deal
(only while `summitLive`) heat −0.09 + S[halcyon] +0.04; say nothing
(`room_declined`). At voice 6 this is the loudest row the ledger will
ever carry, by design. Every path sets `sat_in_the_room` at the choice
chokepoint, so a room discarded by the terminal filter leaves no flag.
The room carries no impulse and empty params — the tape does not print a
private meeting — and it is not terminal-safe (its effects require a live
world). Presentation rotation is deterministic and run-scoped.

**Classification blackout** (`controlRegime = classified`): the bridge
routes severity ≤ 3 detections, persuasion included, to toast-weight
classified briefs with no `impulse` key (absent, not zeroed) — the briefs
do not ask, because the desk is no longer consulted. S4 keeps its public
superevent and still self-discloses same-tick. Belief suppresses
detection folds ≤ S3 and leaves their `det_${id}` unclaimed, so a player
leak can still claim one; insider-tip and leak folds still land (the
surviving channel must move `B`, or the raised tip rate would be
decorative); the tip Bernoulli rises to 0.5 — the channel is the only
feed left. Releases and wonders still print; Consensus and compute are
already frozen. Reading `controlRegime` directly in the belief and bridge
steps is fine: it is public state.

**Treasury backchannel** (the fund-as-actor beat): a one-shot `policy`
event gated on the fund latch; accepting sets `treasury_backchannel`
(the room's sixth criterion) and costs regulatoryExposure +6 — a standing
wire into Treasury is a wire; declining sets `declined_treasury`.

**China intel:** three `china` shells (rung guards 2/2/3) carry an intel
read resolved inside `_fireEvent`: `chinaTrue.velocity` bucketed at
0.90 / 1.10 (edges belong to the upper bucket) into behind / matched /
quietly faster; p = 0.7 the read is true, else it reports one bucket off
(a matched truth errs 50/50 either way), never two notches. Every beat
consumes exactly two draws from an `intel` stream outside `race.streams`,
so trajectories are identical with intel on or off. Intel is
narrative-only — no `B` fold, no race mutation — and the velocity itself
is never printed, only the bucket (an unresolvable read falls back to
the matched pool — defensive). The player's China posterior is theirs to
trade.

Headless harnesses cover what is headless — lane rate invariance, latency
arithmetic, standing-order evaluation, room gating, blackout suppression;
pure-display degradation is exempt by nature and is judged in play.

## The knife-edge principle

Nothing is set in stone: no outcome — doom, triumph, shutdown, the
Deal — may be structurally inevitable, in either direction. The priors
are biased (that is the stance); they are never rigged. The targets, and
what `endings-test` checks of each:

1. **Every family stays live.** Each of families 1–6 occurs at ≥ 2%
   marginally (gate), and — conditional on observable state at each act
   boundary, before a terminal has actually fired — no family's
   posterior exceeds 0.60 and no reachable family falls below 0.02 (a
   design target; `reader-test` reports it from the full reader). A run
   can *lean*; it cannot be over early.
2. **Resolution concentrates at the threshold.** `d = margin −
   required` has median |d| in [0.06, 0.15] (gate; diagnostic ≈ 0.14),
   and ≥ 40% of runs land within the player's maximum reachable |d_P|
   (gate): the sample decides *whether* it's close, play decides the
   close ones. This is how knife-edge coexists with bounded influence —
   the 30% clip matters because many worlds end inside it.
3. **Determination is late.** The full reader's family head, on test
   seeds, beats the prior's Brier by < 25% from day-350 public state and
   by < 60% from day-700 (gates, `endings-test`). It replaced a
   four-feature bucket oracle that measured the ceiling against a weak
   predictor. The reader stays below the prescribed ceilings; that does
   not establish when a world becomes inferentially determined.
4. **Ratchets bind sometimes, never always.** No one-way mechanism
   (`controlRegime`, the heat floor, proliferation) may make its
   terminal state the attractor of most runs — nationalization,
   permanent maximum heat, and forced shutdown are outcomes some
   worlds reach, not defaults every world drifts toward.

## Target outcome distribution (the tuning contract)

Family shares are **eventual** — in-horizon plus timeout-extrapolated
resolutions — in percentage points, summing to 100:

| Family | Target band (gate) |
|---|---|
| 1 won with margin | 14 ± 5 |
| 2 knife-edge | 21 ± 6 |
| 3 misaligned (*all* technical failures, whoever led — a misaligned Tianxia crossing is family 3 with subtitles, per 05) | 32 ± 7 |
| 4 China-first (non-failure: control-axis outcomes) | 14 ± 5 |
| 5 the Deal | 5 (2.3–8) |
| 6 fizzle | 14 ± 4 |

**Timeout is not a seventh family:** the epilogue extrapolates, sampling
the remainder forward from standing state and narrating "years later",
and lands in one of the six with the knife-edge constraints intact. The
**extrapolation share** (runs resolving after day 1008) targets ~25%,
band [0.18, 0.32]. In-horizon family-6 confirmations are expected ≈ 0
(allowed 0–3%): a plateau is mostly a fact the epilogue confirms, not
the game. Family 6 sits near its low edge because the plateau rule
routes fizzle mass through extrapolation, and some of it lands as
timeout family-1/2 texture. The endings harness asserts the family
table, the extrapolation band, and liveness as hard gates.

**Family-4 composition** — the epilogue needs the causal reading, not the
nominal one. Beijing was faster in essentially every China-first world;
in a substantial share, America also regulated itself out of a lead it
would otherwise have kept; a theft, where one happened, was punctuation,
not cause (about one family-4 world in ten has one, by co-occurrence).
Blockades are nearly disjoint from family 4 by mechanism.

**Retune order:** act boundaries (g0, r0, q-band) → incident cadence
(the 0.07 and 0.30 in Λ_world) → knife-edge targets → outcome table
(gates, S0, pace) → τ and `required` last — τ, `required`, `leadAdj`, and
the mapping gates are the stance, and the knife-edge targets are its
guardrails. Validate a lever as specified, never by a neighboring
experiment.
