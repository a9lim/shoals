---
name: Shoals
title: Shoals — Options Trading and Politics Simulator
description: Trade stock, bonds, VXPNT volatility futures, and American options through a branching institutional narrative with stochastic pricing, regulation, lobbying, and six endings.
updated: 2026-07-17
---

# Shoals — Interactive Options Trading Simulator

Shoals is an options trading simulator that models derivatives pricing under stochastic volatility. It combines quantitative pricing models with a narrative market event engine for scenario-based learning.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

The options chain spans 21 strikes and eight expiries, displaying calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Each contract is priced with a term- and moneyness-adjusted volatility derived from the current Heston state.

## Strategy Builder

The multi-leg strategy builder lets users construct spreads, straddles, strangles, condors, butterflies, and custom combinations. Each strategy shows a payoff diagram, Greek overlays, maximum profit/loss, and break-even points. A margin system tracks portfolio-level exposure.

## Instruments and Portfolio

The trading surface includes PNTH stock, bonds, VXPNT volatility futures, and American options. Positions share cash, margin, realized and unrealized P&L, Greeks, and price impact. Instrument-specific square-root impact overlays decay with cumulative volume; option market-maker rehedging adds stock flow, while very large gross exposure can temporarily shift selected process parameters.

## Institutional Narrative

Shoals is also a branching institutional simulation. A domain-organized event graph connects firm decisions, regulators, the Federal Reserve, counterparties, media, farmers, labor, and political actors. Choices change world state, unlock or foreclose later events, and move six standing dimensions: firm standing, regulatory exposure, federalist support, farmer and labor support, media trust, and Fed relations. Twelve permanent traits and six dynamic tags make the consequences of earlier choices visible in later scenes.

## Policy and Endings

Regulations, lobbying, congressional relationships, and monetary-policy choices feed back into the market model and the event graph. The campaign resolves into six ending families, then generates a five-page adaptive epilogue from the accumulated state rather than attaching a single score to the run.

## Educational Use

The market layer makes option pricing, volatility, time decay, rates, portfolio Greeks, margin, and price impact tangible. The narrative layer adds the institutional question the equations leave out: who can act, under which rules, and what a financially successful decision costs elsewhere in the system.

## Accessibility

Shoals provides keyboard shortcuts, light and dark themes, labeled controls, numerical market/portfolio readouts, and focus trapping for narrative popups and the epilogue. The live candlestick chart, sparklines, typewriter treatment, and other animated feedback create continuous motion.

## Price Impact

The impact model records decaying cumulative volume separately for stock, bonds, VXPNT futures, and each option contract. It applies square-root fill costs and valuation overlays without directly rewriting the simulated spot path. Delta changes in the player's option book generate market-maker hedge flow, and exposure thresholds add temporary, capped overlays to selected process parameters.
