# 03 — Market Mechanics

How the race reaches the desk. The race rides on the trading chassis
(CRR trees, GBM+Merton+Heston equity, Vasicek rates, the Almgren–Chriss
impact overlay, the vol-index machinery) without replacing it. Clearing
and settlement rules are in [09-market-integrity.md](09-market-integrity.md);
constants are in [02a-tuning.md](02a-tuning.md).

## Instruments

- **HCN — Halcyon common.** The game's single chart underlying:
  GBM + Merton jumps + Heston vol with discrete quarterly dividends, so
  the whole desk is an AI-complex desk and every chassis mechanic
  (options chain, jumps, vol surface) is load-bearing for the theme.
  In the Dynamic mode HCN's level also carries the market's valuation of
  the race **conditional on survival** — the valuation layer
  ([02a](02a-tuning.md)) — repriced as gaps at the day's close on
  legible news: certifications and Western rung claims lift it, a
  Tianxia claim of parity cuts it, a stall drifts it down. The market
  prices the worlds where its claims can be paid and gives the others no
  weight: pillar 2 written as a price. Long-dated HCN options are the
  game's purest timeline instrument.
- **The primary market.** Money that reaches a lab, unlike a fill on
  the screen. Each rise of the released frontier rung is a Halcyon
  follow-on offering: HCN gaps 2% for dilution and Meridian may take new
  shares at a discount, and the allocation feeds the cost-of-capital
  channel. Polaris, private for the whole run, raises rounds from three
  weeks after the walkout; a stake is marked at the last round, cannot be
  sold, and settles by what became of Polaris (six times the last round
  if Polaris leads a won world, nothing in the doom families). Neither
  has a price process of its own.
- **Milestone binaries** — contracts on **Consensus**. Prices *are* `B`
  made visible — the market's posterior on screen next to yours.
  Settlement is *certified* (audited evals, public demos, typically
  lagged behind the truth), never hidden truth, so the player's edge is
  the gap twice over: posterior vs. `B`, and true vs. certified. Listed:
  the rung crossings of [02-race-model.md](02-race-model.md) — R2, R3, R4
  by certification, and R5 by terminal resolution (no auditor certifies
  takeoff).
- **Compute futures** — Cambria allocation-quarter contracts on a rolling
  four-maturity ladder. The race's physical layer as a term structure:
  backwardation is scramble. With the fabs in Hsinchu, the far end
  carries a standing **strait premium** — the only term structure in the
  game where geography is a risk factor. Blockade scares print here
  first, and the curve takes a belief lift from the market's R5 curve.
- **VXHCN** — single-name vol index on HCN, computed off the one Heston
  process, with tradeable futures priced off the forward variance curve.
  In Act III its *publication* goes stale while settlement stays true.
- **Bonds/rates** — the risk-free rate as a derivative of the world
  staying normal. The **capex channel** ([02a](02a-tuning.md)): each rise
  of the released frontier rung permanently steps the long-run rate —
  duration supply, not discount rate. Rates move with the race for a
  reason that is not the race, legible and mundane and mistakable for
  the market waking up; the implied timeline never reads rates, so the
  channel moves `r` without moving `B`. In Act III "risk-free" becomes
  the game's quietest joke.
- **The `controlRegime` overlay** — every instrument above lives inside
  the state's grip ([02-race-model.md](02-race-model.md)). Supervision
  drags domestic labs' capability drift. Mobilization freezes Consensus
  (the successor adjudicator keeps settling) and the compute curve (held
  at its decree or last mark), and floors domestic racing pace.
  Nationalization and classification fallback-settle every open binary;
  HCN converts at the terminal closeout at a frozen reference times a
  pre-sampled multiple — the nationalization trade is a late-game thesis
  of its own. Classification also blacks out incident detections. The
  rules are in [09](09-market-integrity.md).
