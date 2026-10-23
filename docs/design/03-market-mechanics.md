# 03 — Market Mechanics

How the race reaches the desk. The race rides on the trading chassis
(CRR trees, GBM+Merton+Heston equity, Vasicek rates, the Almgren–Chriss
impact overlay, the vol-index machinery) without replacing it; clearing
and settlement rules are in [09-market-integrity.md](09-market-integrity.md),
constants in [02a-tuning.md](02a-tuning.md).

## Instruments

- **HCN — Halcyon common.** The game's single chart underlying is
  Halcyon equity: GBM + Merton jumps + Heston vol with discrete quarterly
  dividends, so the whole desk is an AI-complex desk and every chassis
  mechanic (options chain, jumps, vol surface) is load-bearing for the
  theme. Long-dated HCN options are the game's purest timeline
  instrument. Cambria has no equity book: its exposure is the compute
  futures curve, which also carries the strait premium.
- **Milestone binaries** — prediction-market contracts on **Consensus
  Markets**. Prices *are* `B` made visible — the market's posterior on
  screen next to yours. Settlement is *certified* (audited evals, public
  demos — typically lagged behind the truth), never hidden truth; the
  player's edge is the gap, twice over: posterior vs. `B`, and true vs.
  certified. (Also the natural home for Brier-score humility: some of the
  player's dooms won't fire.) Listed today: the rung crossings of
  [02-race-model.md](02-race-model.md), which is what settlement
  objectivity hangs on — R2, R3, R4 by certification, and R5 by terminal
  resolution (no auditor certifies takeoff). Designed, not yet listed:
  event contracts ("next Aleph major by Q3," "treaty framework signed,"
  "severity-≥2 incident this year," "Fixedpoint confirmed," "first
  model-designed drug approved"), with the alignment-sentiment channel as
  the settlement basis for the incident-flavored ones.
- **Compute futures** — Cambria allocation-quarter contracts on a rolling
  four-maturity ladder. The race's physical layer as a term structure:
  backwardation = scramble. With the fabs in Hsinchu, the far end carries
  a standing **strait premium** — the only term structure in the game
  where geography is a risk factor. Blockade scares print here first; the
  desk reads the Taiwan tail off the compute curve the way it reads the
  race off Cambria's earnings call.
- **VXHCN** — single-name vol index on HCN, computed off the one Heston
  process, with tradeable futures. Watched the way real single-stock vol
  surfaces are watched for the giants. Late game its term structure is a
  narrative device: the far end refusing to price a future it doesn't
  believe in, then repricing all at once.
- **Bonds/rates** — the risk-free rate as a derivative of the world
  staying normal. The **capex channel** ([02a](02a-tuning.md)): each rise
  of the released frontier rung permanently steps the long-run rate —
  duration supply, not discount rate. Rates move with the race for a
  reason that is not the race, legible and mundane and mistakable for the
  market waking up; the implied timeline never reads rates, so the
  channel moves `r` without moving `B`. In Act III "risk-free" becomes the
  game's quietest joke.
- **The `controlRegime` overlay** — every instrument above lives inside
  the state's grip ([02-race-model.md](02-race-model.md)): supervision
  adds disclosure and dampens gaps, mobilization freezes Consensus and
  the compute curve, nationalization fixes HCN's compensation reference
  and converts shares into it at terminal closeout — the nationalization
  trade, positioning for the conversion, is a late-game thesis all by
  itself. Lifecycle details: [09-market-integrity.md](09-market-integrity.md).
- **Relative-value texture** — because non-frontier corporates build on
  free Tianxia weights, a Tianxia release can *rally* broad tech while
  hitting HCN. Divergence trades around release events are the game's
  best expression of "the race has more than one winner per headline."
  Wonders print the same way: a model-designed molecule clearing trials
  rallies pharma before it moves HCN — upside evidence and risk evidence
  are the same trade with different signs (the ambivalence rule,
  [00-vision.md](00-vision.md)). With HCN the only equity book, this
  lives in event prose and HCN's own impulses rather than a second chart.

## The implied timeline and the player's posterior

The **market's implied timeline** is derived from `B` (whose quotes are
the binaries; the compute curve takes a belief lift from the same
curve). The **player's own posterior** is set explicitly at locked,
scheduled review points — quarterly, no retroactive edits — and
credibility scores it against every matured claim, traded or not. The
gap is available alpha; the gap closing is the world waking up. The
player literally trades their distribution against the market's. This
is the game's thesis as an interface.

