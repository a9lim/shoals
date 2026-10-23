# Shoals

Shoals is the AI race played from a derivatives desk, at a9l.im/shoals. The player
trades Halcyon (HCN) stock, bonds, VXHCN volatility futures and American options.
In the Dynamic modes they also trade Consensus milestone binaries and Cambria
compute futures, while a hidden race model runs underneath and ends each run in one
of six terminal families. It is vanilla ES modules with Canvas 2D charts and Web
Audio synthesis. KaTeX for the reference panels loads from jsDelivr, and the
Dynamic (LLM) mode calls the Anthropic API from the browser.
It is a submodule of the a9l.im repository (`a9lim.github.io`, at `projects/shoals`); the
root `AGENTS.md` covers the shared layer, design system, build, and deployment.

`docs/design/` is the source of truth for what the game is and why. Read
`00-vision.md` first. `02a-tuning.md` holds the ratified constants and implementation
rulings that code comments cite as "02a …", and the other files cover the world (01),
race model (02), market mechanics (03), arcs (04), endings (05), naming (06) and
market integrity (09). Constants in code mirror 02a, so a retune is recorded there
too.
`docs/lore.md` is the world bible (cast, places, products, legislation), and
`docs/art-prompts.md` is an image-prompt sheet. No generated art ships.

## Running and checking

Preview through the parent build (root `AGENTS.md`), then open `/shoals/`.

```bash
for f in main.js colors.js src/*.js src/events/*.js src/race/*.js tools/*.mjs; do node --check "$f"; done
node tools/race-mc.mjs        # [N] [--seed S], N=1000: race calibration vs 02a targets (~1 s)
node tools/plumbing-test.mjs  # [N], N=2000: content plumbing, evidence, Act III, standing orders, room/intel, capex/concealment (~11 s)
node tools/belief-test.mjs    # [N] [--seed S], N=300: belief B, quoters, credibility, impulse decay (~1 s)
node tools/compute-test.mjs   # [N] [--seed S], N=300: compute-futures lifecycle, conservation, integrity (~1 s)
node tools/consensus-test.mjs # [N] [--seed S], N=500: binary settlement, regime split, accounting (~1 s)
node tools/endings-test.mjs   # [N] [--seed S], N=2000: family distribution, player channels, closeout, terminal path (~8 s)
```

The six harnesses import `src/` directly and exit 1 on any failure. They are the
regression gate for anything that touches the Dynamic-mode systems. Run them at the
default N, because their calibration bands are sized for it and small-N runs miss
them legitimately. Each harness header lists its sections. `tools/` is not in the
parent stager's exclusions, so the harnesses deploy alongside the app.

## Layout

```
index.html, styles.css, colors.js  page, styles, project color tokens (--up/--down, Greeks, --vxhcn)
main.js            orchestrator: DOM cache `$`, rAF loop, day pipeline, popup queue, all wiring (~3.9k lines)
src/config.js      named constants and PRESETS
src/simulation.js  GBM + Merton + Heston stock, Vasicek rate, 16 substeps/day; history-buffer.js ring buffer
src/pricing.js     CRR binomial American pricing, Heston term/skew vol, VXHCN spot/futures, Vasicek bond
src/chain.js, chain-renderer.js       option chain skeleton/pricing and its table
src/position-value.js  unitPrice() for every position type
src/price-impact.js    square-root impact overlays, MM rehedge flow, Layer-3 exposure param shifts
src/portfolio.js       positions, orders, margin, expiry, borrow, liquidation, binary/compute settlement
src/portfolio-renderer.js, ui.js, chart.js, strategy.js, reference.js  DOM and canvas rendering, info/reference panels
src/strategy-store.js  built-in and saved (localStorage) strategies
src/market.js          shared market snapshot, written only by main.js `_syncAll()`
src/events.js          EventEngine: Poisson draw, pulses, one-shots, followups, triggers, impulse dispatch
src/events/            authored event pools by domain + param-ranges.js; index.js merges and validates
src/events/race-bridge.js, race-events.js  race ledger → narrative shells
src/world-state.js, faction-standing.js, traits.js, regulations.js, lobbying.js  narrative state
src/endings.js         ending triggers, family/overlay selection, slot-based 5-page epilogue
src/race/              hidden race model and its markets (DOM-free; see below)
src/act3.js, standing-orders.js  Act III driver/latency/degradation; menu-authored precommitments
src/audio.js           all music and SFX, synthesized
src/llm.js             Dynamic (LLM) event source
tools/*.mjs            the six headless harnesses
docs/design/, docs/lore.md, docs/art-prompts.md
```

