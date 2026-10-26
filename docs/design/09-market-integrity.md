# 09 — Market Integrity

Clearing and settlement. Governing idea: **the story may break the
market, but only through declared state — never through hidden taxes.**
The terminal degrades diegetically; the fills stay honest. Magnitudes
and cell rulings are in [02a-tuning.md](02a-tuning.md).

## The marks (and the display layer)

Kept distinct everywhere, because their divergence is content:

1. **Authoritative process price** — the sim. Never displayed directly.
   The impact overlay prices *execution*, never settlement; settlement
   follows this mark, which player flow does not touch. In the Dynamic
   mode its level carries the valuation layer ([02a](02a-tuning.md)): a
   gap at each day's close computed from public state alone, so the
   mark moves on legible news and never on latent truth. Resting orders
   are checked at the post-gap price.
2. **Executable quote** — the authoritative price plus the impact
   overlay, ± a spread set by vol, moneyness, regulation and (at R5) the
   Act III spread multiplier. What a fill actually costs. Execution
   always refreshes against it or fails loudly; a fill never prints
   against a stale value.
3. **Book marks** — P&L and margin run through the one valuation path
   (`unitPrice`: the authoritative price with the impact overlay, and
   the CRR trees for options). Settlement is impact-free: terminal
   closeout, VXHCN and bond expiry, and binary and compute settlement
   use authoritative values.
4. **Model (tree) marks** — the player's own analytics. Option quotes
   and fills also price off the tree on the true process parameters, so
   Act III's degradation is display-only by construction: the chain
   shows a held snapshot while fills reprice fresh.

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
  Hidden truth may narrate, never pay: a certification contract the
  world did not certify by its deadline settles NO, whatever the
  epilogue reveals. A desk that leaves early is settled against the
  world that actually happened — certifications inside the extrapolated
  trajectory count, exactly as if the player had stayed to watch.
  `fallbackValue` (0.50, listed per contract) pays only when the oracle
  cannot: a dispute that expires without a ruling, a nationalized or
  classified regime, or a dispute still open at the terminal.
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
  indefinite limbo. **A timely ruling is terminal and settles the
  contract at ruling time** — synchronously, the same consequence-bundle
  philosophy as `setControlRegime` — so no later regime fallback can
  override it; **post-deadline rulings are void** (the deadline fallback
  is contractual, not a default the adjudicator can beat by ruling
  late); and the adjudicator is **resolved from the current regime at
  ruling/settlement time**, not snapshotted at dispute-open — succession
  applies to disputes already in flight. The lifecycle is exercised by
  the harness; no event opens a dispute, so in play certification
  disputes resolve upstream as a disputed-lag draw.
- **The R5 contract settles on terminal resolution, never mid-run
  certification:** no auditor certifies takeoff — a world that would is
  not a world that keeps markets. Its `evidenceStandard` is the
  resolution ladder's R5-crossing terminal, paid through the terminal
  closeout below: YES if the frontier's internal R5 crossing falls on or
  before day 1000 (extrapolation included), NO otherwise. R2–R4 settle
  on certification as normal — `CERT_RUNGS = [2, 3, 4]` is by design,
  not omission.

## The control regime's consequences

The one table of what each `controlRegime` does to the book and the
feed. The ratchet itself is in [02](02-race-model.md), its gates in
[02a](02a-tuning.md).

| Regime | Markets | Race and feed |
|---|---|---|
| private | ordinary | ordinary |
| supervised | ordinary | domestic labs' capability drift takes a drag |
| mobilized | Consensus frozen (the federal evals office adjudicates); the compute curve frozen at its decree mark | domestic racing pace floored at 0.7 |
| nationalized | open binaries fallback-settle; HCN converts at terminal closeout at the frozen reference × the pre-sampled multiple | as mobilized |
| classified | as nationalized | incident detections through S3 reach the wire as redacted briefs, and the insider channel becomes the only feed |

## The nationalization reference (protected)

Compensation reference = **median exchange settlement mark over the 20
sessions ending 5 sessions before the first public nationalization
trigger** — frozen at that trigger, published with it. Temporary and
player impact are excluded by construction (settlement marks follow
the authoritative process, which the impact overlay never touches);
the window median kills pump-the-reference around a predictable
trigger. The conversion multiple U[0.60, 1.15] is **pre-sampled from
the run seed** and persisted — reloads cannot reroll it. The
nationalization trade is a bet on a published distribution, not on
manipulating its reference. HCN and its options keep trading on the
ordinary chassis after nationalization; the conversion executes at
terminal closeout.

## Lifecycle

Every transition emits its event at or before effect; every disputed
state carries a deadline and an automatic fallback; no state is an
unbounded parking orbit.

