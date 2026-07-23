# 03 — Market Mechanics

> How the race reaches the desk, rev 2 (2026-07-23). Extends the existing
> pricing/impact stack (CRR trees, Heston/Vasicek, Almgren-Chriss overlay,
> vol-index machinery) rather than replacing it.

## Instruments

- **HCN — Halcyon common.** Adopted ✓ (2026-07-23): the game's single
  chart underlying *becomes Halcyon equity*. The prototype's anonymous stock was already a
  GBM+Merton+Heston process with earnings pulses; naming it HCN makes the
  whole desk an AI-complex desk and every existing mechanic (options
  chain, jumps, vol surface) load-bearing for the theme. Long-dated HCN
  options become the game's purest timeline instrument. `OPEN:` whether
  Cambria gets a full second book or event-driven exposure only (compute
  futures may cover it — and they now carry the strait premium, which
  strengthens the futures-only case) — implementation-phase call.
- **Milestone binaries** — prediction-market contracts on **Consensus
  Markets**, the new instrument class: "next Aleph major by Q3," "treaty
  framework signed," "severity-≥2 incident this year," "Fixedpoint
  confirmed," "first model-designed drug approved" — and, centrally, the
  rung crossings of [02-race-model.md](02-race-model.md), which is what
  settlement objectivity hangs on. Prices *are* `B` made visible — the market's posterior on
  screen next to yours. Settlement is *certified* (audited evals, public
  demos — typically lagged behind the truth), never hidden-truth; the
  player's edge is the gap, twice over: posterior vs. `B`, and true vs.
  certified. (Also the natural home for Brier-score humility: some of the
  player's dooms won't fire.)
- **Compute futures** — Cambria allocation-quarter contracts. The race's
  physical layer as a term structure: backwardation = scramble. With the
  fabs in Hsinchu, the far end carries a standing **strait premium** —
  the only term structure in the game where geography is a risk factor.
  Blockade scares print here first; the desk reads the Taiwan tail off
  the compute curve the way it reads the race off Cambria's earnings
  call.
- **VXHCN** — single-name vol index on HCN (ports the VXPNT machinery
  nearly unchanged — it was already computed off the one Heston process).
  Watched the way real single-stock vol surfaces are watched for the
  giants. Late game its term structure is a narrative device: the far end
  refusing to price a future it doesn't believe in, then repricing all at
  once.
- **Bonds/rates** — kept, re-themed: the risk-free rate as a derivative of
  the world staying normal. AI capex distorts the long end in Act II; in
  Act III "risk-free" becomes the game's quietest joke.
- **The `controlRegime` overlay** — every instrument above lives inside
  the state's grip ([02-race-model.md](02-race-model.md)): supervision
  adds disclosure and dampens gaps, mobilization freezes Consensus
  classes, nationalization converts HCN into a compensation claim — the
  nationalization trade, positioning for the conversion, is a late-game
  thesis all by itself. Lifecycle details:
  [09-market-integrity.md](09-market-integrity.md).
- **Relative-value texture** — because non-frontier corporates build on
  free Tianxia weights, a Tianxia release can *rally* broad tech while
  hitting HCN. Divergence trades around release events are the game's
  best expression of "the race has more than one winner per headline."
  Wonders print the same way: a model-designed molecule clearing trials
  rallies pharma before it moves HCN — upside evidence and risk evidence
  are the same trade with different signs (the ambivalence rule,
  [00-vision.md](00-vision.md)).

## The implied-timeline dashboard

A first-class UI element: the **market's implied timeline** (derived from
binaries + long-dated vol + Cambria term structure) plotted against the
**player's own posterior** — which the player *sets* explicitly at
locked, scheduled review points (no retroactive edits; credibility
scores against every matured claim, traded or not), and
updates as evidence arrives. The gap is displayed as available alpha; the
gap closing is the world waking up. The player literally trades their
distribution against the market's point estimate. This is the game's
thesis as an interface.

## The allocation stances (mechanical consequences)

| Stance | Returns | Race effect | Catch |
|---|---|---|---|
| Long + accelerate | Full | `C[halcyon]` ↑, `heat` ↑ | The ledger remembers; endings price it |
| Long + restraint (activist) | Haircut | small `S[halcyon]` ↑ | CEO hostility, board-fight exposure, drift vs. benchmark |
| Sit out (bonds, long vol, binaries) | Real — vol and binaries pay conviction | none, by construction | Financially live, existentially empty: expressive positions finance nothing and move nothing. The ledger stays blank, the room stays shut, and rates are still a bet on normalcy |
| Short | Negative carry, occasional vindication | volume slows `C[halcyon]` marginally | A losing battle vs. the trend — and the true doom-short never settles; no counterparty survives to pay |

