# 09 — Market Integrity

Clearing and settlement. Governing idea: **the story may break the
market, but only through declared state — never through hidden taxes.**
The terminal degrades diegetically; the fills stay honest.

This file is the full specification; parts of it are not built yet, and
each is marked *(not built)* in place. Built today: oracle discipline and
the dispute lifecycle, the nationalization reference, the compute and
binary lifecycles, frozen-leg risk marks and liquidation restriction,
information hygiene, the terminal closeout matrix and the ledger freeze
(magnitudes in [02a-tuning.md](02a-tuning.md)). Not built: HCN and option
halts, regime-aware option pricing, the Act III regime-switch wrapper,
the exchange variance index, stressed-scenario risk limits, and the
regime margin add-on.

## The four marks (and the one display layer)

Kept distinct everywhere, because their divergence is content:

1. **Authoritative process price** — the sim (plus, in Act III, a
   regime-switch/execution wrapper that lets the process itself drift —
   *(not built)*). Never displayed directly.
   The impact overlay prices *execution*, never settlement — settlement
   follows this mark, which player flow does not touch.
2. **Executable quote** — authoritative ± spread(η, impact). What a
   fill actually costs. Execution always refreshes against it or fails
   loudly; a fill never prints against a stale value.
3. **Exchange settlement mark** — daily; follows the authoritative
   price; marks P&L and margin.
4. **Model (tree) marks** — the player's own analytics. In Act III
   these are *allowed to be wrong*; that wrongness is the diegetic
   degradation. CRR trees are demoted to display/scenario tooling —
   fills, settlement, and margin never consume them. Exchange option
   and futures quotes come from a **regime-aware authoritative quote
   surface** that prices halt, conversion-band, decree, and terminal
   hazards. (Testable: corrupting tree inputs changes displayed marks
   and nothing else.) *(Not built: option quotes and fills still price
   off the CRR tree on the true process parameters; Act III degradation
   is display-only by construction instead — the chain shows a held
   snapshot while fills reprice fresh.)*

Above these sits a **display-indication layer** — the chart, the
chain, the sparklines. Act III stutter, stale ticks, and repaints live
*here*, as presentation rerendering only: printed history (fills,
settlements, margin calls) is immutable, and "repaint" never mutates
data. A stale screen number is an indication, not a quote.

## Oracle discipline (Consensus binaries)

Every binary binds at listing to
`{predicate, oracleId, evidenceStandard, deadline, disputeDeadline,
fallbackValue}`.

- **Settlement uses the listed oracle, or the fallback. Nothing else.**
  Epilogue truth may narrate, never pay — a binary the world could not
  certify by its deadline settles at `fallbackValue` (default 0.50,
  listed per contract), regardless of what the epilogue reveals.
- **Impossibility (classification, venue closure) is a predeclared
  third outcome**, not a refund: the contract settles at
  `fallbackValue` for every holder identically. No cost-basis-dependent
  payouts, ever — "money back" rewards buying contracts whose
  favorable world causes classification, and cannot survive secondary
  transfer. Orders freeze the moment a declared impossibility
  condition becomes public; only unused margin returns.
- **Adjudicator succession is named per `controlRegime`**: exchange
  certification panel (private/supervised) → the federal evals office
  (mobilized — yes, the one Congress defunded; the satire register
  owns the staffing, the math plays straight) → `fallbackValue`
  (nationalized/classified). Every dispute has `disputeDeadline`;
  expiry without ruling triggers the fallback automatically. No
  indefinite limbo. **A timely ruling is terminal and settles the contract at ruling time** — synchronously,
  the same consequence-bundle philosophy as `setControlRegime` — so
  no later regime fallback can override it; **post-deadline rulings
  are void** (the deadline fallback is contractual, not a default the
  adjudicator can beat by ruling late); and the adjudicator is
  **resolved from the current regime at ruling/settlement time**, not
  snapshotted at dispute-open — succession applies to disputes
  already in flight.
- **The R5 contract settles on terminal resolution, never mid-run
  certification:** no auditor certifies takeoff — a world that would is
  not a world that keeps markets. Its `evidenceStandard` is the
  resolution ladder's R5-crossing terminal, paid through the terminal
  closeout matrix below; its deadline still settles NO in a run
  that neither crossed nor terminated. R2–R4 settle on certification
  as normal — `CERT_RUNGS = [2, 3, 4]` is by design, not omission.

## The nationalization reference (protected)

Compensation reference = **median exchange settlement mark over the 20
sessions ending 5 sessions before the first public nationalization
trigger** — frozen at that trigger, published with it. Temporary and
player impact are excluded by construction (settlement marks follow
the authoritative process, which the impact overlay never touches);
the window median kills pump-the-reference around a predictable halt.
The conversion multiple U[0.60, 1.15] is **pre-sampled from the run
seed** and persisted — reloads cannot reroll it. The nationalization trade
is a bet on a published distribution, not on manipulating its
reference. The authoritative option surface pricing the declared band
from the moment `controlRegime` reaches mobilized is *(not built)*: HCN
and its options keep trading on the ordinary chassis after
nationalization, and the conversion executes at terminal closeout.

## Lifecycle

Per-product transition tables (the canonical super-graph is `open ↔ halted`, `open|halted → disputed →
settled | void`, plus ordinary `open → settled` at maturity and bond
`open → defaulted` inside terminal families only). Universal rules:
every transition emits its event at or before effect; every disputed
state carries a deadline and an automatic fallback; no state is an
unbounded parking orbit.

