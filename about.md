---
name: Shoals
title: Shoals — Trading the AI Race
description: Trade stock, bonds, VXHCN volatility futures, American options, and AI-milestone binaries through the last years of the race — stochastic pricing, a hidden capability model, and six ways it ends.
updated: 2026-10-27
---

# Shoals — Trading the AI Race

Shoals is a derivatives trading game set in the last years of the AI race. The player runs a book at Meridian Capital while three labs (Halcyon, Polaris, and China's Tianxia) climb toward transformative capability, and the market prices what it can see of that race. Five fixed market regimes teach the pricing on their own; the Dynamic mode adds the race, its milestone and compute markets, and a branching institutional narrative that ends in one of six terminal families.

## The Brief

The interface is *The Meridian Brief*, the firm's morning note, in four pages with one job each. Each trading day is an edition, and an extra edition marks a regime change, a blockade or a crisis. Decisions arrive as dispatches, and the epilogue is the last edition.

The front page is for reading. It leads with the newest item on the wire, with the rest of the wire under it, and sets HCN as a tape of print candles: a hollow body on a day that closed up, a solid red one on a day that closed down, the hairline wick its range, news days ticked above. The forming day's wick holds each new extreme as the day trades; zoomed far out, the candles become the close as a line over a band of the range. Beside the tape is the player's book: its value against holding HCN, the account, any obligation coming due, positions, strategies, working orders and Greeks.

The Markets page is where every trade is made. It draws every market as a curve, as six small multiples: HCN through time, the Vasicek yield curve, the VXHCN futures term structure, the option smile, the Cambria compute forward curve, and Consensus's implied crossing curves. On a news day each keeps the previous day's curve as a dashed ghost, so what moved together is visible at a glance. Every point on a curve is a contract: picking one (or focusing a curve and pressing Enter) puts it on the ticket, again to go short, a third time to remove it. A curve's title opens it with its table, every contract on the curve by bid and ask; the options chain sits beside the smile, with the volatility surface under it. The ticket carries signed ratios and one size, single-leg limit and stop orders, Greeks and net cost. Its figure revalues the legs, and optionally the live book, at a horizon across HCN moves and how far the race gets, and its grid tabulates the same. Strategies load and save on the ticket, and a named one trades all-or-nothing.

The Race page is for knowing. It follows Epoch's Capabilities Index: every public release placed by date on the rung it claims, claims and certifications on the rungs, the released frontier, and Consensus's implied crossing date as a distribution on each rung still ahead. It reads only public records. The self-graded Fixedpoint Index sits apart, unlisted, and the hidden internal tracks appear only once the run has ended.

The Race page is also where the player states a timeline. Each rung follows the market until the player draws on it; from then on the player's distribution is drawn in ink over Consensus's and holds where they left it while the market moves. Its median is a bead that drags along the rung (up and down to tighten or loosen it), and the chance it lands this term a square on a gauge at the term's end, by pointer or keyboard; Delete returns a rung to the market. The desk records the forecast as each quarter opens, without asking, and at the quarter's close the player's probabilities and the market's are scored by log-likelihood against the rungs that certified and the quarters that passed quietly. A rung left to the market scores nothing. Credibility is the player's demonstrated edge over the market, and it opens the firm's memo, the fund's agency and a seat in the room.

Meridian, the fourth page, keeps the accounts: the player's forecast record and scored quarters, the predecessor's handover, their standing with the firm and with Washington, standing orders and convictions, the two chambers as seat bars, regulations, government affairs, the almanac and the settings. The almanac keeps every Dynamic run in the browser: the cumulative forecast score beside a reference reader's on the same worlds, a reliability diagram of the player's stated quarter probabilities, and the families seen beside the baseline measured with no player in the world.

## The Inherited Desk

A Dynamic run opens on a book someone else built. The player takes over from a portfolio manager who has left Meridian, one of four hands dealt by the run's seed: a levered HCN long with a redemption due before its catalyst, a hedged book whose puts expire at the first quarter's end, a large VXHCN futures position that trades thin, or a short on Consensus's far rungs beside long bonds. The predecessor's handover memo leads the first edition, with two archived reports beneath it. The book is marked at the opening and measured from the takeover. Each hand carries a dated obligation, a redemption or a loan repayment, that is met in cash: if the cash won't cover it five sessions out, a notice pauses the desk, and if it is still short on the day, operations sells a slice of every long position at three times the spread. Classic regimes start on cash.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

The options chain spans 21 strikes and eight expiries, displaying calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Each contract is priced with a term- and moneyness-adjusted volatility derived from the current Heston state.

## Multi-leg Strategies

The ticket builds spreads, straddles, strangles, condors, butterflies, and custom combinations, alone or loaded from a built-in list, with any instrument as a leg. Its figure shows the payoff at the horizon (at expiry for an option book, until the player moves it) with breakevens, one line per scenario, and its Greeks are read before the trade fills. A margin system tracks portfolio-level exposure.

## Instruments and Portfolio

The trading surface includes HCN stock, bonds, VXHCN volatility futures, and American options; Dynamic mode adds Consensus milestone binaries and Cambria compute futures. It also adds the primary market. Halcyon sells new stock when it raises for compute, and Polaris, the safety lab, raises private rounds. A Polaris stake is marked at the last round, cannot be sold before the race ends, and settles by what became of Polaris.

In Dynamic mode HCN's price also carries the market's valuation of the race, taken conditional on survival. The market weighs the worlds in which its claims can be paid, so it reprices on certifications, claims and rival releases as overnight gaps, and gives the outcomes in which no one is left to collect no weight at all. Positions share cash, margin, realized and unrealized P&L, Greeks, and price impact. Instrument-specific square-root impact overlays decay with cumulative volume; option market-maker rehedging adds stock flow, while very large gross exposure can temporarily shift selected process parameters.

## Institutional Narrative

Shoals is also a branching institutional simulation. A domain-organized event graph connects firm decisions, regulators, the Federal Reserve, counterparties, media, Congress and the two parties, the labs, and foreign governments. Choices change world state, unlock or foreclose later events, and move eight standing dimensions: firm standing, regulatory exposure, federalist support, farmer and labor support, media trust, Fed relations, safety-network trust, and lab relations. Eighteen permanent traits and six dynamic tags make the consequences of earlier choices visible in later scenes. In Dynamic mode, a hidden AI-race model (three labs on a capability ladder, incidents that surface only on detection, weight thefts, and a ratcheting government control regime) runs beneath the market and drives much of the event graph.

## Policy and Endings

Regulations, lobbying, congressional relationships, and monetary-policy choices feed back into the market model and the event graph. The campaign resolves into six ending families, then generates a five-page adaptive epilogue from the accumulated state rather than attaching a single score to the run.

## Educational Use

The market layer makes option pricing, volatility, time decay, rates, portfolio Greeks, margin, and price impact tangible. The narrative layer adds the institutional question the equations leave out: who can act, under which rules, and what a financially successful decision costs elsewhere in the system.

## Music

The score is synthesized in the browser: "Halcyon", a 32-bar ballad in A minor for Rhodes, upright bass, brushes and Harmon-muted trumpet, played as a four-chorus set (head, a written Rhodes solo, a rhythm-section chorus, and the head again). Dispatches ring the wire bell. In the last act the same form is re-rendered with less humanity each pass: the swing straightens, the trumpet goes first, and a machine layer keeps its own time beneath the band.

## Accessibility

Shoals provides keyboard shortcuts, light and dark themes, labeled controls, numerical market/portfolio readouts, and focus trapping for narrative popups and the epilogue. Every curve, every opened table, the ticket and the forecast editor can be driven from the keyboard. The live tape, the markets' easing after news, sparklines, the typewriter treatment, and other animated feedback create continuous motion; with reduced motion the desk opens paused on a complete edition and the curves change without easing.

## Price Impact

The impact model records decaying cumulative volume separately for stock, bonds, VXHCN futures, and each option contract. It applies square-root fill costs and valuation overlays without directly rewriting the simulated spot path. Delta changes in the player's option book generate market-maker hedge flow, and exposure thresholds add temporary, capped overlays to selected process parameters.