Sit-out is deliberately *better than the prototype's bonds-only version* —
you can get rich on pure epistemics without touching the race. The game's
answer to clean hands is not poverty; it's that clean hands hold no
levers. The menu stays asymmetric because reality's is, and the game never
editorializes it in copy — the fills and the ledger do the talking.

Transmission honesty: an ordinary secondary fill moves nothing by
itself. The table's race effects flow through primary events (raises,
PIPEs, converts), governance weight, and a bounded, *lagged*
cost-of-capital channel driven by persistent aggregate valuation —
which heavy, sustained positioning (including shorts) can move through
the impact machinery; one fill finances nothing. The ledger records
channels, not fills ([05-endings.md](05-endings.md)).

## Alpha decay and the regime break

Market efficiency `η` rises with `max(C)` (AI enters the market long
before takeoff — quant shops license the models too):

- **Act I:** `η` low. Prototype-like play; event-driven edges are fat.
- **Act II:** edges thin — events begin
  *pre-pricing* (the market gaps before the headline the player used to
  front-run — always off legible precursors with a recorded causal
  event, never off latent truth;
  [09-market-integrity.md](09-market-integrity.md)), and the effective
  cost of *information* trades rises
  through adverse selection even as raw liquidity deepens. The player's
  informational edge migrates to the insider
  channel and to model quality (their posterior vs. `B`).
- **Act III:** regime break — **valence unsigned.** Correlations
  converge in the good worlds and the bad ones alike: the melt-up and
  the unraveling print the same tape, euphoria and terror the same vol
  surface, and the player cannot tell which world they are in from
  inside it. Either way the underlying drifts away from the
  GBM+Heston the game's own
  tools assume — **the terminal itself degrades, diegetically**: tree
  marks visibly diverge from fills, quotes go stale mid-tick, the chart
  stutters and repaints, sparklines flicker — all presentation-layer:
  printed history never mutates and fills stay honest
  ([09-market-integrity.md](09-market-integrity.md)). Not a shader party — a
  Bloomberg failing to keep up with a market that has stopped being made
  of humans. Escalates with `η`; by the final days the player is trading
  an instrument panel they no longer trust, which is the point.

## The scrutiny loop (firm belief `F`)

Quarterly review machinery ports, re-aimed at the belief gap:

- **Player more pilled than firm** (early game default): AGI-flavored
  books draw risk-committee heat — position limits, "explain this thesis"
  popups, forced trims if drawdown while divergent. Being right pays
  double: P&L *and* `F` moves toward you.
- **Player less pilled than firm** (late game, after `B` and `F` wake):
  benchmark is now AGI-loaded; conventional books underperform; the
  pressure inverts. The firm that laughed at you in Act I demands you
  out-doom it in Act III.

Credibility (track record of the player's explicit posterior vs. realized
events — Brier-like, not just P&L) is the currency that converts `F` and
unlocks agency.

## Fund-as-actor (late-game unlock)

Gated on `F` high + credibility high, surfaced as advice-to-higher-ups
popups whose options the player earned:

- Anchor Cambria's Austin expansion (onshoring the chokepoint — compute
  nationalism, `C` ↑ broadly, strait premium ↓ slowly)
- PIPE into Halcyon with governance terms (buy `S`, at a price)
- **Back Polaris** — the wager expressed purest: fund the careful racer,
  possibly split the West's lead fatally. The game refuses to say which.
- Refuse participation in a government compute mobilization (or don't)
- The Treasury backchannel: the desk as the state's market-intelligence
  organ — standing here feeds "the room" in Act III

## Lobbying rework

The 6-action/3-tier machinery ports; the menu becomes AI policy:

- **Export-control escalation** — slows Tianxia's `C`, heats the China
  arcs (and the strait with them),
  and now fights a *domestic* constituency: American firms built on free
  Tianxia weights lobby back, loudly. Controls bind chips, never weights
  already released — the asymmetry the administration keeps rediscovering
  in public.
- **Mandatory evals / incident-reporting regime** (`S` ↑ industry-wide,
  Halcyon lobby fights back, farce risk in implementation — satire
  register)
- **Liability shield / e/acc deregulation** (`heat` ↑↑, near-term returns ↑)
- **Compute reporting & verification** (the treaty's domestic
  prerequisite — quietly the highest-leverage pro-Deal action available)
- **Frontier-lab nationalization push** (the panic button; late-game only)

Prototype lobbying moved congress-seat dials; overhauled lobbying moves
`heat`, the regulation pipeline, and treaty preconditions. Politics is now
the medium, not the message.
