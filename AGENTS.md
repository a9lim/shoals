# Shoals

Shoals is the AI race played from a derivatives desk, at a9l.im/shoals. The player
trades Halcyon (HCN) stock, bonds, VXHCN volatility futures and American options; in
Dynamic mode also Consensus milestone binaries and Cambria compute futures, while a
hidden race model runs underneath and ends each run in one of six terminal families.
The interface is *The Meridian Brief*, the firm's morning note. Vanilla ES modules,
Canvas 2D charts, Web Audio synthesis; KaTeX for the reference panels loads from
jsDelivr. It is a submodule of the a9l.im repository (`projects/shoals`); the root
`AGENTS.md` covers the shared layer, design system, build and deployment.

`docs/design/` is the source of truth for what the game is and why; read
`00-vision.md` first. `02a-tuning.md` holds the ratified constants and implementation
rulings that code comments cite as 02a "Section", and constants in code mirror it, so
a retune is recorded there first. The other files cover the world (01), race model
(02), market mechanics (03), arcs (04), endings (05), naming (06) and market integrity
(09). The design docs describe only what is built; everything designed but unbuilt is
in `docs/ROADMAP.md`, and an item's description moves into its design doc when it
lands. `docs/lore.md` is the world bible. No generated art ships.

## Running and checking

Preview through the parent build (root `AGENTS.md`), then open `/shoals/`. Without a
build, `node docs/sim-overhaul/serve.mjs PORT` from the repo root serves `shared/` and
the projects live from the working tree.

```bash
node --test 'tests/*.test.mjs'   # the suite: Node only, no install, no network (~2 s)
for f in main.js colors.js src/*.js src/events/*.js src/race/*.js tools/*.mjs tests/*.mjs; do node --check "$f"; done
node tools/race-mc.mjs [N]       # reports the race's stance (crossing medians, fizzle tail, families) against 02a's targets; not a gate
node tools/reader-fit.mjs        # the reader's offline refit; needs NumPy/SciPy (shared venv). Only under 02a "Refit rule"
```

Quote the glob: Node 24 and older read a bare `tests/` as a module and fail. The tests
import `src/` directly; the parent's stager never deploys `tests/`, `tools/` or
`docs/`. Manual checks: in the page, `shoalsReplayCheck()` replays the live journal in
a module worker and compares it with the page's own state (replay is bit-exact only
within one engine; Node and Chrome round some `Math` functions differently in the last
place, so Node can't check this). `shoalsCounts()` reads the development-only
interruption counters.

