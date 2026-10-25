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
each certifiable contract is genuinely two-sided, and the listing base
rates are derived from the world they describe: the gate is that each
listing mid sits within 8 points of its measured settlement frequency
(`consensus-test`). R2's 70% is still two-sided enough for a live NO
book, and no contract is degenerate. `belief.js` `RUNG_BASE` holds the
same four numbers: day-0 conditional-law seeding makes quote = listing
prior *exactly*, so they are one number stored in two places and move in
lockstep or not at all.

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

**`B`** is a per-rung logistic hazard `{m, w}` over crossing dates. Widths
at listing `w = {90, 140, 120, 160}` for R2–R5; `RUNG_SPACING = 150` days
for rungs pulled forward by a certification below them. Medians are
seeded so day-0 `F_R(deadline)` equals the listing base rate *exactly*,
solved against the survival-conditioned law (day-zero implied medians
{341, 686, 831, 863} against measured KM {405, 736, 860}). The law runs
early by construction: two parameters cannot hold both the median and
the deadline probability of an outcome with a long "not this term"
tail; a plateau mass per rung is on the [roadmap](../ROADMAP.md). Widths
**tighten with evidence** — `w ← w·(1 − 0.15·α)` on each timeline update,
floor 25 — so the market sharpens as the race resolves: Act III's
"repricing all at once" in mechanism form. The quoted probability is
**survival-conditioned**, `P(T ≤ D | T > today)` — no progress as the
deadline nears IS decay toward NO; the unconditional CDF is a seeding
device only. Every `m`/`w`/monotonicity mutation is ledgered under its
originating event ID (monotonicity corrections are consequences of their
trigger, not anonymous drift), and the harness reconstructs live state
from that ledger alone.

**Two-channel routing:** the crossing-date timeline moves only on
releases and certifications — a claim blends at `A_CLAIM = 0.55`; a
certification marks its rung crossed and pulls the next rung toward
`day + 150` at `A_CERT_NEXT = 0.35`; a routine release nudges at
`A_ROUTINE = 0.06`; monotone `m` is re-enforced each step. Incidents,
insider tips, and evidence fold into a **bounded alignment sentiment**
(±log 19): published evidence adds its `logLR`; a detected incident
subtracts `0.06·(severity + 1)`; leaks blend `0.7·B + 0.3·L(leakedSignal)`,
once per evidence ID; a theft disclosure subtracts 0.20. Leaks update by
evidence, never by interpolating toward truth (that would couple `B` to
latent state and let a handful of leaks reveal most of the gap). Reason
for two channels: some 60 flagged occurrences a run would walk an
every-event timeline into runaway, and the player's timeline edge dies
if every tip moves `B`. The alignment sentiment is recorded but
unpriced: no quote, valuation or display reads it. Belief noise is
**off**: every `B` move is causal, and the `belief` substream is
reserved.

**Event impulses** are a decaying overlay on the sim parameters
(half-life 5 trading days), carried as `impulse: {…}` on race shells and
dispatched inside `_fireEvent` on every path. Bridge-fired impulses are
scaled by `(1 − 0.6·η)`, so the market's reaction to a race headline
damps as the released frontier rises; that is η's only consumer. Signs
are binding; per-shell magnitudes live on the
shells and are tunable. Overlays are removed before day-complete
processing, so events mutate baseline parameters and day-complete
valuations never price through a transient overlay; permanent additive
deltas on the race stream remain forbidden ([03](03-market-mechanics.md)).

**The posterior.** The player's timeline is held in the same form as
`B`: for each tracked rung R2–R5, a logistic law `{m, w}` over the
*certified* crossing day (R5: the terminal crossing). Bounds:
`w ∈ [25, 400]`, `m ∈ [0, 2016]`, medians monotone
`m₂ ≤ m₃ ≤ m₄ ≤ m₅` (dragging one pushes its neighbours), and a
certified rung is frozen at its certification day. The player edits a
standing **draft** at any time on the Markets page. Day 0's draft is a
copy of `B`.

