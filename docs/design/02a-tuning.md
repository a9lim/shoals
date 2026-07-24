# 02a — Tuning Appendix

> Rev 2 (2026-07-23) — recalibrated against the Codex numerical pass
> (gaslamp job `cx-20260723-125729-60be`, which integrated the ODE and
> Monte-Carloed the process; rev 1's coefficients reached R5 ~400 days
> early and its fizzle tail was 2.6%, not 12%). Numbers are priors to
> playtest; the **target outcome distribution** at the bottom is the
> tuning contract. Units: trading days (game = days 0–1008, 16
> substeps/day); capability in rung units (R1 = 1 … R5 = 5); `S`,
> `heat`, τ, culture, pace in [0, 1]. All hazards are per trading day —
> per substep use `p_sub = 1 − exp(−λ/16)`, never `λ` raw.

## Per-run sampler

| Variable | Distribution | Notes |
|---|---|---|
| τ `alignTractability` | Beta(2, 3) | mean 0.40 — race-speed alignment works in a minority of worlds |
| `takeoffSharpness` | Beta(3, 2) → mapped [0.5, 3.0]; `sharpnessNorm = (sharpness − 0.5)/2.5` | multiplier on recursion; mass toward fast |
| `scalingElasticity` | mixture: 12% Uniform[0.25, 0.6] (fizzle tail) + 88% Beta(5, 2) → mapped [0.6, 1.1] | overall median ≈ 0.95; the tail is a real 12% by construction |
| `chinaTrue.position` | Normal(mean 0.8, sd 0.3) clamp [0.2, 1.6] | rung gap behind Halcyon at start |
| `chinaTrue.velocity` | LogNormal, median 0.95, σ 0.37, clamp [0.75, 1.325] (P6-1b final, exact; own substream `chinaVelocity`. The high clamp was widened from the 1.15 guess — a fat upper TAIL, not a raised median, is what lets the fastest-Tianxia worlds cross in-horizon) | hidden multiplier on Tianxia capability drift — is Beijing slower, matched, or quietly faster; the China posterior the market argues about |
| `chinaTrue.dealPossible` | Bernoulli(0.15) | treaty live only here |
| `labSafetyCulture` | Halcyon Normal(0.5, 0.2) clamp [0.1, 0.9]; Polaris Normal(0.8, 0.1); Tianxia = 0.15 fixed | anti-safety by construction |

## Capability kinematics

Start: `C_int[halcyon]` = 1.75, `C_rel[halcyon]` = 1.55.
`C_int[tianxia]` = 1.75 − position, `C_rel[tianxia]` = `C_int[tianxia]`
− 0.1 (ships everything). `C[open]` = `C_rel[tianxia]` − 0.15. Polaris
spawns (typ. ~day 400) at `C_int[halcyon]` − 0.6 with `S` = 0.70.
Clamps: `C ∈ [0.3, 5.5]`, `C[open]` ≥ 0.3.

```
ignition  q(E) = smoothstep(0.60, 0.75, scalingElasticity)
base      μ_b  = g0 · compute(t)^0.5 · talent^0.3 · E
recursion μ_r  = r0 · sharpness · C_int · σ((C_int − 2.8)/0.35)
dC_int/dt = q·(μ_b + μ_r) + (1 − q)·μ_b·max(0, 1 − C_int/3.2)
          + 0.004·Normal(0,1)                (daily shock, not √day)
g0 = 0.000828/day      r0 = 0.000724/day
compute(t) doubles yearly (so compute^0.5 = 2^(t/504)); Halcyon
resources = 1.0, talent 1.0. Tianxia: compute 0.75 growing 1.3×/yr
(export-control-dependent, 0.8–1.6×), talent 0.85. Polaris: compute
0.25, talent 1.1.
```

Calibration (Codex-verified at prior medians): R2 ~day 230, R3 ~644,
R4 ~800, R5 ~911 — note the recursion sigmoid's tail contributes from
day one (σ(−3) ≈ 0.047, ~25% of base at start); that is *in* the
calibration, not a bug to re-fix. The official calibration statistic
(settled 2026-07-23, phase-1 verification): **unconditional
first-passage medians** — right-censored runs (no crossing by 1008)
count, Kaplan–Meier style — never medians conditional on crossing,
which bias early. The ±10% tolerance is a *design* band (how far the
stance may drift), not a sampling band; MC sampling SD at N=1000 is
~2–4 days. Low-elasticity worlds (q → 0)
asymptote near C ≈ 3.2 — the plateau is a ceiling, not a slower slope.
**Plateau confirmation** (resolution ladder step 3; ratified at the
phase-6 gate, 2026-07-24, superseding the trailing-120 raw test):
confirmation requires ALL of — recursion never ignited (`q < 0.01` /
`E ≤ 0.60`), R5 never crossed, **day ≥ 700**, and the smoothed
(shock-free expected-drift) capability growth of the leader
< 0.0002/day **sustained over the trailing 180 trading days**. An
instantaneous drift reading is a signal, never a confirmation — the
phase-6 gate caught a day-1 "confirmed" plateau (low-E runs sit under
the drift threshold from the start; a stall is indistinguishable from
being early except in hindsight). By construction most family-6 mass
arrives via timeout extrapolation, per the phase-1 finding below —
in-horizon confirmations are the late, demonstrably-saturating tail.

**Polaris defaults** (ratified 2026-07-23; calibration-neutral —
Halcyon leads regardless): compute grows 2×/yr like the frontier;
starts SL2; `C_rel` = `C_int` − 0.2 at spawn; spawn day ~
round(Normal(400, 25)) clamped [300, 500]; culture Normal(0.8, 0.1)
clamped [0, 1] like every culture draw.

**Releases:** release when `C_int − C_rel` > appetite; appetite 0.25
(Halcyon), 0.15 (Tianxia), 0.45 (Polaris); +0.1 when heat > 0.55, −0.1
when trailing by > 0.25 rung. Release pulls `C_rel` up 85% of the gap.
Per-lab release cooldown **45 trading days** (tuned 2026-07-23 against
the ratchet band — majors ship no oftener than ~9 weeks; 63d was
rejected because it pins the release count at its ceiling and no floor
increment lands mid-band).
Certification lags: R2 Exp(25d); R3 Exp(60d) + 40% disputed (+20–40d);
R4 Exp(20d). Certification is **nested** (ruled 2026-07-23): settling
rung r settles all unresolved lower rungs the same day and cancels
their pending timers — a certified R4 entails a certified R3. The
ledger records implied-vs-direct settlement so Consensus can
distinguish them.

## Safety margin, heat, theft

```
dS/dt = 0.0009·culture·(1 − 0.8·heat) − 0.0012·racingPace
S0    = { halcyon: 0.50, tianxia: 0.15, polaris: 0.70 (at spawn), open: 0 }
racingPace ∈ [0,1] = f(knife-edge proximity, appetite pressure); baseline 0.30
heat0 = { transient: 0.15, floor: 0 }
```

Post-theft: `S` *accumulation* zeroes for 90d; racing burn continues.
Heat impulses as [02](02-race-model.md) rev; theft adds +0.04 to the
permanent floor. Heat floor also takes
min(**0.016**·tianxiaReleases, **0.30**) — retuned 2026-07-23 with the
45d cooldown so the proliferation cap binds in ~47% of runs (inside
the 35–55% acceptance band — a strict minority, with sampling room;
rev 2's
0.05/0.35 saturated in ~95% of runs, a ratchet that always bound).