## How it works

### Modes

`PRESETS` (`src/config.js`) lists five fixed regimes, collectively "Classic" (Calm
bull, Sideways, Volatile, Crisis, Rate hike), plus Dynamic (offline), which is the
default at index 5, and Dynamic (LLM) at index 6. `loadPreset` creates `eventEngine`
and `raceState` only for index ≥ 5. In Classic both are null, and the race, its
markets, belief, Act III and standing orders are all inert, so Classic is the pure
trading sim. `resetSim` re-rolls the race in place with a fresh seed, while a mode
change creates or nulls it.

### The trading day

`Simulation` advances HCN as a GBM with Merton jumps and Heston variance, plus a
Vasicek short rate, in `INTRADAY_STEPS` = 16 substeps per trading day. `sim.history`
is a 252-bar `HistoryBuffer` (`.get(day)`, `.last()`, `.minDay`/`.maxDay`), and
`prepopulate()` backfills it by running with `mu` negated. `beginDay()` pushes
`sim._partial` by reference and `substep()` mutates it in place.

`frame()` (the playing loop) and `step()` (one substep per press, closing the day
after the sixteenth) share the same pipeline. `_beginTradingDay()` installs the
Layer-3 and impulse overlays. `_runSubstep()` runs substep → `_clampRate()` → impact
decay → `_syncAll()` → market-maker rehedge → pending-order check, then the Act III
boundary work (deferred manual fills, the substep event lane, a popup drain).
`_closeTradingDay()` finalizes the bar and removes the overlays LIFO before
`_onDayComplete()`. That handles borrow, dividends, expiry, the quarterly review,
traits, the race block, the event engine and endings, impact and Layer-3 decay, the
rogue-trading and margin checks, UI and the popup drain. `tick()` in `main.js` has no
callers.

Race-block order in `_onDayComplete`: `stepCoupling` → `advanceRace(race,
{straitTension, playerCoupling, exportControlStage})` → `stepControlRegime` →
`stepTreaty` → `_syncRaceToWorld()` (the mirrors) → `setBaseRateScale` →
`_stepAct3()` → standing-order sync → `stepBelief` → Consensus and compute
settlement → standing day rules → forecast lock, scrutiny and firm conversion →
`checkResolution` → `_checkRoom`.

### Pricing, impact, portfolio

- `pricing.js` uses a 128-step CRR tree with discrete dividends. Each tree carries an
  N−1-step companion, and the public APIs average the two to cancel odd/even
  oscillation. Contract vol is `computeEffectiveSigma` (Heston expected integrated
  variance) plus `computeSkewSigma`. Delta, gamma and theta come from tree nodes;
  vega and rho come from finite differences. VXHCN spot is 30-day expected Heston
  vol × 100 (`computeVXHCNSpot`), and the futures use the forward variance curve.
- `unitPrice()` in `position-value.js` is the one valuation path. It covers stock,
  bond, vxhcnfuture, computefuture, binary, call and put, with the vol surface and
  impact overlay included. Only the strategy payoff sweep prices trees directly.
- Impact is an overlay on `sim.S` and never rewrites the path. The decaying
  cumulative volume per instrument feeds `getStockImpact(sigma)`,
  `getBondImpact(sigmaR)`, `getVxhcnImpact(xi)` and `getOptionImpact(…)`. Layer 3
  shifts selected process params temporarily when gross exposure is large.
- Positions carry a signed `qty` (no `side`) and net on `type + strike + expiryDay +
  strategyName`. `portfolio` is a singleton that `resetPortfolio()` mutates in place.
  `executeWithRollback` (main.js) unwinds every leg of a strategy on partial failure.
  Strategies are saved as strike/DTE offsets, with built-ins as constants.

### Events and narrative state

- Events share one schema across `src/events/*.js`. A toast event has `headline` +
  `params`. A popup has `popup: true` + `choices`. A portfolio trigger has `trigger` +
  `cooldown` + `tone` and is evaluated daily, never Poisson-drawn. A superevent has
  `superevent: true`, and that flag is the only source of truth for one. `when` is the
  world-state eligibility guard, and `oneShot: true` events fire at most once per run
  (`_firedOneShot`, including when referenced as followups).