- **Relative-value texture** — because non-frontier corporates build on
  free Tianxia weights, a Tianxia release rallies broad tech in the prose
  while it hits HCN, and wonders rally pharma before they move HCN. With
  HCN the only equity book, this lives in event prose and HCN's own
  impulses, not a second chart.

## The posterior and the implied timeline

The **market's implied timeline** is `B`, per rung a crossing-date law
whose quotes are the binaries; its implied date is the day the law is
even odds, or "not this term". The **player's posterior** is a
logistic per rung with a plateau, drawn: on the Markets page's Consensus
panel, "Your curves" draws the player's draft over the market's curves,
starting from a fit of `B` into the player's family. A median handle per
uncertified rung drags along the timeline and up or down for width; a
square at the term's end sets the chance the rung lands this term at
all. Arrow keys move the median 5 days (21 with Shift) and tighten or
loosen it, Page Up and Page Down move the plateau, and Tab moves between
rungs. Edit mode suspends the panel's sandbox picks. The draft is locked
each quarter through the forecast-lock dispatch — as drawn, the
market's, earlier or later than the market, or "adjust first", which
holds the quarter until the panel's Lock is pressed. Locking the
market's curves is a policy, not a drawing: it scores exactly what the
market scores.

At each quarter's close, every open rung is scored for the player and
for the market's snapshot alike, from the probabilities both stored at
the lock: the log-likelihood of what certified, and of the quiet
quarters that didn't. A quarter still open when the run ends is scored
once, against the world that happened. Against a market this sharp the
record is small, a fraction of a nat to a couple of nats a run for a
skilled reader, so it moves slowly and luck can still carry a bold
early caller through a gate. Credibility is the player's
demonstrated edge over the market (copying the market scores exactly
zero), and it is the currency that converts the firm and unlocks
agency. The Desk shows the track record and credibility; the Race page
shows the locked medians beside the market's. The gap between the curves
is available alpha; the gap closing is the world waking up. The player
literally trades their distribution against the market's — the game's
thesis as an interface.

## The allocation stances (mechanical consequences)

| Stance | Returns | Race effect | Catch |
|---|---|---|---|
| Long + accelerate | Full; the survival-conditioned melt-up | sustained net long speeds Halcyon a little through the cost-of-capital channel (≤ 5%); follow-on allocations feed it directly | the ledger records the C channel; the endings price it |
| Long + restraint | Board restraint, Polaris backing and Polaris rounds | `S[halcyon]` and `S[polaris]` rows, runway that bites only where that lab leads | Polaris stakes are illiquid, and worth nothing in the doom families |
| Sit out (bonds, long vol, binaries) | Real — vol and binaries pay conviction | none from positions | expressive positions finance nothing and move nothing; and bonds are downstream of the buildout, since the capex channel steps the long rate on every released rung |
| Short | Negative carry, occasional vindication | sustained net short slows Halcyon a little through the same channel | a losing battle against the trend; a doom-short is paid at the terminal mark in cash the epilogue prices as a claim on a counterparty that no longer exists |

Sit-out is deliberately a real option: you can get rich on pure
epistemics without touching the race. The game's answer to clean hands
is not poverty; it's that clean hands hold no levers. The menu stays
asymmetric because reality's is, and the game never editorializes it in
copy — the fills and the ledger do the talking.

Transmission honesty: an ordinary secondary fill moves nothing by
itself. Race effects flow through governance and policy choices (board
restraint, backing Polaris, export controls, the room), a bounded,
*lagged* cost-of-capital channel driven by persistent net HCN
positioning, and the primary market, where a follow-on allocation or a
Polaris round reaches the lab. The ledger records channels, not fills
([05-endings.md](05-endings.md)).

**Incident coupling rule:** the detected-incident stream is high-volume
by design (~80–160 per run), so race-event market effects are
**decaying impulses, never permanent additive `sim` parameter deltas** —
a hundred permanent deltas would walk every parameter to its clamp, and
the clamps would become the market. Race shells carry `params: {}` and
an `impulse` (half-life 5 trading days). Permanent additive deltas
belong only to low-volume pools: the political events and the capex
shell (at most four fires per run).

