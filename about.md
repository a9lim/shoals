---
name: Shoals
title: Shoals — Options Trading and Politics Simulator
description: Trade stock, bonds, variance, and options through a branching institutional narrative with stochastic pricing, regulations, lobbying, and six endings.
updated: 2026-07-16
---

# Shoals — Interactive Options Trading Simulator

Shoals is an options trading simulator that models derivatives pricing under stochastic volatility. It combines quantitative pricing models with a narrative market event engine for scenario-based learning.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

The options chain spans 21 strikes and eight expiries, displaying calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Implied-volatility views show how the market prices risk across strikes and maturities.

## Strategy Builder

The multi-leg strategy builder lets users construct spreads, straddles, strangles, condors, butterflies, and custom combinations. Each strategy shows a payoff diagram, Greek overlays, maximum profit/loss, and break-even points. A margin system tracks portfolio-level exposure.

## Instruments and Portfolio

The trading surface includes Lehman stock, bonds, VXPNT variance futures, and American options. Positions share cash, margin, realized and unrealized P&L, Greeks, and price impact. Large trades use an Almgren-Chriss-style temporary and permanent impact overlay without rewriting the underlying stochastic process.

## Institutional Narrative

Shoals is also a branching institutional simulation. A domain-organized event graph connects firm decisions, regulators, the Federal Reserve, counterparties, media, farmers, labor, and political actors. Choices change world state, unlock or foreclose later events, and move six standing dimensions: firm standing, regulatory exposure, federalist support, farmer and labor support, media trust, and Fed relations. Twelve permanent traits and six dynamic tags make the consequences of earlier choices visible in later scenes.

## Policy and Endings

Regulations, lobbying, congressional relationships, and monetary-policy choices feed back into the market model and the event graph. The campaign resolves into six ending families, then generates a five-page adaptive epilogue from the accumulated state rather than attaching a single score to the run.

## Educational Use

The market layer makes option pricing, volatility, time decay, rates, portfolio Greeks, margin, and price impact tangible. The narrative layer adds the institutional question the equations leave out: who can act, under which rules, and what a financially successful decision costs elsewhere in the system.

## Accessibility

Shoals supports keyboard navigation for all controls and dialogs, high-contrast mode via the theme toggle, and ARIA labels on interactive elements. Chart data is accessible through the numerical sidebar displays. All popup dialogs are focus-trapped. No flashing content or motion hazards.

## Price Impact

The Almgren-Chriss model simulates temporary and permanent price impact from large trades. Temporary impact decays exponentially; permanent impact shifts the equilibrium price based on order flow. Impact is computed as an overlay on the simulated price — it never mutates the underlying stochastic process, preserving model consistency.