- `params` are additive deltas clamped to `PARAM_RANGES`. Race-era shells carry
  `impulse: {…}` instead: a decaying overlay with a 5-day half-life (`race/impulse.js`)
  that never permanently mutates sim params, dispatched inside `_fireEvent` on every
  path. Permanent deltas on the race-era stream would walk params to their clamps.
  The exception is `rates_capex_wave` (`src/events/rates.js`), which fires at most
  once per released-rung step and deliberately carries permanent `b`/`sigmaR` deltas
  and no impulse.
- The discretionary draw (`_discretionaryDraw`) is Poisson with cooldown, and
  `eventBaseRateScale` scales it from ×1 at released R1 to ×2.5 at R5. Categories in
  `_PULSE_CATEGORIES` (events.js) never ride it. Those are the pulses (fed, midterm,
  interjection) and everything fired by the race bridge, the ledger or main.js
  latches (release, incident, certification, strait, regime, dispute, theft, polaris,
  insider, conversion, summit, room, rates). Arc categories (halcyon, china, wonder,
  policy, treaty, ghostwritten) are Poisson-live, gated by `world.ai.frontierRung`.
- `race-bridge.js` turns `race.lastTransitions` into shells. Its `finalize` picks a
  variant, substitutes tokens (`{lab}` `{model}` `{aModel}` `{rung}` `{rungName}`
  `{lag}`) and capitalizes. Variant rotation uses per-shell counters reset by
  `resetRaceBridge()`, never RNG.
- `world-state.js` holds congress, geopolitical, fed, investigations, election, media
  and `ai`. `world.ai.controlRegime`, `reportingRegime`, `frontierRung`, `summitLive`,
  `fundLive` and `geopolitical.taiwanBlockade` are mirrors written by main.js and are
  absent from `WORLD_STATE_RANGES`, so no event effect can write them. Factions (eight
  standings) live in `faction-standing.js`, attached as `eventEngine.world.factions`.
  Traits (18 permanent convictions, 6 dynamic tags) live in `traits.js`, and the
  regulation pipeline in `regulations.js` moves only by event (`activateRegulation`,
  `advanceBill`).

### The race (`src/race/`)

Read `02-race-model.md` with this. The modules are DOM-free so the harnesses can drive
them headless.

- `race-state.js` holds per-run hidden state seeded by `createRaceState()`. The labs
  are Halcyon, Tianxia, Polaris (spawned mid-run by the schism) and the open
  ecosystem, and each has internal and released capability on the R1–R5 rung ladder.
  `advanceRace` steps a day and writes `race.lastTransitions` (spawns, releases,
  thefts, crossings, certifications, incident and evidence tracks, strait beats,
  theft disclosures, regime change). Downstream systems consume that ledger and
  never diff state. The only capability mutations are `commitRelease` and
  `commitTheft`.
- RNG: each subsystem draws from a named stream, `createRng(deriveSeed(seed, name))`.
  The race's own streams live in `race.streams`. The nationalization reference,
  closeout, intel, belief noise and act3 presentation keep streams outside it, so race
  trajectories are bit-identical whether those systems run or not.
- Incidents (`incidents.js`) occur silently and fire narratively only on detection.
  The concealment term `lagMultiplier` scales detection lag by how far the source
  lab's internal capability runs past the released frontier. The other race
  modules: `strait.js` (Taiwan blockade, kept distinct from the Gulf arc's
  `straitClosed`), `theft-disclosure.js`,
  `control-regime.js` + `stepControlRegime` (a monotone ratchet private → supervised
  → mobilized → nationalized | classified, whose sole writer is `setControlRegime`;
  the writer freezes Consensus and compute synchronously) and `treaty-track.js`.
- `resolution.js` `checkResolution` applies the precedence ladder. At day 1008
  (`HORIZON`) it extrapolates headless up to `HORIZON + EXTRAP_CAP`, and the result
  picks a family 1–6. `coupling.js` (player HCN positioning → bounded Halcyon velocity)
  and `ledger.js` (the append-only complicity ledger, with `raceChannelsLive()` as the
  shared gate) carry the player's influence, and `closeout.js` values the book at the
  terminal.
