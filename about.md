---
name: Shoals
title: Shoals — Trading the AI Race
description: Trade stock, bonds, VXHCN volatility futures, American options, and AI-milestone binaries through the last years of the race — stochastic pricing, a hidden capability model, and six ways it ends.
updated: 2026-09-08
---

# Shoals — Trading the AI Race

Shoals is a derivatives trading game set in the last years of the AI race. The player runs a book at Meridian Capital while three labs (Halcyon, Polaris, and China's Tianxia) climb toward transformative capability, and the market prices what it can see of that race. Five fixed market regimes teach the pricing on their own; the two Dynamic modes add the race, its milestone and compute markets, and a branching institutional narrative that ends in one of six terminal families.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

The options chain spans 21 strikes and eight expiries, displaying calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Each contract is priced with a term- and moneyness-adjusted volatility derived from the current Heston state.

## Strategy Builder

The multi-leg strategy builder lets users construct spreads, straddles, strangles, condors, butterflies, and custom combinations. Each strategy shows a payoff diagram, Greek overlays, maximum profit/loss, and break-even points. A margin system tracks portfolio-level exposure.

## Instruments and Portfolio

The trading surface includes HCN stock, bonds, VXHCN volatility futures, and American options; the dynamic modes add Consensus milestone binaries and Cambria compute futures. Positions share cash, margin, realized and unrealized P&L, Greeks, and price impact. Instrument-specific square-root impact overlays decay with cumulative volume; option market-maker rehedging adds stock flow, while very large gross exposure can temporarily shift selected process parameters.

## Institutional Narrative

Shoals is also a branching institutional simulation. A domain-organized event graph connects firm decisions, regulators, the Federal Reserve, counterparties, media, Congress and the two parties, the labs, and foreign governments. Choices change world state, unlock or foreclose later events, and move eight standing dimensions: firm standing, regulatory exposure, federalist support, farmer and labor support, media trust, Fed relations, safety-network trust, and lab relations. Eighteen permanent traits and six dynamic tags make the consequences of earlier choices visible in later scenes. In the dynamic modes, a hidden AI-race model (three labs on a capability ladder, incidents that surface only on detection, weight thefts, and a ratcheting government control regime) runs beneath the market and drives much of the event graph.

## Policy and Endings

Regulations, lobbying, congressional relationships, and monetary-policy choices feed back into the market model and the event graph. The campaign resolves into six ending families, then generates a five-page adaptive epilogue from the accumulated state rather than attaching a single score to the run.

## Educational Use

The market layer makes option pricing, volatility, time decay, rates, portfolio Greeks, margin, and price impact tangible. The narrative layer adds the institutional question the equations leave out: who can act, under which rules, and what a financially successful decision costs elsewhere in the system.

## Accessibility

Shoals provides keyboard shortcuts, light and dark themes, labeled controls, numerical market/portfolio readouts, and focus trapping for narrative popups and the epilogue. The live candlestick chart, sparklines, typewriter treatment, and other animated feedback create continuous motion.

## Price Impact

The impact model records decaying cumulative volume separately for stock, bonds, VXHCN futures, and each option contract. It applies square-root fill costs and valuation overlays without directly rewriting the simulated spot path. Delta changes in the player's option book generate market-maker hedge flow, and exposure thresholds add temporary, capped overlays to selected process parameters.
