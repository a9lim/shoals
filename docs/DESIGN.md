# Shoals: design reference

What the code alone doesn't say: the stance the model is built to hold, the
equations and targets it is calibrated against, the market and settlement rules,
and the constraints that steer new work. Constants live in code (the `*_TUNING`
objects and `config.js`); a retune is a design change, checked against
[Targets](#targets).

## Stance

**The singularity experienced from a trading desk.** You see it coming before the
market does, you get rich on the difference, and the money is how you find out what
you actually believe.

- **The wager.** Alignment is probably achievable given a long pause; the pause is not
  achievable; so the least-bad live option is that the most safety-serious racer wins
  with enough lead to slow down at the end. Margin is the whole game.
- **Held softly.** Every contested question (timelines, takeoff speed, alignment
  difficulty, whether Beijing would deal, whether scaling fizzles) is a hidden variable
  sampled per run. In some worlds the wager was right, in some nothing would have
  worked, in some the skeptics were. Neither the player nor the event copy learns which
  until resolution.
- **Two-track everywhere.** Truth advances on one track, disclosure on another:
  internal vs released vs certified capability, incidents occurred vs detected, evidence
  found vs published, thefts committed vs disclosed. Every gap is somebody's alpha.
- **Three pillars.** Your alpha is your timeline (the market doesn't price the race);
  your capital is not neutral (flows move the race, through declared channels only); and
  takeoff arrives through the sim (alpha decays as η rises, the tempo compresses, your
  own orders slow behind machinery you configured).
- **Tone.** The human world is satire, the state above all; the machine is played dead
  straight. The comedy lives in the anatomy of an event, never its consequences.
- **Ambivalence.** Wonders and incidents arrive on the same feed from the same variable.
  Evidence carries real but non-decisive likelihood ratios: the posterior should move and
  never collapse before the last act.
- **Real events are calibration, never content.** They don't retune the stance or the
  outcome priors.
- **Deliberate cuts.** No macro sim, no compute stock-flow ledger, no provenance economy,
  two capability tracks rather than a pipeline, discrete security levels. Doom shorts
  never settle: no counterparty survives to pay.

## Structure

- **Modes.** Classic is the trading chassis alone (GBM + Merton + Heston equity,
  Vasicek rates, CRR American options, VXHCN). Dynamic runs the race underneath it, for
  1008 trading days (four years, 16 substeps a day).
- **The desk.** A Dynamic run opens on one of four inherited books with a dated
  obligation (a redemption or a loan repayment), marked at day 0 with cash set so
  equity net of the obligation is the starting capital. Obligations are liabilities,
  met in cash; a shortfall is raised by a pro-rata forced sale at three times the
  spread. Being right about next year doesn't meet next month's obligation.
- **Acts** follow the released frontier: Act I (R1–R2) is the trading game with the race
  audible to a listener (the hints start on day one); Act II (R3) is complicity; Act III
  (R4 on) compresses the tempo and takes the player's hands. The discretionary event rate scales from ×1 at
  released R1 to ×2.5 at R5.
- **The posterior.** Each rung follows the market until the player draws on it. The
  forecast is a standing policy, snapshotted at each lock day (every 63 days) with no
  dispatch, and scored quarterly against the market.
- **Agency.** Credibility converts the firm (`F`); a converted, credible desk sends
  memos, then acts as a fund; the room convenes once near takeoff, with a voice
  proportional to what the player accumulated.

## The race

The labs are Halcyon (the frontier lab, listed as HCN), Tianxia (Beijing's
open-weights program), Polaris (the safety splinter, founded around day 400) and the
open ecosystem (whatever released weights can build; it can never be the crossing
entity). Capability is continuous and observed as a rung ladder: R1 reliable agent, R2
autonomous engineer, R3 autonomous researcher, R4 recursion, R5 takeoff.

```
ignition  q(E)  = smoothstep(0.60, 0.75, scalingElasticity)
base      μ_b   = g0 · compute(t)^0.5 · talent^0.3 · E
recursion μ_r   = r0 · sharpness · C_int · σ((C_int − 2.8)/0.35)
dC_int/dt       = q·(μ_b + μ_r) + (1 − q)·μ_b·max(0, 1 − C_int/3.2) + 0.004·N(0,1)
Tianxia         += k_f · max(0, C_rel[frontier] − C_int[tianxia])      (distillation, k_f = 0.03)

dS/dt      = 0.0009·culture·(1 − 0.8·heat) − 0.0012·racingPace·clamp(S/0.265, 0, 1)
racingPace = clamp(0.30 + (0.34·closeness + 0.12·pressure)·(1 − culture), 0, 1)
heat       = transient + floor (proliferation, thefts; ratchets) + strait overlay (reversible)
```

- **Releases are choices:** a lab releases when its internal track runs past its
  released one by its appetite. Certification lags a released crossing and is nested
  (certifying R4 certifies R3).
- **Low elasticity plateaus near C ≈ 3.2**; a plateau is confirmed only for never-ignited,
  never-crossed runs after day 700 with the leader's smoothed growth under 2e-4/day for
  180 days, so most fizzle mass arrives through extrapolation.
- **Incidents** occur silently and reach the market only on detection; the
  never-detected tail is real. Detection lag scales with how far the source's internal
  capability runs past the released frontier (the gap hides its own incidents). An S4
  self-discloses the moment it occurs and resolves the run. Past R3 a fifth of
  incidents are persuasion campaigns, slow to detect.
- **Theft** (Tianxia from the leading domestic lab) keys off Beijing's desperation (a
  program slower than it needs, or a frontier pulling away), heat and the victim's
  security level; it sets the thief's capability to the victim's less an integration
  lag, raises the heat floor and stops margin accumulation race-wide for 90 days.
  Disclosure comes later or never, with a public attribution sampled independently of
  the truth.
- **Demonstrations:** Halcyon and Polaris publish what an unreleased model did, bearing
  on the next unreleased rung. Each is sound, over-scoped or flawed; a dispute may
  contest it, an independent evaluation upholds, narrows or withdraws it, and a
  withdrawal takes whatever cites it. They move nothing in the race; they reach the
  market only through the record.
- **The control regime** ratchets one way, `private → supervised → mobilized →
  nationalized | classified`, on decaying grip pressure from detected incidents, thefts,
  blockades, heat and political pushes. Supervision drags domestic drift; mobilization
  freezes Consensus and the compute curve and floors domestic racing pace at 0.7;
  nationalization converts HCN at closeout; classification blacks out detections.
- **The treaty** opens a summit window in about a third of runs and holds only
  where `dealPossible` (15% prior). Windows open independently of `dealPossible`, so a
  summit is evidence in prose, never a tell.

## Belief and the reader

- **Market belief `B`** is, per rung, a crossing-date law: the pool
  (1 − η)·legible + η·full over the reader's two heads, made coherent up the ladder
  (P(R4) ≤ P(R3) ≤ P(R2)). η rises from 0 at released R1 to 1 at R5: the share of the
  market running licensed models.
- **The rule of thumb** (the legible head's input) moves only on releases, claims and
  certifications. It is frozen: the reader's legible heads were fit on its exact
  trajectory.
- **The reader** is fit offline (`tools/reader-fit.mjs`) on headless worlds split
  train/validation/test, and only evaluated in play. Its family heads, per act, also
  drive V.
- **The public record** is the data contract, and nothing else enters: the clock; per
  lab its activity, claim and certification days and release history; the open
  ecosystem's rung and the released and certified frontier; detected incidents by
  severity, source and class with lags (under `classified`, S0–S3 only as briefs);
  disclosed thefts; the strait's scares and blockades; the regime and the day it moved;
  the treaty's public beats; the public world inputs (strait tension, export-control and
  treaty stages). Never continuous capability, latent queues, τ, `S`, heat, truth
  records or insider tips.
- **Refit** whenever a change moves the distribution of runs or the record's contents,
  then re-derive the listing base rates (B's day-0 quote) and check `K_CRED`.
- **Scoring.** At each lock the desk stores, per open rung R2–R4, the player's and the
  market's clamped [0.02, 0.98] probabilities for the coming quarter (a followed rung
  stores pP = pM). At the quarter's end each scores `Δ = ln(pP/pM)` if the rung certified,
  `ln((1−pP)/(1−pM))` if not; a quarter open at the terminal is scored once against
  the world that happened. Credibility = tanh(S_P / K_CRED), `K_CRED = 1.35`: the
  largest K at which the full-reader copier clears the memo gate (0.55) by day 882 in
  half of validation worlds. The score is proper for a fixed process, not where the
  player's actions change it. The market copier scores exactly 0.
- **Firm belief `F`** starts at 15, wakes toward the market's read of the recursion
  rungs and converts toward a credible player; divergence from the player's stated R4
  drives scrutiny. A followed R4 states nothing.

## Markets and settlement

**The story may break the market, but only through declared state, never through
hidden taxes.**

- **Marks.** The authoritative process price (never displayed; settlement follows it);
  the executable quote (plus impact and spread; a fill refreshes against it or fails
  loudly); book marks (`unitPrice`); model marks (the player's analytics, which Act III
  may hold stale while fills reprice fresh). Degradation is display-only: printed fills,
  settlements and margin calls are immutable.
- **The valuation layer.** In Dynamic, HCN carries V = (1 − η)·V_legible + η·V_full,
  each the survival-conditioned expected family mark under that reader's family head
  (family 3 gets no weight: the market prices only worlds that can pay). V is applied as a
  clamped gap at the close; the closeout marks HCN at spot·m_f/V_T.
- **Consensus binaries** (R2–R4 by certification, R5 by terminal resolution: no auditor
  certifies takeoff) bind at listing to `{predicate, oracleId, evidenceStandard,
  deadline, disputeDeadline, fallbackValue}`. Settlement uses the listed oracle or the
  fallback (0.50), nothing else: hidden truth may narrate, never pay. A crossed R5 waits
  for closeout and is never booked NO. Adjudication succeeds by regime (exchange panel →
  federal evals office under mobilization → fallback); a timely ruling is terminal, a
  post-deadline ruling is void. Shorts are fully collateralized; no payout depends on
  cost basis.
- **Compute futures** (Cambria allocation quarters, four maturities) carry a strait
  premium and a belief lift from B's R5 curve. Settlement precedence: decree (mobilized
  or beyond) ⊃ force majeure (a Taiwan blockade) ⊃ ordinary. The Gulf's `straitClosed`
  never moves the chip curve.
