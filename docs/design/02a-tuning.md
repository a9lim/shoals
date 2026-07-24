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
**Plateau confirmation** (resolution ladder step 4): trailing 120-day
capability growth of the leader < 0.0002/day, gated to runs where
recursion never ignited (`q < 0.01` / `E ≤ 0.60`) and R5 was never
crossed — see the note at the terminal mapping.

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

**Theft:** attempt hazard/day = 0.0011 · clamp(0.10 + gap/0.75, 0, 1.5)
· (1 + heat) — the 0.10 floor keeps parity-state espionage alive
(stealing isn't only for the desperate). Success by victim security
level SL1–SL4: [0.70, 0.45, 0.18, 0.04]; failed attempts cool down
60d. Halcyon starts SL2; upgrade costs ~8% `C` velocity for 60d +
retention events. ε ~ U(0.15, 0.35). Benchmark (SL2, no upgrade, heat
≈ 0.3): E[successes] ≈ 0.6 — that is a *benchmark*, not an invariant;
SL3 cuts it to ~0.27, which is what the upgrade buys.

**Strait:** gray-zone ~Poisson(1/90d)·(1 + heat)·tension; blockade
cumulative per-run ≈ 3% baseline → 12–15% hot/desperate. Blockade: far
compute curve +40–80%, heat +0.20, mobilization gate opens.

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

`controlRegime` transition gates and standing-orders unlocks as rev 1.

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
eligible.

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
