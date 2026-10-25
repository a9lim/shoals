---
name: Shoals
title: Shoals — Trading the AI Race
description: Trade stock, bonds, VXHCN volatility futures, American options, and AI-milestone binaries through the last years of the race — stochastic pricing, a hidden capability model, and six ways it ends.
updated: 2026-10-24
---

# Shoals — Trading the AI Race

Shoals is a derivatives trading game set in the last years of the AI race. The player runs a book at Meridian Capital while three labs (Halcyon, Polaris, and China's Tianxia) climb toward transformative capability, and the market prices what it can see of that race. Five fixed market regimes teach the pricing on their own; the Dynamic mode adds the race, its milestone and compute markets, and a branching institutional narrative that ends in one of six terminal families.

## The Brief

The interface is *The Meridian Brief*, the firm's morning note. Each trading day is an edition, and an extra edition marks a regime change, a blockade or a crisis. The front page leads with the newest item on the wire, sets HCN as a Tufte tape (each day's range as a band, the close as a line over it, news days ticked), and prints quotes, the options chain and the Consensus and Cambria books as agate tables you trade by clicking. Decisions arrive as dispatches, and the epilogue is the last edition.

The Markets page draws every market as a curve, as six small multiples: HCN through time, the Vasicek yield curve, the VXHCN futures term structure, the option smile, the Cambria compute forward curve, and Consensus's implied crossing curves. On a news day each keeps the previous day's curve as a dashed ghost, so what moved together is visible at a glance. Every point on a curve is a contract: clicking one (or focusing a curve and pressing Enter) adds it to the sandbox, again to go short, a third time to remove it. The sandbox revalues its legs, and optionally the live book, a quarter out across HCN moves and how far the race gets, says in one sentence what the book bets on, and can send the legs to the desk as market orders.

The Consensus panel is also where the player states a timeline. Switching on "Your curves" draws the player's own crossing curve for each rung over the market's. A median is dragged along the timeline, and a curve tightened or loosened, by pointer or keyboard. Each quarter a forecast-lock dispatch records the draft, the market's curves, or a shift earlier or later. At the next quarter both are scored by log-likelihood against the rungs that certified and the quarters that passed quietly. Credibility is the player's demonstrated edge over the market, and it opens the firm's memo, the fund's agency and a seat in the room.

The Race page follows Epoch's Capabilities Index: every public release placed by date on the rung it claims, claims and certifications on the rungs, the released frontier, and Consensus's implied crossing date as a distribution on each rung still ahead. It reads only public records. The self-graded Fixedpoint Index sits apart, unlisted, and the hidden internal tracks appear only once the run has ended.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

The options chain spans 21 strikes and eight expiries, displaying calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Each contract is priced with a term- and moneyness-adjusted volatility derived from the current Heston state.

## Strategy Builder

The multi-leg strategy builder lets users construct spreads, straddles, strangles, condors, butterflies, and custom combinations. Each strategy shows a payoff diagram, Greek overlays, maximum profit/loss, and break-even points. A margin system tracks portfolio-level exposure.

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

Shoals provides keyboard shortcuts, light and dark themes, labeled controls, numerical market/portfolio readouts, and focus trapping for narrative popups and the epilogue. Every curve and the sandbox can be driven from the keyboard. The live tape, the markets' easing after news, sparklines, the typewriter treatment, and other animated feedback create continuous motion; with reduced motion the desk opens paused on a complete edition and the curves change without easing.

## Price Impact

The impact model records decaying cumulative volume separately for stock, bonds, VXHCN futures, and each option contract. It applies square-root fill costs and valuation overlays without directly rewriting the simulated spot path. Delta changes in the player's option book generate market-maker hedge flow, and exposure thresholds add temporary, capped overlays to selected process parameters.