- **The nationalization reference** is the median exchange mark over the 20 sessions
  ending 5 before the first public trigger, frozen then, times a multiple drawn once at
  creation from U[0.60, 1.15].
- **The primary market** is the only place money reaches a lab: a Halcyon follow-on at
  each rise of the released rung (a 2% dilution gap, discounted shares) and Polaris's
  private rounds (marked at the last round, illiquid, zero collateral value).
- **Rates.** Each rise of the released rung permanently steps the long-run rate (the
  capex channel): rates move with the race for a reason that isn't the race, and `B`
  never reads them.
- **Race-era market effects are decaying impulses** (5-day half-life), never permanent
  param deltas: ~100 detected incidents a run would walk every parameter to its clamp.
- **The closeout is a matrix**: family × regime × instrument, each cell a unit value, so
  pre-closeout equity equals post-closeout cash whatever the basis. The ledger freezes
  before terminal marking.
- **Fairness invariants.** No hidden execution tax; every void or adjustment announces
  itself at or before effect; every settlement value is computable from the listed
  oracle plus public information; no settlement depends on cost basis; degradation never
  rewrites history; outside a restricted account, frozen legs and private stakes the
  player can always flatten at some executable price.

## Resolution and endings

One precedence ladder, checked daily: an S4 → family 3; an implemented treaty → 5; a
confirmed plateau → 6; the frontier's R5 crossing → by margin; day 1008 → extrapolate
headless from standing state (to a cap of 2520 more days) and resolve into one of the
six. An early ejection extrapolates the same way, so the desk's exit never moves the
world's endpoint.