- `belief.js` holds market belief B: per-rung hazards, survival-conditioned quotes,
  quarterly forecast locks, credibility, and firm belief F with scrutiny. It feeds the
  real quoters into `consensus.js` (milestone binaries settled off certifications,
  disputes, R5 settled only at terminal closeout) and `compute-market.js` (the Cambria
  quarterly futures ladder, settled on race-day maturities through
  decree ⊃ force-majeure ⊃ ordinary). `intel.js` samples reliability-bucketed reads of
  Tianxia velocity for prose.

### Endings, Act III, audio, LLM

- In a Dynamic run, natural resolution and early ejection (rogue trading, margin
  deficit, compliance) share one atomic terminal path. It freezes the ledger,
  fires the resolution-day beat, runs the closeout at the resolution-time regime,
  then shows the epilogue. `_triggerGameOver` keeps only `TERMINAL_SAFE_CATEGORIES`
  (`'summit'`) in the popup queue. `endings.js` composes nothing: pages come from
  `EPILOGUE_SLOTS[family][overlay][page]` with fallback [fam][ov] → [fam]['*'] →
  ['*']['*']. Five personal overlays follow the ending cause, and gray eminence vs
  bystander is decided by involvement in ledgered actions, never by traits or beliefs.
- `act3.js` owns one smoothed public driver `x` (and degradation `d`) from the
  released rung and regime. `x` drives the audio machine register, the substep event
  lane (from released R4), the manual latency ladder (`ACT3_TUNING.ladder`) and the
  display-only degradation latches. `standing-orders.js` holds six precommitment
  rules that unlock at released R3 and lock at R5. They execute as machinery, so they
  take no ladder lag and draw no RNG.
- `audio.js` plays a 72 BPM jazz loop (16-bar Am form), an Am drone crossfaded by
  `setAmbientMood`, stingers and superevent stabs. `setMachineIntensity(x)` re-renders
  the same form with less humanity plus a machine bus. `glitchAudio` and
  `silenceDesk()` (the terminal cut) round it out. `initAudio()` waits for the first
  user gesture.
- `llm.js` (`LLMEventSource`) fetches event batches through forced tool use. Settings
  persist in localStorage (`shoals_llm_key`, `shoals_llm_model`; the default is
  `claude-haiku-4-5-20251001`). In LLM mode only the discretionary draw comes from the
  queue, and it falls back to the authored pool when the queue is empty. Race shells
  and latches stay authored, and `SYSTEM_PROMPT` still describes the pre-race world.

## Conventions

- **Authored voice work.** Player-facing prose (events, popup copy, epilogue slots)
  and `src/audio.js` are authored and ratified by a9, not generated. Changes to either
  go through a9. Lore and naming are in `docs/lore.md` and `06-naming.md`: real places
  and public institutions, fictional people, companies and parties. Dead names
  (VXPNT, PNTH, Serica and the other invented polities) appear nowhere at runtime.
- **Prose encoding.** Event headlines and contexts render via `textContent`, so they
  use literal typographic apostrophes, quotes and dashes, never HTML entities.
  `EPILOGUE_SLOTS` cells are HTML and use entities.
- **Public state only.** Quotes, curves, act3 and the bridge's capex latch read only
  public views (`buildPublicView`, `buildComputePublicView`, the `world.ai` mirrors).
  No hidden capability, latent or τ reaches a price. The harnesses corrupt every
  hidden field and assert the quotes are unchanged.
- **Bit-identity is a test invariant.** The harnesses assert bit-identical race
  trajectories for no-player runs, stage-0 export controls and substream isolation,
  and they assert that Classic stays inert. A new random draw belongs in its own
  `deriveSeed` stream. The price path and the event engine use `Math.random`, so
  presentation randomness (act3) never does, or a display draw would move the
  market.
- **Orchestrator inputs.** Race steps that need world facts take them as
  `advanceRace` inputs (strait tension, player coupling, export-control stage), and
  the regime ratchet is called by main.js after `advanceRace`, never inside it.
- **Player channels into the race.** These are HCN positioning (`coupling.js`),
  choice `raceEffects` (S per lab and heat, clamped) and the insider-tip leak verb
  (`raceLeak`). `raceEffects` and the leak share the ledger gate `raceChannelsLive()`,
  and main.js passes zero coupling once the race has resolved, so nothing the player
  does counts after the resolution latch. The trade and sit verbs on a tip are
  uncoupled by ruling.
