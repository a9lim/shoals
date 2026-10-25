# Shoals

The singularity, priced from a derivatives desk. You are a senior trader at Meridian Capital through a four-year presidential term. You trade options on Halcyon, the frontier AI lab, while a hidden AI race runs underneath the market and each run ends in one of six outcomes for the world.

**[Open it](https://a9l.im/shoals)** · part of [a9l.im](https://a9l.im)

## What's in it

- **A live market**: HCN stock follows geometric Brownian motion with Merton jumps and Heston stochastic volatility. Rates follow a Vasicek process. The VXHCN volatility index is derived from the Heston state.
- **Instruments**: stock, bonds, VXHCN volatility futures, and American options across 21 strikes and 8 rolling expiries. Orders can be market, limit, or stop. In Dynamic mode you can also trade Consensus milestone binaries on when each capability rung is reached, and quarterly compute futures on Cambria chip allocation.
- **Pricing**: 128-step Cox–Ross–Rubinstein binomial trees with discrete dividends, term-structure and skew volatility from the Heston state, and Greeks (delta, gamma, theta, vega, rho).
- **A strategy builder**: multi-leg spreads with payoff diagrams, Greek overlays, breakevens, and a time-decay slider. Strategies can be saved.
- **A margin book**: Reg-T margin, short borrow costs, forced liquidation, and square-root price impact with market-maker hedging flow.
- **The race (Dynamic mode)**: three labs — Halcyon, China's Tianxia, and the safety splinter Polaris — climb a capability ladder. Incidents surface only when detected, weights get stolen, and the government's grip tightens. Market belief prices it all, often wrongly. You lock quarterly forecasts, argue your CIO into or out of the thesis, and may end up in the room where it is decided. Late in the game the desk itself gets slower and less reliable. You can arm standing orders before that happens.
- **Narrative**: a branching event engine covers Congress, the Fed, the media, the labs, the Taiwan Strait, and the treaty track. Your choices move faction standings, traits, regulations, and the race. The run closes with a five-page epilogue.
- **Modes**: five fixed market regimes for pure trading, and Dynamic, which adds the race and its narrative.
- **Sound**: a lounge-jazz soundtrack synthesized in the browser, which becomes more mechanical as the race accelerates.

## Controls

Space plays or pauses, `/` steps forward one substep, `.` and `,` change the speed, and `r` resets. `b` and `n` trade stock and bonds, `x` toggles buy/sell, and Enter executes the loaded strategy. `1`–`7` pick a preset. `s` or `t` toggles the sidebar, `[` and `]` switch tabs, and `=`, `-`, and `0` zoom the chart.

## Running locally

The project has no build step of its own; it loads the shared design system from
the parent site by absolute path. From a checkout of
[a9lim.github.io](https://github.com/a9lim/a9lim.github.io) with submodules:

    npm install && npm run build
    python3 -m http.server --directory dist 8000   # http://localhost:8000/shoals/

## How it's built

The app is vanilla HTML, CSS, and JavaScript ES modules with no bundler. Charts are Canvas 2D and the music is Web Audio synthesis. `main.js` orchestrates the simulation, pricing, portfolio, and UI modules in `src/`. The hidden race model and its markets live in `src/race/` and are DOM-free, so six headless Node harnesses in `tools/` can drive them. Design documents are in `docs/design/`. [AGENTS.md](AGENTS.md) has the detailed map.

## License

[AGPL-3.0](LICENSE)
