# Shoals

Shoals is the AI race played from a derivatives desk, at a9l.im/shoals. The player
trades Halcyon (HCN) stock, bonds, VXHCN volatility futures and American options.
In Dynamic mode they also trade Consensus milestone binaries and Cambria
compute futures, while a hidden race model runs underneath and ends each run in one
of six terminal families. The interface is *The Meridian Brief*, the firm's morning
note (see "The Brief" below). It is vanilla ES modules with Canvas 2D charts and Web
Audio synthesis. KaTeX for the reference panels loads from jsDelivr.
It is a submodule of the a9l.im repository (`a9lim.github.io`, at `projects/shoals`); the
root `AGENTS.md` covers the shared layer, design system, build, and deployment.

`docs/design/` is the source of truth for what the game is and why. Read
`00-vision.md` first. `02a-tuning.md` holds the ratified constants and implementation
rulings that code comments cite as "02a …", and the other files cover the world (01),
race model (02), market mechanics (03), arcs (04), endings (05), naming (06) and
market integrity (09). Constants in code mirror 02a, so a retune is recorded there
too.
These docs describe only what is built. Everything designed but not built is in
`docs/ROADMAP.md`, and an item's description moves into its design doc when it
lands. `docs/lore.md` is the world bible (cast, places, products, legislation). No
generated art ships.

## Running and checking

Preview through the parent build (root `AGENTS.md`), then open `/shoals/`. Without a
build, `node docs/sim-overhaul/serve.mjs PORT` from the repo root serves `shared/` and
the projects live from the working tree.

```bash
for f in main.js colors.js src/*.js src/events/*.js src/race/*.js tools/*.mjs; do node --check "$f"; done
node tools/race-mc.mjs         # [N] [--seed S], N=1000: race calibration vs 02a targets (~1 s)
node tools/plumbing-test.mjs   # [N], N=2000: content plumbing, evidence, Act III, standing orders, room/intel, capex/concealment (~13 s)
node tools/belief-test.mjs     # [N] [--seed S], N=300: the rule of thumb's ledger and frozen hash, B's pool, quoters, the posterior's arithmetic, impulse decay (~9 s)
node tools/compute-test.mjs    # [N] [--seed S], N=300: compute-futures lifecycle, conservation, integrity (~2 s)
node tools/consensus-test.mjs  # [N] [--seed S], N=500: binary settlement, regime split, accounting, listing base rates (~2 s)
node tools/endings-test.mjs    # [N] [--seed S], N=2000: family distribution, player channels, closeout, terminal path, the reader's ceilings (~18 s)
node tools/forecast-test.mjs   # [N] [--seed S] [--calibrate], N=500/scenario: properness, the copier, K_CRED vs the reader-copier, static presets (~22 s)
node tools/valuation-test.mjs  # [N] [--seed S] [--validation], N=1000/scenario: V's corruption invariance, calibration, fairness, reconciliation (~54 s)
node tools/rounds-test.mjs     # [N] [--seed S], N=300: Polaris rounds, Halcyon follow-ons, collateral, conservation, main-thread helpers (~28 s)
node tools/reader-test.mjs     # [N] [--seed S] [--sections A-G], N=2000/scenario: the reader's gates, B's edge and its close (~2 min)
node tools/opening-test.mjs    # N=400 worlds: the inherited desks, obligations and their netting, the forced sale, the close, reduce-only closes, the skip's stops, the flatten ticket (~4 s)
node tools/run-test.mjs        # [--seed S] [--rebaseline]: the run headless: no ambient randomness, determinism, isolation, round trip, the fixture, resume, the close's order, coupling, the bystander, Classic inert, timing (~4 s)
node tools/reader-fit.mjs      # the reader's offline fit; needs NumPy/SciPy (shared venv). Run only under 02a's refit rule
```

The twelve harnesses import `src/` directly and exit 1 on any failure. They are the
regression gate for anything that touches the Dynamic-mode systems. Run them at the
default N, because their calibration bands are sized for it and small-N runs miss
them legitimately. Each harness header lists its sections. The parent build doesn't
stage `tools/`.

## Layout