**Theft:** attempt hazard/day = **0.0015** (recalibrated 2026-07-24
under the new desperation distribution; rev 1: 0.0011) · clamp(0.10 +
1.4·desperation, 0, 1.5) · (1 + heat) — the 0.10 floor keeps
parity-state espionage alive (stealing isn't only for the desperate).
`desperation` is the shared strategic-desperation quantity defined at
the strait block below (phase-6 amendment: the raw internal gap
stopped meaning desperation once the fast-follower bounded it — see
there). The base above IS the recalibrated value (rev 1: 0.0011). Success by victim security
level SL1–SL4: [0.70, 0.45, 0.18, 0.04]; failed attempts cool down
60d. Halcyon starts SL2; upgrade costs ~8% `C` velocity for 60d +
retention events. ε ~ U(0.15, 0.35). Benchmark (SL2, no upgrade, heat
≈ 0.3): E[successes] ≈ 0.6 — that is a *benchmark*, not an invariant;
SL3 cuts it to ~0.27, which is what the upgrade buys.

**Strait:** gray-zone ~Poisson(1/90d)·(1 + heat)·tension; blockade
cumulative per-run ≈ 3% baseline → 12–15% hot/desperate. Blockade: far
compute curve +40–80%, heat +0.20, mobilization gate opens.

Blockade hazard (ratified 2026-07-23, phase 5a — calibrated against
the incidence band above; measured 2.9% / 14.2% at N=2000):

```
h_block/day = BLOCKADE_BASE · (1 + heat) · (0.5 + 2.05·tension)
                            · (0.4 + 1.4·desperation)

vDeficit    = clamp((1.05 − chinaTrue.velocity) / 0.30, 0, 1)
runaway     = clamp((C_int[frontier] − C_int[tianxia] − 0.25) / 0.60,
                    0, 1)
desperation = max(vDeficit, runaway)
```

**Desperation redefined (phase-6 ruling, 2026-07-24).** Rev 1 read
`clamp((C_int[frontier] − C_int[tianxia])/1.2)` — the raw internal
gap. The P6-1b fast-follower bounds that gap near the release lag
(~0.13, low variance), so the raw gap stopped *meaning* desperation:
it measures release-cycle phase, not strategic position. The
redefinition reads what actually signifies "Beijing losing
unconventionally-relevantly": the velocity deficit (a world where
their program is genuinely slower — their own hidden state, which
they of course know) OR post-ignition runaway (the frontier's
internal track pulling away past the follow floor ≈ appetite, where
distillation stops helping). Both are physical-world reads, the same
class as before — never a market/quote read. Emergent and intended:
blockades now concentrate in slow-velocity worlds, anti-correlated
with family 4 (the tail fires in the timelines where China was
losing; measured near-disjoint). `BLOCKADE_BASE` = **0.000052**
(recalibrated 2026-07-24 against the UNCHANGED incidence band —
measured 3.0% baseline / 14.6% hot; rev 1: 0.0000355; the band is
the design invariant, the base was always derived from it). The
vDeficit/runaway scales landed VERBATIM as specified — no shaping
needed. Theft's gap term takes the same desperation quantity (see
the theft block).
Duration ~ Exp(45d) clamped [20, 120]: blockades **end** — flag, heat
overlay, and compute force-majeure all lift together. The mobilization
gate, once opened, stays open for the run (the political option space
doesn't re-shrink). Strait tension is one shared source:
`0.6·clamp(−chinaRelations/3) + 0.4·clamp(tradeWarStage/4)`, public
facts only. No gray-zone escalation or new blockade rolls while a
blockade is active.

## Incidents (two-track) and evidence

World occurrence process (cadence-calibrated; per-lab hazards compose
badly, so the *world* rate is the primitive):

```
w_i      = exp(0.7·(C_int,i − 2)) · (1 − S_i) · (0.5 + heat) · surface_i
Λ_world  = min(0.30, 0.07 · Σ w_i)          (Poisson daily; source ∝ w_i)
surface  = { halcyon 1.0, tianxia 1.3, open 1.6, polaris 0.4 };  S_open = 0
```

Gives ~one occurrence per 13 days early, capped near one per 3.3 days
late. Severity: S0 0.55 / S1 0.25 / S2 0.15 / S3 0.045 at mid-margin,
renormalized after the S4 draw — **S4 is budgeted separately as a
late-tail event**, not a flat slice:

```
p4 = min(0.005, 0.0004 · ((1−S)/0.5)² · (heat/0.5)² · σ((C_int − 4)/0.25))
```

(A flat 0.5% over ~100–140 incidents/run would have ended 39–50% of
runs by S4 alone and eaten the outcome table.)

Detection per severity — full ladder ratified 2026-07-23 (rev 1 gave
only the endpoints): S0 0.70/Exp(10d); S1 0.78/Exp(8d); S2
0.86/Exp(6d); S3 0.94/Exp(3d); S4 1.00/immediate (same tick —
self-disclosing is the point); persuasion 0.40/Exp(90d), unlocks at
C_int ≥ R3 and takes a **0.20 share** of class-draw once unlocked
(ratified) — **severity 4 is never persuasion-class**: the absolute
S4 self-disclosure rule dominates every reclassification (ruled
2026-07-23, phase-2 gate). Reporting regime:
detection `min(1, p + 0.12)`, lags halved — and activation applies
**retroactively once**: pending latents re-roll detectability and
remaining lag under the improved parameters at activation (the
disclosure wave when a reporting mandate lands is deliberate; ruled
2026-07-23). Insider tip: **one
Bernoulli(0.3) per undetected incident** (standing-gated), drawn at
occurrence — "undetected" means every incident not detected in its
occurrence tick, independent of whether public detection ever comes;
the occurrence→disclosure window is the tip's whole point (ruled
2026-07-23; gating on the never-detected tail alone starves it). Occurrence-day physical S-effects are **deferred
entirely**: the latent-record field stays null until a 02a revision
ratifies a magnitude (no invented truth-valued numbers in state, even
inert ones; applying one would also double-count the calibrated S
path).

**Evidence beats:** per alignment-carrying lab ~Exp(40d) —
alignment-carrying = **Halcyon and Polaris** (ratified 2026-07-23;
Tianxia is anti-safety by construction and produces no alignment
evidence, only capability signals). Per-beat LR: |log LR| ~
U(0, log 3), sign ~ Bernoulli(τ) (kind worlds read kind, ratified),
clipped to [⅓, 3] **and cumulative evidence log-odds clipped to
±log 19** — the posterior ceiling (0.95) is enforced at the
accumulator. Measured cadence ≈ 40 found / 28 published per run
(rev 2's "~22 beats/run" rationale figure was a loose derivation —
the clamp is the stance; the count is derived, and the clamp holds
at any count). Publication prob = culture; unpublished beats leak
at 0.25.

## Consensus binaries (phase-3a ratifications, 2026-07-23)

`BINARY_NOTIONAL = 100` (mirrors bond face; per-unit prices share the
bond display scale). Contract deadlines: R2 → day 420, R3 → 756,
R4 → 880, R5 → 1000 — calibrated against the *measured certified* KM
medians (R2 ~405, R3 ~736, R4 ~860) so each certifiable contract is
genuinely two-sided (~57–60% YES), per the knife-edge principle.
Binary longs are cash-funded (no leverage); shorts post full-notional
collateral with premium sequestered. R5 settles only via terminal
closeout ([09](09-market-integrity.md), oracle discipline) — the
harness's "R5 100% NO" is the pre-endings artifact of runs that never
terminate, not the design. `disputeDeadline` rides every tuple per 09;
its adjudication path activates when a dispute event class exists
(P5) — certification disputes are meanwhile resolved upstream in
`stepCertification`'s disputed-lag draw. Quote magnitudes are
placeholder until `B` lands (phase 4) and are deliberately not
recorded here.

**Listing-prior recalibration (P6-1b, 2026-07-24)**: the retuned
kinematics (velocity / drag / follower legs) shifted the certified
settlement frequencies, so the public listing priors move with the
world they describe — the harness's 8pp listing-mid invariant is the
contract, the base rates are derived. Old → new: R2 0.57 → **0.70**
(measured 0.705 at N=2000), R3 0.56 → **0.62** (0.625), R4 0.57 →
**0.60** (0.600); R5 stays **0.70** (designed crossing prior; measured
crossing 0.712, within the invariant). The "genuinely two-sided
(~57–60% YES)" knife-edge above described the pre-retune world; R2's
70% remains two-sided enough for a live NO book, and no contract is
degenerate. `belief.js` `RUNG_BASE` moves in lockstep — the day-0
conditional-law seeding makes quote = listing prior *exactly*, so
these constants are one number stored in two places by construction.

## Compute futures (phase-3b ratifications, 2026-07-23)