- **Intraday mutation.** `_midDayBaseline(fn)` wraps any sim-param change made while
  a day is open. Without it, `_closeTradingDay`'s overlay restore silently erases the
  change.
- **The popup queue.** `_queuePopup(event, front)` is the only insertion point, and
  standing-order tip interception happens there. `_applyPopupChoice` is the only
  choice applicator. `_popupBarrier()` keeps a day open while any popup is shown,
  queued or the epilogue is pending, and dismissal closes the waiting day via
  `_closeCompletedDayIfPending()`.
- **Machinery vs the player's hand.** The latency ladder and spread multiplier apply
  to every manual entry (market and chain orders, binaries, compute futures,
  strategies) plus position close and strategy unwind, all via `_deferManual`.
  Exercise, popup trades, margin liquidation, standing orders and terminal paths
  stay instant. Lag 0 bypasses the queue and `spreadMult === 1`
  short-circuits, because the general formula is not bit-exact at 1.
- **Settlement chokepoints.** Every binary settlement row goes through
  `portfolio.applyBinarySettlementRows` (cash, credibility scoring, exactly-once).
  Binary trades go through `executeBinaryTrade`, never `_fillPrice`. Equity decisions
  use `_portfolioEquity`/`portfolioValue`, which include reserved margin. A frozen leg
  restricts the book (`portfolio.restricted`) rather than force-filling it.
- **Two homes, one number.** The Consensus listing base rates in `consensus.js` and
  `RUNG_BASE` in `belief.js` must match so that day-0 quotes equal the listing
  priors. Edit them together.
- **Reset paths.** `_resetCore` resets every module singleton. `resetRaceBridge()`
  runs unconditionally, because `loadPreset` creates the race after `_resetCore` and
  stale latches would throttle a fresh run. The epilogue Restart goes through
  `loadPreset`, since a bare core reset keeps the resolved race.
- **Variance, not vol.** `computeEffectiveSigma`, `computeVXHCNSpot` and
  `computeVXHCNFuturePrice` take Heston variance `v`. `_priceCore` and
  `_pricePairCore` share the `_V` buffer, so a single price after a pair call
  overwrites the pair's call value.
- **Chassis semantics.** `q` drops the price only at the discrete quarterly dividend;
  it is not in the drift. `_clampRate()` is a permanent `sim.r` mutation from
  regulation ceilings and floors. Popup `trades` actions `close_short` and
  `close_long` are directional (`close_short` also closes long puts). Followup
  `weight` breaks ties among same-day siblings and is not a probability. Choice-level
  `factionShifts` add to the base value.
- **Display.** Internal money is at $10,000 scale, and `fmtDollar()` appends "k" for
  portfolio amounts while per-unit prices show raw `$X.XX`. Greeks color by their own
  CSS vars (`--delta` …), VXHCN by `--vxhcn`, and P&L by `pnl-up`/`pnl-down`.
  Portfolio value is colored against buy-and-hold. All UI and canvas text is
  `--font-text`/`_FONT.text`; `--font-code` is used only for the API-key input. The
  canvas redraws once `_loadTextFonts()` resolves.
- **Labels.** UI labels, presets, built-in strategies, traits and epilogue labels are
  sentence case in source, so code finds a preset by `/\(offline\)/i`. The chain
  table is rebuilt on every update, with one delegated listener (`_chainClicksBound`).

## Open work

- a9 is play-testing the reality-beats content (capex waves, concealment, the six
  beats) and the feel of the capex rates channel.
- The feel pass: the `ACT3_TUNING` magnitudes and ladder numbers are first-pass, and
  whether the standing-orders lock at R5 is right will be judged at feel.
- Deferred seams:
  - Terminal VXHCN marks last-valid. The exchange-variance-index machinery is not
    built.
  - The post-theft "why slow down if it can be stolen" margin burn is still missing
    (see the header of `src/events/china.js`).
  - LLM mode has no race-era event source, and `llm.js`'s `SYSTEM_PROMPT` predates
    the race.
- `lobbying.js` still has the prototype menu (party PACs, fundraiser, broker a deal,
  leak, counsel the Fed). The AI-policy menu in `03-market-mechanics.md` is unbuilt.
- `tick()` in `main.js` is dead code. The `/` shortcut and `#step-btn` say "Step
  forward one day", but `step()` advances one substep.
