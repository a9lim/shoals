# Shoals

The AI race played from a derivatives desk, at a9l.im/shoals: the player trades
Halcyon (HCN) stock, bonds, VXHCN futures and American options, and in Dynamic mode
Consensus milestone binaries and Cambria compute futures, while a hidden race model ends
each run in one of six families. The interface is *The Meridian Brief*, the firm's
morning note. Vanilla ES modules, Canvas 2D, Web Audio. A submodule of the a9l.im
repository; the root `AGENTS.md` covers the shared layer, design system, build and
deployment.

`docs/DESIGN.md` holds the stance, the model's equations, the targets it is calibrated
against, and the market and settlement rules. `docs/ROADMAP.md` is what's next.

## Running and checking

Preview through the parent build, then open `/shoals/`; or `node tools/sims/serve.mjs
PORT` from the parent repo's root serves the projects live from the working tree.

```bash
node --test 'tests/*.test.mjs'   # the suite: Node only, no install, no network (~2 s)
for f in main.js colors.js src/*.js src/events/*.js src/race/*.js tools/*.mjs tests/*.mjs; do node --check "$f"; done
node tools/race-mc.mjs [N]       # reports crossing medians, fizzle tail and families against DESIGN.md's targets
node tools/reader-fit.mjs        # the reader's offline refit; needs NumPy/SciPy (shared venv)
```