`COMPUTE_INDEX_BASE = 100` (shares the bond-face/binary-notional
display scale); rolling four-maturity quarterly ladder; Reg-T shorts
with `COMPUTE_MAINTENANCE_MARGIN = 0.35`; fills are spread-only
(`COMPUTE_SPREAD_VOL = 3.0`, no impact pool — allocation-quarter
contracts don't trade through the equity impact book; P4 may
revisit). Curve **structure** is ratified: demand uplift from public
release count + certified rung + secular trend; scramble
backwardation (near rich, saturating far); standing strait premium as
a *pure tail* — zero at spot, saturating with maturity — so
geography is priced only where geography bites. Curve **magnitudes**
(the demand coefficients, scramble depth, standing-tail size, spread
width, tension weights) are the P4-swappable placeholder quoter,
deliberately unrecorded here — same stance as the binary quote
magnitudes above.

Blockade: the far-curve band **[0.40, 0.80]** is verbatim from the
Strait block; the near end carries **half** the blockade adjustment
(`BLOCKADE_NEAR_FRAC = 0.5`) so a contract settling *during* a
blockade settles force-majeure-priced, never at a pre-blockade free
pass.

**Two straits, two flags** (ruled 2026-07-23): the compute market's
blockade condition is `geopolitical.taiwanBlockade` (Hsinchu — the
fabs), a new field distinct from the Gulf arc's `straitClosed`
(Hormuz — oil), which survives from the prototype and must never
touch the compute curve. `taiwanBlockade` stays dormant until P5
wires the strait generator (gray-zone/blockade events per the Strait
block above); until then the force-majeure path is harness-exercised
only, exactly like the `controlRegime` transitions. Strait tension is
read off the China proxies (`chinaRelations`, `tradeWarStage`).

**Decree ≠ nationalization reference** (ruled 2026-07-23): the
compute-future decree closeout uses the contract's *own listed
multiplier* (= 1 at listing) over the formulas enumerated at listing,
per [09](09-market-integrity.md). The U[0.60, 1.15] conversion
multiple and the 20-session median belong solely to **HCN share
conversion**; phase 3b builds that reference as seed-persisted state
(drawn once at race creation from the `nationalization` substream)
for the endings phase to consume — the two multipliers never mix.

## Market coupling

**η reads the released frontier** (ruled 2026-07-23, phase 4): 03's
"η rises with `max(C)`" means `max(C_released)` — the licensing
rationale ("quant shops license the models too") only reaches shipped
models, and a public-state-derived η keeps the corruption-invariance
harness meaningful. Latent `C_internal` never touches market
efficiency; it acts only through evidence, like everything else.

η, pre-price, impact, and `B`-update magnitudes as rev 1, with two
hardenings (per [09-market-integrity.md](09-market-integrity.md)):
every non-random `B` move carries a causal evidence ID; and **leaks
update by evidence, not by truth-interpolation** — `B_new = 0.7·B +
0.3·L(leakedSignal)`, one update per evidence ID, no cooldown-free
re-leaking of the same fact. (Rev 1's "30% of the B−truth gap" both
coupled `B` to latent truth and let five leaks reveal 83% of it.)

**Forecast locking:** lock days fixed at 0, 63, 126, … (quarterly, not
event-relative — no waiting out late evidence); the full claim vector
is mandatory each lock; Brier averaged over the vector;
credibility = EMA(α = 0.25, init 0) of (1 − 2·Brier). Gates: memos
> 0.55; fund-as-actor > 0.65 ∧ `F` > 60.

`F` ∈ [0,100] starts 15; moves as rev 1.

## Belief and coupling (phase-4 ratifications, 2026-07-23)

`B` is a per-rung logistic hazard `{m, w}` over crossing dates, widths
`w = {90, 140, 120, 160}` for R2–R5 at listing, `RUNG_SPACING = 150`
for rungs pulled forward by a certification below them; seeded so
day-0 `F_R(deadline)` equals the listing base rate *exactly* — the
seeds are solved against the survival-conditioned law, giving
day-zero implied medians {393, 721, 846, 863} against measured KM
{405, 736, 860}. Widths **tighten with evidence** (ruled at the
phase-4 gate): `w ← w·(1 − 0.15·α)` on each timeline update, floor
25 — the market sharpens as the race resolves, which is Act III's
"repricing all at once" in mechanism form. The quoted probability is
the **survival-conditioned** `P(T ≤ D | T > today)` — no progress as
the deadline nears IS decay toward NO; the unconditional CDF is a
seeding device only, re-solved so day-0 quotes stay exact. Every
`m`/`w`/monotonicity mutation is ledgered under the originating
event ID — monotonicity corrections are consequences of their
trigger, not anonymous drift.

**Two-channel routing** (ratified): the crossing-date timeline moves
only on releases and certifications (claim blend `A_CLAIM = 0.55`;
cert marks crossed and pulls the next rung at `A_CERT_NEXT = 0.35`
toward `day + 150`; routine cadence `A_ROUTINE = 0.06`; monotone `m`
re-enforced each step). Incidents, insider tips, and evidence fold
into a **bounded alignment sentiment** (±log 19; published evidence
additive `logLR`; leaks `0.7·B + 0.3·L` once per evidence ID —
the ratified anchor; `ALIGN_INCIDENT = 0.06` per severity step).
Rationale: ~30 tips/run would walk an every-event timeline into
runaway, and the player's timeline edge dies if every tip moves `B`.
P5 policy/dispute events may still move the timeline directly — they
are legible events with causal IDs — and the alignment channel is the
settlement basis for P5's incident-flavored Consensus contracts.

`η = clamp((releasedFrontierRung − 1)/4, 0, 1)`; Act-II pre-pricing
scales event impulses by `(1 − 0.6·η)`. Event impulses are a
**decaying overlay** (half-life 5 trading days, magnitudes = the
rev-1 coupling reference values carried on the shells); permanent
additive deltas on the race stream remain forbidden per
[03](03-market-mechanics.md). Compute belief lift: the structural
curve × `(1 + 0.15·P(R5 by day+252))`, dte-uniform by ratified
simplification. Belief noise is **off** — every `B` move is causal;
the `belief` substream is reserved for a future decision recorded
here first.

`F` lives on `race.F` with its logic in belief.js (revisit at the
P5 roster-v2 pass); starts 15, clamped [0, 100]; wakes toward market
pilledness at 0.08, converts toward the player's side at
`6·max(0, cred)`. Market pilledness reads **R4** while the compute
lift reads **R5** — ratified asymmetry, not drift: firm culture
wakes on the visible recursion-adjacent frontier, compute demand
scrambles on the terminal rung; scrutiny fires on belief gap > 20 with a ±3
firmStanding nudge — **two-sided by rule**: −3 divergent and
underperforming, +3 divergent and outperforming (the committee
grudgingly respects P&L) — interim until P5 rewrites the review
content. Lock semantics (ruled at the phase-4 gate): "mandatory"
binds the *vector*, not participation — a lock, when made, is the
full 4-rung vector or nothing; skipping a lock day is allowed,
scores no Brier, and stalls the credibility EMA (staleness is its
own penalty — a player who never locks never clears the memo/fund
gates). Locks are immutable once accepted: no off-grid days, no
retroactive edits, idempotent replay only. Day 0 is a real prompted
lock, never a manufactured market-prior forecast. The forecast-lock
UI is the minimal 3-preset popup; the timeline-vs-posterior
dashboard belongs to a later phase.

## Content plumbing (phase-5a ratifications, 2026-07-23)

**controlRegime transition gates** — the ratchet runs on a *decaying*
grip pressure (per-day decay 0.97, half-life ≈ 23 trading days), so it
responds to recent severity clusters, not the ever-accumulating S0/S1
farce stream — that decay is what keeps mobilized+ a strict minority
despite ~80–160 detected incidents per run, and it is a design load-
bearing choice, not an implementation detail. Per-detection pressure
increments by severity: S0 0.10 / S1 0.20 / S2 0.80 / S3 4.0 / S4
15.0; persuasion-class 2.5; successful theft 2.0; blockade start 4.0.
Gates, transcribed as the full disjunctions (corrected at the
phase-5a gate — the first transcription compressed the OR-structure
into conjunctive gates, and Codex's replay showed the strict
conjunctions produce 0.08% / 0.00% terminals, killing the
nationalization trade; the event-triggered paths ARE the design):