| Instrument | During the run | Terminal behavior |
|---|---|---|
| HCN | trades on the chassis; never halted | conversion regimes: signed shares redeem to cash 1:1 at reference × sampled multiple. Otherwise realized-over-expected: `spot·m_f / V_T` (claims language survives in prose) |
| HCN options | exercise at will; expiry closes in the money at intrinsic through the ordinary fill path, spread and impact included | settle at intrinsic vs. the terminal HCN mark in every family; time value extinguished; a corporate-action hook applies before intrinsic |
| VXHCN futures | settle to the live index at expiry, impact-free | the last live VXHCN, last-valid-before-cutoff |
| Compute futures | precedence: decree conversion (mobilized) ⊃ force-majeure adjustment (blockade) ⊃ ordinary settlement | cash closeout `signedQty × multiplier × (decreePrice − entryBasis)` — shorts owe symmetrically; every contract binds the last-valid-mark decree formula at listing. `multiplier` is the contract's own listed multiple (1 at listing) — never the HCN conversion multiple above. `entryBasis` = volume-weighted average fill price of the open position (formula-priced closeout must conserve cash under multi-fill, which the chassis first-entry display convention cannot) |
| Consensus binaries | frozen from mobilized onward (the successor adjudicator keeps settling); fallback-settled at nationalized or classified | listed oracle → fallback (above) |
| Bonds | never halted | default only inside doom families (recovery on face); otherwise the last live mark |
| Polaris private stakes | illiquid; marked at the last round | last round price × the terminal multiple for the family, leader and regime |

## Risk limits, margin, and the frozen book

- **Binary shorts are fully collateralized; tail-sale premiums are
  sequestered** until the exposure closes — selling the apocalypse
  pays only if the apocalypse doesn't come *and* the position unwinds.
- Margin is the chassis Reg-T model, with private stakes counted in
  equity at their mark but given no lending value. A subscription is
  capped at the collateral headroom above maintenance, so buying into a
  round can never leave a compliant book under-margined.
- **Frozen legs** (frozen binaries and compute futures): a published,
  explicitly non-executable **risk mark** carries margin — the last
  valid executable mark for pending, disputed and compute legs, the
  live quote for binaries frozen by mobilization. Collateral calls may
  fire while a leg is frozen; a liquidation that leaves frozen legs
  restricts the account (`portfolio.restricted`) until they settle on
  their own clock. **Never a fictional fill.**
- **No NPC default before resolution.** In the doom families the
  terminal applies single recovery factors: HCN at the doom mark, bonds
  at 0.40 of face, options at intrinsic against that mark. Binaries and
  compute settle in full by their own oracles. The doom-short that
  never pays is the epilogue's statement about that cash, not a
  clearing rule.

## Information hygiene

`B` is a function of the public record and the day. The record holds
what the Brief prints: claims, certifications, releases, detected
incidents as the wire shows them, disclosed thefts, the strait, the
regime, the treaty's beats and the public world inputs. `B` also reads
the rule of thumb's state, and every mutation of that state records a
causal evidence ID pointing at a public in-game event. Quotes, the
valuation layer and round prices are functions of `B` and the public
view, so they move only when the record does or the clock turns. The
reader is fit offline and only evaluated in play, and a harness rebuilds
the record from the logged public projection alone. No price may read
`C_internal`, undetected incidents, or the event queue: a market that
front-runs latent truth is a hidden tax, and it is barred. Hidden state
— the Polaris terminal leader included — reaches a price only at
terminal closeout.

## Terminal closeout

Closeout is a **matrix, not a mood**: family × `controlRegime` ×
instrument, each cell specifying valuation timestamp, public inputs,
recovery, and seeded path where a path is needed
(`src/race/closeout.js`; cell rulings and magnitudes in
[02a](02a-tuning.md); the families below are its row constraints).
Binaries past deadline settle at `fallbackValue` — narration is the
epilogue's, cash is the oracle's.

- **Fizzle:** marked at one seeded draw — the 18-month unwind
  compressed to its endpoint.
- **The Deal:** boring-world mark; bonds are bonds.
- **Won with margin / ambiguous dawn:** melt-up marks.
- **Doom families:** *monetary recovery and terminal meaning are
  separate lines.* The cash layer settles what a symmetric waterfall
  can settle; the final page then re-expresses the number in "a
  currency that has stopped existing" — that sentence is the ledger's,
  not the clearinghouse's.

**The ledger freezes before terminal marking**: terminal wealth may
change the wealth score, never retroactively create, erase, or launder
financing/governance channels.

## Fairness invariants

The harnesses assert 3, 4, 5's settlement half, and the
information-hygiene invariant (quotes, valuations, round prices and
settlements unchanged under corrupted hidden state).

1. No hidden execution tax: every fill at a freshly-refreshed
   executable quote, or explicit failure.
2. Every void or adjustment emits its event at or before effect.
3. Every settlement value is computable from the instrument's listed
   oracle tuple plus in-game public information at settlement time.
4. No settlement ever depends on a holder's cost basis.
5. Degradation never rewrites history: fills, settlement marks, and
   margin calls are immutable once printed; repaint is presentation
   only.
6. Outside a restricted account, frozen legs and private stakes, the
   player can always flatten at *some* executable price.