Built today: the quarterly lock is a popup showing the market's implied
R3 and R4 days and offering three preset claim vectors. Designed, not
built: the plotted dashboard of implied timeline against posterior, with
the gap displayed as available alpha.

## The allocation stances (mechanical consequences)

| Stance | Returns | Race effect | Catch |
|---|---|---|---|
| Long + accelerate | Full | `C[halcyon]` ↑ | The ledger remembers; endings price it |
| Long + restraint (activist) | Haircut | small `S[halcyon]` ↑ | CEO hostility, board-fight exposure, drift vs. benchmark |
| Sit out (bonds, long vol, binaries) | Real — vol and binaries pay conviction | none, by construction | Financially live, existentially empty: expressive positions finance nothing and move nothing. The ledger stays blank, the room stays shut, rates are still a bet on normalcy — and bonds are downstream of the buildout: the capex channel steps the long-run rate on every released rung |
| Short | Negative carry, occasional vindication | sustained volume slows `C[halcyon]` marginally | A losing battle vs. the trend — and the true doom-short never settles; no counterparty survives to pay |

Sit-out is deliberately a real option: you can get rich on pure
epistemics without touching the race. The game's answer to clean hands
is not poverty; it's that clean hands hold no levers. The menu stays
asymmetric because reality's is, and the game never editorializes it in
copy — the fills and the ledger do the talking.

Transmission honesty: an ordinary secondary fill moves nothing by
itself. The table's race effects flow through governance and policy
choices (board restraint, backing Polaris, export controls, the room)
and a bounded, *lagged* cost-of-capital channel driven by persistent net
HCN positioning, which heavy, sustained positioning (including shorts)
can move; one fill finances nothing. Primary events (raises, PIPEs,
converts) are a designed channel not yet built. The ledger records
channels, not fills ([05-endings.md](05-endings.md)).

**Incident coupling rule:** the detected-incident stream is high-volume
by design (~80–160 events per run), so race-event market effects are
**decaying impulses or `B` moves, never permanent additive `sim`
parameter deltas** — a hundred permanent deltas would walk every
parameter to its clamp, and the clamps would become the market. Race
shells carry `params: {}` and an `impulse` (half-life 5 trading days).
Permanent additive deltas belong only to low-volume pools: the political
events and the capex shell (at most four fires per run).

## Alpha decay and the regime break

Market efficiency `η` rises with the *released* frontier (AI enters the
market long before takeoff — quant shops license the models too, and
only shipped models can be licensed):

- **Act I:** `η` low. Event-driven edges are fat.
- **Act II:** edges thin — event impulses are pre-priced (the market
  gaps before the headline the player used to front-run — always off
  legible precursors with a recorded causal event, never off latent
  truth; [09-market-integrity.md](09-market-integrity.md)), and the
  effective cost of *information* trades rises through adverse selection
  even as raw liquidity deepens. The player's informational edge migrates
  to the insider channel and to model quality (their posterior vs. `B`).
- **Act III:** regime break — **valence unsigned.** The melt-up and the
  unraveling print the same tape, euphoria and terror the same vol
  surface, and the player cannot tell which world they are in from
  inside it. **The terminal itself degrades, diegetically**: quotes go
  stale mid-tick, the chart stutters and repaints, sparklines flicker,
  the VXHCN print holds stale — all presentation-layer: printed history
  never mutates and fills stay honest. Not a shader party — a Bloomberg
  failing to keep up with a market that has stopped being made of
  humans. The player's own orders slow as their hands are replaced by
  machinery they configured earlier (standing orders,
  [04-arcs.md](04-arcs.md)). By the final days the player is trading an
  instrument panel they no longer trust, which is the point.