**Locks** stay quarterly: days 0, 63, 126, …, on-grid, immutable, with
idempotent replay only. Each lock day raises the lock dispatch, which
holds the day (it counts in `_popupBarrier`) until a lock is recorded.
The choices are *as drawn*, *the market's curves*, *earlier than the
market* (`m_B − 0.5·w_B` on each uncertified rung, `w_B` kept), *later
than the market* (`m_B + 0.5·w_B`), or *adjust first*. Adjust first
dismisses the dispatch, opens the Markets page with the editor focused,
and keeps the day held until the panel's Lock is pressed. Every lock
stores the player's curves together with a snapshot of `B`'s `{m, w}`
for the same rungs.

**Scoring.** At each lock day `L_{q+1}`, every rung R ∈ {2, 3, 4} that
was uncertified at `L_q` is scored for the quarter `[L_q, L_{q+1})`,
under the lock recorded at `L_q`, for both the player and the snapshotted
`B`. The quarter's crossing probability is
`p = (F(L_{q+1}) − F(L_q)) / (1 − F(L_q))`, clamped to [0.02, 0.98], and
`o = 1` if R was certified in the quarter. The skill increment is the
log-likelihood ratio, in nats:
`Δ = o·ln(p_P/p_M) + (1 − o)·ln((1 − p_P)/(1 − p_M))`. Cumulative skill
is `S_P = ΣΔ`, and **credibility = tanh(S_P / K_CRED)**, with K_CRED set
in calibration. R5 is not scored, because nothing certifies
it.

These properties are gated by the harness:

- A player who locks the market's curves scores exactly 0 every quarter.
- The score is proper: the expected Δ under the true law is maximized by
  reporting that law.
- A quarter without a crossing is information. The early caller pays a
  little every quiet quarter and collects when the crossing lands, so
  being early is indistinguishable from being wrong until it isn't.

A run scores up to sixteen quarters. The gates are memos > 0.55 and
fund-as-actor > 0.65 ∧ `F` > 60. Calibration targets (gated by
`forecast-test`):

- An oracle that locks the true certification days (`w` 30) clears the
  fund gate by day 756 in ≥ 80% of the worlds that certify a rung by
  then.
- An informed player halfway between `B` and the truth (`w = 0.7·w_B`)
  clears the memo gate by day 882 in roughly half of worlds (band
  30–70%).
- The market copier stays at 0.
- No static preset (earlier or later) earns more than a bounded edge.
  Because `B` runs early (above), a static *later* caller earns about
  +0.14 nats over a run from Act I's quiet quarters and clears the memo
  gate in about 4% of worlds; the gate is ≤ 0.25 nats and ≤ 10%.

**K_CRED = 1.8** (calibrated by `forecast-test`). Diagnostic: the
informed rate is steep in K (about 94% at 1.5 and 31% at 2.0), so retune
with care. Early
quarters carry little score, because both laws clamp at 0.02 until a
rung is in reach.

`lockedClaim(R)` is the latest lock's P(T_R ≤ D_R) at the contract
deadline. `playerPilled` mirrors `marketPilled` exactly: 100 × the
latest lock's P(R4 within 252 days of today | not yet crossed). A player
who locks the market's curves therefore reads exactly the market's
pilledness, and draws no scrutiny gap or trait for copying. Consensus
settlement scores nothing. The editor and the record's display are in
[03](03-market-mechanics.md).

**Firm belief `F`** lives on `race.F`: starts 15, clamped [0, 100]; wakes
toward market pilledness at 0.08 of the gap per step, and converts toward
the player's side at `6·max(0, credibility)` per step. Market pilledness
reads **R4** while the compute lift reads **R5** — a deliberate
asymmetry: firm culture wakes on the visible recursion-adjacent frontier,
compute demand scrambles on the terminal rung. The **scrutiny** loop
fires on a belief gap > 20 with a ±3 `firmStanding` nudge, **two-sided**:
−3 divergent and underperforming, +3 divergent and outperforming (the
committee grudgingly respects P&L). No lock, no stated posterior, no gap.

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

`V` is a survival-conditioned expected terminal multiple, read from
public state only (`buildPublicView` and `belief`):

```
V = Π·[Λ·m_W + (1 − Λ)·m_C] + (1 − Π)·m_F
```