- **supervised**: pressure ≥ 7 ∨ heat ≥ 0.45 ∨ exo
  supervision/evals push.
- **mobilized** (may jump straight from private on a severe shock):
  pressure ≥ 12 ∨ any S4 ∨ (mobilization gate open ∧ (heat ≥ 0.60 ∨
  pressure ≥ 7)) ∨ (theft ∧ heat ≥ 0.60) ∨ exo push. The open gate
  lowering the pressure bar to the *supervised* threshold is
  deliberate: after a blockade the memo is already drafted.
- **terminal** (**requires already-mobilized** — current rank, not
  the in-call target; the panic button follows mobilization, never
  leapfrogs it): *event-triggered first* — (S4 ∧ theft) →
  nationalized; (≥ 2 detected persuasion campaigns ∧ heat ≥ 0.55) →
  classified; exo pushes; *pressure-gated second* — pressure ≥ 22 ∧
  heat ≥ 0.55, splitting theft-flavored → nationalized, else
  classified. A qualitative catastrophe nationalizes regardless of
  the accumulated-pressure metric — that is the story, not a
  shortcut.

Measured reachability (endogenous only, N=2500, full predicates):
private 15.6 / supervised 68.0 / mobilized 13.9 / nationalized 1.8 /
classified 0.7 — ≥ mobilized 16.4%, a strict minority per the
knife-edge principle; all five reachable; zero monotonicity
violations. Terminal peers never swap: nationalized ↔ classified is
rejected by the sole writer, both directions. Exogenous pushes (lobbying, elections) are
the content layer's lever and arrive as `exo` signals, never as
direct `setControlRegime` calls.

**Regime evaluation is orchestrated, not baked in** — ratified: the
target-regime evaluator (`stepControlRegime`) is a separate step the
orchestrator runs after `advanceRace`, not part of it. `advanceRace`
stays the physical race (capability, incidents, strait — the strait
*is* race dynamics and lives inside); the political overlay is a
consumer of its ledger. This keeps the instrument harnesses'
regime-static runs meaningful and `advanceRace`'s ledger role pure.

**Event cadence scaling** — day-level discretionary base rate scales
linearly in the *released* frontier rung (the same public driver as
η): ×1.0 at R1 → ×2.5 at R5, applied to accept-rate and cooldowns
alike. Measured: early cadence ≈ 41d (prototype match), late ≈ 17d.
This is the day-resolution precursor of 04's tempo compression; the
substep firing pass is P7's, gated by the same driver.

**Field contract** (ratified): new world domain `world.ai` —
`exportControlStage` 0–3, `treatyStage` 0–4, `wonderCount`,
`controlRegime` + `reportingRegime` + `frontierRung` as **race-owned
read-only mirrors** (main.js mirrors race → world each day; event
`when` guards read the mirror, never the race object).
`frontierRung` (added content round 1) is the released frontier rung
— the public act proxy arc guards key on, the same public quantity η
and the base-rate scale read. Ordinary narrative flags the arcs set
(e.g. `fixedpointPublic`) live in `world.ai` as plain writable state,
outside `WORLD_STATE_RANGES` unless deliberately whitelisted. Existing prototype
domains are *not* slimmed yet — every candidate-dead geopolitical
field is still read by surviving prototype `when` guards, so
slimming rides the content-excision rounds, field by field with its
last reader (the AGENTS.md deletion rule, applied to state).
Factions v2 adds `safetyNetworkTrust` (init 20) and `labRelations`
(init 30) to the six; `labRelations` is a **scalar** — per-lab
nuance lives in playerFlags and the insider-channel state, not the
faction table. Traits v2 (agi-pilled, doomer, accelerationist,
deal-believer, insider, whistleblower) gate on **observable play
only** — locked posteriors, credibility, tip verbs, leak choices;
never hidden truth. Their thresholds are narrative gating, not
market math: they stay code-local and tunable through the prose
rounds, and their `effects` land with the content that uses them.

**Impulse magnitudes on the new shells** (strait, regime, dispute):
signs are binding as written (blockade risk-off with jump premium,
relief rally with tail memory, regime hardening scaling with rank),
magnitudes rev-1-tunable — the same clause as the phase-4 table.
Blockade duration, gray-zone silence during an active blockade, and
the latched mobilization gate are ratified above in the Strait block.

**Content-round wiring numbers** (2026-07-24, coordinator): insider
channel feed — bridge fires flagged occurrences as tips gated on
`safetyNetworkTrust ≥ 20` (the init standing: the channel exists
weakly from day one and deepens by sitting), throttled to one tip
per 45 days minimum and one per day maximum (~5–8/run; the channel
is a person, not a feed). The tip's trade edge is real without
extra machinery *if/when detection later fires and moves the tape*
— tipped incidents can also stay permanently undetected (the
never-detected tail), and that quiet-tape ambiguity is design. The
leak verb's detection-acceleration and B evidence-fold ride
`_tipIncidentId`, a stamped seam for the evidence machinery round.
Wonder cadence: likelihood functions of the released rung (0 below
each act gate, then rising; cascade 2.5 at R4+) — the wonder feed
compounds on the same public variable as everything else, which is
the ambivalence rule as wiring.