**Test policy.** A check earns its place only when a failure would be silent or hard
to see by playing: conservation and exactly-once settlement, public state only,
determinism, replay and resume, analytic oracles (the score's properness, V's formula,
the pool's arithmetic), structural invariants of data. One representative case per
mechanism, seeded, the smallest N that is not flaky. No snapshots of tuned values, no
statistical headline bands, no source or UI-string greps. A new mechanism adds a test
only if its failure would be silent.

| File | What it guards |
|---|---|
| `tests/run.test.mjs` | no ambient `Math.random`; a seed and journal replay exactly; isolation between runs; resume; Classic inert; every dispatch names one bystander choice |
| `tests/books.test.mjs` | Consensus and compute settlement exactly once against independent truth, the regime split and precedence, cash conserved |
| `tests/belief.test.mjs` | the rule's ledger, B's pool and coherence, the posterior's scoring against naive forms, properness, the reader-copier, V's formula, gap and bounds, impulse decay, the reader's laws |
| `tests/public-state.test.mjs` | corrupting hidden state moves no quote, settlement, B or V; the public record folds back from its rows; the chain's reports |
| `tests/terminal.test.mjs` | closeout conservation in every cell, the finalizers, ejection invariance, the bounded-influence clip, the ledger's latch |
| `tests/desk.test.mjs` | the takeover at `INITIAL_CAPITAL`, obligations and the forced sale, reduce-only legs and their estimate, private stakes |
| `tests/race.test.mjs` | S4 self-disclosure, Polaris's round schedule, the demonstration withdrawal cascade |

## Layout

```
index.html, styles.css, colors.js   the Brief: masthead, four pages, overlays; data hues on the inks
main.js            the shell: DOM cache `$`, the clock (rAF loop, step, the skip), the sink, save and resume, wiring
src/run.js         the run, DOM-free: day transitions, the race block, the dispatch queue, commands, the terminal path
src/run-desk.js, run-state.js     trade entry points and standing orders; the run's state object and the sink
src/run-replay.js, run-worker.js  headless runs, replay, the bystander, the digest; the worker behind shoalsReplayCheck()
src/pages.js, brief.js            the four pages; masthead, editions, the lead and the wire
src/markets.js, ticket.js, surface.js  the Markets page's curves and tables; the one order entry; the vol surface
src/race-page.js, reports-view.js the race page and the posterior's editor; the chain's reports
src/config.js      named constants, PRESETS, RULES_VERSION
src/simulation.js, history-buffer.js  GBM + Merton + Heston stock, Vasicek rate, 16 substeps/day; 252-bar ring buffer
src/pricing.js, chain.js, position-value.js  CRR American pricing, Heston vol, VXHCN, bonds; the chain; unitPrice()
src/price-impact.js, portfolio.js  impact overlays and MM rehedge; positions, orders, margin, settlement, obligations
src/chart.js, portfolio-renderer.js, sparkline.js  the tape; the book on the front page's rail
src/ui.js, reference.js, format-helpers.js  Meridian's panels and settings; info and reference panels; contractName etc.
src/market.js      shared market snapshot, written only by the run's syncAll()
src/events.js, events/  EventEngine; authored pools by domain, param-ranges.js, race-bridge.js (ledger → shells)
src/world-state.js, faction-standing.js, traits.js, regulations.js, lobbying.js  narrative state
src/endings.js     ending triggers, family/overlay selection, the slot-based epilogue
src/opening.js, pacing.js  the inherited desks and the takeover; the skip's stop classifier (both DOM-free)
src/almanac.js, almanac-view.js  the almanac's records and summary; its Meridian view
src/act3.js, standing-orders.js  Act III's driver, latency and degradation; precommitment rules
src/audio.js, counters.js  all music and SFX, synthesized; development-only counters
src/race/          the hidden race model, its markets, the public record and the reader (DOM-free);
                   reader-constants.js is generated by the refit, never edited by hand
tests/             the suite (above)
tools/             race-mc.mjs; the reader's refit: reader-fit.mjs, reader-data.mjs, reader-metrics.mjs,
                   engine-worlds.mjs (bystander worlds, cached in .cache/), reader-optimizer.py, reader-fit-report.json
docs/design/, docs/lore.md, docs/ROADMAP.md
```

## How it fits together

- **Modes.** `PRESETS` lists five fixed regimes ("Classic") and Dynamic, the default
  at index 5. `newRun` creates the event engine and the race only for index ≥ 5; in
  Classic the race, its markets, belief, Act III and standing orders are all inert, so
  Classic is the pure trading sim.
- **The day.** `Simulation` runs 16 substeps a day. The run owns the transitions
  (`beginDay`, `substep`, `tryClose`); `main.js` only drives the clock. Overlays (Layer
  3 and event impulses) are installed at `beginDay` and removed LIFO before the close's
  work. On a lock day the forecast's snapshot is the close's first act, so it reads the
  lock day's state.
- **Race-block order** in `_onDayComplete`: `stepCoupling` → `advanceRace(race,
  {straitTension, playerCoupling, exportControlStage})` (demonstrations step inside it)
  → `stepControlRegime` → `stepTreaty` → `_syncRaceToWorld()` → `setBaseRateScale` →
  `_stepAct3()` → standing-order sync → `stepBelief` → Consensus and compute settlement
  → standing day rules → on lock days `scoreQuarter` (and the reader-copier's), `F`,
  scrutiny, firm conversion → `checkResolution` → `_checkRoom`. After the event engine
  and the bridge pass, `_stepRaceMarkets` applies the valuation gap (and any follow-on
  dilution) to the closed day and fills resting orders at the post-gap price;
  `marketsDayClose` snapshots after it. The order is load-bearing and no test pins it:
  a reorder changes what every later step reads, so it is a design change, recorded in
  02a.
- **The run is its seed, its journal and `RULES_VERSION`** (02a "The run, headless").
  Every state-changing draw comes from `keyedRng(seed, name, ...keys)`, a fresh stream
  per semantic slot (the price path by day and substep, an event's draws by its id and
  occurrence), so a branch that adds an event relabels only the draws keyed on it.
  Everything the player does that changes state is a command through `runCommand`
  (`trade`, `cancel`, `close`, `unwind`, `exercise`, `answer`, `forecast`, `standing`,
  `lobby`, `setting`), journaled at its position and carrying what it resolved to;
  speed, pause, the skip, pages, theme and sound are not commands. The shell saves
  `shoals-run` at each close and after each command between days; a load replays it
  headless to the endpoint and opens paused, and a save under other rules or one that
  fails to replay is retired with a notice. The run reports to the shell through one
  sink (`setSink`); a headless run passes none. Bump `RULES_VERSION` on any change that
  alters what a journal replays to.
- **Headless runs.** `runHeadless`/`drive` play a policy; the bystander answers each
  dispatch with its `bystander: true` choice, sends no commands and starts on cash.
  The engine worlds the reader is fit on are bystander runs.
- **Pricing.** A 128-step CRR tree with discrete dividends, averaged with an N−1-step
  companion to cancel odd/even oscillation. `unitPrice()` is the one valuation path
  (only the ticket's scenario figure prices trees directly). Impact is an overlay on
  `sim.S` and never rewrites the path. Positions carry a signed `qty` and net on
  `type + strike + expiryDay + strategyName`.
- **The valuation layer** (`race/valuation.js`, 02a): HCN's level carries
  V = (1−η)·V_legible + η·V_full, each reader's survival-conditioned expected family
  mark, applied as a clamped gap at the close; the closeout marks HCN at spot·m_f/V_T.
- **The primary market** (`race/rounds.js`): Polaris private rounds (`privatestake`:
  cash-funded, marked at the last round, zero collateral value, illiquid) and a
  Halcyon follow-on at each capex wave. Offers are `rounds` dispatches.
- **Events.** One schema across `src/events/*.js` (toast, popup, portfolio trigger,
  superevent, `when`, `oneShot`). `params` are permanent deltas clamped to
  `PARAM_RANGES`; race-era shells carry `impulse` instead, a decaying overlay, because
  permanent deltas on that stream would walk params to their clamps. The one exception
  is `rates_capex_wave` (permanent `b`/`sigmaR`, at most once per released-rung step).
  Pulse categories (`_PULSE_CATEGORIES`) and everything the bridge, the ledger or the
  run's latches fire never ride the Poisson draw. The bridge's variant rotation uses
  counters reset by `resetRaceBridge()`, never RNG.
- **The race** (`src/race/`, 02-race-model). `advanceRace` writes
  `race.lastTransitions`, and downstream systems consume that ledger and never diff
  state. The only capability mutations are `commitRelease` and `commitTheft`. Each
  subsystem draws from its own named stream, so race trajectories are bit-identical
  whether presentation, closeout or intel draws happen. The control regime is a
  monotone ratchet whose sole writer is `setControlRegime`, which freezes Consensus and
  compute synchronously. At day 1008 `checkResolution` extrapolates headless and picks
  a family 1–6.
- **The reader and belief** (02a "The reader", "Belief, η, and the firm"). The public
  record (`public-record.js`) is the data contract: public rows, snapshots and the
  orchestrator's public inputs. The reader is fit offline on headless worlds split
  train/validation/test and only evaluated in play. `belief.js` holds market belief B
  (the frozen rule of thumb, and the pool of the legible and full readers, coherent up
  the ladder), the player's posterior (a standing policy per rung, snapshotted at each
  lock day, scored by log-likelihood ratio against B), the reader-copier's record (the
  almanac's, never shown in play) and firm belief F. B feeds the Consensus and compute
  quoters.
- **The interface.** One job per page (2026-10-26): the Front page reads, Markets
  commits (the ticket is the only order entry), Race knows (the ladder and the
  forecast editor), Meridian accounts. Hidden pages do no drawing. The ticket's
  scenario figure and grid revalue its legs under a model that is the display's, not
  the engine's, and unratified: Heston mean reversion with a leverage shock on
  variance, the capex channel's +0.005 on `b` per newly certified rung, B re-evaluated
  on a copy of the record with the scenario's certification added, and compute
  repriced by `placeholderCurve`. During play the race
  page draws only public records and B; hidden tracks appear after `endRacePage()`.
  Sections marked `data-dynamic` hide in Classic. The shared colophon sits in the
  masthead; Shoals styles its own hairline controls and loads neither
  `shared/toolbar.js` nor `shared/hud.css`. The theme key is `shoals-theme`.
- **Endings.** Natural resolution and early ejection share one atomic terminal path:
  freeze the ledger, fire the resolution-day beat, close out at the resolution-time
  regime, show the epilogue. `_triggerGameOver` keeps only `TERMINAL_SAFE_CATEGORIES`
  in the queue. `endings.js` composes nothing: pages come from
  `EPILOGUE_SLOTS[family][overlay][page]` with fallback [fam][ov] → [fam]['*'] →
  ['*']['*']. Gray eminence vs bystander is decided by involvement in ledgered actions,
  never by traits or beliefs.
- **Act III and audio.** `act3.js` owns one smoothed public driver `x` from the
  released rung and regime; it drives the audio's machine register, the substep event
  lane, the manual latency ladder and display-only degradation. Standing orders unlock
  at released R3 and lock at R5. `audio.js` schedules its score from its own PRNG and
  waits for the first user gesture.

## Conventions

- **Authored voice work.** Player-facing prose (events, popup copy, epilogue slots)
  and `src/audio.js` are authored work, ratified by a9; changes go through a9. The
  2026-10-24 score was written by Claude at a9's request. Lore and naming are in
  `docs/lore.md` and `06-naming.md`: real places and public institutions, fictional
  people, companies and parties. Dead names (VXPNT, PNTH, Serica and the other invented
  polities) appear nowhere at runtime.
- **Prose encoding.** Event headlines and contexts render via `textContent`, so they
  use literal typographic punctuation, never entities. `EPILOGUE_SLOTS` cells are HTML
  and use entities.
- **Public state only.** Quotes, curves, act3 and the bridge's capex latch read only
  public views (`buildPublicView`, `buildComputePublicView`, the `world.ai` mirrors).
  No hidden capability, latent or τ reaches a price, and the markets page, the ticket
  and the race page during play hold to the same rule.
- **Determinism.** No state path draws `Math.random`; `randomSeed()` at a new run is
  the one ambient draw. A new draw belongs in its own `deriveSeed` stream or a
  `keyedRng` slot keyed by its semantic identity, and presentation draws from streams
  of its own, so a display draw never moves the market. Bit-identity between
  configurations (a subsystem on or off) is kept by construction where it's cheap.
- **Orchestrator inputs.** Race steps that need world facts take them as
  `advanceRace` inputs, and the regime ratchet is called by the run after
  `advanceRace`, never inside it.
- **World mirrors.** `world.ai.controlRegime`, `reportingRegime`, `frontierRung`,
  `summitLive`, `fundLive` and `geopolitical.taiwanBlockade` are written by the run and
  absent from `WORLD_STATE_RANGES`, so no event effect can write them.
- **Player channels into the race** are HCN positioning (`coupling.js`), choice
  `raceEffects` (S per lab and heat, clamped) and the insider-tip leak (`raceLeak`).
  `raceEffects` and the leak share the ledger gate `raceChannelsLive()`, and the run
  passes zero coupling once the race has resolved, so nothing counts after the latch.
  The trade and sit verbs on a tip are uncoupled by ruling.
- **Intraday mutation.** `_midDayBaseline(fn)` wraps any sim-param change made while a
  day is open; without it, the close's overlay restore silently erases the change.
- **The popup queue.** `_queuePopup` is the only insertion point (standing-order tip
  interception happens there), a dispatch is answered only by an `answer` command, and
  `_applyPopupChoice` is the only choice applicator. `barrier()` keeps a day open while
  a dispatch is up or queued or the epilogue is pending, from run state, never the DOM.
- **Machinery vs the player's hand.** The latency ladder and spread multiplier apply to
  every manual entry, close and unwind via `_deferManual`. Exercise, popup trades,
  liquidation, the forced sale, standing orders and terminal paths stay instant. Lag 0
  bypasses the queue and `spreadMult === 1` short-circuits, because the general
  formula is not bit-exact at 1.
- **Obligations** (02a "The evening") are liabilities: `unpaidObligations` nets them out
  of every actual and prospective equity calculation. They are paid in cash at the
  close due; a shortfall is raised by the pro-rata forced sale, a machinery reduce-only
  close at `FORCED_SALE_SPREAD_MULT` times the spread. The terminal closeout pays what
  is unpaid.
- **Settlement chokepoints.** Every binary settlement row goes through
  `applyBinarySettlementRows` (cash, exactly once); credibility is scored quarterly by
  `scoreQuarter`, never at settlement. Binary trades go through `executeBinaryTrade`.
  Equity decisions use `portfolioEquity`/`portfolioValue`, which include reserved
  margin. A frozen leg restricts the book (`portfolio.restricted`) rather than
  force-filling it.
- **Refit couplings.** The Consensus listing base rates live only in `consensus.js` and
  equal B's day-0 quote (the same in every world); re-derive them whenever the reader
  is refit. The rule of thumb is frozen: the legible heads were fit on its exact
  trajectory, so changing it means refitting.
- **Reset paths.** One run exists at a time. `newRun` begins with `_resetRun`, which
  resets every module singleton the run touches; `resetRaceBridge()` runs there
  unconditionally, because the race is created after it and stale latches would
  throttle a fresh run. Every new run (reset, mode change, restart) goes through
  `newRun` with a fresh seed.
- **Variance, not vol.** `computeEffectiveSigma`, `computeVXHCNSpot` and
  `computeVXHCNFuturePrice` take Heston variance `v`. `_priceCore` and
  `_pricePairCore` share the `_V` buffer, so a single price after a pair call
  overwrites the pair's call value.
- **Chassis semantics.** `q` drops the price only at the discrete quarterly dividend.
  `_clampRate()` is a permanent `sim.r` mutation from regulation ceilings and floors.
  Popup `close_short`/`close_long` are directional (`close_short` also closes long
  puts). Followup `weight` breaks ties among same-day siblings and is not a
  probability. Choice-level `factionShifts` add to the base value.
- **Display.** Internal money is at $10,000 scale; `fmtDollar()` appends "k" for
  portfolio amounts while per-unit prices show raw `$X.XX`. The accent is the one red,
  spent on losses and down moves; gains take viridian. A short position is not a loss
  and is never red. Instruments have inks (`colors.js`), and each Greek has its own.
  All text is `--font-text`/`_FONT.text`; the canvas redraws once `_loadTextFonts()`
  resolves. The tape's first caption write is forced, because `_colophon.caption()`
  skips a write within its interval of time zero.
- **Show, don't tell** (root `AGENTS.md`). A caption is the view's name and the live
  values nothing else shows; empty states are a muted em dash; what a mark means
  lives in `about.md` and one info tip per section heading. The diegetic copy (wire,
  lead, dispatches, epilogue) is content and keeps its voice.
- **Labels.** UI labels, presets, built-in strategies, traits and epilogue labels are
  sentence case in source. Contracts are named once, by `contractName`, for the
  ticket, the tables and the book.

## Open work

`docs/ROADMAP.md` is the queue, in order, with a9's direction (2026-10-25: know,
commit, lose your grip, and an honest accounting) and the rulings of the 2026-10-27
review. Next is the decision chain's second round: a financing commitment conditional
on an independent evaluation, the terminal clip retired, matched-policy runs.