| Instrument | Halt/adjust | Terminal behavior |
|---|---|---|
| HCN | LULD-style ≤ 1 day; delisting halt ≤ 5 days *(not built)* | conversion at terminal closeout: signed shares redeem to cash 1:1 at reference × sampled multiple (claims language survives in prose) |
| HCN options | exercise/assignment suspended during halts; pending orders rejected explicitly; expiry inside a halt settles against the published risk mark *(not built — no halts)* | nationalization = **declared accelerated termination**: cash at intrinsic vs. conversion price, time value extinguished *by published term* — the surface prices this from mobilized onward; corporate-action adjustments apply before intrinsic. Built at terminal closeout in every family: intrinsic vs. the family's terminal mark |
| VXHCN futures | index observations stored with validity status *(not built)* | settles to the **exchange variance index** — computed from authoritative option quotes with a published realized-variance fallback; never reconstructed from abandoned Heston state *(not built; terminal closeout marks the last live VXHCN as last-valid-before-cutoff)*. Expiry-in-halt and nationalization use last-valid-before-cutoff, then the fallback |
| Compute futures | precedence: decree conversion (mobilized) ⊃ force-majeure adjustment (blockade) ⊃ ordinary settlement | cash closeout `signedQty × multiplier × (decreePrice − entryBasis)` — shorts owe symmetrically; the committee chooses only among formulas enumerated at listing. `multiplier` is the contract's own listed multiple (1 at listing) — never the HCN conversion multiple above. `entryBasis` = volume-weighted average fill price of the open position (formula-priced closeout must conserve cash under multi-fill, which the chassis first-entry display convention cannot) |
| Consensus binaries | freeze on public impossibility condition | listed oracle → fallback (above) |
| Bonds | never halted | default only inside doom families (recovery on face); otherwise the last live mark |

**Carry through delisting** *(not built — no delisting before terminal closeout)*: borrow fees and manufactured dividends
accrue to the legal conversion timestamp, then terminate; dividends
declared pre-conversion honor a stated record-date rule; none after.
Nothing farmable in the gap between halt and conversion.

## Risk limits, margin, and the halted book

- **Global stressed-scenario limits, not per-instrument counts**
  *(not built)*:
  aggregate delta/gamma/vega, jump-to-conversion, decree, binary, and
  doom scenarios across all maturities and synthetic equivalents. You
  cannot assemble unlimited tail-shortness out of small pieces.
- **Binary shorts are fully collateralized; tail-sale premiums are
  sequestered** until the exposure closes — selling the apocalypse
  pays only if the apocalypse doesn't come *and* the position unwinds.
- Margin = **max(realized-vol, implied-jump, regime add-on)** — the
  requirement anticipates the jump instead of reacting to it *(not
  built; margin is the chassis Reg-T model)*.
- **Halted legs** (built for frozen binaries and compute futures): a
  published, explicitly non-executable **risk mark**
  (authoritative wrapper + regime stress add-ons) carries margin.
  Collateral calls may fire during a halt; liquidation of the halted
  leg is queued to reopening or contractual closeout, the account
  restricted meanwhile. **Never a fictional fill.** Loss allocation
  between call and reopening follows the risk-mark path, published
  with the reopening print.
- **No NPC default before resolution** still holds — with the above
  closing its moral-hazard seam. At terminal states a **symmetric CCP
  waterfall** applies to player assets and liabilities alike; the
  doom-short that never pays remains a terminal-family statement, not
  a mid-run clearing ambush.

## Information hygiene

Pre-pricing (03's Act II alpha decay) may run only off **legible
precursors**: every non-random `B` or quote move records a causal
evidence ID pointing at a public in-game event or modeled public order
flow. The market may infer faster than the player; it may never read
`C_internal`, undetected incidents, or the event queue. A market that
front-runs latent truth is a hidden tax, and it is barred.

## Claims maturing past day 1008

Closeout is a **matrix, not a mood**: family × `controlRegime` ×
instrument, each cell specifying valuation timestamp, public inputs,
discount/numeraire convention, recovery, and seeded path where a path
is needed (`src/race/closeout.js`; cell rulings and magnitudes in
[02a](02a-tuning.md); the families below are its row constraints). Binaries past deadline settle at `fallbackValue` —
narration is the epilogue's, cash is the oracle's.

- **Fizzle:** marked at one seeded draw — the 18-month unwind
  compressed to its endpoint.
- **The Deal:** boring-world curve; long vol bleeds, bonds are bonds.
- **Won with margin / ambiguous dawn:** melt-up marks with the
  survivorship note.
- **Doom families:** *monetary recovery and terminal meaning are
  separate lines.* The cash layer settles what a symmetric waterfall
  can settle; the final page then re-expresses the number in "a
  currency that has stopped existing" — that sentence is the ledger's,
  not the clearinghouse's.

**The ledger freezes before terminal marking**: terminal wealth may
change the wealth score, never retroactively create, erase, or launder
financing/governance channels.

## Fairness invariants

The instrument harnesses assert 3, 4, and the information-hygiene half of
6 (quotes and settlements invariant under corrupted hidden state); 6 as
stated waits on the tree demotion above.

1. No hidden execution tax: every fill at a freshly-refreshed
   executable quote, or explicit failure.
2. Every halt/void/adjustment emits its event at or before effect.
3. Every settlement value is computable from the instrument's listed
   oracle tuple plus in-game public information at settlement time.
4. No settlement ever depends on a holder's cost basis.
5. Degradation never rewrites history: fills, settlement marks, and
   margin calls are immutable once printed; repaint is presentation
   only.
6. Corrupting player-tree inputs changes displayed analytics and
   nothing economic (fills, settlement, P&L, margin).
7. Outside declared halts (bounded ≤ 5 days except terminal states),
   the player can always flatten at *some* executable price.