- `Π = F₅(1000)` is the market's *unconditional* belief that R5 lands
  this term, read off `B`'s own R5 law `{m, w}`. It is 0 from day 1000
  on without a crossing. Unconditional, because `B` moves only on
  legible events, so `Π` moves only on news: certifications and rung
  claims pull the median in, and routine releases with no claim drift it
  out, which is how a stall unwinds the AGI trade. A survival-conditioned
  quote would decay toward the deadline in every world and make shorting
  HCN a free trade.
- `Λ = σ(λ₀ + (r_W − r_T)/0.75)` is the public lead, with `λ₀ = 1.0`
  (the market's prior that Tianxia trails). `r_W` is the highest
  *claimed* released rung of Halcyon or Polaris, and `r_T` is Tianxia's
  (below the ladder counts as 0). Without the prior, tied R1 claims
  (30% of day-0 worlds) read as a coin flip.
- `m_W = 1.40` (the family-1/2 blend of 1.60 and 1.25, weighted 14:21),
  `m_C = 0.35` (family 4's recovery), and `m_F = 0.55` (the fizzle
  centre).
- Misalignment (family 3) is absent by construction; that is the
  survival conditioning. The Deal has no term.

Day 0 reads Π 0.70, so V ≈ 1.08 with a one-rung Western claim lead and
≈ 0.95 with claims tied (gate, `valuation-test`).

`V` is recomputed at day close, after `stepBelief` and the bridge pass.
The authoritative price takes the change as a level gap before the next
open: `S ← S·ratio`, where `ratio = V_t / V_applied` is clamped to
[0.75, 1.30] and `V_applied` is the last level actually embedded in the
price, so a clamped remainder carries into later days. Resting orders are
checked at the post-gap price, and the resolving day takes no gap.
A Halcyon certification lifts Π and Λ, and a Tianxia claim of parity
cuts Λ. Routine releases that claim nothing drift `B`'s R5 median out,
and day 1000 without a crossing drops Π to 0, so the AGI trade unwinds
on the tape in the worlds that stall. The gap reaches every downstream
mark the normal way (`_syncAll`), and the markets snapshot is taken
after it. Classic has no `V`. The decaying impulses stay, as texture:
vol, jump intensity and a hair of drift.

Gates (`valuation-test`):

- Corrupting every latent field leaves `V` bit-identical.
- No silent drift: across seeds, V is unchanged on every day without a
  legible event that moved `B` or a claim, apart from the day-1000 step.
- `V ∈ [m_C, m_W]`, and the ratio stays inside its clamp.
- `V` is constant in Classic.
- No-player race trajectories are untouched, because nothing under
  `src/race/` reads `sim`.

Diagnostics (`valuation-test`): gaps over 2% fall on under 1% of days;
the largest daily move is the 25% clamp floor.

**Known bias:** `B` is a heuristic updater, not a martingale, so V
inherits its drift. Routine releases pull R5 out in every world, and mean
log V falls about 0.29 over a run even in family 1. The terminal reveal
is correspondingly large: the median `m_f/V_T` is about 1.85 for family 1
and 0.42 for family 3. The calibrated public estimator on the
[roadmap](../ROADMAP.md) removes it.

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
`hasEverLocked`. The orchestrator consumes the exposed delta and never
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
in the valuation layer's Π. A quiet half-year is a flat-to-down round.

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
composes no sentences. `resolution.movability` renders always, as a
number.

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
   design target no harness measures yet). A run can *lean*; it cannot
   be over early.
2. **Resolution concentrates at the threshold.** `d = margin −
   required` has median |d| in [0.06, 0.15] (gate; diagnostic ≈ 0.14),
   and ≥ 40% of runs land within the player's maximum reachable |d_P|
   (gate): the sample decides *whether* it's close, play decides the
   close ones. This is how knife-edge coexists with bounded influence —
   the 30% clip matters because many worlds end inside it.
3. **Determination is late.** An oracle predicting the final family
   from day-350 observable state beats the prior's Brier by < 25%;
   from day-700, by < 60% (gates). Most outcome
   variance resolves in Act III, where the player is watching.
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