Quote the glob: Node 24 and older read a bare `tests/` as a module and fail. In the
page, `shoalsReplayCheck()` replays the live journal in a module worker and compares
states (replay is bit-exact only within one JS engine, so Node can't check Chrome), and
`shoalsCounts()` reads the development-only interruption counters.

**Test policy.** A check earns its place only where a failure would be silent:
conservation, exactly-once settlement, public state only, determinism and replay,
analytic oracles, structural invariants. One case per mechanism, seeded, the smallest
N that isn't flaky; no snapshots of tuned values, no statistical bands, no greps.

| File | Guards |
|---|---|
| `tests/run.test.mjs` | no ambient `Math.random`; seed + journal replay; isolation between runs; resume; Classic inert; one bystander choice per dispatch |
| `tests/books.test.mjs` | Consensus and compute settle once against independent truth; regime split and precedence; cash conserved |
| `tests/belief.test.mjs` | the rule's ledger; B's pool; scoring against naive forms; properness; the reader-copier; V; impulse decay; reader laws |
| `tests/public-state.test.mjs` | hidden-state corruption moves no quote, settlement, B or V; the record folds back from its rows; the chain's reports |
| `tests/terminal.test.mjs` | closeout conservation per cell; finalizers; ejection invariance; the influence clip; the ledger's latch |
| `tests/desk.test.mjs` | the takeover at `INITIAL_CAPITAL`; obligations and the forced sale; reduce-only legs; private stakes |
| `tests/race.test.mjs` | S4 self-disclosure; Polaris's round schedule; the withdrawal cascade |

## Layout

```
main.js            the shell: DOM cache, the clock (rAF loop, step, the skip), the sink, save and resume, wiring
src/run.js         the run, DOM-free: day transitions, the race block, the dispatch queue, commands, the terminal path
src/run-desk.js, run-state.js, run-replay.js, run-worker.js  trade entry; the run's state and sink; headless runs and replay; the replay-check worker
src/pages.js, brief.js, markets.js, ticket.js, race-page.js  the four pages, the editions and wire, the curves, the one order entry, the race page and forecast editor
src/simulation.js, pricing.js, chain.js, position-value.js  the chassis: GBM + Merton + Heston, Vasicek, CRR trees, unitPrice()
src/portfolio.js, price-impact.js  positions, margin, settlement, obligations; impact overlays and MM rehedge
src/events.js, events/  the event engine; authored pools by domain; race-bridge.js turns the race's ledger into shells
src/endings.js     terminal triggers and the slot-based epilogue
src/opening.js, pacing.js, almanac.js  the inherited desks; the skip's stop classifier; the almanac (all DOM-free)
src/act3.js, standing-orders.js, audio.js  Act III's driver, latency and degradation; precommitments; the synthesized score
src/race/          the hidden race, its markets, the public record and the reader (DOM-free); reader-constants.js is generated
tests/             the suite
tools/             race-mc.mjs; the refit: reader-fit.mjs, reader-data.mjs, reader-metrics.mjs, engine-worlds.mjs (cached in .cache/), reader-optimizer.py
```

## The run

- **A run is its seed, its journal and `RULES_VERSION`.** Every state-changing draw comes
  from `keyedRng(seed, name, ...keys)`, a stream per semantic slot (the price path by day
  and substep, an event's draws by its id and occurrence), so adding an event relabels
  only the draws keyed on it. `randomSeed()` at a new run is the one ambient draw. Bump
  `RULES_VERSION` on any change to what a journal replays to; saves under other rules
  are retired.
- **Commands.** Everything the player does that changes state goes through `runCommand`
  (`trade`, `cancel`, `close`, `unwind`, `exercise`, `answer`, `forecast`, `standing`,
  `lobby`, `setting`), journaled at its position and carrying what it resolved to. Speed,
  pause, the skip, pages, theme and sound are not commands. The run reports to the shell
  through one sink; a headless run passes none, and its bystander answers each dispatch
  with its `bystander: true` choice.
- **Race-block order** in `_onDayComplete`: `stepCoupling` → `advanceRace` →
  `stepControlRegime` → `stepTreaty` → `_syncRaceToWorld()` → `setBaseRateScale` →
  `_stepAct3()` → standing-order sync → `stepBelief` → Consensus and compute settlement
  → standing day rules → on lock days scoring, `F`, scrutiny and conversion →
  `checkResolution` → `_checkRoom`; after the event engine and bridge,
  `_stepRaceMarkets` applies the valuation gap and fills resting orders at the post-gap
  price, then `marketsDayClose`. On a lock day the forecast snapshot runs first, so it
  reads the lock day's state. Nothing tests the order, and every later step reads what
  earlier ones wrote.
- **Overlays.** Layer-3 and impulse overlays go on at `beginDay` and come off LIFO
  before the close's work; `_midDayBaseline(fn)` wraps any sim-param change made while a
  day is open, or the restore silently erases it.
- **Reset.** `newRun` begins with `_resetRun`, which resets every module singleton;
  `resetRaceBridge()` runs there unconditionally, because the race is created after it
  and stale latches would throttle a fresh run.

## Conventions

- **Public state only.** Quotes, curves, V, act3 and the bridge's capex latch read only
  public views (`buildPublicView`, `buildComputePublicView`, the `world.ai` mirrors); the
  race page draws hidden tracks only after the run ends. A leak makes the market
  prescient with nothing on screen looking wrong.
- **Determinism.** No state path draws `Math.random`; a new draw gets its own named
  stream or `keyedRng` slot, and presentation draws from streams of its own, so a
  display draw never moves the market.
- **The race's ledger.** `advanceRace` writes `race.lastTransitions`; downstream systems
  consume it and never diff state. The only capability mutations are `commitRelease`
  and `commitTheft`; `setControlRegime` is the regime's sole writer and freezes the
  books synchronously. Race steps take world facts as `advanceRace` inputs.
- **World mirrors** (`world.ai.controlRegime`, `reportingRegime`, `frontierRung`,
  `summitLive`, `fundLive`, `geopolitical.taiwanBlockade`) are absent from
  `WORLD_STATE_RANGES`, so no event effect can write them.
- **Player channels** (coupling, `raceEffects`, the tip leak) share the ledger gate
  `raceChannelsLive()`, and the run passes zero coupling after resolution, so nothing
  counts past the latch.
- **Events.** `params` are permanent deltas clamped to `PARAM_RANGES`; race-era shells
  carry a decaying `impulse` instead (except `rates_capex_wave`). Pulse categories and
  everything the bridge or ledger fires never ride the Poisson draw. Variant rotation
  uses counters, never RNG.
- **The popup queue.** `_queuePopup` is the only insertion point, an `answer` command
  the only way to answer, `_applyPopupChoice` the only applicator; `barrier()` holds a
  day from run state, never the DOM.
- **Machinery vs the hand.** The latency ladder and spread multiplier apply to every
  manual entry, close and unwind via `_deferManual`; exercise, popup trades,
  liquidation, the forced sale, standing orders and terminal paths stay instant.
  `spreadMult === 1` short-circuits because the general formula isn't bit-exact at 1.
- **Settlement chokepoints.** Binary settlement rows go through
  `applyBinarySettlementRows` (exactly once); binary trades through
  `executeBinaryTrade`; equity decisions through `portfolioValue`/`portfolioEquity`,
  which include reserved margin and net unpaid obligations. A frozen leg restricts the
  book rather than force-filling it.
- **Refit couplings.** The listing base rates live only in `consensus.js` and equal B's
  day-0 quote; re-derive them on a refit. The rule of thumb is frozen: changing it means
  refitting.
- **Pricing.** `unitPrice()` is the one valuation path; impact is an overlay on `sim.S`
  and never rewrites the path. The pricing functions take Heston variance `v`, not vol;
  `_priceCore` and `_pricePairCore` share the `_V` buffer, so a single price after a pair
  call overwrites the pair's call value.
- **Authored voice work.** Player-facing prose (events, dispatches, epilogue slots) and
  `src/audio.js` are ratified by a9; changes go through a9. Event text renders via
  `textContent` (literal typographic punctuation); `EPILOGUE_SLOTS` cells are HTML.
- **Display.** Internal money is at $10,000 scale (`fmtDollar()` appends "k"). The
  accent is the one red, spent on losses and down moves; a short position is never red.
  Instruments and Greeks have inks (`colors.js`). Canvas text redraws once
  `_loadTextFonts()` resolves; the tape's first caption write is forced. Labels are
  sentence case; contracts are named once, by `contractName`.
- **Show, don't tell** (root `AGENTS.md`): captions are the view's name and live values,
  empty states a muted em dash, explanations in `about.md` and one info tip per section.
- **The ticket's scenario figure** values legs under a display-only model (Heston mean
  reversion with a leverage shock, the capex step per certified rung, B re-evaluated with
  the scenario's certification) that is not the engine's.