```
index.html, styles.css, colors.js  the Brief: masthead, four pages, overlays; styles; data hues on the inks
main.js            the shell: DOM cache `$`, the clock (rAF loop, step, the skip), the sink, the dispatch's display, save and resume, all wiring (~1.6k lines)
src/run.js         the run, DOM-free: its transitions (open, substep, close, the race block), the dispatch queue, commands and the journal, the terminal path (~2k lines)
src/run-desk.js, run-state.js  the run's trade entry points and standing orders; its state object, the sink and shared helpers
src/run-replay.js, run-worker.js  headless runs, replay to an endpoint, the bystander, the state digest; the module worker for the live-equivalence check
src/pages.js       the four pages (folios), and a folio's count (the ticket's legs on Markets)
src/brief.js       masthead, editions and extras, the lead item and "In brief"
src/markets.js     the markets page: six curves sampled into daily snapshots, ghosts, pointer/keyboard, opened panels and their tables
src/ticket.js      the ticket: legs, ratios and size, order types, the scenario figure and grid, strategies
src/surface.js     the volatility surface under the opened Options panel
src/race-page.js   the race page: public release/claim/certification record, demonstrations, Consensus laws, the forecast editor, epilogue reveal
src/reports-view.js  the chain's reports under the race page's releases
src/config.js      named constants and PRESETS
src/simulation.js  GBM + Merton + Heston stock, Vasicek rate, 16 substeps/day; history-buffer.js ring buffer
src/pricing.js     CRR binomial American pricing, Heston term/skew vol, VXHCN spot/futures, Vasicek bond
src/chain.js       option chain skeleton and pricing
src/position-value.js  unitPrice() for every position type
src/price-impact.js    square-root impact overlays, MM rehedge flow, Layer-3 exposure param shifts
src/portfolio.js       positions, orders, margin, expiry, borrow, liquidation, binary/compute settlement
src/chart.js       the tape: HCN as print candles (zoomed out, a close line over a range band), news days, entries, strikes
src/portfolio-renderer.js  the book on the front page's rail
src/ui.js, reference.js    the DOM cache and settings, Meridian's panels, the dispatch; info and reference panels
src/strategy-store.js  built-in and saved (localStorage) strategies
src/market.js          shared market snapshot, written only by the run's `syncAll()`
src/events.js          EventEngine: Poisson draw, pulses, one-shots, followups, triggers, impulse dispatch
src/events/            authored event pools by domain + param-ranges.js; index.js merges and validates
src/events/race-bridge.js, race-events.js  race ledger → narrative shells
src/world-state.js, faction-standing.js, traits.js, regulations.js, lobbying.js  narrative state
src/endings.js         ending triggers, family/overlay selection, slot-based 5-page epilogue
src/opening.js         the inherited desks (fixtures), the draw and the takeover (DOM-free)
src/almanac.js, almanac-view.js  the almanac's records and summary (DOM-free); its Meridian view
src/counters.js        development-only interruption counters (`shoalsCounts()` in the console)
src/pacing.js          the skip's stop classifier: what makes a close worth reading (DOM-free)
src/race/              hidden race model and its markets (DOM-free; see below), the public
                       record and the reader (reader-constants.js is generated; never edit it)
src/act3.js, standing-orders.js  Act III driver/latency/degradation; menu-authored precommitments
src/audio.js           all music and SFX, synthesized
tools/*.mjs            the twelve headless harnesses, the reader's fit tool and its data/metrics
                       modules; tools/reader-optimizer.py (the fit's optimizer); tools/fixtures/
                       (run-test's browser-recorded journal)
docs/design/, docs/lore.md, docs/ROADMAP.md
```

## How it works

### Modes