## Alpha decay and the regime break

Market efficiency `η` rises with the *released* frontier — quant shops
license the models too, and only shipped models can be licensed. It
damps the market's reaction to race headlines: bridge-fired impulses
scale by `1 − 0.6·η`. The market's waking itself is the valuation
layer: as certifications and claims move `B`, HCN reprices in gaps, and
a player whose curves ran ahead of `B` is paid on the front page as `B`
catches up.

In Act III the tempo compresses (the discretionary event rate climbs to
2.5× by R5, and from R4 events arrive mid-day), the player's own orders
slow on a latency ladder and pay a wider spread at R5, and **the
terminal degrades diegetically**: quotes go stale mid-tick, the tape
repaints, sparklines skip, the VXHCN print holds stale — all
presentation-layer, while printed history never mutates and fills stay
honest. The band in the score loses its humanity a bar at a time. The
player's hands are replaced by the machinery they configured earlier
(standing orders, [04-arcs.md](04-arcs.md)). By the final days the
player is trading an instrument panel they no longer trust, which is
the point. Valence is unsigned: the melt-up and the unraveling print the
same tape.

## The scrutiny loop (firm belief `F`)

The risk committee watches the gap between the player's locked
pilledness and the firm's belief `F` (both read on the same horizon, so
a player who copies the market draws no heat):

- **Player more pilled than the firm** (the early default): an
  AGI-flavored book draws committee heat.
- **Player less pilled than the firm** (late, after `B` and `F` wake):
  the benchmark is AGI-loaded and a conventional book underperforms; the
  pressure inverts. The firm that laughed at you in Act I demands you
  out-doom it in Act III.

Mechanically, a gap beyond 20 points nudges firm standing by 3 — down
when the divergent book is underperforming, up when it is outperforming
(the committee grudgingly respects P&L) — and firm standing scales the
player's position limits.

## The firm and fund-as-actor

- **The firm conversion** — the memo (credibility > 0.55 and `F` ≥ 40)
  and then the verdict (`F` ≥ 75 if the player made the case, 85
  otherwise), checked on lock days. The conversion counts toward a seat
  in the room and toward the gray-eminence overlay.
- **The Treasury backchannel** — the fund-as-actor beat, gated on the
  fund latch (credibility > 0.65 and `F` > 60): the desk as the state's
  market-intelligence organ. Accepting it is one of the room's seat
  criteria and costs regulatory exposure, because a standing wire into
  Treasury is a wire.
- **Back Polaris** — the wager expressed purest: fund the careful racer,
  possibly split the West's lead fatally. The game refuses to say which.
  An ungated Polaris popup buys runway (`S[polaris]`), and Polaris's
  private rounds make the backing a position.
- **Governance on Halcyon** — restraint bought through the board, an
  ungated one-shot popup once the released frontier reaches R2
  (`S[halcyon]`).

## Policy levers

Policy moves `heat`, the regulation pipeline, the control regime, and
the treaty's preconditions; politics is the medium, not the message.
The AI-policy levers arrive as event choices:

- **Export-control escalation** — the export-controls popup raises
  `exportControlStage`, which slows Tianxia's compute growth, and backing
  it heats the race. It fights a *domestic* constituency (American firms
  built on free Tianxia weights lobby back, loudly), and controls bind
  chips, never weights already released.
- **Incident reporting** — backing the reporting bill pushes the regime
  toward supervision and turns on the reporting regime: detection rises,
  lags halve, retroactively once. The player can lobby their own alpha
  away.
- **Compute reporting** — the treaty-groundwork choice puts the fund
  behind the training-run registry, the treaty's domestic prerequisite:
  it lets talks open earlier and never bypasses a gate.

The lobby bar carries the political menu: party PACs, a fundraiser,
brokering a deal, a leak to the press, counsel to the Fed.