```
lead     = C_int[leader] − max(C_int[others], C[open])
leadAdj  = −0.15·(1 − lead/0.10) below 0.10 · 0 to 0.25 · +0.12·min((lead − 0.25)/0.25, 1) above
d        = S[leader] + leadAdj − (0.22 + 0.35·(1 − τ) + 0.08·sharpnessNorm)
d ≤ −0.15 → 3 (whoever leads) · Tianxia or open leader → 4 · domestic: lead ≥ 0.25 ∧ d > 0 → 1, else 2
```

| Family | What happened |
|---|---|
| 1 Won with margin | the careful lab crossed with a lead to slow down, and τ was kind; vindication played narrow |
| 2 Knife-edge | first across, corners cut; from an ambiguous dawn down toward 3 |
| 3 Misaligned | τ was bad or margin gone, whoever won, or an S4; told in past tense by no narrator |
| 4 China first | Tianxia crossed without technical failure: aligned to Beijing |
| 5 The Deal | `dealPossible` and the treaty survived its gauntlet; markets become boring |
| 6 The fizzle | the recursion never ignited; being early is indistinguishable from being wrong |

- **Personal overlays** compose with any family: margin called, convicted,
  whistleblower exile, gray eminence (involved in ledgered actions) or bystander. Never
  decided by traits or beliefs.