The design's full break — correlations converging, the underlying
drifting away from the GBM+Heston its own tools assume, tree marks
diverging from fills — needs the authoritative regime-switch wrapper
specified in [09](09-market-integrity.md); it is not built. Today the
underlying stays GBM+Merton+Heston moved by decaying event impulses, and
the break is felt through `η`, tempo, latency, and display degradation.

## The scrutiny loop (firm belief `F`)

The risk committee watches the gap between the player's locked posterior
and the firm's belief `F`:

- **Player more pilled than firm** (early game default): an AGI-flavored
  book draws committee heat.
- **Player less pilled than firm** (late game, after `B` and `F` wake):
  the benchmark is AGI-loaded and a conventional book underperforms; the
  pressure inverts. The firm that laughed at you in Act I demands you
  out-doom it in Act III.

Built: once the player has locked a forecast, a divergence beyond 20
points nudges firm standing ±3 — down when the divergent book is
underperforming, up when it is outperforming (the committee grudgingly
respects P&L) — and firm standing scales the player's position limits.
Designed, not built: "explain this thesis" popups and forced trims on a
divergent drawdown.

Credibility (track record of the player's explicit posterior vs. realized
events — Brier-like, not just P&L) is the currency that converts `F` and
unlocks agency.

## Fund-as-actor (late-game unlock)

Gated on credibility high + `F` high (the fund latch, [02a](02a-tuning.md)),
surfaced as advice-to-higher-ups popups whose options the player earned:

- **The Treasury backchannel** (built): the desk as the state's
  market-intelligence organ — accepting it is one of the room's seat
  criteria in Act III, and costs regulatory exposure, because a standing
  wire into Treasury is a wire.
- **Back Polaris** — the wager expressed purest: fund the careful racer,
  possibly split the West's lead fatally. The game refuses to say which.
  Built as an ungated Polaris popup (runway as `S[polaris]`).
- **Governance on Halcyon** — restraint bought through the board.
  Built as an ungated board popup (`S[halcyon]`); a PIPE with governance
  terms is the designed fund-scale version.
- Designed, not built: anchor Cambria's Austin expansion (onshoring the
  chokepoint — compute nationalism, `C` ↑ broadly, strait premium ↓
  slowly); refuse participation in a government compute mobilization (or
  don't).

## Policy levers

Overhauled policy moves `heat`, the regulation pipeline, the control
regime, and treaty preconditions; politics is the medium, not the
message. The lobby bar still carries the political PAC/fundraiser/deal
actions; the AI-policy levers arrive as event choices:

- **Export-control escalation** (built: the export-controls popup raises
  `exportControlStage`, which slows Tianxia's compute growth, and backing
  it heats the race) — and it fights a *domestic* constituency: American
  firms built on free Tianxia weights lobby back, loudly. Controls bind
  chips, never weights already released — the asymmetry the
  administration keeps rediscovering in public.
- **Mandatory evals / incident reporting** (built: backing the reporting
  bill pushes the regime toward supervision; the reporting regime raises
  detection and halves lags, retroactively once — the player can lobby
  their own alpha away). Halcyon's lobby fights back; farce risk in
  implementation.
- **Compute reporting & verification** (built as the treaty-groundwork
  choice) — the treaty's domestic prerequisite, quietly the
  highest-leverage pro-Deal action available.
- Designed, not built: **liability shield / e/acc deregulation**
  (`heat` ↑↑, near-term returns ↑) and the **frontier-lab
  nationalization push** (the panic button; late-game only). The
  regime evaluator already accepts supervision, mobilization,
  nationalization, and classification pushes; nothing sets them yet.
