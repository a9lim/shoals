# 09 — Market Integrity

> Rev 2 (2026-07-23) — hardened against the Codex integrity pass
> (gaslamp job `cx-20260723-125739-f157`; 14 verified holes, all
> addressed below). The clearing/settlement spec queued in
> [07-migration.md](07-migration.md). Governing idea: **the story may
> break the market, but only through declared state — never through
> hidden taxes.** The terminal degrades diegetically; the fills stay
> honest.

## The four marks (and the one display layer)

Kept distinct everywhere, because their divergence is content:

1. **Authoritative process price** — the sim (plus, in Act III, the
   regime-switch/execution wrapper from 07). Never displayed directly.
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
   and nothing else.)

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
  indefinite limbo.
- **The R5 contract settles on terminal resolution, never mid-run
  certification** (ruled 2026-07-23, phase 3a): no auditor certifies
  takeoff — a world that would is not a world that keeps markets. Its
  `evidenceStandard` is the resolution ladder's R5-crossing terminal,
  paid through the post-1008/terminal closeout matrix below (wired
  with the endings phase); its deadline still settles NO in a run
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
seed** and persisted — reloads cannot reroll it. The authoritative
option surface prices the declared band from the moment `controlRegime`
reaches mobilized; the nationalization trade is a bet on a published
distribution, not on manipulating its reference.

## Lifecycle

Per-product transition tables (code phase publishes the full set; the
canonical super-graph is `open ↔ halted`, `open|halted → disputed →
settled | void`, plus ordinary `open → settled` at maturity and bond
`open → defaulted` inside terminal families only). Universal rules:
every transition emits its event at or before effect; every disputed
state carries a deadline and an automatic fallback; no state is an
unbounded parking orbit.

| Instrument | Halt/adjust | Terminal behavior |
|---|---|---|
| HCN | LULD-style ≤ 1 day; delisting halt ≤ 5 days | conversion: signed shares → signed compensation claims 1:1 at reference × sampled multiple |
| HCN options | exercise/assignment suspended during halts; pending orders rejected explicitly; expiry inside a halt settles against the published risk mark | nationalization = **declared accelerated termination**: cash at intrinsic vs. conversion price, time value extinguished *by published term* — the surface prices this from mobilized onward; corporate-action adjustments apply before intrinsic |
| VXHCN futures | index observations stored with validity status | settles to the **exchange variance index** — computed from authoritative option quotes with a published realized-variance fallback; never reconstructed from abandoned Heston state. Expiry-in-halt and nationalization use last-valid-before-cutoff, then the fallback |
| Compute futures | precedence: decree conversion (mobilized) ⊃ force-majeure adjustment (blockade) ⊃ ordinary settlement | cash closeout `signedQty × multiplier × (decreePrice − entryBasis)` — shorts owe symmetrically; the committee chooses only among formulas enumerated at listing. `multiplier` is the contract's own listed multiple (1 at listing) — never the HCN conversion multiple above. `entryBasis` = volume-weighted average fill price of the open position (ruled phase 3b: formula-priced closeout must conserve cash under multi-fill, which the chassis first-entry display convention cannot) |
| Consensus binaries | freeze on public impossibility condition | listed oracle → fallback (above) |
| Bonds | never halted | default only inside terminal families |

**Carry through delisting:** borrow fees and manufactured dividends
accrue to the legal conversion timestamp, then terminate; dividends
declared pre-conversion honor a stated record-date rule; none after.
Nothing farmable in the gap between halt and conversion.

## Risk limits, margin, and the halted book

- **Global stressed-scenario limits, not per-instrument counts**:
  aggregate delta/gamma/vega, jump-to-conversion, decree, binary, and
  doom scenarios across all maturities and synthetic equivalents. You
  cannot assemble unlimited tail-shortness out of small pieces.
- **Binary shorts are fully collateralized; tail-sale premiums are
  sequestered** until the exposure closes — selling the apocalypse
  pays only if the apocalypse doesn't come *and* the position unwinds.
- Margin = **max(realized-vol, implied-jump, regime add-on)** — the
  requirement anticipates the jump instead of reacting to it.
- **Halted legs:** a published, explicitly non-executable **risk mark**
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
is needed (code-phase artifact; the families below are its row
constraints). Binaries past deadline settle at `fallbackValue` —
narration is the epilogue's, cash is the oracle's.

- **Fizzle:** marked along the seeded unwind path (the 18-month decay,
  compressed to a page).
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

## Fairness invariants (testable, code-phase)

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