- **Player channels** are the cost-of-capital coupling (persistent net HCN positioning,
  capped at ±5% of Halcyon's drift; primary allocations), choice `raceEffects` on `S`
  and heat (clamped per effect), and the insider-tip leak, which changes when the world
  learns of an incident, not what it believes. The ledger records channels, never
  fills, and freezes at the latch.
- **Bounded influence:** d_eff = d_W + clip(d_P, ±(3/7)·|d_W|), so the player's share of
  any terminal movement is at most 30%. A seat, not a steering wheel.
- The epilogue is five pages from `EPILOGUE_SLOTS[family][overlay][page]`; it composes
  no sentences of its own.

## Act III

- One smoothed public driver `x` from the released rung and regime drives the audio's
  machine register, the substep event lane (from released R4), the manual latency
  ladder and display-only degradation.
- Six standing orders unlock at released R3 and lock at R5. They execute as machinery:
  no ladder lag, the plain spread, no RNG. Takeoff is felt as agency migrating into
  machinery the player configured.

## Targets

Neutral inputs, no player. `node tools/race-mc.mjs` reports the first three rows.

| Quantity | Target |
|---|---|
| Frontier internal-crossing medians (unconditional, Kaplan–Meier) | R2 230, R3 644, R4 800, R5 911 days; each ±10% (±25 days) |
| Fizzle tail (elasticity ≤ 0.60) | 12% (9–15%) |
| Eventual family shares (%) | 1: 14 ± 5 · 2: 21 ± 6 · 3: 32 ± 7 · 4: 14 ± 5 · 5: 5 (2.3–8) · 6: 14 ± 4 |
| Runs resolving by extrapolation | ~25% (18–32%); in-horizon fizzles ≈ 0 |
| Proliferation cap on the heat floor binds | 35–55% of runs |
| Reader-copier edge over B | positive in Act I, closed by Act III |

**The knife-edge principle** is the guardrail: no outcome may be structurally
inevitable in either direction. Every family occurs in at least 2% of runs, and at an
act boundary no family's posterior exceeds 0.60; median |d| sits in [0.06, 0.15], with
at least 40% of runs inside the player's maximum reachable |d_P|; the full reader's
family head beats the prior's Brier by under 25% at day 350 and under 60% at day 700;
no one-way ratchet makes its terminal state the attractor of most runs. Retune in this
order: act boundaries (g0, r0, the ignition band), incident cadence, the knife-edge
targets, the outcome table, and τ and `required` last, since they are the stance.

## Names

- **Real places and public institutions, fictional people, companies and parties**
  (Federalist / Farmer-Labor: real party names would read as partisan commentary).
- Names sound like what the entities believe about themselves, never the author's
  editorial; no real-company puns; model names version naturally ("Aleph 4.5").
- The slate: Meridian Capital (the player's fund), Halcyon (frontier lab; Aleph models;
  Project Fixedpoint, the recursion program), Zhaowei's Tianxia program (Shenzhen;
  Cangjie models, open weights), Polaris (Boulder; Holt models), Cambria (the chips,
  Hsinchu), Consensus (the prediction market), MarketWire (the Street's wire). HCN and
  VXHCN are Halcyon common and its vol index.
- Dead names (VXPNT, PNTH, Serica and the other invented polities) appear nowhere.
- People, places and products beyond these live in the authored event prose
  (`src/events/`) and the epilogue slots (`src/endings.js`).
