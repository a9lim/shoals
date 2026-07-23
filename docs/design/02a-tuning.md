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

Detection per severity as rev 1 (S0 0.70/Exp 10d … S4 1.00/immediate;
persuasion 0.40/Exp 90d, unlocks at C_int ≥ R3). Reporting regime:
detection `min(1, p + 0.12)`, lags halved. Insider tip: **one
Bernoulli(0.3) per undetected incident** (standing-gated), drawn at
occurrence.

**Evidence beats:** per alignment-carrying lab ~Exp(40d); per-beat LR
clipped to [⅓, 3] **and cumulative evidence log-odds clipped to
±log 19** — the posterior ceiling (0.95) is enforced at the
accumulator, since ~22 beats/run would otherwise blow through it.
Publication prob = culture; unpublished beats leak at 0.25.

## Market coupling

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