`PRESETS` (`src/config.js`) lists five fixed regimes, collectively "Classic" (Calm
bull, Sideways, Volatile, Crisis, Rate hike), plus Dynamic, the default at index 5.
`newRun` (`src/run.js`) creates the event engine (`run.engine`) and the race
(`run.race`) only for index ≥ 5. In Classic both are null, and the race, its markets,
belief, Act III and standing orders are all inert, so Classic is the pure trading sim.
Every new run (a reset, a mode change, the epilogue's restart) draws a fresh run seed
with `randomSeed()`, the one ambient draw.

### The trading day

`Simulation` advances HCN as a GBM with Merton jumps and Heston variance, plus a
Vasicek short rate, in `INTRADAY_STEPS` = 16 substeps per trading day. `sim.history`
is a 252-bar `HistoryBuffer` (`.get(day)`, `.last()`, `.minDay`/`.maxDay`), and
`prepopulate()` backfills it by running with `mu` negated. `beginDay()` pushes
`sim._partial` by reference and `substep()` mutates it in place.

The run's transitions live in `src/run.js`; `frame()` (the playing loop) and `step()`
(one substep per press, closing the day after the sixteenth) in `main.js` only drive
its clock. `beginDay()` installs the Layer-3 and impulse overlays. `substep()` runs
substep → `_clampRate()` → impact decay → `syncAll()` → market-maker rehedge →
pending-order check, then the Act III boundary work (deferred manual fills, processed
atomically; the substep event lane; a popup drain). `tryClose()` closes a finished day
unless the barrier holds: `_closeTradingDay()` finalizes the bar and removes the
overlays LIFO before `_onDayComplete()`. That opens with the forecast's snapshot on a
lock day (before anything else steps, so it is still the lock day's), then handles
borrow, dividends, expiry, the quarterly review, traits, the race block, the event
engine and endings, impact and Layer-3 decay, the obligations (`_settleObligations`:
payment, the forced sale, the notice), the rogue-trading and margin checks, the sink's
close notifications and the popup drain.

Race-block order in `_onDayComplete`: `stepCoupling` → `advanceRace(race,
{straitTension, playerCoupling, exportControlStage})` (demonstrations step inside it,
after the day's releases and certifications) → `stepControlRegime` →
`stepTreaty` → `_syncRaceToWorld()` (the mirrors) → `setBaseRateScale` →
`_stepAct3()` → standing-order sync → `stepBelief` → Consensus and compute
settlement → standing day rules → on lock days, quarter scoring (`scoreQuarter`, and the
reader-copier's), the quarter's close line, `F`, scrutiny and firm conversion →
`checkResolution` →
`_checkRoom`. After the event engine and the bridge pass, `_stepRaceMarkets` applies
the valuation gap (and any follow-on dilution) to the closed day, fills resting orders
at the post-gap price and queues the round offers; `marketsDayClose` snapshots after it.

### The run and its journal

Read 02a "The run, headless" with this. A run is its seed, its journal and its rules
version (`RULES_VERSION`, `config.js`).

- **Randomness.** Every draw that can change state comes from the run seed through
  `keyedRng(seed, name, ...keys)` (`race/rng.js`): a fresh stream per semantic slot
  (the price path by day and substep, the event engine's draws by day or by an event's
  id and occurrence, tips, lobbying), so a branch that adds an event relabels only the
  draws keyed on it. The race's named streams are unchanged; presentation keeps
  streams of its own. `randomSeed()` at a new run is the only `Math.random` left.
- **The sink.** The run reports to the shell through one object (`setSink`,
  `run-state.js`): toasts, developments, stops, wire refreshes, a dispatch to show,
  the close's display data. A headless run passes none.
- **Commands.** Everything the player does that changes state is a command through
  `runCommand` (`trade`, `cancel`, `close`, `unwind`, `exercise`, `answer`, `forecast`,
  `standing`, `lobby`, `setting`), journaled at its position (the day, and the
  substeps run: 0 between days, 16 for a finished day a dispatch holds open). A
  command carries what it resolved to, admission is checked inside the run, a
  dispatch answer names its occurrence, and the forecast editor commits the draft's
  whole state at a gesture's end. Speed, pause, the skip, pages, theme and sound are
  not commands.
- **Save and resume.** The shell writes `shoals-run` (header, journal, endpoint and
  the Markets page's ghost) at each close and after each command between days, and a
  page load replays it headless to the endpoint with the sink in replay mode, then
  opens paused. A save under other rules, or one that fails to replay, is retired
  with a notice; the last edition clears it.
- **Headless runs.** `runHeadless` and `drive` (`run-replay.js`) play a policy; the
  bystander answers each dispatch with its `bystander: true` choice (every dispatch
  names one, `validateBystander` in `events/index.js`), sends no commands and starts
  on cash. `digest()` hashes the run's state at each close.
- **Exactness is per engine.** Replay is bit-exact within one JavaScript engine; Node
  and Chrome round some `Math` functions differently in the last place, so the fixture's
  trail is derived in Node and live equivalence is checked in the page
  (`shoalsReplayCheck()`, a module worker with its own module instances).

### Pricing, impact, portfolio

- `pricing.js` uses a 128-step CRR tree with discrete dividends. Each tree carries an
  N−1-step companion, and the public APIs average the two to cancel odd/even
  oscillation. Contract vol is `computeEffectiveSigma` (Heston expected integrated
  variance) plus `computeSkewSigma`. Delta, gamma and theta come from tree nodes;
  vega and rho come from finite differences. VXHCN spot is 30-day expected Heston
  vol × 100 (`computeVXHCNSpot`), and the futures use the forward variance curve.
- `unitPrice()` in `position-value.js` is the one valuation path. It covers stock,
  bond, vxhcnfuture, computefuture, binary, call and put, with the vol surface and
  impact overlay included. Only the ticket's scenario figure prices trees directly.
- Impact is an overlay on `sim.S` and never rewrites the path. The decaying
  cumulative volume per instrument feeds `getStockImpact(sigma)`,
  `getBondImpact(sigmaR)`, `getVxhcnImpact(xi)` and `getOptionImpact(…)`. Layer 3
  shifts selected process params temporarily when gross exposure is large.
- The valuation layer (`race/valuation.js`, 02a): in Dynamic, HCN's level carries
  V = (1−η)·V_legible + η·V_full, each reader's survival-conditioned expectation of
  the closeout's family marks under its per-act family head, applied as a clamped gap
  at each day's close. Misalignment gets no weight. The closeout marks HCN at
  spot·m_f/V_T. V's known limit (it drifts predictably at about 0.027 a quarter) is in
  02a.
- The primary market (`race/rounds.js`, `src/events/rounds.js`): Polaris private
  rounds (`privatestake`: cash-funded, marked at the last round, zero collateral value,
  illiquid, capped at cash and collateral headroom, settled by closeout cell 10) and a
  Halcyon follow-on at each capex wave (dilution gap, discounted shares, a 126-day
  primary input to the cost-of-capital channel). Offers are `rounds` dispatches.
- Positions carry a signed `qty` (no `side`) and net on `type + strike + expiryDay +
  strategyName`. `portfolio` is a singleton that `resetPortfolio()` mutates in place.
  `executeWithRollback` (`run-desk.js`) unwinds every leg of a strategy on partial failure.
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
  interjection) and everything fired by the race bridge, the ledger or the run's
  latches (release, incident, certification, strait, regime, dispute, theft, polaris,
  insider, conversion, summit, room, rates). Arc categories (halcyon, china, wonder,
  policy, treaty, ghostwritten) are Poisson-live, gated by `world.ai.frontierRung`.
- `race-bridge.js` turns `race.lastTransitions` into shells. Its `finalize` picks a
  variant, substitutes tokens (`{lab}` `{model}` `{aModel}` `{rung}` `{rungName}`
  `{lag}`) and capitalizes. Variant rotation uses per-shell counters reset by
  `resetRaceBridge()`, never RNG.
- `world-state.js` holds congress, geopolitical, fed, investigations, election, media
  and `ai`. `world.ai.controlRegime`, `reportingRegime`, `frontierRung`, `summitLive`,
  `fundLive` and `geopolitical.taiwanBlockade` are mirrors written by the run and are
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
  theft disclosures, demonstrations, regime change). Downstream systems consume that
  ledger and never diff state. The only capability mutations are `commitRelease` and
  `commitTheft`. A release draws the lab's next cooldown, U(30, 60) days, from
  `streams.releaseJitter`.
- Demonstrations (`demonstrations.js`, 02a "Demonstrations"): Halcyon and Polaris
  publish what their unreleased models did, bearing on the next unreleased rung. Each
  is sound, over-scoped or flawed by its hidden truth; a scope dispute contests it, an
  exact independent evaluation upholds, narrows or withdraws it (a withdrawal takes
  whatever cites it), and nothing new is published under the classified regime. It
  draws only from `streams.demonstrations` and moves nothing in the race. Polaris's
  funding window reads `polarisRoundDays` (`rounds.js`), the nominal round schedule.
  The public rows fold into the record; `chainReports` gives each report's status.
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
- The reader (`public-record.js`, `reader.js`, generated `reader-constants.js`; 02a
  "The reader"): the public record is the data contract, built from the ledger's
  public rows, public snapshots and the orchestrator's public world inputs. The reader
  is fit offline by `tools/reader-fit.mjs` (through `tools/reader-optimizer.py`;
  NumPy/SciPy from the shared venv's `data` column, needed only to refit) on headless
  worlds whose seeds are split train/validation/test, and only evaluated in play. Its
  legible rung heads are the rule of thumb through the calibration stage (each horizon
  segment rescaled per 21-day knot and claim state, moment-matched), its full heads
  read the whole record through the same stage, and its family heads are per act. Refit when the
  distribution of runs or the record changes (02a "Refit rule").
- `belief.js` holds market belief B: the rule of thumb (the old heuristic updater,
  ledgered, kept bit-identical; the reader was fit on it) and the pool
  (1−η)·legible + η·full over the reader's laws, made coherent up the ladder; the
  player's posterior (a standing policy per rung: each rung follows `B`'s projection
  until the player draws on it, then carries its `{m, w, q}` curve; `lockForecast`
  snapshots it each quarter, classifying every rung once as followed or carried and
  storing the clamped probability pairs, `p_P ≡ p_M` on a followed rung;
  `scoreQuarter`'s log-likelihood ratio, the outstanding quarter scored at the
  terminal, credibility = tanh(S_P/K_CRED), and σ₀ reported); the reader-copier's
  record beside it (`copierRecord`, the almanac's, never shown in play); and firm
  belief F with scrutiny, where `playerPilled` mirrors `marketPilled`'s 252-day
  horizon and is null when the latest lock follows R4 (no stated posterior). It feeds the
  real quoters into `consensus.js` (milestone binaries settled off certifications,
  disputes, R5 settled only at terminal closeout) and `compute-market.js` (the Cambria
  quarterly futures ladder, settled on race-day maturities through
  decree ⊃ force-majeure ⊃ ordinary). `intel.js` samples reliability-bucketed reads of
  Tianxia velocity for prose.

### The Brief (interface)

The page is the firm's morning note. The shared colophon (seal, name, play, step,
theme, help; `shared/colophon.js`) sits in the masthead's corner; Shoals loads neither
`shared/toolbar.js` nor `shared/hud.css` and styles its own hairline controls. The theme
key is `shoals-theme`.

- **Editions.** `brief.js` numbers each live trading day as an edition (day 0 is
  Edition 1) and sets the dateline (day, regime, HCN, VXHCN, rate, book). `markExtra`
  flags an extra edition for a control-regime change, a Taiwan blockade, a superevent
  or a crisis (`compound`) event; the shell calls it when the run reports an extra.
- **The wire.** Every event-log refresh goes through the shell's `_updateWire()`, which
  also sets the front page's lead (the newest log entry, split at its first clause
  break by `splitHeadline`; the text is quoted, never rewritten), the wire under it
  (the rest of the log: `MAX_EVENT_LOG` keeps the lead and forty items under it, the
  paper's archive) and the tape's news days. Event
  toasts show only off the front page, where the lead carries them. A quiet first
  edition leads with the tape.
- **Pages.** One job each (2026-10-26): the Front page reads (lead and wire, the tape,
  the book), Markets commits (the curves and the ticket, the only order entry), Race
  knows (the ladder and the forecast editor), and Meridian accounts (the record, the
  standing, standing orders and convictions, Washington, the settings). `pages.js`
  shows one (`[` `]`, and F, M, G, D); hidden pages do no drawing.
- **The tape.** `chart.js` draws print candles: hollow in ink on a day that closed
  up, solid in the accent on a day that closed down, a hairline wick that never
  crosses the body. The forming day's wick is a water mark of the eased close, so it
  ratchets out and holds. Below `CANDLE_MIN_PX` a day it draws the close as a line
  over a band of the range.
- **The book.** The front page's rail (`portfolio-renderer.js`): the value in ink with
  a line comparing it to holding HCN (the sparkline's dashed ghost), the account,
  unpaid obligations (label, due edition, amount), positions (binaries included) as contract, quantity and P&L, strategy groups,
  working orders and the Greeks. A position's name hands its contract to the ticket
  (`shoals:toTicket`).
- **Opening.** The desk opens playing on Edition 1 unless the platform asks for reduced
  motion, which opens paused on a complete frame; a saved run resumes paused where it
  stood ("The run and its journal"). In Dynamic, `_dealOpeningHand` (`src/run.js`,
  on `src/opening.js`) deals one of four inherited desks from the run's seed (its own
  `'opening'` stream) and takes it over at day 0's marks, cash solved so equity net of
  the obligation is `INITIAL_CAPITAL`. The predecessor's memo leads Edition 1, with two
  archived reports (dated `Archive`, no news day) under it. Classic starts on cash.
  There is no forecast dispatch: the desk snapshots the standing policy at each lock
  day's close (02a "The standing policy").
- **Pacing.** *To the next edition worth reading* (`#skip-btn`, `n`) plays at
  `SKIP_DAYS_PER_SEC` without touching the speed setting and stops on 02a's list: a
  dispatch at once, the rest latched through the day and taken at the close
  (`pacing.js` `closeStop`). Every development site in the run calls `develop(kind)`,
  which counts it and reaches the shell's `_develop`, which feeds the latch. A stop pauses and stays paused; answering a
  dispatch the skip stopped on does not resume play.
- **Dispatches and the last edition.** The run's queue decides which dispatch is up
  (`_queuePopup`/`_processPopupQueue`); the shell shows it (`showPopupEvent`) and a
  choice sends an `answer` command. The epilogue overlay is the last edition, with a "The race, revealed" button
  that opens the race page; the race page's "The last edition" reopens it.
- **Markets.** `takeSnapshot` samples six curves from the engines once per day
  (`marketsDayClose`, after the day's events) and prices each tradeable point through
  `unitPrice` or the books' quotes. On a news day the previous snapshot is the ghost
  and the curves ease from it. Consensus curves come from `binaryProb` (belief B) and
  the compute curve from `computeCurveFromBelief` on the public view: public state
  only, the quoters' own inputs. The Consensus panel draws the player's draft
  read-only, on the rungs where it differs from B's projection. A panel's title opens
  it over the curves area with its table (`openPanel`): every contract on the curve
  by bid and ask, a bid cell selling and an ask cell buying; the Options panel opens
  to the published chain (`publishedChain`, so Act III can hold it) with every listed
  strike on the smile and the surface under it. Open tables refresh each substep.
- **The ticket.** `ticket.js` is the one order entry. Legs come from curve points and
  table rows (a click cycles long, short, removed; a right-click goes short), carry
  a signed ratio and share one size; an option leg's kind is a link that switches
  call and put. One leg, or a named ticket of strategy types, may rest as a limit or
  stop (triggered on HCN's price, as `checkPendingOrders` does); a named ticket trades
  through `executeWithRollback` or the ladder's `'strategy'` entry, anything else leg
  by leg through `_deferManual`, `executeMarketOrder` and `executeBinaryTrade`, so the
  latency ladder and spreads apply. A send is a `trade` command carrying its resolved
  contracts (`sendTicket`, `run-desk.js`). Greeks come from `aggregateGreeks` over the legs.
  The figure and grid revalue every leg at the horizon (until the player sets it, a
  quarter or the nearest option expiry, whichever is sooner) across HCN moves and,
  in Dynamic, how far the race gets (in Classic, volatility). The scenario model is
  the display's, not the engine's, and unratified: Heston mean reversion with a
  leverage shock on variance, the capex channel's +0.005 on `b` per newly certified
  rung, B re-evaluated on a copy of the record and the rule with the scenario's
  certification added (the quiet row carries routine releases forward at each lab's
  cadence), and compute repriced by `placeholderCurve` at the new certified rung.
  Strategies load at the Options panel's expiry (`strategy-store.js`) and save
  relative to it when their legs share one expiry. The flatten (`#book-flatten`, `x`)
  loads a reduce-only closing leg per position, bound to its id and strategy name, at
  size one, with its estimated cost beside the cash it releases (`estimateReduceOnly`,
  `previewImpact`: nothing mutates). Sending it cancels resting orders and working
  Act III entries and sends each leg through `_deferManual` as a `'reduce'`, capped at
  what the position holds when it executes and skipped if it has reversed. Any edit to
  the legs makes it an ordinary ticket.
- **Race page.** `recordRaceDay` (after the day's events) appends public records to
  `_pub` (releases with the rung they claim, released-rung claims, certifications, the
  open ecosystem's rung, the Fixedpoint Index's publication day) and the continuous
  tracks to `_hid`. Demonstrations are read from the public record (`chainReports`):
  each is its lab's mark, hollow, in the lab's lane at the rung it bears on, dashed
  while disputed, with a dot once upheld, short of the rung once narrowed and struck
  through once withdrawn; `reports-view.js` lists them under the releases, one row per
  demonstration with its trail, marked new since the latest snapshot. During play only `_pub`, belief B and the listed contracts are
  drawn; `_hid` and the internal crossing days are drawn only after `endRacePage()`
  (game over). The Fixedpoint Index has no numeric series in the model, so its strip
  shows publication only. The page is also the posterior's editor: the draft's daily
  mass drawn in ink over B's on each open rung, on one scale; the bead is the median
  (drag across; up and down for width), the square on the term-end gauge the plateau
  (beside B's tick), with 02a's keys on the focused canvas. A followed rung draws only
  B; ink appears only on carried rungs. Delete or Backspace returns the focused rung to
  the market, and "Follow the market" returns every rung (`followMarket`). The editor
  works on a copy during a gesture and commits the draft's whole state as one
  `forecast` command at its end. The ladder's Locked column reads `Market` for a rung
  the latest lock followed.
- **Meridian.** The record shows quarters stated (a carried rung scored) and the
  predecessor's handover (`renderHandover`). The almanac (`almanac-view.js`) sits under
  the columns: summary rows, the latest runs, a reliability canvas and the families
  beside the neutral-input baseline, rendered on page open, theme change and the last
  edition's append. The settings (regime, sound, the pricing parameters) sit at its foot.
  Sections marked `data-dynamic` (Meridian's columns, the race page's forecast notes)
  hide in Classic. Congress is one seat bar per chamber: Farmer-Labor solid, the
  Federalists hatched, a rule at the majority.

### Endings, Act III, audio

- In a Dynamic run, natural resolution and early ejection (rogue trading, margin
  deficit, compliance) share one atomic terminal path. It freezes the ledger,
  fires the resolution-day beat, runs the closeout at the resolution-time regime,
  then shows the epilogue. `_triggerGameOver` keeps only `TERMINAL_SAFE_CATEGORIES`
  (`'summit'`, and `'catastrophe'`: an S4 resolves on the tick it self-discloses, and
  the latch keeps its detection for the bridge) in the popup queue. `endings.js` composes nothing: pages come from
  `EPILOGUE_SLOTS[family][overlay][page]` with fallback [fam][ov] → [fam]['*'] →
  ['*']['*']. Five personal overlays follow the ending cause, and gray eminence vs
  bystander is decided by involvement in ledgered actions, never by traits or beliefs.
- `act3.js` owns one smoothed public driver `x` (and degradation `d`) from the
  released rung and regime. `x` drives the audio machine register, the substep event
  lane (from released R4), the manual latency ladder (`ACT3_TUNING.ladder`) and the
  display-only degradation latches. `standing-orders.js` holds six precommitment
  rules that unlock at released R3 and lock at R5. They execute as machinery, so they
  take no ladder lag and draw no RNG.
- `audio.js` plays "Halcyon", a 32-bar AABA ballad in A minor at 72 BPM, as a
  four-chorus set (head in on muted trumpet, a written Rhodes solo, a walking
  rhythm chorus, head out), scheduled a bar at a time from its own PRNG (never
  `Math.random`). An A drone crossfades by `setAmbientMood`. Dispatches ring the wire
  bell; superevent cues (`playMusic`) ring the flash and quote the tune.
  `setMachineIntensity(x)` re-renders the same form with less humanity plus a machine
  bus. `glitchAudio` and `silenceDesk()` (the terminal cut) round it out.
  `initAudio()` waits for the first user gesture.

## Conventions

- **Authored voice work.** Player-facing prose (events, popup copy, epilogue slots)
  and `src/audio.js` are authored work, ratified by a9; changes to either go through
  a9. The 2026-10-24 score was written by Claude at a9's request. Lore and naming are in `docs/lore.md` and `06-naming.md`: real places
  and public institutions, fictional people, companies and parties. Dead names
  (VXPNT, PNTH, Serica and the other invented polities) appear nowhere at runtime.
- **Prose encoding.** Event headlines and contexts render via `textContent`, so they
  use literal typographic apostrophes, quotes and dashes, never HTML entities.
  `EPILOGUE_SLOTS` cells are HTML and use entities.
- **Public state only.** Quotes, curves, act3 and the bridge's capex latch read only
  public views (`buildPublicView`, `buildComputePublicView`, the `world.ai` mirrors).
  No hidden capability, latent or τ reaches a price. The markets page, the ticket and
  the race page during play hold to the same rule; the race page's hidden tracks are
  drawn only after the run ends. The harnesses corrupt every
  hidden field and assert the quotes are unchanged.
- **Bit-identity is a test invariant.** The harnesses assert bit-identical race
  trajectories for no-player runs, stage-0 export controls and substream isolation,
  and they assert that Classic stays inert. A new random draw belongs in its own
  `deriveSeed` stream, or a `keyedRng` slot keyed by its semantic identity. No state
  path draws `Math.random`; presentation draws from streams of its own, so a display
  draw never moves the market. run-test asserts a run completes with `Math.random`
  throwing.
- **Orchestrator inputs.** Race steps that need world facts take them as
  `advanceRace` inputs (strait tension, player coupling, export-control stage), and
  the regime ratchet is called by the run after `advanceRace`, never inside it.
- **Player channels into the race.** These are HCN positioning (`coupling.js`),
  choice `raceEffects` (S per lab and heat, clamped) and the insider-tip leak verb
  (`raceLeak`). `raceEffects` and the leak share the ledger gate `raceChannelsLive()`,
  and the run passes zero coupling once the race has resolved, so nothing the player
  does counts after the resolution latch. The trade and sit verbs on a tip are
  uncoupled by ruling.
- **Intraday mutation.** `_midDayBaseline(fn)` wraps any sim-param change made while
  a day is open. Without it, `_closeTradingDay`'s overlay restore silently erases the
  change.
- **The popup queue** (`src/run.js`). `_queuePopup(event, front)` is the only
  insertion point, and standing-order tip interception happens there. A dispatch is
  answered only by an `answer` command, and `_applyPopupChoice` is the only choice
  applicator. `barrier()` keeps a day open while a dispatch is up or queued or the
  epilogue is pending (run state, never the DOM), and an answer closes the waiting day
  via `_closeCompletedDayIfPending()`.
- **Machinery vs the player's hand.** The latency ladder and spread multiplier apply
  to every manual entry (the ticket's market legs, binaries, compute futures,
  strategies) plus position close and strategy unwind, all via `_deferManual`
  (`run-desk.js`).
  Exercise, popup trades, margin liquidation, a forced sale, standing orders and terminal paths
  stay instant. Lag 0 bypasses the queue and `spreadMult === 1`
  short-circuits, because the general formula is not bit-exact at 1.
- **Obligations** (02a "The evening") are liabilities: `unpaidObligations` nets them out
  of every actual and prospective equity calculation (`portfolioValue`,
  `collateralEquity`, `checkMargin`, short admission, the endings check). They are paid
  in cash at the close due on their day; a shortfall is raised by `settleObligation`'s
  pro-rata forced sale, a machinery reduce-only close at `FORCED_SALE_SPREAD_MULT`
  times the spread. The terminal closeout pays what is unpaid.
- **Settlement chokepoints.** Every binary settlement row goes through
  `portfolio.applyBinarySettlementRows` (cash, exactly-once). Credibility is scored
  quarterly by `scoreQuarter`, never at settlement.
  Binary trades go through `executeBinaryTrade`, never `_fillPrice`. Equity decisions
  use `portfolioEquity`/`portfolioValue`, which include reserved margin. A frozen leg
  restricts the book (`portfolio.restricted`) rather than force-filling it.
- **Listing base rates.** The Consensus listing base rates live only in
  `consensus.js` and equal B's day-0 quote, which is the same in every world. Re-derive
  them on validation seeds whenever the reader is refit.
- **The rule of thumb is frozen.** The reader's legible heads were fit on the
  heuristic updater's exact trajectory. belief-test hashes it against commit 1343924;
  changing the rule means refitting the reader.
- **Reset paths.** One run exists at a time. `newRun` begins with `_resetRun`, which
  resets every module singleton the run touches; `resetRaceBridge()` runs
  unconditionally there, because the race is created after it and stale latches would
  throttle a fresh run. The shell's `_startRun` takes every new run (a reset, a mode
  change, the epilogue's restart) through `newRun` with a fresh seed, and run-test
  checks that runs A, B, A reproduce A.
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
  portfolio amounts while per-unit prices show raw `$X.XX`. The accent is the one red
  and is spent on losses and down moves (`--down`, `pnl-down`, a down session's last
  close); gains take viridian (`--up`). A short position is not a loss and is never
  red. Instruments have inks (`colors.js`: stock ochre, bond prussian, call verdigris,
  put sienna, VXHCN violet, binary indigo, compute umber, private stake sap), and each
  Greek has its own (`--delta` …).
  The book's value is set in ink; the line under it colors the comparison with
  holding HCN. All UI and canvas text is
  `--font-text`/`_FONT.text`. The canvas redraws once `_loadTextFonts()` resolves. Live
  captions use `_colophon.caption()`; the tape's first write is forced, because the
  helper skips a write that falls within its interval of time zero.
- **Show, don't tell** (root `AGENTS.md`). A caption is the view's name and the live
  values nothing else shows: the dateline carries HCN, VXHCN, the rate and the book,
  and each market panel reads its own value, so Fig. 1 is the day's range, Fig. 2 the
  edition the dashed ghosts show, Fig. 3 the released frontier. Empty states are a
  muted em dash. What a mark means or how a control works lives in `about.md` and in
  one info tip per section heading, never in ledes, hints or panel subtitles; the
  diegetic copy (wire, lead, dispatches, epilogue) is content and keeps its voice.
- **Labels.** UI labels, presets, built-in strategies, traits and epilogue labels are
  sentence case in source. Contracts are named once, by `contractName`
  (format-helpers.js), for the ticket, the tables and the book. An opened panel's
  table is rebuilt on each refresh with delegated listeners on its container, and
  keeps focus on the same cell.

## Open work

`docs/ROADMAP.md` is the queue, in order, and opens with the direction set on
2026-10-25: know, commit, lose your grip, and an honest accounting, read through
embedded agency. The 2026-10-27 review reordered it around how the game plays for an
evening, and a9 ratified it the same day (its rulings are listed there). The evening
landed on 2026-10-27 (the forecast as a standing policy, the inherited desks with
their obligations, pacing, the flatten, the almanac). Next is one decision chain end
to end (a demonstration, a disputed inference, a position, a financing commitment with
the terminal clip retired, a disclosure, the firm's response), with the transitions
extracted from `main.js` alongside it so whole runs play headless and replay from a
journal. Then come what the book bets beside what the player says, the accounting,
Act III taking the player's judgment, widening into domains, and shared worlds. The
backlog holds the instruments in waiting, the race's missing machinery, market
integrity, satire, cleanup, and a9's play-test notes. The event-illustration pilot is
its own session, briefed there.