Content-gate rulings (2026-07-24, second pass): (1) the phase-4
occurrence whisper STANDS — stepBelief folds flagged occurrences
into alignment sentiment at occurrence, so a tipped player's edge
is the *fact and its specificity, never exclusivity*; tip prose
says so. (2) Hedging the conversion memo cannot stop the firm —
being right converts it regardless (04) — but costs attribution:
the verdict gate is F ≥ 75 made-the-case, F ≥ 85 hedged. (3)
Ordinary popups schedule followups at choice level only (engine
fact, now a binding convention). (4) Assigned to the evidence
machinery round: the exportControlStage → Tianxia velocity
dampener (ratify magnitude here first; it perturbs race
trajectories and re-runs calibration), the tip→detection outcome
coupling via `_tipIncidentId`, the leak detection-acceleration +
B evidence-fold, and the theft disclosure track. Assigned to
P6/P7: HCN conversion execution (the nationalization shell's text
stops where today's machinery stops), the classification blackout
(public-feed darkening), `summitLive` + the treaty holds branch.

## Bounded influence (margin units, not log-odds)

Track world and player deltas to each terminal quantity separately.
With `d = margin − required`:

```
d_eff = d_W + clip(d_P, −(3/7)·|d_W|, +(3/7)·|d_W|)
```

— the player's share of any threshold crossing is ≤ 30% of the total,
by construction, with no attenuation of the world when the player sat
out. (Rev 1's `0.7·world + 0.3·player` blend attenuated the world
unconditionally and capped nothing.)

**Player-channel magnitudes (P6-2 ratifications, 2026-07-24).**
Cost-of-capital channel (`coupling.js`): EMA halflife **50 trading
days** over net persistent HCN positioning (net book delta·S/equity +
impact-overlay flow, normalized to [−1, +1], computed
orchestrator-side); output a bounded Halcyon velocity multiplier
`1 + 0.05·clamp(ema, ±1)` — **cap 0.05**, both signs (sustained
long → marginal acceleration, sustained short → marginal slowdown,
03's stance table). The channel is an *orchestrator-passed input* to
`advanceRace` (the `straitTension` precedent) and flows through
`deterministicDrift`, so kinematics and the plateau detector see one
drift. Headless MC passes nothing → the P6-1 calibration is
bit-identical with the channel unfed (harness-probed). Calibration:
constraint 2 measured against the final |d_W| distribution (medians
0.143/0.144/0.150 at the three gate seeds) gives max-|d_P| coverage
**58/62/60%** at cap 0.05 — comfortably over the ≥40% floor, while
0.08 → 84% and 0.10 → 95% overshoot "marginal" into "authorial";
0.05 is the ratified point. Cumulative dC ≤ ~0.16 rung-units over
the horizon; the 50d halflife makes the realistic ramp ≈ the
instantaneous ceiling over 1008 days.

`raceEffects` retrofit magnitudes (per-effect clamp ±0.15, whitelist
S-per-lab + heat, ledgered under event id, tracked on
`race.playerS`): `polaris_supplicant` fund choice → **S[polaris]
+0.06** (runway; only bites in Polaris-leader worlds);
`halcyon_osei_board` restraint choice → **S[halcyon] +0.05**
(~0.35× median |d_W|); `china_export_controls` "Back the controls" →
**heat +0.04** (visible-containment heat — indirect via theft/
incident hazards, never a direct margin move; the Tianxia *velocity*
dampener stays deferred to the evidence round). The osei event was
toast-only in P5; P6-2 reconstructs it as a **oneShot popup**
(coordinator-confirmed — oneShot bars S-stacking across fires;
prose placeholders land with the P6 prose round).

**Recorded imprecision (taper over-attribution)**: `playerS[halcyon]`
ledgers the *raw applied* +0.05, but the burn taper (S_taper 0.265)
erodes part of it before resolution, so `d_P_S` slightly overstates
the S-channel's resolution-time contribution. Accepted: the error is
bounded, conservative (overstates *player* share, which the
(3/7)·|d_W| clip caps), and honest accounting of intent-at-decision
rather than a decayed shadow. The ledger records what capital did,
not what survived the weather.

**P6-2 gate rulings (2026-07-24).** (1) *F-channel attribution*:
firm-belief movement decomposes into the player-attributable
conversion term (advice acts — memos, locks scored by credibility)
and the autonomous B-wake term; `stepFirmBelief` exposes the
decomposition and the ledger records ONLY the player component —
the ledger charges the player for persuasion, never for the world
waking up on its own. The orchestrator must not recompute the split;
it consumes the exposed player-only delta (gated on `hasEverLocked`,
zero-dropped like every channel). The decomposition must survive
exact cancellation: when wake and conversion oppose to a net-zero
interior step, the raw components stand unscaled — *preventing* the
autonomous move is persuasion, and a ledger that erases offsetting
contributions launders exactly the involvement it exists to record.
Proportional scaling applies only when the final [0,100] clamp
actually binds. (2) *Freeze is a mutation gate,
not an append gate*: post-resolution, player channels are INERT —
`applyRaceEffects` rejects (no-op, no mutation) while the ledger is
frozen/inactive, and the orchestrator stops passing `playerCoupling`
after the resolution latch (unfed channel → no drift term, no row).
Check-then-mutate, never mutate-then-fail-to-record: a race
mutation without a ledger row is the corruption 09's freeze exists
to prevent. This extends the zombie-state ruling — after the latch,
books are frozen AND capital moves nothing that counts; the interim
is settlement mechanics, not a second act. (3) The plateau detector
prices the live coupling (single-drift-source, the P6-1 lesson
applied to the player channel: the detector reads
`deterministicDrift` with `playerCoupling` passed — if sustained
capital is the only thing keeping drift above 2e-4, the race has
NOT plateaued; the ledger and `d_P_C` attribute exactly that).

`controlRegime` transition gates: ratified numbers in the "Content
plumbing (phase-5a ratifications)" block above (rev 1 never
transcribed them; the phase-5a set is the first concrete one).
Standing-orders unlocks stay as rev 1, deferred to P7 with the rest
of the delegation layer.

**Terminal closeout rulings (P6-3, 2026-07-24).** The nine 09 cells
flagged as interpretation, arbitrated:

1. *Family-mark magnitudes* (`CLOSEOUT_TUNING`): melt-up **1.60**
   (won with margin) / **1.25** (ambiguous dawn), boring-world
   **1.00** (the Deal — flat is the point), doom equity recovery
   **0.35**, fizzle **0.55 ± 0.15** (seeded), doom bond recovery
   **0.40** (the classic convention, knowingly). RATIFIED (feel
   pass at the prose round, 2026-07-24): the magnitudes sit
   correctly under the epilogue registers — 1.60 under "the growth
   prints," 1.25 under the melt-up no audit can fault, 1.00 under a
   Desk page whose whole sentence is that nothing below is
   dramatic, 0.35/0.40 under "recovery assumptions were applied
   where assumptions were all that remained," 0.55 ± 0.15 under an
   unwind that ends at prices, without incident. 09 fixes the
   shape; these are now the numbers.
2. *HCN options settle intrinsic-vs-family-mark in ALL terminal
   families*, not only nationalization — at the world's end there is
   no remaining time value to price; declared accelerated
   termination generalizes. Corporate-action hook stays (identity
   today). Ratified.
3. *Shares redeem to cash* at reference × multiple rather than
   carrying claim instruments — the epilogue values everything
   immediately, so claims-as-positions have no gap to live in. The
   *claims language* survives in prose. Ratified.
4. *VXHCN terminal mark* = last live `market.vxhcn` as
   last-valid-before-cutoff. The exchange-variance-index
   observation-record + realized-variance fallback machinery is a
   DECLARED SEAM deferred to P7 (it matters when Heston is abandoned
   mid-run — Act III terminal degradation — not at a clean terminal
   marking). Ratified with the seam recorded.
5. *Bonds*: **OVERRULED as flagged** — par redemption erases rate
   P&L in families where 09's own language is "bonds are bonds."
   Ruling: non-doom families mark bonds at the last live MTM (the
   sim's own bond price; `unitPrice` already computes it); doom
   families apply the 0.40 recovery on face. Par-at-the-world's-end
   is only true when the world actually ends.
6. *Fizzle* = single seeded draw (0.55 ± 0.15 from the `'closeout'`
   substream), the 18-month path compressed to its endpoint.
   Ratified; if the gate finds date-differentiated claims materially
   mispriced by pathlessness, the refinement is maturity-linear
   interpolation from last-valid to the draw — not a full path.
7. *No usable frozen conversion reference* → redeem at last spot +
   console.warn, never a family mark. Ratified (defensive; should
   be unreachable).
8. *Compute held past resolution* (private/supervised) → last-valid
   index mark, `kind: 'TERMINAL'`. Ratified — frozen marks are
   terminal and never repriced (phase-3b convention extended).
9. *Early-ejection binaries*: **OVERRULED as flagged** — "world
   stopped ⇒ can't certify further ⇒ NO" contradicts
   desk-ends-before-world. The extrapolation IS the world
   continuing without you: certifications that occur inside the
   extrapolated trajectory before a contract's deadline settle that
   contract YES, exactly as if you'd been there to watch. A binary
   book settles against the world that actually happened, not the
   world as of your firing. (The extrapolation already advances
   race days past the ejection; the contract judge reads the
   extrapolated state as of each deadline day.)

*Overlay mapping* (endings engine): direct — indictment→convicted,
margin call→margin_called, whistleblower→whistleblower_exile;
term_ends/forced_resignation/firm_collapse split by INVOLVEMENT
into gray_eminence vs bystander, judged on frozen-LEDGER actions
(**|C| ≥ 0.02**, S ≥ 0.03, |F| ≥ 0.05, treaty ≥ 1, |d_P| ≥ 0.03,
or firm-converted). Ratified, incl. the Codex-argued exclusion of
traits/credibility/raw-F as primary signals — a belief is not an
act, and raw F carries the autonomous wake. Thresholds code-local
through the prose rounds (traits-v2 convention). The C gate is
UNSIGNED — arbitrated to the code's semantics over this block's
original one-sided transcription (P6-3 gate, 2026-07-24):
involvement is magnitude, not direction — a player whose sustained
short measurably slowed the race was in the room, not in the
audience. (S and treaty stay one-sided because restraint-bought
and windows-advanced are inherently positive quantities.) The
rogue-trading loss popup (prototype `_showGameOver`) routes as
**forced_resignation** through the shared terminal latch — walked
out for cause, the firm survives you; the involvement split then
decides the overlay like any other resignation.

*Closeout substream*: `'closeout'` via `deriveSeed`, deliberately
outside `race.streams` (nationalization-reference precedent) —
race trajectories bit-identical with closeout on or off.

## Resolution arithmetic and the exclusive mapping

```
margin   = S[leader] + leadAdj(lead)
lead     = C_int[leader] − max(C_int[others], C[open])
leadAdj  = −0.15·(1 − lead/0.10)          lead < 0.10
         = 0                              0.10 ≤ lead ≤ 0.25
         = +0.12·min((lead−0.25)/0.25, 1) lead > 0.25     (continuous)
required = 0.22 + 0.35·(1−τ) + 0.08·sharpnessNorm
```

(`required` mean ≈ 0.47, 5–95% ≈ 0.34–0.58 — centered against typical
end-state margins per the knife-edge principle below; rev 1's 0.60
mean left most runs decided ~0.3 from the threshold, i.e. set in
stone.)

Terminal mapping, exclusive, in order:

1. S4 incident → family 3 (resolved in place)
2. implemented treaty → family 5
3. confirmed plateau → family 6
4. at R5 crossing: technical failure (`margin ≤ required − 0.15`) →
   family 3 *regardless of leader*; Tianxia or `C[open]` leader with
   non-failure → family 4 (control axis); domestic leader →
   **family 1 requires `lead ≥ 0.25` ∧ `margin > required`** (no
   knife-edge vindication), else family 2 gradient
5. day 1008 → timeout

(Plateau confirmation in step 3 must be gated to pre-R5 runs: the
trailing-120d growth test false-positives on ceiling-saturated
post-takeoff trajectories — C clamps at the asymptote and flatlines,
reading ~26% "plateau" against the true 12% elasticity tail in the
phase-1 MC. Confirm plateau only where recursion never ignited
(`q < 0.01` / `E ≤ 0.60` are the clean signals); a run that crossed
R5 and then flatlined is family 1–4 business, not family 6. Found by
the phase-1 skeleton's calibration harness, 2026-07-23. Second
finding, same day: the trailing-120d growth test is noise-dominated —
the daily shock puts the growth-estimator SD at ~3.6e-4/day against
the 2e-4/day threshold, so even a truly flat run confirms only ~71%
of the time, and most low-E runs are still slowly climbing toward the
3.2 asymptote at day 1008 anyway (they resolve by timeout
extrapolation, correctly). When the resolution ladder is built, use a
smoothed or shock-free capability estimate, or a wider window, for
the confirmation test — the raw endpoint difference is not usable.)

Treaty sub-gates (to make Deal ≈ 4% derivable from dealPossible 0.15):
discovery of `dealPossible` 0.65/run · initiation 0.85 · farce-gauntlet
survival 0.65 · summit-week-no-incident 0.75 ≈ 0.27 completion given
eligible. **Summit-pass re-ratified ≈ 0.70 (2026-07-24):** the gate is
real-incident-driven, and the P6-1b retune's kinematics run hotter
incident cadence in exactly the windows that open late-run — measured
0.68–0.71 at the final constants. The 0.75 was the pre-retune
calibration target; the DEAL BAND (2.3–8, held at 3.7–4.1%) is the
invariant, and the honest world-coupling (hot worlds fail summits
more) is the mechanism working, not drift to fix.

## Endings machinery (phase-6 ratifications, 2026-07-24)

Rulings from the P6-1 gate (job `cx-20260724-080837-6434`), binding on
the fix/retune rounds:

- **Canonical resolution precedence** is this file's mapping order —
  S4, treaty, **plateau, then R5-crossing**, timeout. 02's prose listed
  R5 before plateau; 02 now matches this file. Materially equivalent
  (plateau is gated ¬R5), but the canonical order is recorded once,
  here.
- **Plateau confirmation** as amended in the kinematics section above:
  never-ignited gate ∧ day ≥ 700 ∧ smoothed drift < 2e-4/day sustained
  180 trading days. Day-1 confirmations are the bug this rule kills.
- **Treaty windows are leak-free by construction.** Window OPENING is
  independent of `chinaTrue.dealPossible`: non-deal worlds traverse the
  same viability-blind gauntlet pacing and open doomed windows at the
  same rate; `dealPossible` gates only the holds outcome after the
  window, never the opening. Posterior P(dealPossible | window) equals
  the 0.15 prior by construction — harness-asserted (the P6-1 gate
  measured 100% under viability-gated opening; 04/09's information
  boundary makes that a blocker, and partial-leak middle grounds were
  rejected: the summit convening may be *evidence* in prose, never a
  *tell* in the joint distribution). At most ONE summit window per run
  (04's "one live negotiation"); expected window rate ≈ the blind
  gauntlet product ≈ 36% of runs, band [0.25, 0.45]. Deal ≈ 4% is
  preserved because the viable-path product is unchanged.
- **`treaty_window` is bridge-fired on the window-open transition** —
  the window is a race-model decision, and the P5 convention (model
  decisions fire from the ledger, never Poisson) applies; the Poisson
  `when: summitLive` gating fired with p ≈ 0.003/window and was
  effectively dead. Category joins the bridge-excluded set. Player
  counsel leverage on the summit gate stays a P7 seam. **Amended at
  the re-gate (2026-07-24): the window's OUTCOME shells are
  bridge-fired too** — the choice-scheduled `treaty_resolution`
  followup was outcome-blind (Deal worlds signed successfully, then
  received the failure prose ~3 weeks later). The window popup's
  choices schedule nothing; the treaty track's outcome transition
  fires `treaty_resolution` (failure) or `treaty_holds` (implemented —
  prose is the coordinator's, lands with the P6 prose round) from the
  ledger. Same principle, one level deeper: the model decides the
  outcome, so the model fires the news of it.
- **Timeout/player-terminal extrapolation includes neutral-signal
  `stepControlRegime`** — the political-control axis reads the
  extrapolated world, not the day the desk's story ended (final
  measurement under the retuned kinematics: 33.15% of extrapolated
  runs change regime post-1008 and every stored political axis equals
  the final extrapolated regime; family rates unaffected).
- **Post-resolution interim — SUPERSEDED by P6-3** (gate finding,
  2026-07-24): the interim (freeze + keep playing to term-end) was
  P6-1 scaffolding only. With the closeout matrix landed, letting
  the sim run past resolution is actively wrong — measured: 359/500
  worlds resolved early and stayed live a median 128 days; 132/5000
  changed regime *after* the world was terminal and mutated
  settlements closeout should have fixed at resolution time. Ruled:
  natural resolution enters the SAME atomic path as `resolveNow` —
  latch (freezeLedger → mark → clear) → the resolution-day beat
  fires (the carried treaty-outcome superevent must still reach the
  player) → terminal closeout → epilogue; day processing stops.
  What survives from the interim: the latch clearing
  `lastTransitions` and the trade bars, now inside the atomic
  sequence. *Terminal queue discipline* (re-gate ruling): once
  terminal closeout starts, the popup queue is FILTERED to
  terminal-safe beats — today, category `'summit'` (effect-free
  acknowledgments by construction) — and every ordinary queued
  popup is discarded: the world's resolution supersedes the day's
  ordinary news, and no popup decision may mutate the settled book
  or stale the epilogue (measured realizable: 58/5000 natural
  resolutions land on forecast-lock days with an actionable popup
  already queued; `scrutiny_enforcement` carries a cash penalty).
  Later phases adding terminal beats (P7's room) mark them by
  category, never by exemption.
- **Constraint-4 "forced shutdown" reading**: the ratchet set for the
  knife-edge constraint is {nationalized, classified, permanent
  max-heat} — forced shutdown is not a distinct model state. Heat
  assertions measure the RUN MAXIMUM of total heat, not terminal heat.

### Outcome-table levers (phase-6 retune; the "gates, S0, pace" slot)

The P6-1 gate reproduced the machinery-faithful world-side table at
52.5/14.8/2.9/0.0/3.6/11.1/15.1 vs the contract 12/18/28/12/4/12/14,
and verified two structural causes plus one incompleteness. Sanctioned
levers (τ, `required`, leadAdj, and the mapping gates stay untouched —
they are the stance):

1. **racingPace goes dynamic** (the recorded `f(knife-edge proximity,
   appetite pressure)` made concrete; per-lab, daily, deterministic):

   ```
   lead[lab]  = C_int[lab] − max(C_int[rivals], C[open])   (signed)
   closeness  = clamp(1 − lead/L_pace, 0, 1)
   pressure   = clamp((heat − 0.30)/0.40, 0, 1)
   racingPace[lab] = clamp(0.30
                   + (a_c·closeness + a_p·pressure)·(1 − culture[lab]),
                     0, 1)
   ```

   Sweep a_c, a_p, L_pace (starting guesses 0.45 / 0.15 / 0.6). The
   `(1 − culture)` factor is the stance in one term: culture is how
   much a lab resists racing when the race gets close — Tianxia (0.15)
   responds almost fully, Halcyon (~0.5) halfway, Polaris (0.8) barely,
   which is what keeps Polaris the margin-carrier despite permanently
   saturated closeness. "Appetite pressure" is concretized as
   heat-driven (the ambient race temperature), not release-backlog
   pressure — contestable at review. Gate probe: forcing pace 0.70
   moved family 1 52.5→0.7% and family 3 2.9→61.9% — the lever is
   decisive. Big lead → baseline pace → S recovers → family 1 lives
   exactly in runaway worlds (the leadAdj double-count is the thesis,
   per 02).
2. **Fast-follower term** (bounded gap, retained as a composition
   piece — NOT a lead-producer): `dC_int[tianxia]/dt += k_f · max(0,
   C_rel[frontier] − C_int[tianxia])` — the follower distills from the
   RELEASED frontier (public information; hygiene holds inside the
   kinematics). The P6-1b sweep PROVED this term alone cannot make
   Tianxia lead (<0.1% at k_f up to 0.5 — its target is structurally
   behind the frontier's internal track); it bounds the gap so the
   lead-producing legs below have something to work with. Tianxia
   compute growth stays fixed 1.3×/yr — the 0.8–1.6× range remains the
   exportControlStage dampener's plug point (evidence round).
3. **Sampled Tianxia velocity** (family-4 lead production, leg A):
   `chinaTrue.velocity` — a per-run hidden multiplier on Tianxia's
   deterministic capability drift, sampled at run start (proposed
   LogNormal-ish, median ~0.92, range ~[0.75, 1.15]; shape swept so
   Halcyon loses the lead at some point in ~15–25% of runs jointly
   with legs B/k_f). This is the market's actual argument rendered as
   hidden state — is Tianxia six months behind, two years behind, or
   quietly faster — and 04 already promises it: "intelligence about
   `chinaTrue` arrives with sampled reliability; the player's China
   posterior is as tradeable as their timeline." The position draw
   stays untouched (level prior unchanged; belief calibrations
   undisturbed).
4. **Domestic regulatory drag** (family-4 lead production, leg B —
   the policy debate made mechanical): under `controlRegime ==
   supervised`, DOMESTIC labs' (Halcyon, Polaris) capability drift
   takes a compliance factor `×(1 − δ_sup)` (δ_sup swept, guess
   ~0.05–0.12); Tianxia is untouched. Mobilized+ regimes impose NO
   drag — the state is racing — but pin the domestic pace floor at
   0.7 (mobilization burns margin instead). "Slowing down hands it to
   China" stops being a talking point in the copy and becomes a
   coupling in the kinematics; the worlds where the ratchet fired are
   exactly the worlds where the gap closes. race-mc never steps the
   regime, so its trajectories are untouched by construction.
5. **Purchased margin: floor, not fuel** (family-4 margin survival,
   leg C). `S0[tianxia]` rises into [0.30, 0.45] (swept), and the
   "bought, not grown" reading is completed: bought margin doesn't
   BURN either — `S[tianxia]` floors at its purchased base (burn never
   takes it below `S0[tianxia]`; accumulation above it stays
   culture-tiny). Control is non-negotiable for that principal — an
   unaligned model threatens the Party first — so the control budget
   is not what they cut under racing. Culture stays 0.15: no growth,
   no safety network, no generalization. The West's margin is a
   practice (grows, burns); Tianxia's is a purchase (static, floored).
   Family-4's mapping window is d > −0.15 (non-failure), not d > 0 —
   "aligned-to-Beijing" includes the ambiguous-dawn band; bad-τ
   worlds still put Tianxia crossings in family 3 (subtitles).
6. **Burn tapers as S falls** (all labs; fixes the |d|-tail conflict):
   `dS_burn = −0.0012·racingPace·clamp(S/S_taper, 0, 1)`, S_taper
   swept (guess 0.25). Margin is a practice level, not a fuel tank —
   corner-cutting has diminishing room, S asymptotes above zero
   instead of hitting the rail, and the deep-failure tail that blew
   median |d| past 0.15 in the first sweep is compressed. Resolution
   concentrates at the threshold, which is the knife-edge principle's
   own demand.
7. **C[open] can never be the crossing entity** under current
   kinematics (structurally ≤ C_rel[tianxia] − 0.15) — the family-4
   proliferation variant is unreachable until C[open] gets its own
   dynamics (stripped fine-tunes exceeding base releases). Deferred;
   candidate for the evidence round or P7; family 4 mass is
   Tianxia-led for now.

**Withdrawn (P6-1b sweep, 2026-07-24):** the first revision of this
subsection validated its S0 range against the gate's "32.4% family 4
at S0=0.60" probe — that probe was a forced-clone (Tianxia = Halcyon
capability clone at fixed baseline pace) diagnostic, not the levers as
specified, and the released-follower + S0 package it appeared to
license is structurally incapable of family 4 (0% at any swept
coefficient). Lesson, recorded: a lever's validation must be the lever
as specified, not a neighboring experiment.

**Accounting re-record (amended plateau rule, 2026-07-24):** family
targets are **EVENTUAL** (in-horizon + timeout-extrapolated
resolutions, per family); "timeout ~14%" in the target table is
superseded by an **extrapolation-share** statistic — fraction of runs
resolving via post-1008 extrapolation — with target ~25%, band
[0.18, 0.32] (the old 14% still-racing share plus fizzle mass that the
amended plateau rule correctly routes through extrapolation).
In-horizon family-6 confirmations are expected ≈ 0 (allowed 0–3%): a
plateau is mostly a fact the epilogue confirms, not the game.

Post-retune the endings harness PROMOTES the family table and liveness
to hard gates at the RENORMALIZED centers (see the renormalization
paragraph below — the single source): f1 14±5, f2 21±6, f3 32±7,
f4 14±5, f5 5 (2.3–8), f6 14±4 (percentage points, EVENTUAL),
extrapolation share [0.18, 0.32].

**P6-1b final constants (swept 2026-07-24, three-seed verified;
re-centered in the shared-desperation round):**
`a_c 0.34 / a_p 0.12 / L_pace 0.6` (a_c swept down from the 0.45
guess — 0.45 over-burned; a_p/δ_sup/S_taper re-centered when the
recalibrated theft benchmark added heat); `k_f 0.03`; `δ_sup 0.09`;
`S0[tianxia] 0.43` (floor semantics); `S_taper 0.265`; velocity
median 0.95, σ 0.37, clamp [0.75, 1.325] (hidden-state table row is
approximate; these are exact). Measured eventual families across
seeds {1, 90210, 424242}, full theft benchmark: f1 11.1–12.3,
f2 22.6–24.0, f3 33.5–34.9, f4 15.3–16.9, f5 3.7–4.1, f6 10.5–11.0,
extrapolation share 28.6–30.5%, median |d| 0.143–0.148, in-horizon
f6 ≤ 1.4%. Family-4 composition — two decompositions, both recorded because the
epilogue needs the causal one (gate probes, N=20k nominal / N=5k
counterfactual): NOMINAL partition ~90.5% fast-velocity-no-theft /
~9.5% **theft-present** (co-occurrence, deliberately not
"theft-assisted") / 0% residual. CAUSAL (counterfactual removal):
velocity is necessary in ~99.7% of family-4 worlds; **domestic drag
is necessary in ~38.8%**; theft is necessary in only ~1.1%. Epilogue
framing follows the causal table: Beijing was faster in essentially
every China-first world; in roughly two of five, America also
regulated itself out of the lead it would otherwise have kept; the
theft, where it happened, was punctuation, not cause. Blockade ⊥
family 4, by mechanism: P(blockade | f4) ~0.6% vs P(blockade) ~3% —
the strait tail fires in the timelines where China was losing.

**Eventual-band renormalization (2026-07-24, closing an arithmetic
slip):** the original family targets summed to 86 WITH timeout as a
14% bucket; under the eventual accounting families must sum to 100,
so the centers renormalize (÷0.86) with widths unchanged —
**f1 14±5, f2 21±6, f3 32±7, f4 14±5, f5 5 (2.3–8), f6 14±4** —
and the extrapolation-share band [0.18, 0.32] is unchanged. All
measured values above sit mid-band under the renormalized centers
(f6 at 10.5 sits near the low edge of 10 — acceptable; the plateau
rule deliberately routes fizzle mass through extrapolation and some
of it lands as timeout-family-1/2 texture instead). The endings
harness asserts these centers (adopted at the re-gate fix round,
2026-07-24).

**race-mc diagnostic re-record (P6-1b, supersedes the phase-1
values):** S[leader] day-350 0.454 / day-700 0.401 / day-1008 0.349
(dynamic pace + taper; the taper keeps it off the rail); leadership
at 1008: Halcyon unique-top 44.4% / ceiling-tie 51.3% / lost 4.3%
(was 87.2/12.5/0.3 — the race is genuinely competitive now, which
was the point; ceiling ties are post-takeoff clamp artifacts in the
resolution-free race-mc horizon and benign); top-entity lead p50
0.00 under ceiling ties; proliferation-cap incidence 40.4% (band
[0.35, 0.55] held); rung KM medians R2 230 / R3 645 / R4 804 /
R5 916 (±10% band held); fizzle tail 12.0%.

## Evidence machinery (pre-P7 ratifications, 2026-07-24)

The round assigned at the phase-5 content gate, ratified here BEFORE
implementation (the dampener perturbs race trajectories; the design
decision precedes the code). Three items, deliberately tight:

1. **exportControlStage → Tianxia compute dampener.** Enters
   `advanceRace(race, { …, exportControlStage })` as an
   orchestrator-passed input — the straitTension/playerCoupling
   precedent — read from `world.ai.exportControlStage` by main.js.
   Headless race-mc passes nothing → stage 0 → **bit-identical
   trajectories**, so the calibration bands stay the stage-0
   invariant; a harness section forces stages and asserts direction.
   The plug point is Tianxia's fixed 1.3×/yr compute growth (the
   0.8–1.6× range reserved at the P6-1b lever block). Annual growth
   factor by stage: **[1.30, 1.20, 1.06, 0.90]** — entity lists trim
   the exponent, broad chip controls nearly flatten it, full embargo
   sends it below 1 (clusters age out faster than gray-market
   replacement). The dampener binds the COMPUTE leg only: the
   fast-follower distillation term `k_f` is untouched — controls
   bind chips, never weights already released; 03's satire line is
   the mechanism, verbatim. `chinaTrue.velocity` still multiplies
   the (now slower) drift — controls slow even a
   faster-than-believed Tianxia, they never reverse distillation.
   Directional probe (not a band): sustained stage 3 from day 0
   must visibly cut Tianxia terminal capability and family-4
   incidence; stage 0 must be bit-identical to the pre-round build.

2. **Leak coupling via `_tipIncidentId`** (the insider channel's
   leak verb, stamped since content round 7). Two effects, one
   route, applied at choice resolution through the SAME
   frozen/inactive gate as `applyRaceEffects` (a leak after the
   terminal latch does nothing mechanical):
   - **Detection forcing**: the leaked incident becomes
     `detectable = true` unconditionally (the never-detected tail
     is overridden BY DESIGN — guaranteeing the world finds out is
     what the verb is for) and its remaining `meanLag` is set to
     **4 days** (memoryless hazard from leak day; the story forces
     the filing inside a week, usually). Already-detected: no-op.
   - **B evidence-fold, once per evidence ID**: the leak folds the
     incident's detection-class sentiment
     (−ALIGN_INCIDENT·(sev+1), weight 1) **under the detection's
     own fold id `det_${id}`** on leak day, cause `'player-leak'`.
     The existing leak-once machinery (`processed` set) then makes
     the real detection's later fold a no-op — the total B move is
     IDENTICAL leaked or unleaked; leaking buys timing and public
     pressure, never extra belief mass. No new idempotency
     machinery; the audit ledger shows who claimed the fold.
   The trade and sit verbs get NO race coupling (ruled at the
   content gate: the trade edge is the fact and its timing on the
   chassis; the outcome beat stays detection-agnostic).

3. **Theft disclosure track** (replaces the bridgeThefts stub).
   Thefts keep occurring silently — `commitTheft`'s physical
   bundle (discontinuity, heat floor, 90d S-freeze) is complete
   and UNTOUCHED at occurrence. Disclosure is narrative + belief
   only, so race trajectories stay bit-identical with the track on
   or off: rolls draw from a NEW named substream
   `streams.theftDisclosure` (convention 5; extension-stable).
   Memoryless daily hazard over undisclosed thefts: **pDisclose
   0.75, meanLag 40d** — the never-disclosed tail is real (a
   quarter of thefts stay rumor forever). At disclosure, PUBLIC
   attribution is sampled — **espionage 0.55 / insider 0.30 / the
   model itself 0.15** — independent of the record's true
   attribution (public post-mortems rarely settle it; the dispute
   is the story). Ledger rows `tr.theftDisclosures`
   {from, to, theftDay, day, lag, publicAttribution}; the bridge
   fires shells off the ledger (prose coordinator-written, frontier
   victim gets the superevent treatment), B folds **−0.20** into
   alignment sentiment once per disclosure (`theftdisc_` id class),
   market coupling rides decaying impulses on the shells per the
   standing incident-coupling rule. NO treaty mutation this round
   (the "treaty dies or gets suddenly serious" beat is prose
   gesture until P7 wires it); NO tips on thefts (the channel
   stays incident-fed).

Deliberately OUT of this round: `chinaTrue` intelligence beats with
sampled reliability (04's "China posterior as tradeable as the
timeline") — assigned to P7 content, where the china.js arc can
carry velocity-correlated readings as texture; no new machinery
beyond what this round lands is required for it.

## The knife-edge principle (a9, 2026-07-23 — binding tuning constraints)

Nothing is set in stone: no outcome — doom, triumph, shutdown, the
Deal — may be structurally inevitable, in either direction. The priors
are biased (that is the stance); they are never rigged. Testable
targets for the code-phase Monte Carlo:

1. **Every family stays live.** Each of families 1–6 occurs at ≥ 2%
   marginally, and — conditional on observable state at each act
   boundary, before a terminal has actually fired — no family's
   posterior exceeds 0.60 and no reachable family falls below 0.02. A
   run can *lean*; it cannot be over early.
2. **Resolution concentrates at the threshold.** `d = margin −
   required` has median |d| ≈ 0.10, and ≥ 40% of runs land within the
   player's maximum reachable |d_P|: the sample decides *whether* it's
   close, play decides the close ones. This is how knife-edge coexists
   with bounded influence — the 30% clip matters because many worlds
   end inside it.
3. **Determination is late.** An oracle predicting the final family
   from day-350 observable state beats the prior's Brier by < 25%;
   from day-700, by < 60%. Most outcome variance resolves in Act III,
   where the player is watching.
4. **Ratchets bind sometimes, never always.** No one-way mechanism
   (`controlRegime`, the heat floor, proliferation) may make its
   terminal state the attractor of most runs — nationalization,
   permanent maximum heat, and forced shutdown are outcomes some
   worlds reach, not defaults every world drifts toward.

## Target outcome distribution (the tuning contract)

**1** won-with-margin ~12% · **2** knife-edge ~18% · **3** misaligned
~28% (*all* technical failures, whoever led — a misaligned Tianxia
crossing is family 3 with subtitles, per 05) · **4** China-first
~12% (non-failure: control-axis outcomes) · **5** Deal ~4% · **6**
fizzle ~12% · timeout ~14%. **Timeout (decided 2026-07-23): no seventh
family** — the epilogue extrapolates, sampling the remainder forward
from standing state and narrating "years later"; it lands in one of
the six, knife-edge constraints intact. Playtest
order: act boundaries (g0, r0, q-band) → incident cadence (the 0.07
and 0.30 in Λ_world) → knife-edge targets → outcome table (gates, S0,
pace) → τ and
`required` last — they are the stance, and the knife-edge targets are
its guardrails.
